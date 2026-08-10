import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "../../authz";
import { ensureExcelData } from "../../excel-data";
import { planExcelPaymentSync, type ExcelPaymentRow } from "../../excel-payment-sync";
import { createSupabaseServerClient, isSupabaseConfigured } from "../../supabase/server";
import { getD1Database } from "../../d1";

async function getD1() {
  return getD1Database();
}

type RawImportRow = {
  row_number?: number;
  customer?: string;
  project?: string;
  rfq_no?: string;
  quotation_no?: string;
  po_no?: string;
  invoice_no?: string;
  part_number?: string;
  description?: string;
  amount?: number;
  payment_status?: string;
  raw?: Record<string, string | number>;
};

type SalesImportRecord = {
  source_key?: string;
  customer?: string;
  location?: string;
  transaction_type?: string;
  project?: string;
  rfq_no?: string;
  quotation_no?: string;
  po_no?: string;
  delivery_no?: string;
  invoice_no?: string;
  invoice_amount?: number;
  amount_paid?: number;
  due_date?: string;
  payment_date?: string;
  payment_status?: string;
  transaction_status?: string;
  notes?: string;
  created_at?: string;
};

export async function GET(request: NextRequest) {
  const access = await requireRole(request, ["ADMIN", "EDITOR", "VIEWER"]);
  if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });
  await ensureExcelData();
  const documentType = request.nextUrl.searchParams.get("document_type");
  const documentNo = request.nextUrl.searchParams.get("document_no")?.trim() ?? "";
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const allRows = request.nextUrl.searchParams.get("all") === "1";
  const page = Math.max(1, Number(request.nextUrl.searchParams.get("page") || 1));
  const limit = 30;
  const offset = (page - 1) * limit;
  if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    const columns = "id,row_number,customer,project,rfq_no,quotation_no,po_no,invoice_no,part_number,description,amount,payment_status,raw_json";
    const parseRows = (rows: Record<string, unknown>[]) => rows.map((row) => ({
      ...row,
      raw: typeof row.raw_json === "string" ? JSON.parse(row.raw_json || "{}") : row.raw_json ?? {},
      raw_json: undefined,
    }));
    const { data: imports, error: sourceError } = await supabase.from("data_imports")
      .select("source_file,imported_at,row_count").order("imported_at", { ascending: false }).limit(1);
    if (sourceError) return NextResponse.json({ error: sourceError.message }, { status: 500 });
    const source = imports?.[0] ?? null;
    if (allRows) {
      const { data, error } = await supabase.from("excel_rows").select(columns).order("row_number").limit(5000);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ data: parseRows((data ?? []) as Record<string, unknown>[]), total: data?.length ?? 0, source });
    }
    if (documentNo && (documentType === "invoice" || documentType === "po")) {
      const field = documentType === "invoice" ? "invoice_no" : "po_no";
      const { data, error } = await supabase.from("excel_rows").select(columns).eq(field, documentNo).order("row_number").limit(200);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ data: parseRows((data ?? []) as Record<string, unknown>[]), total: data?.length ?? 0 });
    }
    let builder = supabase.from("excel_rows").select(columns, { count: "exact" });
    if (query) {
      const term = query.replace(/[,%()]/g, " ").trim();
      const fields = ["customer", "project", "rfq_no", "quotation_no", "po_no", "invoice_no", "part_number", "description"];
      builder = builder.or(fields.map((field) => `${field}.ilike.%${term}%`).join(","));
    }
    const { data, count, error } = await builder.order("row_number").range(offset, offset + limit - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({
      data: parseRows((data ?? []) as Record<string, unknown>[]), page,
      total: count ?? 0, pages: Math.max(1, Math.ceil(Number(count ?? 0) / limit)), source,
    });
  }
  const db = await getD1();
  if (allRows) {
    const result = await db.prepare(
      `SELECT id, row_number, customer, project, rfq_no, quotation_no, po_no, invoice_no,
              part_number, description, amount, payment_status, raw_json
       FROM excel_rows ORDER BY row_number LIMIT 5000`,
    ).all();
    const source = await db.prepare(
      "SELECT source_file, imported_at, row_count FROM data_imports ORDER BY imported_at DESC LIMIT 1",
    ).first();
    return NextResponse.json({
      data: result.results.map((row) => ({ ...row, raw: JSON.parse(String(row.raw_json || "{}")), raw_json: undefined })),
      total: result.results.length,
      source,
    });
  }
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

