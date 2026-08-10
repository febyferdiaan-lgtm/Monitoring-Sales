import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "../../authz";
import { createSupabaseServerClient, isSupabaseConfigured } from "../../supabase/server";
import { getD1Database } from "../../d1";

type DocumentItem = {
  spare_part_id?: number | null;
  part_number?: string;
  description?: string;
  quantity?: number;
  unit?: string;
  unit_price?: number;
};

type DocumentInput = {
  type?: "QUOTATION" | "INVOICE";
  customer?: string;
  customer_address?: string;
  customer_pic?: string;
  project?: string;
  reference_no?: string;
  document_date?: string;
  due_date?: string;
  tax_percent?: number;
  notes?: string;
  items?: DocumentItem[];
};

const documentSchema = `CREATE TABLE IF NOT EXISTS sales_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_type TEXT NOT NULL,
  document_number TEXT NOT NULL UNIQUE,
  customer TEXT NOT NULL,
  customer_address TEXT NOT NULL DEFAULT '',
  customer_pic TEXT NOT NULL DEFAULT '',
  project TEXT NOT NULL DEFAULT '',
  reference_no TEXT NOT NULL DEFAULT '',
  document_date TEXT NOT NULL,
  due_date TEXT NOT NULL DEFAULT '',
  subtotal REAL NOT NULL DEFAULT 0,
  tax_percent REAL NOT NULL DEFAULT 11,
  tax_amount REAL NOT NULL DEFAULT 0,
  grand_total REAL NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'DRAFT',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`;

const itemSchema = `CREATE TABLE IF NOT EXISTS sales_document_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL,
  spare_part_id INTEGER,
  part_number TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'Pcs',
  unit_price REAL NOT NULL DEFAULT 0,
  line_total REAL NOT NULL DEFAULT 0,
  FOREIGN KEY(document_id) REFERENCES sales_documents(id) ON DELETE CASCADE
)`;

const getDb = async () => {
  return getD1Database();
};

async function ensureDatabase() {
  if (isSupabaseConfigured()) return;
  const db = await getDb();
  await db.batch([
    db.prepare(documentSchema),
    db.prepare(itemSchema),
    db.prepare("CREATE INDEX IF NOT EXISTS sales_documents_customer_idx ON sales_documents(customer)"),
    db.prepare("CREATE INDEX IF NOT EXISTS sales_document_items_document_idx ON sales_document_items(document_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS sales_documents_type_id_idx ON sales_documents(document_type, id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS sales_document_items_spare_part_idx ON sales_document_items(spare_part_id, document_id)"),
  ]);
}

const romanMonths = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

async function nextDocumentNumber(type: "QUOTATION" | "INVOICE", date: string) {
  const parsed = new Date(`${date}T00:00:00`);
  const year = Number.isNaN(parsed.valueOf()) ? new Date().getFullYear() : parsed.getFullYear();
  const month = Number.isNaN(parsed.valueOf()) ? new Date().getMonth() : parsed.getMonth();
  if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    const { count, error } = await supabase.from("sales_documents")
      .select("id", { count: "exact", head: true })
      .eq("document_type", type).like("document_date", `${year}%`);
    if (error) throw error;
    const sequence = String(Number(count ?? 0) + 1).padStart(3, "0");
    return `${sequence}/MDA-${type === "INVOICE" ? "INV" : "QUOT"}/${romanMonths[month]}/${year}`;
  }
  const db = await getDb();
  const result = await db.prepare(
    "SELECT COUNT(*) AS total FROM sales_documents WHERE document_type = ? AND substr(document_date, 1, 4) = ?"
  ).bind(type, String(year)).first<{ total: number }>();
  const sequence = String(Number(result?.total ?? 0) + 1).padStart(3, "0");
  return `${sequence}/MDA-${type === "INVOICE" ? "INV" : "QUOT"}/${romanMonths[month]}/${year}`;
}

