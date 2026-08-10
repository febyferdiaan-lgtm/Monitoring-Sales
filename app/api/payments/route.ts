import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "../../authz";
import { planExcelPaymentSync, type ExcelPaymentRow } from "../../excel-payment-sync";
import { createSupabaseServerClient, isSupabaseConfigured } from "../../supabase/server";
import { getD1Database } from "../../d1";

const schemaSql = `CREATE TABLE IF NOT EXISTS payment_confirmations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id INTEGER NOT NULL,
  invoice_no TEXT NOT NULL,
  customer TEXT NOT NULL,
  amount REAL NOT NULL,
  payment_date TEXT NOT NULL,
  reference_no TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'PENDING',
  requested_by_email TEXT NOT NULL,
  requested_by_name TEXT NOT NULL DEFAULT '',
  requested_at TEXT NOT NULL,
  reviewed_by_email TEXT NOT NULL DEFAULT '',
  reviewed_by_name TEXT NOT NULL DEFAULT '',
  reviewed_at TEXT NOT NULL DEFAULT '',
  review_notes TEXT NOT NULL DEFAULT ''
)`;

type PaymentConfirmation = {
  id: number;
  sale_id: number;
  invoice_no: string;
  customer: string;
  amount: number;
  payment_date: string;
  reference_no: string;
  notes: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  requested_by_email: string;
  requested_by_name: string;
  requested_at: string;
  reviewed_by_email: string;
  reviewed_by_name: string;
  reviewed_at: string;
  review_notes: string;
};

async function getD1() {
  return getD1Database();
}

