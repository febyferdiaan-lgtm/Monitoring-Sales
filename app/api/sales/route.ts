import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "../../authz";
import { seedSalesFromExcel } from "../../excel-data";
import { createSupabaseServerClient, isSupabaseConfigured } from "../../supabase/server";
import { getD1Database } from "../../d1";

type InputRecord = {
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
};

type PoItem = {
  spare_part_id?: number | null;
  part_number?: string;
  description?: string;
  quantity?: number;
  unit?: string;
  unit_price?: number;
};

const schemaSql = `CREATE TABLE IF NOT EXISTS sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_key TEXT NOT NULL UNIQUE,
  customer TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  transaction_type TEXT NOT NULL DEFAULT '',
  project TEXT NOT NULL DEFAULT '',
  rfq_no TEXT NOT NULL DEFAULT '',
  quotation_no TEXT NOT NULL DEFAULT '',
  po_no TEXT NOT NULL DEFAULT '',
  delivery_no TEXT NOT NULL DEFAULT '',
  invoice_no TEXT NOT NULL DEFAULT '',
  invoice_amount REAL NOT NULL DEFAULT 0,
  amount_paid REAL NOT NULL DEFAULT 0,
  due_date TEXT NOT NULL DEFAULT '',
  payment_date TEXT NOT NULL DEFAULT '',
  payment_status TEXT NOT NULL DEFAULT 'OPEN',
  transaction_status TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`;

const poDocumentSchema = `CREATE TABLE IF NOT EXISTS sales_documents (
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
  tax_percent REAL NOT NULL DEFAULT 0,
  tax_amount REAL NOT NULL DEFAULT 0,
  grand_total REAL NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'RECEIVED',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`;