export async function POST(request: NextRequest) {
  try {
    const access = await requireRole(request, ["ADMIN", "EDITOR"]);
    if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });
    await ensureExcelData();
    const body = await request.json() as { source_file?: string; rows?: RawImportRow[]; records?: SalesImportRecord[] };
    const rows = body.rows ?? [];
    const records = body.records ?? [];
    if (!rows.length || !records.length || rows.length > 5000 || records.length > 5000) {
      return NextResponse.json({ error: "File Excel tidak berisi data yang dapat diproses." }, { status: 400 });
    }

    if (isSupabaseConfigured()) {
      await importExcelToSupabase(body, rows, records);
      return NextResponse.json({ ok: true, imported_rows: rows.length, transactions: records.length });
    }

    const db = await getD1();
    const now = new Date().toISOString();
    const importVersion = `upload-${Date.now()}-${crypto.randomUUID()}`;
    await db.batch([
      db.prepare(
        "INSERT INTO data_imports (import_version, source_file, imported_at, row_count) VALUES (?, ?, ?, ?)",
      ).bind(importVersion, String(body.source_file || "Monitoring Sales.xlsx").slice(0, 180), now, rows.length),
      db.prepare("DELETE FROM excel_rows"),
      db.prepare("DELETE FROM data_imports WHERE import_version <> ?").bind(importVersion),
      db.prepare("DELETE FROM sales WHERE source_key LIKE 'seed-%' OR source_key LIKE 'xlsx-%' OR source_key LIKE 'xlsx:%' OR source_key LIKE 'upload:%'"),
    ]);

    for (let offset = 0; offset < rows.length; offset += 35) {
      const statements = rows.slice(offset, offset + 35).map((row, index) => db.prepare(
        `INSERT INTO excel_rows (
          import_version, row_number, customer, project, rfq_no, quotation_no, po_no,
          invoice_no, part_number, description, amount, payment_status, raw_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        importVersion, Number(row.row_number || offset + index + 1), String(row.customer || ""),
        String(row.project || ""), String(row.rfq_no || ""), String(row.quotation_no || ""),
        String(row.po_no || ""), String(row.invoice_no || ""), String(row.part_number || ""),
        String(row.description || ""), Number(row.amount || 0), String(row.payment_status || ""),
        JSON.stringify(row.raw || {}),
      ));
      await db.batch(statements);
    }

    for (let offset = 0; offset < records.length; offset += 35) {
      const statements = records.slice(offset, offset + 35).map((record, index) => {
        const sourceKey = String(record.source_key || `upload:manual:${offset + index}`);
        const invoiceAmount = Number(record.invoice_amount || 0);
        const amountPaid = Number(record.amount_paid || 0);
        const paymentStatus = amountPaid >= invoiceAmount && invoiceAmount > 0 ? "CLOSED" : String(record.payment_status || "OPEN");
        return db.prepare(
          `INSERT INTO sales (
            source_key, customer, location, transaction_type, project, rfq_no, quotation_no,
            po_no, delivery_no, invoice_no, invoice_amount, amount_paid, due_date, payment_date,
            payment_status, transaction_status, notes, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          sourceKey, String(record.customer || "Tanpa Nama"), String(record.location || ""),
          String(record.transaction_type || ""), String(record.project || ""), String(record.rfq_no || ""),
          String(record.quotation_no || ""), String(record.po_no || ""), String(record.delivery_no || ""),
          String(record.invoice_no || ""), invoiceAmount, amountPaid, String(record.due_date || ""),
          String(record.payment_date || ""), paymentStatus, String(record.transaction_status || ""),
          String(record.notes || ""), String(record.created_at || now), now,
        );
      });
      await db.batch(statements);
    }

    await db.batch([
      db.prepare(
        `UPDATE payment_confirmations SET sale_id = (
          SELECT sales.id FROM sales WHERE sales.invoice_no = payment_confirmations.invoice_no LIMIT 1
        ) WHERE status = 'PENDING' AND EXISTS (
          SELECT 1 FROM sales WHERE sales.invoice_no = payment_confirmations.invoice_no
        )`,
      ),
      db.prepare(
        `UPDATE payment_confirmations SET status = 'REJECTED', reviewed_at = ?,
         review_notes = 'Dibatalkan otomatis karena invoice tidak ada pada sumber Excel terbaru.'
         WHERE status = 'PENDING' AND NOT EXISTS (
           SELECT 1 FROM sales WHERE sales.invoice_no = payment_confirmations.invoice_no
         )`,
      ).bind(now),
    ]);
    await db.prepare(
      `UPDATE sales SET
        amount_paid = MIN(invoice_amount, MAX(amount_paid, COALESCE((
          SELECT SUM(amount) FROM payment_confirmations
          WHERE payment_confirmations.invoice_no = sales.invoice_no AND payment_confirmations.status = 'APPROVED'
        ), 0))),
        payment_status = CASE WHEN MIN(invoice_amount, MAX(amount_paid, COALESCE((
          SELECT SUM(amount) FROM payment_confirmations
          WHERE payment_confirmations.invoice_no = sales.invoice_no AND payment_confirmations.status = 'APPROVED'
        ), 0))) >= invoice_amount AND invoice_amount > 0 THEN 'CLOSED' ELSE payment_status END,
        payment_date = COALESCE((
          SELECT payment_date FROM payment_confirmations
          WHERE payment_confirmations.invoice_no = sales.invoice_no AND payment_confirmations.status = 'APPROVED'
          ORDER BY reviewed_at DESC LIMIT 1
        ), payment_date)
       WHERE invoice_no <> ''`,
    ).run();

    const paidSales = await db.prepare(
      "SELECT invoice_no, amount_paid, payment_date FROM sales WHERE invoice_no <> '' AND amount_paid > 0",
    ).all<{ invoice_no: string; amount_paid: number; payment_date: string }>();
    for (const sale of paidSales.results) {
      const excelRows = await db.prepare(
        "SELECT id, amount, raw_json FROM excel_rows WHERE invoice_no = ? ORDER BY row_number",
      ).bind(sale.invoice_no).all<ExcelPaymentRow>();
      const updates = planExcelPaymentSync(excelRows.results, sale.amount_paid, sale.payment_date);
      for (let offset = 0; offset < updates.length; offset += 35) {
        await db.batch(updates.slice(offset, offset + 35).map((update) => db.prepare(
          "UPDATE excel_rows SET payment_status = ?, raw_json = ? WHERE id = ?",
        ).bind(update.paymentStatus, update.rawJson, update.id)));
      }
    }
    await db.prepare("PRAGMA optimize").run();
    return NextResponse.json({ ok: true, imported_rows: rows.length, transactions: records.length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to import Excel source" }, { status: 500 });
  }
}

