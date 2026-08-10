import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "../../authz";
import { seedSparePartsFromExcel } from "../../excel-data";
import { createSupabaseServerClient, isSupabaseConfigured } from "../../supabase/server";

type SparePartInput = {
  id?: number;
  part_number?: string;
  name?: string;
  category?: string;
  brand?: string;
  unit?: string;
  selling_price?: number;
  notes?: string;
};

const schemaSql = `CREATE TABLE IF NOT EXISTS spare_parts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  part_number TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  brand TEXT NOT NULL DEFAULT '',
  unit TEXT NOT NULL DEFAULT 'Pcs',
  selling_price REAL NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`;

const getDb = async () => {
  const { env } = await import("cloudflare:workers");
  if (!env.DB) throw new Error("Database binding is unavailable");
  return env.DB;
};

async function ensureDatabase() {
  if (isSupabaseConfigured()) return;
  const db = await getDb();
  await db.prepare(schemaSql).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS spare_parts_name_idx ON spare_parts(name)").run();
}

export async function GET(request: NextRequest) {
  try {
    const access = await requireRole(request, ["ADMIN", "EDITOR", "VIEWER"]);
    if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });
    await ensureDatabase();
    if (!isSupabaseConfigured()) await seedSparePartsFromExcel();
    if (isSupabaseConfigured()) {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase.from("spare_parts").select("*")
        .eq("is_active", true).order("updated_at", { ascending: false }).order("name");
      if (error) throw error;
      return NextResponse.json({ data });
    }
    const result = await (await getDb()).prepare(
      `WITH sold_lines AS (
        SELECT COALESCE(items.spare_part_id, matched_parts.id) AS part_id,
          documents.customer AS customer, items.quantity AS quantity
        FROM sales_document_items AS items
        INNER JOIN sales_documents AS documents ON documents.id = items.document_id
        LEFT JOIN spare_parts AS matched_parts
          ON UPPER(TRIM(items.part_number)) = matched_parts.part_number
        WHERE documents.document_type = 'INVOICE' AND TRIM(documents.customer) <> ''
        UNION ALL
        SELECT matched_parts.id AS part_id, excel_rows.customer AS customer,
          CAST(COALESCE(NULLIF(json_extract(excel_rows.raw_json, '$.invoice_qty'), ''), 0) AS REAL) AS quantity
        FROM excel_rows
        INNER JOIN spare_parts AS matched_parts
          ON UPPER(TRIM(excel_rows.part_number)) = matched_parts.part_number
        WHERE excel_rows.invoice_no <> '' AND TRIM(excel_rows.customer) <> ''
          AND CAST(COALESCE(NULLIF(json_extract(excel_rows.raw_json, '$.invoice_qty'), ''), 0) AS REAL) > 0
      ), sales_by_customer AS (
        SELECT part_id, customer, SUM(quantity) AS customer_quantity
        FROM sold_lines
        WHERE part_id IS NOT NULL
        GROUP BY part_id, customer
      ), ranked_customers AS (
        SELECT part_id, customer, customer_quantity,
          ROW_NUMBER() OVER (
            PARTITION BY part_id ORDER BY customer_quantity DESC, customer ASC
          ) AS customer_rank
        FROM sales_by_customer
      )
      SELECT spare_parts.*,
        COALESCE(SUM(ranked_customers.customer_quantity), 0) AS sold_quantity,
        COALESCE(MAX(CASE WHEN ranked_customers.customer_rank = 1 THEN ranked_customers.customer END), '') AS top_customer,
        COALESCE(MAX(CASE WHEN ranked_customers.customer_rank = 1 THEN ranked_customers.customer_quantity END), 0) AS top_customer_quantity
      FROM spare_parts
      LEFT JOIN ranked_customers ON ranked_customers.part_id = spare_parts.id
      WHERE spare_parts.is_active = 1
      GROUP BY spare_parts.id
      ORDER BY sold_quantity DESC, spare_parts.updated_at DESC, spare_parts.name ASC`
    ).all();
    return NextResponse.json({ data: result.results });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load spare parts" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const access = await requireRole(request, ["ADMIN", "EDITOR"]);
    if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });
    await ensureDatabase();
    const body = await request.json() as SparePartInput & { items?: SparePartInput[] };
    if (Array.isArray(body.items)) {
      if (!body.items.length || body.items.length > 2000) {
        return NextResponse.json({ error: "File harus berisi 1 sampai 2.000 sparepart." }, { status: 400 });
      }
      const normalized = new Map<string, Required<Omit<SparePartInput, "id">>>();
      const invalidRows: number[] = [];
      body.items.forEach((item, index) => {
        const partNumber = String(item.part_number || "").trim().toUpperCase().slice(0, 100);
        const name = String(item.name || "").trim().slice(0, 240);
        const price = Number(item.selling_price || 0);
        if (!partNumber || !name || !Number.isFinite(price) || price < 0) {
          invalidRows.push(index + 2);
          return;
        }
        normalized.set(partNumber, {
          part_number: partNumber,
          name,
          category: String(item.category || "").trim().slice(0, 120),
          brand: String(item.brand || "").trim().slice(0, 120),
          unit: String(item.unit || "Pcs").trim().slice(0, 40) || "Pcs",
          selling_price: price,
          notes: String(item.notes || "").trim().slice(0, 500),
        });
      });
      if (invalidRows.length) {
        return NextResponse.json({
          error: `Baris ${invalidRows.slice(0, 10).join(", ")} belum memiliki Part Number, Nama Spare Part, atau Harga Jual yang valid.`,
        }, { status: 400 });
      }
      const db = await getDb();
      const now = new Date().toISOString();
      const items = Array.from(normalized.values());
      if (isSupabaseConfigured()) {
        const supabase = await createSupabaseServerClient();
        const payload = items.map((item) => ({ ...item, is_active: true, created_at: now, updated_at: now }));
        const { error } = await supabase.from("spare_parts").upsert(payload, { onConflict: "part_number" });
        if (error) throw error;
        return NextResponse.json({ ok: true, imported: items.length, duplicates_in_file: body.items.length - items.length });
      }
      for (let offset = 0; offset < items.length; offset += 35) {
        await db.batch(items.slice(offset, offset + 35).map((item) => db.prepare(
          `INSERT INTO spare_parts (
            part_number, name, category, brand, unit, selling_price, notes, is_active, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
          ON CONFLICT(part_number) DO UPDATE SET
            name=excluded.name, category=excluded.category, brand=excluded.brand,
            unit=excluded.unit, selling_price=excluded.selling_price, notes=excluded.notes,
            is_active=1, updated_at=excluded.updated_at`,
        ).bind(
          item.part_number, item.name, item.category, item.brand, item.unit,
          item.selling_price, item.notes, now, now,
        )));
      }
      await db.prepare("PRAGMA optimize").run();
      return NextResponse.json({ ok: true, imported: items.length, duplicates_in_file: body.items.length - items.length });
    }
    const partNumber = String(body.part_number || "").trim().toUpperCase();
    const name = String(body.name || "").trim();
    if (!partNumber || !name) return NextResponse.json({ error: "Part number and name are required" }, { status: 400 });
    const now = new Date().toISOString();
    if (isSupabaseConfigured()) {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.from("spare_parts").upsert({
        part_number: partNumber, name, category: String(body.category || ""), brand: String(body.brand || ""),
        unit: String(body.unit || "Pcs"), selling_price: Math.max(0, Number(body.selling_price || 0)),
        notes: String(body.notes || ""), is_active: true, created_at: now, updated_at: now,
      }, { onConflict: "part_number" });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    await (await getDb()).prepare(
      `INSERT INTO spare_parts (
        part_number, name, category, brand, unit, selling_price, notes, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT(part_number) DO UPDATE SET
        name=excluded.name, category=excluded.category, brand=excluded.brand,
        unit=excluded.unit, selling_price=excluded.selling_price, notes=excluded.notes,
        is_active=1, updated_at=excluded.updated_at`
    ).bind(
      partNumber,
      name,
      String(body.category || ""),
      String(body.brand || ""),
      String(body.unit || "Pcs"),
      Math.max(0, Number(body.selling_price || 0)),
      String(body.notes || ""),
      now,
      now
    ).run();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save spare part" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const access = await requireRole(request, ["ADMIN", "EDITOR"]);
    if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });
    await ensureDatabase();
    const body = await request.json() as SparePartInput & { is_active?: boolean };
    if (!body.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    if (isSupabaseConfigured()) {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.from("spare_parts").update({
        part_number: String(body.part_number || "").trim().toUpperCase(), name: String(body.name || "").trim(),
        category: String(body.category || ""), brand: String(body.brand || ""), unit: String(body.unit || "Pcs"),
        selling_price: Math.max(0, Number(body.selling_price || 0)), notes: String(body.notes || ""),
        is_active: body.is_active !== false, updated_at: new Date().toISOString(),
      }).eq("id", Number(body.id));
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    await (await getDb()).prepare(
      `UPDATE spare_parts SET part_number=?, name=?, category=?, brand=?, unit=?,
       selling_price=?, notes=?, is_active=?, updated_at=? WHERE id=?`
    ).bind(
      String(body.part_number || "").trim().toUpperCase(),
      String(body.name || "").trim(),
      String(body.category || ""),
      String(body.brand || ""),
      String(body.unit || "Pcs"),
      Math.max(0, Number(body.selling_price || 0)),
      String(body.notes || ""),
      body.is_active === false ? 0 : 1,
      new Date().toISOString(),
      Number(body.id)
    ).run();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update spare part" }, { status: 500 });
  }
}