const poItemSchema = `CREATE TABLE IF NOT EXISTS sales_document_items (
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

const seed: InputRecord[] = [
  { source_key: "seed-001", customer: "Pertamina Port and Logistic", location: "Jakarta", transaction_type: "Pengadaan", project: "Jaket Brand Wood", rfq_no: "027/MDA-HO/RFQ/V/2025", quotation_no: "062/MDA/XII-2025", po_no: "1286/PPB/XII/25", delivery_no: "037/SJ-MDA/XII/2025", invoice_no: "017/MDA-INV/XII/2025", invoice_amount: 1084947300, amount_paid: 1084947300, due_date: "2025-12-05", payment_date: "2025-12-05", payment_status: "CLOSED", transaction_status: "Done Invoice", notes: "Pembayaran diterima." },
  { source_key: "seed-002", customer: "Kementrian PanRB", location: "Jakarta", transaction_type: "Pengadaan", project: "Seragam Brand Executive", rfq_no: "028/MDA-HO/RFQ/V/2025", quotation_no: "068/MDA/XII-2025", po_no: "EP-01KC0MZ6M6DV5W9V5TXVPBM33A", delivery_no: "034/SJ-MDA/XII/2025", invoice_no: "022/MDA-INV/XII/2025", invoice_amount: 929628330, amount_paid: 929628330, due_date: "2026-01-30", payment_date: "2026-01-30", payment_status: "CLOSED", transaction_status: "Done Invoice", notes: "Transaksi selesai." },
  { source_key: "seed-003", customer: "Waskita Beton Preacast", location: "Jakarta", transaction_type: "Trading Part", project: "TM 125", rfq_no: "029/MDA-HO/RFQ/I/2026", quotation_no: "069/MDA/I-2026", po_no: "4100013843/SPPB.NONOA/WBP/2026", delivery_no: "046/SJ-MDA/I/2026", invoice_no: "025/MDA-INV/I/2026", invoice_amount: 2401862.4, amount_paid: 0, due_date: "2026-03-16", payment_status: "OPEN", transaction_status: "Done Invoice", notes: "Menunggu pembayaran customer." },
  { source_key: "seed-004", customer: "Waskita Beton Preacast", location: "Jakarta", transaction_type: "Trading Part", project: "TM 133", rfq_no: "029/MDA-HO/RFQ/I/2026", quotation_no: "069/MDA/I-2026", po_no: "4100013863/SPPB.NONOA/WBP/2026", delivery_no: "044/SJ-MDA/I/2026", invoice_no: "030/MDA-INV/I/2026", invoice_amount: 804972, amount_paid: 0, due_date: "2026-03-16", payment_status: "OPEN", transaction_status: "Done Invoice", notes: "Follow up finance WBP." },
  { source_key: "seed-005", customer: "Waskita Beton Preacast", location: "Jakarta", transaction_type: "Trading Part", project: "Part Repair", rfq_no: "029/MDA-HO/RFQ/I/2026", quotation_no: "070/MDA/I-2026", po_no: "4100013828/SPPB/Non-OA/1/2026", delivery_no: "047/SJ-MDA/I/2026", invoice_no: "031/MDA-INV/I/2026", invoice_amount: 11900310, amount_paid: 0, due_date: "2026-03-20", payment_status: "OPEN", transaction_status: "Done Invoice", notes: "Invoice terkirim, pembayaran belum diterima." },
  { source_key: "seed-006", customer: "Waskita Beton Preacast", location: "Jakarta", transaction_type: "Trading Part", project: "Part QHSE", rfq_no: "030/MDA-HO/RFQ/I/2026", quotation_no: "067/MDA/I-2026", po_no: "4100013905/SPPB.NONOA/WBP/2026", delivery_no: "049/SJ-MDA/I/2026", invoice_no: "032/MDA-INV/I/2026", invoice_amount: 1356486.6, amount_paid: 0, due_date: "2026-03-29", payment_status: "OPEN", transaction_status: "Done Invoice", notes: "Perlu follow up." },
  { source_key: "seed-007", customer: "Waskita Beton Preacast", location: "Jakarta", transaction_type: "Trading Part", project: "Part Repair", rfq_no: "031/MDA-HO/RFQ/I/2026", quotation_no: "072/MDA/I-2026", po_no: "4100013919/SPPB/NON-OA/1/2026", delivery_no: "051/SJ-MDA/I/2026", invoice_no: "033/MDA-INV/I/2026", invoice_amount: 4097010, amount_paid: 0, due_date: "2026-04-03", payment_status: "OPEN", transaction_status: "Done Invoice", notes: "Menunggu jadwal pembayaran." },
  { source_key: "seed-008", customer: "Pilar Pratama Dinamika", location: "Balikpapan", transaction_type: "Trading Part", project: "Spare Part Hydraulic", rfq_no: "041/MDA-HO/RFQ/II/2026", quotation_no: "081/MDA/II-2026", po_no: "PPD/PO/026/2026", delivery_no: "", invoice_no: "", invoice_amount: 78500000, amount_paid: 0, payment_status: "OPEN", transaction_status: "Open", notes: "Barang dalam proses pengiriman." },
  { source_key: "seed-009", customer: "GMT", location: "Cilegon", transaction_type: "Trading Part", project: "Safety Equipment", rfq_no: "044/MDA-HO/RFQ/II/2026", quotation_no: "087/MDA/II-2026", po_no: "", delivery_no: "", invoice_no: "", invoice_amount: 46250000, amount_paid: 0, payment_status: "OPEN", transaction_status: "Open", notes: "Menunggu PO customer." },
  { source_key: "seed-010", customer: "PT. Auger Sistem Indonesia", location: "Balikpapan", transaction_type: "Trading Part", project: "Spare Part Mobil Crane", rfq_no: "001/MDA-HO/RFQ/II/2025", quotation_no: "001/MDA-HO/RFQ/II/2025", po_no: "", delivery_no: "", invoice_no: "", invoice_amount: 18500000, amount_paid: 0, payment_status: "OPEN", transaction_status: "Closed", notes: "Waiting budget, last update 21 May." },
  { source_key: "seed-011", customer: "Sinarmas", location: "Riau", transaction_type: "Pengadaan", project: "Seragam Operasional", rfq_no: "050/MDA-HO/RFQ/III/2026", quotation_no: "", po_no: "", delivery_no: "", invoice_no: "", invoice_amount: 125000000, amount_paid: 0, payment_status: "OPEN", transaction_status: "Open", notes: "RFQ sedang dihitung." },
];

const getDb = async () => {
  return getD1Database();
};

async function ensureDatabase() {
  if (isSupabaseConfigured()) return;
  const db = await getDb();
  await db.batch([
    db.prepare(schemaSql),
    db.prepare(poDocumentSchema),
    db.prepare(poItemSchema),
    db.prepare("CREATE INDEX IF NOT EXISTS sales_customer_idx ON sales(customer)"),
    db.prepare("CREATE INDEX IF NOT EXISTS sales_due_date_idx ON sales(due_date)"),
    db.prepare("CREATE INDEX IF NOT EXISTS sales_document_items_document_idx ON sales_document_items(document_id)"),
  ]);
  const count = await db.prepare("SELECT COUNT(*) AS total FROM sales").first<{ total: number }>();
  if (Number(count?.total ?? 0) === 0) await upsertRecords(seed);
  await db.prepare(
    `UPDATE sales
     SET invoice_amount = (
       SELECT quotation.grand_total
       FROM sales_documents quotation
       WHERE quotation.document_type = 'QUOTATION'
         AND quotation.document_number = sales.quotation_no
       LIMIT 1
     ), updated_at = ?
     WHERE po_no <> '' AND quotation_no <> '' AND invoice_no = ''
       AND EXISTS (
         SELECT 1 FROM sales_documents quotation
         WHERE quotation.document_type = 'QUOTATION'
           AND quotation.document_number = sales.quotation_no
           AND ABS(quotation.grand_total - sales.invoice_amount) > 0.01
       )`
  ).bind(new Date().toISOString()).run();
}

async function savePoDocument(poNo: string, record: InputRecord, inputItems: PoItem[]) {
  const items = inputItems.filter((item) => String(item.description || "").trim() && Number(item.quantity || 0) > 0);
  if (!items.length) throw new Error("Tambahkan minimal satu produk pada PO.");
  const subtotal = items.reduce((sum, item) => sum + Number(item.quantity || 0) * Math.max(0, Number(item.unit_price || 0)), 0);
  const requestedTotal = Number(record.invoice_amount);
  const grandTotal = Number.isFinite(requestedTotal) && requestedTotal >= 0 ? requestedTotal : subtotal;
  const taxAmount = Math.max(0, grandTotal - subtotal);
  const taxPercent = subtotal > 0 ? taxAmount / subtotal * 100 : 0;
  const now = new Date().toISOString();
  const document = {
    document_type: "PURCHASE_ORDER",
    document_number: poNo,
    customer: String(record.customer || "").trim(),
    customer_address: "",
    customer_pic: "",
    project: String(record.project || "").trim(),
    reference_no: String(record.quotation_no || "").trim(),
    document_date: now.slice(0, 10),
    due_date: "",
    subtotal,
    tax_percent: taxPercent,
    tax_amount: taxAmount,
    grand_total: grandTotal,
    notes: String(record.notes || "").trim(),
    status: "RECEIVED",
    created_at: now,
    updated_at: now,
  };
  if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    const { data: saved, error: documentError } = await supabase.from("sales_documents")
      .upsert(document, { onConflict: "document_number" }).select("id").single();
    if (documentError || !saved) throw documentError ?? new Error("Detail PO gagal disimpan.");
    const documentId = Number(saved.id);
    const { error: deleteError } = await supabase.from("sales_document_items").delete().eq("document_id", documentId);
    if (deleteError) throw deleteError;
    const { error: itemError } = await supabase.from("sales_document_items").insert(items.map((item) => ({
      document_id: documentId,
      spare_part_id: item.spare_part_id ? Number(item.spare_part_id) : null,
      part_number: String(item.part_number || "").trim(),
      description: String(item.description || "").trim(),
      quantity: Number(item.quantity || 0),
      unit: String(item.unit || "Pcs").trim(),
      unit_price: Math.max(0, Number(item.unit_price || 0)),
      line_total: Number(item.quantity || 0) * Math.max(0, Number(item.unit_price || 0)),
    })));
    if (itemError) throw itemError;
    return;
  }
  const db = await getDb();
  await db.prepare(
    `INSERT INTO sales_documents (
      document_type, document_number, customer, customer_address, customer_pic, project,
      reference_no, document_date, due_date, subtotal, tax_percent, tax_amount, grand_total,
      notes, status, created_at, updated_at
    ) VALUES (?, ?, ?, '', '', ?, ?, ?, '', ?, ?, ?, ?, ?, 'RECEIVED', ?, ?)
    ON CONFLICT(document_number) DO UPDATE SET
      document_type=excluded.document_type, customer=excluded.customer, project=excluded.project,
      reference_no=excluded.reference_no, subtotal=excluded.subtotal, tax_percent=excluded.tax_percent,
      tax_amount=excluded.tax_amount, grand_total=excluded.grand_total,
      notes=excluded.notes, status='RECEIVED', updated_at=excluded.updated_at`
  ).bind("PURCHASE_ORDER", poNo, document.customer, document.project, document.reference_no,
    document.document_date, subtotal, taxPercent, taxAmount, grandTotal, document.notes, now, now).run();
  const saved = await db.prepare("SELECT id FROM sales_documents WHERE document_number = ? LIMIT 1").bind(poNo).first<{ id: number }>();
  if (!saved?.id) throw new Error("Detail PO gagal disimpan.");
  await db.prepare("DELETE FROM sales_document_items WHERE document_id = ?").bind(saved.id).run();
  await db.batch(items.map((item) => db.prepare(
    `INSERT INTO sales_document_items (document_id, spare_part_id, part_number, description, quantity, unit, unit_price, line_total)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(saved.id, item.spare_part_id ? Number(item.spare_part_id) : null, String(item.part_number || "").trim(),
    String(item.description || "").trim(), Number(item.quantity || 0), String(item.unit || "Pcs").trim(),
    Math.max(0, Number(item.unit_price || 0)), Number(item.quantity || 0) * Math.max(0, Number(item.unit_price || 0)))));
}