async function ensurePaymentsDatabase() {
  if (isSupabaseConfigured()) return;
  const db = await getD1();
  await db.batch([
    db.prepare(schemaSql),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_payment_confirmations_status_requested ON payment_confirmations(status, requested_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_payment_confirmations_sale_id ON payment_confirmations(sale_id)"),
  ]);
}

export async function GET(request: NextRequest) {
  try {
    const access = await requireRole(request, ["ADMIN", "EDITOR", "VIEWER"]);
    if (access.error || !access.identity) return NextResponse.json({ error: access.error }, { status: access.status });
    await ensurePaymentsDatabase();
    if (isSupabaseConfigured()) {
      const supabase = await createSupabaseServerClient();
      let query = supabase.from("payment_confirmations").select("*").order("requested_at", { ascending: false })
        .limit(access.identity.role === "ADMIN" ? 200 : 100);
      if (access.identity.role !== "ADMIN") query = query.eq("requested_by_email", access.identity.email);
      const { data, error } = await query;
      if (error) throw error;
      return NextResponse.json({ data });
    }
    const db = await getD1();
    const approvedSales = await db.prepare(
      `SELECT DISTINCT sales.invoice_no, sales.amount_paid, sales.payment_date
       FROM sales INNER JOIN payment_confirmations
         ON payment_confirmations.invoice_no = sales.invoice_no
       WHERE payment_confirmations.status = 'APPROVED' AND sales.invoice_no <> '' AND sales.amount_paid > 0`,
    ).all<{ invoice_no: string; amount_paid: number; payment_date: string }>();
    for (const sale of approvedSales.results) {
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
    const result = access.identity.role === "ADMIN"
      ? await db.prepare("SELECT * FROM payment_confirmations ORDER BY requested_at DESC LIMIT 200").all<PaymentConfirmation>()
      : await db.prepare("SELECT * FROM payment_confirmations WHERE requested_by_email = ? ORDER BY requested_at DESC LIMIT 100").bind(access.identity.email).all<PaymentConfirmation>();
    return NextResponse.json({ data: result.results });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load payment confirmations" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const access = await requireRole(request, ["ADMIN", "EDITOR"]);
    if (access.error || !access.identity) return NextResponse.json({ error: access.error }, { status: access.status });
    await ensurePaymentsDatabase();
    const body = await request.json() as { sale_id?: number; amount?: number; payment_date?: string; reference_no?: string; notes?: string };
    const saleId = Number(body.sale_id || 0);
    const amount = Number(body.amount || 0);
    const paymentDate = String(body.payment_date || "").trim();
    if (!saleId || !Number.isFinite(amount) || amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
      return NextResponse.json({ error: "Data pembayaran belum lengkap." }, { status: 400 });
    }

    if (isSupabaseConfigured()) {
      const supabase = await createSupabaseServerClient();
      const { data: sale, error: saleError } = await supabase.from("sales")
        .select("id,invoice_no,customer,invoice_amount,amount_paid").eq("id", saleId).maybeSingle();
      if (saleError) throw saleError;
      if (!sale?.invoice_no) return NextResponse.json({ error: "Invoice tidak ditemukan." }, { status: 404 });
      const remaining = Math.max(0, Number(sale.invoice_amount) - Number(sale.amount_paid));
      if (remaining <= 0 || amount > remaining + 0.01) return NextResponse.json({ error: "Nominal melebihi sisa tagihan." }, { status: 400 });
      const { data: pending, error: pendingError } = await supabase.from("payment_confirmations")
        .select("id").eq("sale_id", saleId).eq("status", "PENDING").limit(1).maybeSingle();
      if (pendingError) throw pendingError;
      if (pending) return NextResponse.json({ error: "Konfirmasi invoice ini masih menunggu verifikasi." }, { status: 409 });
      const { error } = await supabase.from("payment_confirmations").insert({
        sale_id: sale.id, invoice_no: sale.invoice_no, customer: sale.customer, amount, payment_date: paymentDate,
        reference_no: String(body.reference_no || "").trim().slice(0, 100),
        notes: String(body.notes || "").trim().slice(0, 500), status: "PENDING",
        requested_by_email: access.identity.email, requested_by_name: access.identity.name,
        requested_at: new Date().toISOString(),
      });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    const db = await getD1();
    const sale = await db.prepare(
      "SELECT id, invoice_no, customer, invoice_amount, amount_paid FROM sales WHERE id = ?",
    ).bind(saleId).first<{ id: number; invoice_no: string; customer: string; invoice_amount: number; amount_paid: number }>();
    if (!sale?.invoice_no) return NextResponse.json({ error: "Invoice tidak ditemukan." }, { status: 404 });
    const remaining = Math.max(0, Number(sale.invoice_amount) - Number(sale.amount_paid));
    if (remaining <= 0 || amount > remaining + 0.01) return NextResponse.json({ error: "Nominal melebihi sisa tagihan." }, { status: 400 });
    const pending = await db.prepare(
      "SELECT id FROM payment_confirmations WHERE sale_id = ? AND status = 'PENDING' LIMIT 1",
    ).bind(saleId).first<{ id: number }>();
    if (pending) return NextResponse.json({ error: "Konfirmasi invoice ini masih menunggu verifikasi." }, { status: 409 });

    const now = new Date().toISOString();
    await db.prepare(
      `INSERT INTO payment_confirmations (
        sale_id, invoice_no, customer, amount, payment_date, reference_no, notes, status,
        requested_by_email, requested_by_name, requested_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?)`,
    ).bind(
      sale.id, sale.invoice_no, sale.customer, amount, paymentDate,
      String(body.reference_no || "").trim().slice(0, 100),
      String(body.notes || "").trim().slice(0, 500),
      access.identity.email, access.identity.name, now,
    ).run();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to submit payment confirmation" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const access = await requireRole(request, ["ADMIN"]);
    if (access.error || !access.identity) return NextResponse.json({ error: access.error }, { status: access.status });
    await ensurePaymentsDatabase();
    const body = await request.json() as { id?: number; action?: "approve" | "reject"; review_notes?: string };
    const id = Number(body.id || 0);
    if (!id || (body.action !== "approve" && body.action !== "reject")) {
      return NextResponse.json({ error: "Tindakan verifikasi tidak valid." }, { status: 400 });
    }
    if (isSupabaseConfigured()) {
      const supabase = await createSupabaseServerClient();
      const { data: confirmation, error: confirmationError } = await supabase.from("payment_confirmations")
        .select("*").eq("id", id).maybeSingle();
      if (confirmationError) throw confirmationError;
      if (!confirmation) return NextResponse.json({ error: "Konfirmasi pembayaran tidak ditemukan." }, { status: 404 });
      if (confirmation.status !== "PENDING") return NextResponse.json({ error: "Konfirmasi ini sudah diverifikasi." }, { status: 409 });
      let sale: { id: number; invoice_no: string; invoice_amount: number; amount_paid: number } | null = null;
      if (body.action === "approve") {
        const { data, error } = await supabase.from("sales")
          .select("id,invoice_no,invoice_amount,amount_paid").eq("id", confirmation.sale_id).maybeSingle();
        if (error) throw error;
        sale = data;
        if (!sale?.invoice_no) return NextResponse.json({ error: "Invoice pembayaran tidak ditemukan." }, { status: 404 });
      }
      const now = new Date().toISOString();
      const nextStatus = body.action === "approve" ? "APPROVED" : "REJECTED";
      const { error: reviewError } = await supabase.from("payment_confirmations").update({
        status: nextStatus, reviewed_by_email: access.identity.email, reviewed_by_name: access.identity.name,
        reviewed_at: now, review_notes: String(body.review_notes || "").trim().slice(0, 500),
      }).eq("id", id).eq("status", "PENDING");
      if (reviewError) throw reviewError;
      if (body.action === "approve" && sale) {
        const targetPaid = Math.min(Number(sale.invoice_amount), Number(sale.amount_paid) + Number(confirmation.amount));
        const targetStatus = Number(sale.invoice_amount) > 0 && targetPaid >= Number(sale.invoice_amount) - 0.01 ? "CLOSED" : "OPEN";
        const { error: saleUpdateError } = await supabase.from("sales").update({
          amount_paid: targetPaid, payment_status: targetStatus,
          payment_date: confirmation.payment_date, updated_at: now,
        }).eq("id", sale.id);
        if (saleUpdateError) throw saleUpdateError;
        const { data: excelRows, error: excelError } = await supabase.from("excel_rows")
          .select("id,amount,raw_json").eq("invoice_no", sale.invoice_no).order("row_number");
        if (excelError) throw excelError;
        const updates = planExcelPaymentSync((excelRows ?? []).map((row) => ({
          id: Number(row.id), amount: Number(row.amount),
          raw_json: typeof row.raw_json === "string" ? row.raw_json : JSON.stringify(row.raw_json ?? {}),
        })), targetPaid, confirmation.payment_date);
        for (const update of updates) {
          const { error } = await supabase.from("excel_rows").update({
            payment_status: update.paymentStatus, raw_json: JSON.parse(update.rawJson),
          }).eq("id", update.id);
          if (error) throw error;
        }
      }
      return NextResponse.json({ ok: true, status: nextStatus });
    }
    const db = await getD1();
    const confirmation = await db.prepare(
      "SELECT * FROM payment_confirmations WHERE id = ?",
    ).bind(id).first<PaymentConfirmation>();
    if (!confirmation) return NextResponse.json({ error: "Konfirmasi pembayaran tidak ditemukan." }, { status: 404 });
    if (confirmation.status !== "PENDING") return NextResponse.json({ error: "Konfirmasi ini sudah diverifikasi." }, { status: 409 });

    const now = new Date().toISOString();
    const nextStatus = body.action === "approve" ? "APPROVED" : "REJECTED";
    const statements = [
      db.prepare(
        `UPDATE payment_confirmations SET status = ?, reviewed_by_email = ?, reviewed_by_name = ?,
         reviewed_at = ?, review_notes = ? WHERE id = ? AND status = 'PENDING'`,
      ).bind(nextStatus, access.identity.email, access.identity.name, now, String(body.review_notes || "").trim().slice(0, 500), id),
    ];
    if (body.action === "approve") {
      const sale = await db.prepare(
        "SELECT invoice_no, invoice_amount, amount_paid FROM sales WHERE id = ?",
      ).bind(confirmation.sale_id).first<{ invoice_no: string; invoice_amount: number; amount_paid: number }>();
      if (!sale?.invoice_no) return NextResponse.json({ error: "Invoice pembayaran tidak ditemukan." }, { status: 404 });
      const targetPaid = Math.min(Number(sale.invoice_amount), Number(sale.amount_paid) + Number(confirmation.amount));
      const targetStatus = Number(sale.invoice_amount) > 0 && targetPaid >= Number(sale.invoice_amount) - 0.01 ? "CLOSED" : "OPEN";
      statements.push(db.prepare(
        `UPDATE sales SET
          amount_paid = ?,
          payment_status = ?,
          payment_date = ?, updated_at = ?
         WHERE id = ?`,
      ).bind(targetPaid, targetStatus, confirmation.payment_date, now, confirmation.sale_id));

      const excelRows = await db.prepare(
        "SELECT id, amount, raw_json FROM excel_rows WHERE invoice_no = ? ORDER BY row_number",
      ).bind(sale.invoice_no).all<ExcelPaymentRow>();
      const excelUpdates = planExcelPaymentSync(excelRows.results, targetPaid, confirmation.payment_date);
      statements.push(...excelUpdates.map((update) => db.prepare(
        "UPDATE excel_rows SET payment_status = ?, raw_json = ? WHERE id = ?",
      ).bind(update.paymentStatus, update.rawJson, update.id)));
    }
    await db.batch(statements);
    return NextResponse.json({ ok: true, status: nextStatus });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to verify payment" }, { status: 500 });
  }
}
