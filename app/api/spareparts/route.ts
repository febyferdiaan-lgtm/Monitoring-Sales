import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "../../authz";
import { seedSparePartsFromExcel } from "../../excel-data";

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
  const db = await getDb();
  await db.prepare(schemaSql).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS spare_parts_name_idx ON spare_parts(name)").run();
}

export async function GET(request: NextRequest) {
  try {
    const access = await requireRole(request, ["ADMIN", "EDITOR", "VIEWER"]);
    if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });
    await ensureDatabase();
    await seedSparePartsFromExcel();
    const result = await (await getDb()).prepare(
      "SELECT * FROM spare_parts WHERE is_active = 1 ORDER BY updated_at DESC, name ASC"
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
    const body = await request.json() as SparePartInput;
    const partNumber = String(body.part_number || "").trim().toUpperCase();
    const name = String(body.name || "").trim();
    if (!partNumber || !name) return NextResponse.json({ error: "Part number and name are required" }, { status: 400 });
    const now = new Date().toISOString();
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