const normalized = (record: InputRecord, index = 0) => {
  const now = new Date().toISOString();
  return {
    source_key: record.source_key || `manual-${crypto.randomUUID()}-${index}`,
    customer: String(record.customer || "Tanpa Nama").trim(),
    location: String(record.location || ""),
    transaction_type: String(record.transaction_type || ""),
    project: String(record.project || ""),
    rfq_no: String(record.rfq_no || ""),
    quotation_no: String(record.quotation_no || ""),
    po_no: String(record.po_no || ""),
    delivery_no: String(record.delivery_no || ""),
    invoice_no: String(record.invoice_no || ""),
    invoice_amount: Number(record.invoice_amount || 0),
    amount_paid: Number(record.amount_paid || 0),
    due_date: String(record.due_date || ""),
    payment_date: String(record.payment_date || ""),
    payment_status: String(record.payment_status || "OPEN"),
    transaction_status: String(record.transaction_status || ""),
    notes: String(record.notes || ""),
    created_at: now,
    updated_at: now,
  };
};

async function upsertRecords(records: InputRecord[]) {
  const rows = records.map(normalized);
  if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    const keys = rows.map((row) => row.source_key);
    const { data: existing, error: readError } = await supabase.from("sales")
      .select("source_key,amount_paid,payment_date").in("source_key", keys);
    if (readError) throw readError;
    const existingByKey = new Map((existing ?? []).map((row) => [row.source_key, row]));
    const merged = rows.map((row) => {
      const current = existingByKey.get(row.source_key);
      const amountPaid = Math.max(Number(current?.amount_paid ?? 0), row.amount_paid);
      return {
        ...row,
        amount_paid: amountPaid,
        payment_date: Number(current?.amount_paid ?? 0) > row.amount_paid ? current?.payment_date ?? "" : row.payment_date,
        payment_status: row.invoice_amount > 0 && amountPaid >= row.invoice_amount ? "CLOSED" : row.payment_status,
      };
    });
    for (let offset = 0; offset < merged.length; offset += 500) {
      const { error } = await supabase.from("sales").upsert(merged.slice(offset, offset + 500), { onConflict: "source_key" });
      if (error) throw error;
    }
    return;
  }
  const db = await getDb();
  for (let offset = 0; offset < rows.length; offset += 40) {
    const statements = rows.slice(offset, offset + 40).map((row) => db.prepare(
      `INSERT INTO sales (
        source_key, customer, location, transaction_type, project, rfq_no, quotation_no,
        po_no, delivery_no, invoice_no, invoice_amount, amount_paid, due_date, payment_date,
        payment_status, transaction_status, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(source_key) DO UPDATE SET
        customer=excluded.customer, location=excluded.location, transaction_type=excluded.transaction_type,
        project=excluded.project, rfq_no=excluded.rfq_no, quotation_no=excluded.quotation_no,
        po_no=excluded.po_no, delivery_no=excluded.delivery_no, invoice_no=excluded.invoice_no,
        invoice_amount=excluded.invoice_amount, amount_paid=MAX(sales.amount_paid, excluded.amount_paid), due_date=excluded.due_date,
        payment_date=CASE WHEN sales.amount_paid > excluded.amount_paid THEN sales.payment_date ELSE excluded.payment_date END,
        payment_status=CASE WHEN MAX(sales.amount_paid, excluded.amount_paid) >= excluded.invoice_amount THEN 'CLOSED' ELSE excluded.payment_status END,
        transaction_status=excluded.transaction_status, notes=excluded.notes, updated_at=excluded.updated_at`
    ).bind(
      row.source_key, row.customer, row.location, row.transaction_type, row.project, row.rfq_no,
      row.quotation_no, row.po_no, row.delivery_no, row.invoice_no, row.invoice_amount, row.amount_paid,
      row.due_date, row.payment_date, row.payment_status, row.transaction_status, row.notes, row.created_at, row.updated_at
    ));
    await db.batch(statements);
  }
}

