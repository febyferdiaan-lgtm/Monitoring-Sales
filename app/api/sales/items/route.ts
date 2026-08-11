import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "../../../authz";
import { createSupabaseServerClient, isSupabaseConfigured } from "../../../supabase/server";
import { getD1Database } from "../../../d1";

type PoDocument = {
  id: number;
  document_number: string;
  customer: string;
  project: string;
};

type PoItem = {
  id: number;
  part_number: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  line_total: number;
};

const toExcelShape = (document: PoDocument, items: PoItem[]) => items.map((item, index) => ({
  id: item.id,
  row_number: index + 1,
  customer: document.customer,
  project: document.project,
  rfq_no: "",
  quotation_no: "",
  po_no: document.document_number,
  invoice_no: "",
  part_number: item.part_number,
  description: item.description,
  amount: Number(item.line_total || 0),
  payment_status: "OPEN",
  raw: {
    po_no: document.document_number,
    po_part_number: item.part_number,
    po_description: item.description,
    po_qty: Number(item.quantity || 0),
    po_uom: item.unit,
    po_price: Number(item.unit_price || 0),
    po_amount: Number(item.line_total || 0),
    invoice_part_number: item.part_number,
    invoice_description: item.description,
    invoice_qty: Number(item.quantity || 0),
    invoice_uom: item.unit,
  },
}));

export async function GET(request: NextRequest) {
  try {
    const access = await requireRole(request, ["ADMIN", "EDITOR", "VIEWER"]);
    if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });
    const poNo = String(request.nextUrl.searchParams.get("po_no") || "").trim();
    if (!poNo) return NextResponse.json({ data: [] });
    if (isSupabaseConfigured()) {
      const supabase = await createSupabaseServerClient();
      const { data: document, error: documentError } = await supabase.from("sales_documents")
        .select("id,document_number,customer,project")
        .eq("document_type", "PURCHASE_ORDER")
        .eq("document_number", poNo)
        .maybeSingle();
      if (documentError) throw documentError;
      if (!document) return NextResponse.json({ data: [] });
      const { data: items, error: itemError } = await supabase.from("sales_document_items")
        .select("id,part_number,description,quantity,unit,unit_price,line_total")
        .eq("document_id", Number(document.id))
        .order("id");
      if (itemError) throw itemError;
      return NextResponse.json({ data: toExcelShape(document as PoDocument, (items ?? []) as PoItem[]) });
    }
    const db = await getD1Database();
    const document = await db.prepare(
      "SELECT id, document_number, customer, project FROM sales_documents WHERE document_type = 'PURCHASE_ORDER' AND document_number = ? LIMIT 1"
    ).bind(poNo).first<PoDocument>();
    if (!document) return NextResponse.json({ data: [] });
    const items = await db.prepare(
      "SELECT id, part_number, description, quantity, unit, unit_price, line_total FROM sales_document_items WHERE document_id = ? ORDER BY id"
    ).bind(document.id).all<PoItem>();
    return NextResponse.json({ data: toExcelShape(document, items.results) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Detail produk PO belum dapat dimuat." }, { status: 500 });
  }
}
