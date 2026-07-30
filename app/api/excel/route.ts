import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "../../authz";
import { ensureExcelData } from "../../excel-data";

async function getD1() {
  const { env } = await import("cloudflare:workers");
  if (!env.DB) throw new Error("Database binding is unavailable");
  return env.DB;
}

export async function GET(request: NextRequest) {
  const access = await requireRole(request, ["ADMIN", "EDITOR", "VIEWER"]);
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });
  await ensureExcelData();
  const documentType = request.nextUrl.searchParams.get("document_type");
  const documentNo = request.nextUrl.searchParams.get("document_no")?.trim() ?? "";
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const page = Math.max(1, Number(request.nextUrl.searchParams.get("page") || 1));
  const limit = 30;
  const offset = (page - 1) * limit;
  const db = await getD1();
  if (documentNo && (documentType === "invoice" || documentType === "po")) {
    const field = documentType === "invoice" ? "invoice_no" : "po_no";
    const result = await db.prepare(
      `SELECT id, row_number, customer, project, rfq_no, quotation_no, po_no, invoice_no,
              part_number, description, amount, payment_status, raw_json
       FROM excel_rows WHERE ${field} = ? ORDER BY row_number LIMIT 200`,
    ).bind(documentNo).all();
    return NextResponse.json({
      data: result.results.map((row) => ({ ...row, raw: JSON.parse(String(row.raw_json || "{}")), raw_json: undefined })),
      total: result.results.length,
    });
  }
  const where = query
    ? "WHERE customer LIKE ? OR project LIKE ? OR rfq_no LIKE ? OR quotation_no LIKE ? OR po_no LIKE ? OR invoice_no LIKE ? OR part_number LIKE ? OR description LIKE ?"
    : "";
  const args = query ? Array(8).fill(`%${query}%`) : [];
  const total = await db.prepare(`SELECT COUNT(*) AS total FROM excel_rows ${where}`).bind(...args).first<{ total: number }>();
  const result = await db.prepare(
    `SELECT id, row_number, customer, project, rfq_no, quotation_no, po_no, invoice_no,
            part_number, description, amount, payment_status, raw_json
     FROM excel_rows ${where} ORDER BY row_number LIMIT ? OFFSET ?`,
  ).bind(...args, limit, offset).all();
  const source = await db.prepare(
    "SELECT source_file, imported_at, row_count FROM data_imports ORDER BY imported_at DESC LIMIT 1",
  ).first();
  return NextResponse.json({
    data: result.results.map((row) => ({ ...row, raw: JSON.parse(String(row.raw_json || "{}")), raw_json: undefined })),
    page,
    total: Number(total?.total ?? 0),
    pages: Math.max(1, Math.ceil(Number(total?.total ?? 0) / limit)),
    source,
  });
}