export async function GET(request: NextRequest) {
  try {
    const access = await requireRole(request, ["ADMIN", "EDITOR", "VIEWER"]);
    if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });
    await ensureDatabase();
    if (!isSupabaseConfigured()) await seedSalesFromExcel();
    if (isSupabaseConfigured()) {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase.from("sales").select("*")
        .order("updated_at", { ascending: false }).order("id", { ascending: false });
      if (error) throw error;
      return NextResponse.json({ data });
    }
    const result = await (await getDb()).prepare("SELECT * FROM sales ORDER BY updated_at DESC, id DESC").all();
    return NextResponse.json({ data: result.results });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load data" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const access = await requireRole(request, ["ADMIN", "EDITOR"]);
    if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });
    await ensureDatabase();
    const body = await request.json() as { action?: string; record?: InputRecord; records?: InputRecord[]; items?: PoItem[] };
    let records = body.action === "import" ? body.records ?? [] : body.record ? [body.record] : [];
    let directPo: InputRecord | null = null;
    if (body.action === "add_po") {
      const record = body.record ?? {};
      const customer = String(record.customer || "").trim();
      const project = String(record.project || "").trim();
      const poNo = String(record.po_no || "").trim();
      const poAmount = Number(record.invoice_amount || 0);
      if (!customer || !project || !poNo || !Number.isFinite(poAmount) || poAmount < 0) {
        return NextResponse.json({ error: "Customer, nomor PO, proyek, dan nilai PO wajib valid." }, { status: 400 });
      }
      if (isSupabaseConfigured()) {
        const supabase = await createSupabaseServerClient();
        const { data, error } = await supabase.from("sales").select("id").eq("po_no", poNo).limit(1);
        if (error) throw error;
        if (data?.length) return NextResponse.json({ error: `Nomor PO ${poNo} sudah terdaftar.` }, { status: 409 });
      } else {
        const existing = await (await getDb()).prepare("SELECT id FROM sales WHERE po_no = ? COLLATE NOCASE LIMIT 1").bind(poNo).first();
        if (existing) return NextResponse.json({ error: `Nomor PO ${poNo} sudah terdaftar.` }, { status: 409 });
      }
      directPo = {
        ...record,
        customer,
        project,
        po_no: poNo,
        rfq_no: "",
        quotation_no: "",
        amount_paid: 0,
        payment_status: "OPEN",
        transaction_status: "PO Diterima",
        notes: String(record.notes || "").trim() || "PO masuk langsung tanpa RFQ.",
      };
      records = [directPo];
    }
    if (!records.length || records.length > 5000) return NextResponse.json({ error: "Invalid records" }, { status: 400 });
    await upsertRecords(records);
    if (directPo) await savePoDocument(String(directPo.po_no), directPo, body.items ?? []);
    return NextResponse.json({ ok: true, imported: records.length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save data" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json() as InputRecord & { action?: string; id?: number; record?: InputRecord; items?: PoItem[] };
    const access = await requireRole(request, body.action === "accept_po" ? ["ADMIN", "EDITOR"] : ["ADMIN"]);
    if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });
    await ensureDatabase();
    if (!body.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    if (body.action === "accept_po") {
      const record = body.record ?? {};
      const poNo = String(record.po_no || "").trim();
      let poAmount = Number(record.invoice_amount || 0);
      if (!poNo || !Number.isFinite(poAmount) || poAmount < 0 || !(body.items ?? []).length) {
        return NextResponse.json({ error: "Nomor PO, nilai PO, dan detail produk wajib valid." }, { status: 400 });
      }
      const now = new Date().toISOString();
      if (isSupabaseConfigured()) {
        const supabase = await createSupabaseServerClient();
        const [{ data: current, error: currentError }, { data: duplicate, error: duplicateError }] = await Promise.all([
          supabase.from("sales").select("id,customer,location,transaction_type,project,rfq_no,quotation_no,po_no,notes").eq("id", Number(body.id)).single(),
          supabase.from("sales").select("id").eq("po_no", poNo).neq("id", Number(body.id)).limit(1),
        ]);
        if (currentError || !current) throw currentError ?? new Error("Quotation tidak ditemukan.");
        if (duplicateError) throw duplicateError;
        if (duplicate?.length) return NextResponse.json({ error: `Nomor PO ${poNo} sudah terdaftar.` }, { status: 409 });
        if (!current.quotation_no) return NextResponse.json({ error: "Transaksi ini belum memiliki quotation." }, { status: 400 });
        if (current.po_no) return NextResponse.json({ error: `Quotation ini sudah memiliki PO ${current.po_no}.` }, { status: 409 });
        const { data: quotation, error: quotationError } = await supabase.from("sales_documents")
          .select("grand_total").eq("document_type", "QUOTATION")
          .eq("document_number", current.quotation_no).maybeSingle();
        if (quotationError) throw quotationError;
        if (quotation && Number.isFinite(Number(quotation.grand_total))) poAmount = Number(quotation.grand_total);
        const notes = String(record.notes || current.notes || "").trim();
        const { error: updateError } = await supabase.from("sales").update({
          po_no: poNo,
          invoice_amount: poAmount,
          transaction_status: "PO Diterima",
          notes,
          updated_at: now,
        }).eq("id", Number(body.id));
        if (updateError) throw updateError;
        await savePoDocument(poNo, { ...current, ...record, po_no: poNo, invoice_amount: poAmount, notes }, body.items ?? []);
        return NextResponse.json({ ok: true });
      }
      const db = await getDb();
      const current = await db.prepare(
        "SELECT id, customer, location, transaction_type, project, rfq_no, quotation_no, po_no, notes FROM sales WHERE id = ?"
      ).bind(Number(body.id)).first<InputRecord & { id: number }>();
      if (!current) return NextResponse.json({ error: "Quotation tidak ditemukan." }, { status: 404 });
      const duplicate = await db.prepare("SELECT id FROM sales WHERE po_no = ? COLLATE NOCASE AND id <> ? LIMIT 1").bind(poNo, Number(body.id)).first();
      if (duplicate) return NextResponse.json({ error: `Nomor PO ${poNo} sudah terdaftar.` }, { status: 409 });
      if (!current.quotation_no) return NextResponse.json({ error: "Transaksi ini belum memiliki quotation." }, { status: 400 });
      if (current.po_no) return NextResponse.json({ error: `Quotation ini sudah memiliki PO ${current.po_no}.` }, { status: 409 });
      const quotation = await db.prepare(
        "SELECT grand_total FROM sales_documents WHERE document_type = 'QUOTATION' AND document_number = ? LIMIT 1"
      ).bind(current.quotation_no).first<{ grand_total: number }>();
      if (quotation && Number.isFinite(Number(quotation.grand_total))) poAmount = Number(quotation.grand_total);
      const notes = String(record.notes || current.notes || "").trim();
      await db.prepare(
        "UPDATE sales SET po_no = ?, invoice_amount = ?, transaction_status = 'PO Diterima', notes = ?, updated_at = ? WHERE id = ?"
      ).bind(poNo, poAmount, notes, now, Number(body.id)).run();
      await savePoDocument(poNo, { ...current, ...record, po_no: poNo, invoice_amount: poAmount, notes }, body.items ?? []);
      return NextResponse.json({ ok: true });
    }
    const customer = String(body.customer || "").trim();
    const project = String(body.project || "").trim();
    const invoiceAmount = Math.max(0, Number(body.invoice_amount || 0));
    const amountPaid = Math.max(0, Number(body.amount_paid || 0));
    if (!customer || !Number.isFinite(invoiceAmount) || !Number.isFinite(amountPaid)) {
      return NextResponse.json({ error: "Customer dan nominal transaksi wajib valid." }, { status: 400 });
    }
    if (amountPaid > invoiceAmount && invoiceAmount > 0) {
      return NextResponse.json({ error: "Nominal terbayar tidak boleh melebihi nilai invoice." }, { status: 400 });
    }
    const updatedAt = new Date().toISOString();
    const payload = {
      customer,
      location: String(body.location || "").trim(),
      transaction_type: String(body.transaction_type || "").trim(),
      project,
      rfq_no: String(body.rfq_no || "").trim(),
      quotation_no: String(body.quotation_no || "").trim(),
      po_no: String(body.po_no || "").trim(),
      delivery_no: String(body.delivery_no || "").trim(),
      invoice_no: String(body.invoice_no || "").trim(),
      invoice_amount: invoiceAmount,
      amount_paid: amountPaid,
      due_date: String(body.due_date || "").trim(),
      payment_date: String(body.payment_date || "").trim(),
      payment_status: String(body.payment_status || "OPEN").toUpperCase() === "CLOSED" ? "CLOSED" : "OPEN",
      transaction_status: String(body.transaction_status || "").trim(),
      notes: String(body.notes || "").trim(),
      updated_at: updatedAt,
    };
    if (isSupabaseConfigured()) {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.from("sales").update(payload).eq("id", Number(body.id));
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    await (await getDb()).prepare(
      `UPDATE sales SET customer = ?, location = ?, transaction_type = ?, project = ?, rfq_no = ?,
       quotation_no = ?, po_no = ?, delivery_no = ?, invoice_no = ?, invoice_amount = ?,
       amount_paid = ?, due_date = ?, payment_date = ?, payment_status = ?, transaction_status = ?,
       notes = ?, updated_at = ? WHERE id = ?`
    ).bind(
      payload.customer, payload.location, payload.transaction_type, payload.project, payload.rfq_no,
      payload.quotation_no, payload.po_no, payload.delivery_no, payload.invoice_no, payload.invoice_amount,
      payload.amount_paid, payload.due_date, payload.payment_date, payload.payment_status,
      payload.transaction_status, payload.notes, payload.updated_at,
      Number(body.id)
    ).run();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update data" }, { status: 500 });
  }
}
