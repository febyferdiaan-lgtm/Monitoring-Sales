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
  await db.prepare(schemaSql).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS sales_customer_idx ON sales(customer)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS sales_due_date_idx ON sales(due_date)").run();
  const count = await db.prepare("SELECT COUNT(*) AS total FROM sales").first<{ total: number }>();
  if (Number(count?.total ?? 0) === 0) await upsertRecords(seed);
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
    const body = await request.json() as { action?: string; record?: InputRecord; records?: InputRecord[] };
    const records = body.action === "import" ? body.records ?? [] : body.record ? [body.record] : [];
    if (!records.length || records.length > 5000) return NextResponse.json({ error: "Invalid records" }, { status: 400 });
    await upsertRecords(records);
    return NextResponse.json({ ok: true, imported: records.length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save data" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const access = await requireRole(request, ["ADMIN", "EDITOR"]);
    if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });
    await ensureDatabase();
    const body = await request.json() as { id?: number; amount_paid?: number; payment_status?: string };
    if (!body.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    if (isSupabaseConfigured()) {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.from("sales").update({
        amount_paid: Number(body.amount_paid || 0),
        payment_status: String(body.payment_status || "OPEN"),
        payment_date: body.payment_status === "CLOSED" ? new Date().toISOString().slice(0, 10) : "",
        updated_at: new Date().toISOString(),
      }).eq("id", Number(body.id));
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    await (await getDb()).prepare(
      "UPDATE sales SET amount_paid = ?, payment_status = ?, payment_date = ?, updated_at = ? WHERE id = ?"
    ).bind(
      Number(body.amount_paid || 0),
      String(body.payment_status || "OPEN"),
      body.payment_status === "CLOSED" ? new Date().toISOString().slice(0, 10) : "",
      new Date().toISOString(),
      Number(body.id)
    ).run();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update data" }, { status: 500 });
  }
}
