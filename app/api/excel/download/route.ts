import { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { GET as getExcelData } from "../route";
import { GET as getSalesData } from "../../sales/route";

const excelRawKeys = [
  "no", "customer", "location", "transaction", "project", "rfq_date", "rfq_no",
  "rfq_part_number", "rfq_description", "rfq_qty", "rfq_uom", "quotation_date",
  "quotation_no", "quotation_part_number", "quotation_description", "quotation_qty",
  "quotation_uom", "quotation_price", "quotation_amount", "po_date", "po_no",
  "po_part_number", "po_description", "po_qty", "po_uom", "po_price", "po_amount",
  "delivery_date", "delivery_no", "invoice_date", "invoice_no", "invoice_part_number",
  "invoice_description", "invoice_qty", "invoice_uom", "invoice_dpp", "invoice_amount_dpp",
  "invoice_ppn", "invoice_amount", "invoice_pph23", "total_ar", "payment_type",
  "payment_term", "invoice_due_date", "invoice_aging", "received_due_date", "payment_amount",
  "transfer_date", "payment_status", "payment_difference", "payment_note",
  "transaction_status", "remark",
] as const;

type ExcelRow = { raw?: Record<string, unknown> };
type Sale = {
  customer?: string;
  project?: string;
  rfq_no?: string;
  quotation_no?: string;
  po_no?: string;
  delivery_no?: string;
  invoice_no?: string;
  invoice_amount?: number;
  amount_paid?: number;
  due_date?: string;
  payment_status?: string;
};

const stageOf = (sale: Sale) => {
  const invoiceAmount = Number(sale.invoice_amount || 0);
  const amountPaid = Number(sale.amount_paid || 0);
  if (sale.payment_status?.toUpperCase() === "CLOSED" || (invoiceAmount > 0 && amountPaid >= invoiceAmount)) return "Payment";
  if (sale.invoice_no) return "Invoice";
  if (sale.delivery_no) return "Surat Jalan";
  if (sale.po_no) return "PO";
  if (sale.quotation_no) return "Quotation";
  return "RFQ";
};

const agingStatus = (sale: Sale) => {
  if (stageOf(sale) === "Payment") return "Lunas";
  if (!sale.due_date) return "Belum Ada Tempo";
  const diff = Math.ceil((new Date(sale.due_date).getTime() - Date.now()) / 86400000);
  if (diff < 0) return "Terlambat";
  if (diff <= 14) return "Segera Jatuh Tempo";
  return "Lancar";
};

const internalRequest = (request: NextRequest, path: string) =>
  new NextRequest(new URL(path, request.url), { headers: request.headers });

export async function GET(request: NextRequest) {
  try {
    const [excelResponse, salesResponse] = await Promise.all([
      getExcelData(internalRequest(request, "/api/excel?all=1")),
      getSalesData(internalRequest(request, "/api/sales")),
    ]);
    if (!excelResponse.ok) return excelResponse;
    if (!salesResponse.ok) return salesResponse;

    const excelPayload = await excelResponse.json() as { data?: ExcelRow[]; source?: { source_file?: string } | null };
    const salesPayload = await salesResponse.json() as { data?: Sale[] };
    const currentSummary = (salesPayload.data ?? []).filter((sale) => sale.po_no?.trim());

    const sourceSheet = XLSX.utils.json_to_sheet(
      (excelPayload.data ?? []).map((row) => row.raw ?? {}),
      { header: [...excelRawKeys] },
    );
    sourceSheet["!cols"] = excelRawKeys.map((key) => ({
      wch: key.includes("description") || key.includes("note") || key === "remark" ? 28 : key.includes("no") ? 22 : 15,
    }));

    const totalInvoice = currentSummary.reduce((sum, sale) => sum + Number(sale.invoice_amount || 0), 0);
    const totalPaid = currentSummary.reduce((sum, sale) => sum + Number(sale.amount_paid || 0), 0);
    const totalOutstanding = currentSummary.reduce((sum, sale) => sum + Math.max(0, Number(sale.invoice_amount || 0) - Number(sale.amount_paid || 0)), 0);
    const overdueCount = currentSummary.filter((sale) => agingStatus(sale) === "Terlambat").length;
    const summaryRows: (string | number)[][] = [
      ["PT. MDA AMANAH SEJAHTERA — MONITORING RAB"],
      ["Sumber Data", excelPayload.source?.source_file || "Monitoring RAB.xlsx"],
      ["Diperbarui", new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })],
      [],
      ["Jumlah PO", "Jumlah Invoice", "Nilai Transaksi", "Sudah Dibayar", "Belum Dibayar", "Lewat Jatuh Tempo"],
      [new Set(currentSummary.map((sale) => sale.po_no).filter(Boolean)).size, new Set(currentSummary.map((sale) => sale.invoice_no).filter(Boolean)).size, totalInvoice, totalPaid, totalOutstanding, overdueCount],
      [],
      ["Customer", "Project", "RFQ", "Quotation", "PO", "Surat Jalan", "Invoice", "Nilai Invoice", "Terbayar", "Outstanding", "Jatuh Tempo", "Status Pembayaran", "Status Aging"],
      ...currentSummary.map((sale) => [
        sale.customer || "", sale.project || "", sale.rfq_no || "", sale.quotation_no || "", sale.po_no || "", sale.delivery_no || "",
        sale.invoice_no || "", Number(sale.invoice_amount || 0), Number(sale.amount_paid || 0),
        Math.max(0, Number(sale.invoice_amount || 0) - Number(sale.amount_paid || 0)), sale.due_date || "", sale.payment_status || "", agingStatus(sale),
      ]),
    ];
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
    summarySheet["!cols"] = [{ wch: 28 }, { wch: 28 }, { wch: 22 }, { wch: 22 }, { wch: 25 }, { wch: 22 }, { wch: 24 }, { wch: 17 }, { wch: 17 }, { wch: 17 }, { wch: 16 }, { wch: 18 }, { wch: 18 }];

    const customerMap = new Map<string, { invoices: number; total: number; paid: number; outstanding: number; overdue: number }>();
    currentSummary.forEach((sale) => {
      const customer = sale.customer || "Tanpa Nama";
      const current = customerMap.get(customer) ?? { invoices: 0, total: 0, paid: 0, outstanding: 0, overdue: 0 };
      if (sale.invoice_no) current.invoices += 1;
      current.total += Number(sale.invoice_amount || 0);
      current.paid += Number(sale.amount_paid || 0);
      current.outstanding += Math.max(0, Number(sale.invoice_amount || 0) - Number(sale.amount_paid || 0));
      if (agingStatus(sale) === "Terlambat") current.overdue += 1;
      customerMap.set(customer, current);
    });
    const customerSheet = XLSX.utils.json_to_sheet(Array.from(customerMap, ([customer, value]) => ({
      Customer: customer,
      "Jumlah Invoice": value.invoices,
      "Total Tagihan": value.total,
      "Sudah Dibayar": value.paid,
      "Belum Dibayar": value.outstanding,
      "Invoice Terlambat": value.overdue,
    })));
    customerSheet["!cols"] = [{ wch: 32 }, { wch: 15 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sourceSheet, "RAW");
    XLSX.utils.book_append_sheet(workbook, summarySheet, "SUMMARY");
    XLSX.utils.book_append_sheet(workbook, customerSheet, "PIUTANG CUSTOMER");
    const file = XLSX.write(workbook, { type: "array", bookType: "xlsx", compression: true }) as ArrayBuffer;
    const filename = `PT MDA Monitoring RAB - ${new Date().toISOString().slice(0, 10)}.xlsx`;

    return new Response(file, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[api/excel/download] failed", error);
    return Response.json({ error: error instanceof Error ? error.message : "File Excel belum berhasil dibuat." }, { status: 500 });
  }
}