export async function GET(request: NextRequest) {
  try {
    const access = await requireRole(request, ["ADMIN", "EDITOR", "VIEWER"]);
    if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });
    await ensureDatabase();
    if (isSupabaseConfigured()) {
      const supabase = await createSupabaseServerClient();
      const [{ data: documents, error: documentError }, { data: items, error: itemError }] = await Promise.all([
        supabase.from("sales_documents").select("*").order("created_at", { ascending: false }).order("id", { ascending: false }),
        supabase.from("sales_document_items").select("*").order("id"),
      ]);
      if (documentError) throw documentError;
      if (itemError) throw itemError;
      const grouped = new Map<number, Record<string, unknown>[]>();
      (items ?? []).forEach((item) => {
        const id = Number(item.document_id);
        grouped.set(id, [...(grouped.get(id) ?? []), item]);
      });
      return NextResponse.json({ data: (documents ?? []).map((document) => ({ ...document, items: grouped.get(Number(document.id)) ?? [] })) });
    }
    const db = await getDb();
    const documents = await db.prepare("SELECT * FROM sales_documents ORDER BY created_at DESC, id DESC").all<Record<string, unknown>>();
    const items = await db.prepare("SELECT * FROM sales_document_items ORDER BY id ASC").all<Record<string, unknown>>();
    const grouped = new Map<number, Record<string, unknown>[]>();
    items.results.forEach((item) => {
      const id = Number(item.document_id);
      grouped.set(id, [...(grouped.get(id) ?? []), item]);
    });
    return NextResponse.json({
      data: documents.results.map((document) => ({ ...document, items: grouped.get(Number(document.id)) ?? [] })),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load documents" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const access = await requireRole(request, ["ADMIN", "EDITOR"]);
    if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });
    await ensureDatabase();
    const body = await request.json() as DocumentInput;
    const type = body.type === "INVOICE" ? "INVOICE" : "QUOTATION";
    const customer = String(body.customer || "").trim();
    const items = (body.items ?? []).filter((item) => String(item.description || "").trim() && Number(item.quantity || 0) > 0);
    if (!customer || !items.length) return NextResponse.json({ error: "Customer and items are required" }, { status: 400 });

    const documentDate = String(body.document_date || new Date().toISOString().slice(0, 10));
    const number = await nextDocumentNumber(type, documentDate);
    const taxPercent = Math.max(0, Number(body.tax_percent ?? 11));
    const subtotal = items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_price || 0), 0);
    const taxAmount = subtotal * taxPercent / 100;
    const grandTotal = subtotal + taxAmount;
    const now = new Date().toISOString();
    if (isSupabaseConfigured()) {
      const supabase = await createSupabaseServerClient();
      const { data: inserted, error: documentError } = await supabase.from("sales_documents").insert({
        document_type: type, document_number: number, customer,
        customer_address: String(body.customer_address || ""), customer_pic: String(body.customer_pic || ""),
        project: String(body.project || ""), reference_no: String(body.reference_no || ""),
        document_date: documentDate, due_date: String(body.due_date || ""), subtotal,
        tax_percent: taxPercent, tax_amount: taxAmount, grand_total: grandTotal,
        notes: String(body.notes || ""), status: "DRAFT", created_at: now, updated_at: now,
      }).select("id").single();
      if (documentError || !inserted) throw documentError ?? new Error("Dokumen gagal dibuat.");
      const documentId = Number(inserted.id);
      const { error: itemError } = await supabase.from("sales_document_items").insert(items.map((item) => ({
        document_id: documentId, spare_part_id: item.spare_part_id ? Number(item.spare_part_id) : null,
        part_number: String(item.part_number || ""), description: String(item.description || ""),
        quantity: Number(item.quantity || 0), unit: String(item.unit || "Pcs"), unit_price: Number(item.unit_price || 0),
        line_total: Number(item.quantity || 0) * Number(item.unit_price || 0),
      })));
      if (itemError) throw itemError;
      const sourceKey = `document-${type.toLowerCase()}-${documentId}`;
      const { error: saleError } = await supabase.from("sales").upsert({
        source_key: sourceKey, customer, location: "", transaction_type: "Trading Part",
        project: String(body.project || items[0]?.description || ""), rfq_no: "",
        quotation_no: type === "QUOTATION" ? number : String(body.reference_no || ""),
        po_no: "", delivery_no: "", invoice_no: type === "INVOICE" ? number : "",
        invoice_amount: grandTotal, amount_paid: 0, due_date: type === "INVOICE" ? String(body.due_date || "") : "",
        payment_date: "", payment_status: "OPEN", transaction_status: "Open",
        notes: `${type === "INVOICE" ? "Invoice" : "Quotation"} dibuat dari modul dokumen.`, created_at: now, updated_at: now,
      }, { onConflict: "source_key" });
      if (saleError) throw saleError;
      return NextResponse.json({ ok: true, id: documentId, document_number: number });
    }
    const db = await getDb();

    const inserted = await db.prepare(
      `INSERT INTO sales_documents (
        document_type, document_number, customer, customer_address, customer_pic, project,
        reference_no, document_date, due_date, subtotal, tax_percent, tax_amount, grand_total,
        notes, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?)`
    ).bind(
      type,
      number,
      customer,
      String(body.customer_address || ""),
      String(body.customer_pic || ""),
      String(body.project || ""),
      String(body.reference_no || ""),
      documentDate,
      String(body.due_date || ""),
      subtotal,
      taxPercent,
      taxAmount,
      grandTotal,
      String(body.notes || ""),
      now,
      now
    ).run();
    const documentId = Number(inserted.meta.last_row_id);

    await db.batch(items.map((item) => db.prepare(
      `INSERT INTO sales_document_items (
        document_id, spare_part_id, part_number, description, quantity, unit, unit_price, line_total
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      documentId,
      item.spare_part_id ? Number(item.spare_part_id) : null,
      String(item.part_number || ""),
      String(item.description || ""),
      Number(item.quantity || 0),
      String(item.unit || "Pcs"),
      Number(item.unit_price || 0),
      Number(item.quantity || 0) * Number(item.unit_price || 0)
    )));

    const salesExists = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sales'").first();
    if (salesExists) {
      const sourceKey = `document-${type.toLowerCase()}-${documentId}`;
      await db.prepare(
        `INSERT INTO sales (
          source_key, customer, location, transaction_type, project, rfq_no, quotation_no,
          po_no, delivery_no, invoice_no, invoice_amount, amount_paid, due_date, payment_date,
          payment_status, transaction_status, notes, created_at, updated_at
        ) VALUES (?, ?, '', 'Trading Part', ?, '', ?, '', '', ?, ?, 0, ?, '', 'OPEN', 'Open', ?, ?, ?)
        ON CONFLICT(source_key) DO UPDATE SET customer=excluded.customer, project=excluded.project,
          quotation_no=excluded.quotation_no, invoice_no=excluded.invoice_no,
          invoice_amount=excluded.invoice_amount, due_date=excluded.due_date, updated_at=excluded.updated_at`
      ).bind(
        sourceKey,
        customer,
        String(body.project || items[0]?.description || ""),
        type === "QUOTATION" ? number : String(body.reference_no || ""),
        type === "INVOICE" ? number : "",
        grandTotal,
        type === "INVOICE" ? String(body.due_date || "") : "",
        `${type === "INVOICE" ? "Invoice" : "Quotation"} dibuat dari modul dokumen.`,
        now,
        now
      ).run();
    }

    return NextResponse.json({ ok: true, id: documentId, document_number: number });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create document" }, { status: 500 });
  }
}
