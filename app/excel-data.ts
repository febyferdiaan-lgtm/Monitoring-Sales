import { excelSeed } from "./data/excel-seed";

async function getD1() {
  const { env } = await import("cloudflare:workers");
  if (!env.DB) throw new Error("Database binding is unavailable");
  return env.DB;
}

export async function ensureExcelData() {
  const db = await getD1();
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS data_imports (
      import_version TEXT PRIMARY KEY,
      source_file TEXT NOT NULL,
      imported_at TEXT NOT NULL,
      row_count INTEGER NOT NULL DEFAULT 0
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS excel_rows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      import_version TEXT NOT NULL,
      row_number INTEGER NOT NULL,
      customer TEXT NOT NULL DEFAULT '',
      project TEXT NOT NULL DEFAULT '',
      rfq_no TEXT NOT NULL DEFAULT '',
      quotation_no TEXT NOT NULL DEFAULT '',
      po_no TEXT NOT NULL DEFAULT '',
      invoice_no TEXT NOT NULL DEFAULT '',
      part_number TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      amount REAL NOT NULL DEFAULT 0,
      payment_status TEXT NOT NULL DEFAULT '',
      raw_json TEXT NOT NULL,
      UNIQUE(import_version, row_number)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS excel_rows_customer_idx ON excel_rows(customer)"),
    db.prepare("CREATE INDEX IF NOT EXISTS excel_rows_documents_idx ON excel_rows(rfq_no, quotation_no, po_no, invoice_no)"),
  ]);
  const exists = await db.prepare(
    "SELECT import_version FROM data_imports WHERE import_version = ?",
  ).bind(excelSeed.importVersion).first();
  if (exists) return;
  await db.prepare("DELETE FROM excel_rows WHERE import_version <> ?").bind(excelSeed.importVersion).run();
  await db.prepare("DELETE FROM data_imports WHERE import_version <> ?").bind(excelSeed.importVersion).run();

  for (let offset = 0; offset < excelSeed.rawRecords.length; offset += 35) {
    await db.batch(excelSeed.rawRecords.slice(offset, offset + 35).map((row) => db.prepare(
      `INSERT INTO excel_rows (
        import_version, row_number, customer, project, rfq_no, quotation_no, po_no,
        invoice_no, part_number, description, amount, payment_status, raw_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(import_version, row_number) DO UPDATE SET
        customer=excluded.customer, project=excluded.project, rfq_no=excluded.rfq_no,
        quotation_no=excluded.quotation_no, po_no=excluded.po_no, invoice_no=excluded.invoice_no,
        part_number=excluded.part_number, description=excluded.description, amount=excluded.amount,
        payment_status=excluded.payment_status, raw_json=excluded.raw_json`
    ).bind(
      excelSeed.importVersion, row.row_number, row.customer, row.project, row.rfq_no,
      row.quotation_no, row.po_no, row.invoice_no, row.part_number, row.description,
      row.amount, row.payment_status, row.raw_json,
    )));
  }
  await db.prepare(
    "INSERT INTO data_imports (import_version, source_file, imported_at, row_count) VALUES (?, ?, ?, ?)",
  ).bind(excelSeed.importVersion, excelSeed.sourceFile, excelSeed.importedAt, excelSeed.rawRecords.length).run();
}

export async function seedSalesFromExcel() {
  await ensureExcelData();
  const db = await getD1();
  await db.prepare("DELETE FROM sales WHERE source_key LIKE 'seed-%' OR source_key LIKE 'xlsx-%'").run();
  for (let offset = 0; offset < excelSeed.sales.length; offset += 35) {
    await db.batch(excelSeed.sales.slice(offset, offset + 35).map((row) => {
      const now = new Date().toISOString();
      return db.prepare(
        `INSERT INTO sales (
          source_key, customer, location, transaction_type, project, rfq_no, quotation_no,
          po_no, delivery_no, invoice_no, invoice_amount, amount_paid, due_date, payment_date,
          payment_status, transaction_status, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(source_key) DO UPDATE SET
          customer=excluded.customer, location=excluded.location, transaction_type=excluded.transaction_type,
          project=excluded.project, rfq_no=excluded.rfq_no, quotation_no=excluded.quotation_no,
          po_no=excluded.po_no, delivery_no=excluded.delivery_no, invoice_no=excluded.invoice_no,
          invoice_amount=excluded.invoice_amount, amount_paid=excluded.amount_paid,
          due_date=excluded.due_date, payment_date=excluded.payment_date,
          payment_status=excluded.payment_status, transaction_status=excluded.transaction_status,
          notes=excluded.notes, updated_at=excluded.updated_at`
      ).bind(
        row.source_key, row.customer, row.location, row.transaction_type, row.project, row.rfq_no,
        row.quotation_no, row.po_no, row.delivery_no, row.invoice_no, row.invoice_amount,
        row.amount_paid, row.due_date, row.payment_date, row.payment_status,
        row.transaction_status, row.notes, row.created_at, now,
      );
    }));
  }
}

export async function seedSparePartsFromExcel() {
  await ensureExcelData();
  const db = await getD1();
  const now = new Date().toISOString();
  for (let offset = 0; offset < excelSeed.spareParts.length; offset += 35) {
    await db.batch(excelSeed.spareParts.slice(offset, offset + 35).map((row) => db.prepare(
      `INSERT INTO spare_parts (
        part_number, name, category, brand, unit, selling_price, notes, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT(part_number) DO NOTHING`
    ).bind(
      row.part_number, row.name, row.category, row.brand, row.unit, row.selling_price,
      row.notes, now, now,
    )));
  }
}