async function importExcelToSupabase(
  body: { source_file?: string },
  rows: RawImportRow[],
  records: SalesImportRecord[],
) {
  const supabase = await createSupabaseServerClient();
  const now = new Date().toISOString();
  const importVersion = `upload-${Date.now()}-${crypto.randomUUID()}`;

  let result = await supabase.from("data_imports").insert({
    import_version: importVersion,
    source_file: String(body.source_file || "Monitoring Sales.xlsx").slice(0, 180),
    imported_at: now,
    row_count: rows.length,
  });
  if (result.error) throw result.error;
  result = await supabase.from("excel_rows").delete().gte("id", 0);
  if (result.error) throw result.error;
  result = await supabase.from("data_imports").delete().neq("import_version", importVersion);
  if (result.error) throw result.error;

  const importedSales = records.map((record, index) => {
    const invoiceAmount = Number(record.invoice_amount || 0);
    const amountPaid = Number(record.amount_paid || 0);
    return {
      source_key: String(record.source_key || `upload:manual:${index}`),
      customer: String(record.customer || "Tanpa Nama"), location: String(record.location || ""),
      transaction_type: String(record.transaction_type || ""), project: String(record.project || ""),
      rfq_no: String(record.rfq_no || ""), quotation_no: String(record.quotation_no || ""),
      po_no: String(record.po_no || ""), delivery_no: String(record.delivery_no || ""), invoice_no: String(record.invoice_no || ""),
      invoice_amount: invoiceAmount, amount_paid: amountPaid, due_date: String(record.due_date || ""),
      payment_date: String(record.payment_date || ""),
      payment_status: amountPaid >= invoiceAmount && invoiceAmount > 0 ? "CLOSED" : String(record.payment_status || "OPEN"),
      transaction_status: String(record.transaction_status || ""), notes: String(record.notes || ""),
      created_at: String(record.created_at || now), updated_at: now,
    };
  });

  const { data: oldImportedSales, error: oldError } = await supabase.from("sales").select("id,source_key");
  if (oldError) throw oldError;
  const removableIds = (oldImportedSales ?? []).filter(({ source_key }) =>
    source_key.startsWith("seed-") || source_key.startsWith("xlsx-") || source_key.startsWith("xlsx:") || source_key.startsWith("upload:"),
  ).map(({ id }) => id);
  if (removableIds.length) {
    const { error } = await supabase.from("sales").delete().in("id", removableIds);
    if (error) throw error;
  }

  for (let offset = 0; offset < rows.length; offset += 500) {
    const payload = rows.slice(offset, offset + 500).map((row, index) => ({
      import_version: importVersion, row_number: Number(row.row_number || offset + index + 1),
      customer: String(row.customer || ""), project: String(row.project || ""), rfq_no: String(row.rfq_no || ""),
      quotation_no: String(row.quotation_no || ""), po_no: String(row.po_no || ""), invoice_no: String(row.invoice_no || ""),
      part_number: String(row.part_number || ""), description: String(row.description || ""), amount: Number(row.amount || 0),
      payment_status: String(row.payment_status || ""), raw_json: row.raw || {},
    }));
    const { error } = await supabase.from("excel_rows").insert(payload);
    if (error) throw error;
  }
  for (let offset = 0; offset < importedSales.length; offset += 500) {
    const { error } = await supabase.from("sales").insert(importedSales.slice(offset, offset + 500));
    if (error) throw error;
  }

  const { data: confirmations, error: confirmationError } = await supabase.from("payment_confirmations").select("*");
  if (confirmationError) throw confirmationError;
  const { data: sales, error: salesError } = await supabase.from("sales").select("id,invoice_no,invoice_amount,amount_paid,payment_date");
  if (salesError) throw salesError;
  const saleByInvoice = new Map((sales ?? []).filter((sale) => sale.invoice_no).map((sale) => [sale.invoice_no, sale]));
  for (const confirmation of confirmations ?? []) {
    const sale = saleByInvoice.get(confirmation.invoice_no);
    if (confirmation.status === "PENDING" && !sale) {
      const { error } = await supabase.from("payment_confirmations").update({
        status: "REJECTED", reviewed_at: now,
        review_notes: "Dibatalkan otomatis karena invoice tidak ada pada sumber Excel terbaru.",
      }).eq("id", confirmation.id);
      if (error) throw error;
    } else if (confirmation.status === "PENDING" && sale && Number(confirmation.sale_id) !== Number(sale.id)) {
      const { error } = await supabase.from("payment_confirmations").update({ sale_id: sale.id }).eq("id", confirmation.id);
      if (error) throw error;
    }
  }

  const approvedByInvoice = new Map<string, { amount: number; paymentDate: string }>();
  for (const confirmation of confirmations ?? []) {
    if (confirmation.status !== "APPROVED") continue;
    const current = approvedByInvoice.get(confirmation.invoice_no) ?? { amount: 0, paymentDate: "" };
    current.amount += Number(confirmation.amount || 0);
    if (confirmation.payment_date) current.paymentDate = confirmation.payment_date;
    approvedByInvoice.set(confirmation.invoice_no, current);
  }
  for (const sale of sales ?? []) {
    const approved = approvedByInvoice.get(sale.invoice_no);
    if (!approved) continue;
    const amountPaid = Math.min(Number(sale.invoice_amount), Math.max(Number(sale.amount_paid), approved.amount));
    const { error } = await supabase.from("sales").update({
      amount_paid: amountPaid,
      payment_status: Number(sale.invoice_amount) > 0 && amountPaid >= Number(sale.invoice_amount) ? "CLOSED" : "OPEN",
      payment_date: approved.paymentDate || sale.payment_date,
      updated_at: now,
    }).eq("id", sale.id);
    if (error) throw error;
  }

  const { data: paidSales, error: paidSalesError } = await supabase.from("sales")
    .select("invoice_no,amount_paid,payment_date").neq("invoice_no", "").gt("amount_paid", 0);
  if (paidSalesError) throw paidSalesError;
  for (const sale of paidSales ?? []) {
    const { data: excelRows, error: excelError } = await supabase.from("excel_rows")
      .select("id,amount,raw_json").eq("invoice_no", sale.invoice_no).order("row_number");
    if (excelError) throw excelError;
    const updates = planExcelPaymentSync((excelRows ?? []).map((row) => ({
      id: Number(row.id), amount: Number(row.amount),
      raw_json: typeof row.raw_json === "string" ? row.raw_json : JSON.stringify(row.raw_json ?? {}),
    })), Number(sale.amount_paid), String(sale.payment_date || ""));
    for (const update of updates) {
      const { error } = await supabase.from("excel_rows").update({
        payment_status: update.paymentStatus,
        raw_json: JSON.parse(update.rawJson),
      }).eq("id", update.id);
      if (error) throw error;
    }
  }
}
