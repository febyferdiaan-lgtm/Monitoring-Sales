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
  type?: "QUOTATION" | "INVOICE" | "DELIVERY_NOTE";
  quotation_sequence?: string;
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

const sequenceFromNumber = (value: unknown, year: number) => {
  const number = String(value || "").trim();
  if (!number.includes(String(year))) return 0;
  const match = number.match(/^(\d{1,3})\//);
  return match ? Number(match[1]) : 0;
};

type DocumentType = "QUOTATION" | "INVOICE" | "DELIVERY_NOTE";

const deliveryItemKey = (item: DocumentItem) => {
  const sparePartId = Number(item.spare_part_id || 0);
  if (sparePartId) return `part:${sparePartId}`;
  const partNumber = String(item.part_number || "").trim().toLowerCase();
  if (partNumber) return `number:${partNumber}`;
  return `description:${String(item.description || "").trim().toLowerCase()}|${String(item.unit || "Pcs").trim().toLowerCase()}`;
};

const validateDeliveryQuantities = (orderedItems: DocumentItem[], deliveredItems: DocumentItem[], requestedItems: DocumentItem[]) => {
  const ordered = new Map<string, number>();
  const delivered = new Map<string, number>();
  orderedItems.forEach((item) => ordered.set(deliveryItemKey(item), (ordered.get(deliveryItemKey(item)) ?? 0) + Number(item.quantity || 0)));
  deliveredItems.forEach((item) => delivered.set(deliveryItemKey(item), (delivered.get(deliveryItemKey(item)) ?? 0) + Number(item.quantity || 0)));
  for (const item of requestedItems) {
    const key = deliveryItemKey(item);
    const remaining = Math.max(0, (ordered.get(key) ?? 0) - (delivered.get(key) ?? 0));
    const quantity = Number(item.quantity || 0);
    if (!ordered.has(key)) throw new Error(`Item ${String(item.part_number || item.description || "pengiriman")} tidak terdapat pada PO.`);
    if (quantity > remaining + 0.0001) throw new Error(`Jumlah kirim ${String(item.part_number || item.description || "item")} melebihi sisa PO (${remaining}).`);
    delivered.set(key, (delivered.get(key) ?? 0) + quantity);
  }
  return Array.from(ordered.entries()).every(([key, quantity]) => (delivered.get(key) ?? 0) >= quantity - 0.0001);
};

async function nextDocumentNumber(type: DocumentType, date: string, requestedSequence = "") {
  const parsed = new Date(`${date}T00:00:00`);
  const year = Number.isNaN(parsed.valueOf()) ? new Date().getFullYear() : parsed.getFullYear();
  const month = Number.isNaN(parsed.valueOf()) ? new Date().getMonth() : parsed.getMonth();
  const requested = requestedSequence.trim();
  if (requested && !/^[0-9]{1,3}$/.test(requested)) throw new Error("Tiga digit awal nomor quotation harus berupa angka.");
  let nextSequence = Number(requested || 0);
  if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    const [{ data: documents, error: documentError }, salesResult] = await Promise.all([
      supabase.from("sales_documents").select("document_number").eq("document_type", type)
        .gte("document_date", `${year}-01-01`).lt("document_date", `${year + 1}-01-01`),
      type === "QUOTATION" ? supabase.from("sales").select("quotation_no").neq("quotation_no", "") : Promise.resolve({ data: [], error: null }),
    ]);
    if (documentError) throw documentError;
    if (salesResult.error) throw salesResult.error;
    if (!nextSequence) {
      const used = [
        ...(documents ?? []).map((document) => sequenceFromNumber(document.document_number, year)),
        ...((salesResult.data ?? []) as { quotation_no?: string }[]).map((sale) => sequenceFromNumber(sale.quotation_no, year)),
      ];
      nextSequence = Math.max(0, ...used) + 1;
    }
  } else {
    const db = await getDb();
    if (!nextSequence) {
      const documents = await db.prepare(
        "SELECT document_number FROM sales_documents WHERE document_type = ? AND substr(document_date, 1, 4) = ?"
      ).bind(type, String(year)).all<{ document_number: string }>();
      const salesExists = type === "QUOTATION"
        ? await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sales'").first()
        : null;
      const sales = salesExists
        ? await db.prepare("SELECT quotation_no FROM sales WHERE quotation_no <> ''").all<{ quotation_no: string }>()
        : { results: [] as { quotation_no: string }[] };
      const used = [
        ...documents.results.map((document) => sequenceFromNumber(document.document_number, year)),
        ...sales.results.map((sale) => sequenceFromNumber(sale.quotation_no, year)),
      ];
      nextSequence = Math.max(0, ...used) + 1;
    }
  }
  if (nextSequence < 1 || nextSequence > 999) throw new Error("Nomor urut quotation harus berada di antara 001 dan 999.");
  const sequence = String(nextSequence).padStart(3, "0");
  const suffix = type === "INVOICE" ? "MDA-INV" : type === "DELIVERY_NOTE" ? "SJ-MDA" : "MDA-QUOT";
  return `${sequence}/${suffix}/${romanMonths[month]}/${year}`;
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
    const type: DocumentType = body.type === "INVOICE" ? "INVOICE" : body.type === "DELIVERY_NOTE" ? "DELIVERY_NOTE" : "QUOTATION";
    const customer = String(body.customer || "").trim();
    const items = (body.items ?? []).filter((item) => String(item.description || "").trim() && Number(item.quantity || 0) > 0);
    if (!customer || !items.length) return NextResponse.json({ error: "Customer and items are required" }, { status: 400 });
    const referenceNo = String(body.reference_no || "").trim();
    if (type === "DELIVERY_NOTE" && !referenceNo) {
      return NextResponse.json({ error: "Nomor PO wajib dipilih untuk membuat surat jalan." }, { status: 400 });
    }

    const documentDate = String(body.document_date || new Date().toISOString().slice(0, 10));
    const number = await nextDocumentNumber(type, documentDate, type === "QUOTATION" ? String(body.quotation_sequence || "") : "");
    if (isSupabaseConfigured()) {
      const supabase = await createSupabaseServerClient();
      const { data: duplicate, error: duplicateError } = await supabase.from("sales_documents")
        .select("id").eq("document_number", number).limit(1);
      if (duplicateError) throw duplicateError;
      if (duplicate?.length) return NextResponse.json({ error: `Nomor dokumen ${number} sudah digunakan. Pilih tiga digit lain.` }, { status: 409 });
    } else {
      const duplicate = await (await getDb()).prepare(
        "SELECT id FROM sales_documents WHERE document_number = ? COLLATE NOCASE LIMIT 1"
      ).bind(number).first();
      if (duplicate) return NextResponse.json({ error: `Nomor dokumen ${number} sudah digunakan. Pilih tiga digit lain.` }, { status: 409 });
    }
    let deliveryComplete = false;
    let linkedSale: { id: number; quotation_no?: string; delivery_no?: string } | null = null;
    if (type === "DELIVERY_NOTE") {
      if (isSupabaseConfigured()) {
        const supabase = await createSupabaseServerClient();
        const [{ data: poDocuments, error: poError }, { data: saleRows, error: saleError }, { data: deliveryDocuments, error: deliveryError }] = await Promise.all([
          supabase.from("sales_documents").select("id").eq("document_type", "PURCHASE_ORDER").eq("document_number", referenceNo).limit(1),
          supabase.from("sales").select("id,quotation_no,delivery_no").eq("po_no", referenceNo).limit(1),
          supabase.from("sales_documents").select("id").eq("document_type", "DELIVERY_NOTE").eq("reference_no", referenceNo),
        ]);
        if (poError) throw poError;
        if (saleError) throw saleError;
        if (deliveryError) throw deliveryError;
        linkedSale = saleRows?.[0] ? { id: Number(saleRows[0].id), quotation_no: saleRows[0].quotation_no, delivery_no: saleRows[0].delivery_no } : null;
        if (!linkedSale) return NextResponse.json({ error: `PO ${referenceNo} tidak ditemukan atau belum terhubung ke transaksi.` }, { status: 404 });
        let sourceDocumentId = Number(poDocuments?.[0]?.id || 0);
        if (!sourceDocumentId && linkedSale.quotation_no) {
          const { data: quotationDocuments, error: quotationError } = await supabase.from("sales_documents")
            .select("id").eq("document_type", "QUOTATION").eq("document_number", linkedSale.quotation_no).limit(1);
          if (quotationError) throw quotationError;
          sourceDocumentId = Number(quotationDocuments?.[0]?.id || 0);
        }
        if (!sourceDocumentId) return NextResponse.json({ error: `Detail item PO ${referenceNo} belum tersedia.` }, { status: 404 });
        const deliveryIds = (deliveryDocuments ?? []).map((document) => Number(document.id));
        const [{ data: orderedItems, error: orderedError }, deliveredResult] = await Promise.all([
          supabase.from("sales_document_items").select("spare_part_id,part_number,description,quantity,unit").eq("document_id", sourceDocumentId),
          deliveryIds.length
            ? supabase.from("sales_document_items").select("spare_part_id,part_number,description,quantity,unit").in("document_id", deliveryIds)
            : Promise.resolve({ data: [], error: null }),
        ]);
        if (orderedError) throw orderedError;
        if (deliveredResult.error) throw deliveredResult.error;
        deliveryComplete = validateDeliveryQuantities(orderedItems ?? [], deliveredResult.data ?? [], items);
      } else {
        const db = await getDb();
        let sourceDocument = await db.prepare(
          "SELECT id FROM sales_documents WHERE document_type = 'PURCHASE_ORDER' AND document_number = ? COLLATE NOCASE LIMIT 1"
        ).bind(referenceNo).first<{ id: number }>();
        linkedSale = await db.prepare(
          "SELECT id, quotation_no, delivery_no FROM sales WHERE po_no = ? COLLATE NOCASE LIMIT 1"
        ).bind(referenceNo).first<{ id: number; quotation_no: string; delivery_no: string }>();
        if (!linkedSale) return NextResponse.json({ error: `PO ${referenceNo} tidak ditemukan atau belum terhubung ke transaksi.` }, { status: 404 });
        if (!sourceDocument && linkedSale.quotation_no) {
          sourceDocument = await db.prepare(
            "SELECT id FROM sales_documents WHERE document_type = 'QUOTATION' AND document_number = ? COLLATE NOCASE LIMIT 1"
          ).bind(linkedSale.quotation_no).first<{ id: number }>();
        }
        if (!sourceDocument) return NextResponse.json({ error: `Detail item PO ${referenceNo} belum tersedia.` }, { status: 404 });
        const orderedItems = await db.prepare(
          "SELECT spare_part_id, part_number, description, quantity, unit FROM sales_document_items WHERE document_id = ?"
        ).bind(sourceDocument.id).all<DocumentItem>();
        const deliveredItems = await db.prepare(
          `SELECT item.spare_part_id, item.part_number, item.description, item.quantity, item.unit
           FROM sales_document_items item
           INNER JOIN sales_documents document ON document.id = item.document_id
           WHERE document.document_type = 'DELIVERY_NOTE' AND document.reference_no = ? COLLATE NOCASE`
        ).bind(referenceNo).all<DocumentItem>();
        deliveryComplete = validateDeliveryQuantities(orderedItems.results, deliveredItems.results, items);
      }
    }

    const taxPercent = type === "DELIVERY_NOTE" ? 0 : Math.max(0, Number(body.tax_percent ?? 11));
    const subtotal = type === "DELIVERY_NOTE" ? 0 : items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_price || 0), 0);
    const taxAmount = subtotal * taxPercent / 100;
    const grandTotal = subtotal + taxAmount;
    const now = new Date().toISOString();
    if (isSupabaseConfigured()) {
      const supabase = await createSupabaseServerClient();
      const { data: inserted, error: documentError } = await supabase.from("sales_documents").insert({
        document_type: type, document_number: number, customer,
        customer_address: String(body.customer_address || ""), customer_pic: String(body.customer_pic || ""),
        project: String(body.project || ""), reference_no: referenceNo,
        document_date: documentDate, due_date: String(body.due_date || ""), subtotal,
        tax_percent: taxPercent, tax_amount: taxAmount, grand_total: grandTotal,
        notes: String(body.notes || ""), status: type === "DELIVERY_NOTE" ? (deliveryComplete ? "COMPLETE" : "PARTIAL") : "DRAFT", created_at: now, updated_at: now,
      }).select("id").single();
      if (documentError || !inserted) throw documentError ?? new Error("Dokumen gagal dibuat.");
      const documentId = Number(inserted.id);
      const { error: itemError } = await supabase.from("sales_document_items").insert(items.map((item) => ({
        document_id: documentId, spare_part_id: item.spare_part_id ? Number(item.spare_part_id) : null,
        part_number: String(item.part_number || ""), description: String(item.description || ""),
        quantity: Number(item.quantity || 0), unit: String(item.unit || "Pcs"), unit_price: type === "DELIVERY_NOTE" ? 0 : Number(item.unit_price || 0),
        line_total: type === "DELIVERY_NOTE" ? 0 : Number(item.quantity || 0) * Number(item.unit_price || 0),
      })));
      if (itemError) throw itemError;
      if (type === "DELIVERY_NOTE" && linkedSale) {
        const deliveryNumbers = [...new Set([...(String(linkedSale.delivery_no || "").split(",").map((value) => value.trim()).filter(Boolean)), number])];
        const { error: deliverySaleError } = await supabase.from("sales").update({
          delivery_no: deliveryNumbers.join(", "),
          transaction_status: deliveryComplete ? "Terkirim - Siap Invoice" : "Dikirim Partial",
          updated_at: now,
        }).eq("id", linkedSale.id);
        if (deliverySaleError) throw deliverySaleError;
        return NextResponse.json({ ok: true, id: documentId, document_number: number, delivery_complete: deliveryComplete });
      }

      if (type === "INVOICE") {
        let invoiceSaleId = 0;
        const byQuotation = await supabase.from("sales").select("id").eq("quotation_no", referenceNo).limit(1);
        if (byQuotation.error) throw byQuotation.error;
        invoiceSaleId = Number(byQuotation.data?.[0]?.id || 0);
        if (!invoiceSaleId) {
          const byPo = await supabase.from("sales").select("id").eq("po_no", referenceNo).limit(1);
          if (byPo.error) throw byPo.error;
          invoiceSaleId = Number(byPo.data?.[0]?.id || 0);
        }
        if (!invoiceSaleId) {
          const referenceDocument = await supabase.from("sales_documents").select("reference_no").eq("document_number", referenceNo).limit(1);
          if (referenceDocument.error) throw referenceDocument.error;
          const referencedPo = String(referenceDocument.data?.[0]?.reference_no || "");
          if (referencedPo) {
            const byDelivery = await supabase.from("sales").select("id").eq("po_no", referencedPo).limit(1);
            if (byDelivery.error) throw byDelivery.error;
            invoiceSaleId = Number(byDelivery.data?.[0]?.id || 0);
          }
        }
        if (invoiceSaleId) {
          const { error: invoiceSaleError } = await supabase.from("sales").update({
            invoice_no: number, invoice_amount: grandTotal, due_date: String(body.due_date || ""),
            payment_status: "OPEN", transaction_status: "Done Invoice",
            notes: "Invoice dibuat dari dokumen pengiriman.", updated_at: now,
          }).eq("id", invoiceSaleId);
          if (invoiceSaleError) throw invoiceSaleError;
          return NextResponse.json({ ok: true, id: documentId, document_number: number });
        }
      }
      const sourceKey = `document-${type.toLowerCase()}-${documentId}`;
      const { error: saleError } = await supabase.from("sales").upsert({
        source_key: sourceKey, customer, location: "", transaction_type: "Trading Part",
        project: String(body.project || items[0]?.description || ""), rfq_no: "",
        quotation_no: type === "QUOTATION" ? number : referenceNo,
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
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      type,
      number,
      customer,
      String(body.customer_address || ""),
      String(body.customer_pic || ""),
      String(body.project || ""),
      referenceNo,
      documentDate,
      String(body.due_date || ""),
      subtotal,
      taxPercent,
      taxAmount,
      grandTotal,
      String(body.notes || ""),
      type === "DELIVERY_NOTE" ? (deliveryComplete ? "COMPLETE" : "PARTIAL") : "DRAFT",
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
      type === "DELIVERY_NOTE" ? 0 : Number(item.unit_price || 0),
      type === "DELIVERY_NOTE" ? 0 : Number(item.quantity || 0) * Number(item.unit_price || 0)
    )));

    const salesExists = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sales'").first();
    if (salesExists) {
      if (type === "DELIVERY_NOTE" && linkedSale) {
        const deliveryNumbers = [...new Set([...(String(linkedSale.delivery_no || "").split(",").map((value) => value.trim()).filter(Boolean)), number])];
        await db.prepare(
          "UPDATE sales SET delivery_no = ?, transaction_status = ?, updated_at = ? WHERE id = ?"
        ).bind(deliveryNumbers.join(", "), deliveryComplete ? "Terkirim - Siap Invoice" : "Dikirim Partial", now, linkedSale.id).run();
        return NextResponse.json({ ok: true, id: documentId, document_number: number, delivery_complete: deliveryComplete });
      }

      if (type === "INVOICE") {
        let invoiceSale = await db.prepare(
          "SELECT id FROM sales WHERE quotation_no = ? COLLATE NOCASE OR po_no = ? COLLATE NOCASE LIMIT 1"
        ).bind(referenceNo, referenceNo).first<{ id: number }>();
        if (!invoiceSale) {
          const referenceDocument = await db.prepare(
            "SELECT reference_no FROM sales_documents WHERE document_number = ? COLLATE NOCASE LIMIT 1"
          ).bind(referenceNo).first<{ reference_no: string }>();
          if (referenceDocument?.reference_no) {
            invoiceSale = await db.prepare("SELECT id FROM sales WHERE po_no = ? COLLATE NOCASE LIMIT 1")
              .bind(referenceDocument.reference_no).first<{ id: number }>();
          }
        }
        if (invoiceSale) {
          await db.prepare(
            "UPDATE sales SET invoice_no = ?, invoice_amount = ?, due_date = ?, payment_status = 'OPEN', transaction_status = 'Done Invoice', notes = ?, updated_at = ? WHERE id = ?"
          ).bind(number, grandTotal, String(body.due_date || ""), "Invoice dibuat dari dokumen pengiriman.", now, invoiceSale.id).run();
          return NextResponse.json({ ok: true, id: documentId, document_number: number });
        }
      }
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
        type === "QUOTATION" ? number : referenceNo,
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

export async function PATCH(request: NextRequest) {
  try {
    const access = await requireRole(request, ["ADMIN"]);
    if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });
    await ensureDatabase();
    const body = await request.json() as { id?: number; document_number?: string };
    const id = Number(body.id || 0);
    const documentNumber = String(body.document_number || "").trim().toUpperCase();
    if (!id || !/^[0-9]{3}\/.+/.test(documentNumber)) {
      return NextResponse.json({ error: "Nomor quotation wajib diawali tepat tiga digit." }, { status: 400 });
    }

    if (isSupabaseConfigured()) {
      const supabase = await createSupabaseServerClient();
      const [{ data: current, error: currentError }, { data: duplicate, error: duplicateError }] = await Promise.all([
        supabase.from("sales_documents").select("id,document_type,document_number").eq("id", id).single(),
        supabase.from("sales_documents").select("id").eq("document_number", documentNumber).neq("id", id).limit(1),
      ]);
      if (currentError || !current) throw currentError ?? new Error("Quotation tidak ditemukan.");
      if (duplicateError) throw duplicateError;
      if (current.document_type !== "QUOTATION") return NextResponse.json({ error: "Hanya nomor quotation yang dapat diubah." }, { status: 400 });
      if (duplicate?.length) return NextResponse.json({ error: `Nomor quotation ${documentNumber} sudah digunakan.` }, { status: 409 });
      const oldNumber = String(current.document_number);
      if (oldNumber === documentNumber) return NextResponse.json({ ok: true, document_number: documentNumber });
      const now = new Date().toISOString();
      const { error: documentError } = await supabase.from("sales_documents")
        .update({ document_number: documentNumber, updated_at: now }).eq("id", id);
      if (documentError) throw documentError;
      const [{ error: saleError }, { error: referenceError }] = await Promise.all([
        supabase.from("sales").update({ quotation_no: documentNumber, updated_at: now }).eq("quotation_no", oldNumber),
        supabase.from("sales_documents").update({ reference_no: documentNumber, updated_at: now }).eq("reference_no", oldNumber),
      ]);
      if (saleError) throw saleError;
      if (referenceError) throw referenceError;
      return NextResponse.json({ ok: true, document_number: documentNumber });
    }

    const db = await getDb();
    const current = await db.prepare(
      "SELECT id, document_type, document_number FROM sales_documents WHERE id = ? LIMIT 1"
    ).bind(id).first<{ id: number; document_type: string; document_number: string }>();
    if (!current) return NextResponse.json({ error: "Quotation tidak ditemukan." }, { status: 404 });
    if (current.document_type !== "QUOTATION") return NextResponse.json({ error: "Hanya nomor quotation yang dapat diubah." }, { status: 400 });
    const duplicate = await db.prepare(
      "SELECT id FROM sales_documents WHERE document_number = ? COLLATE NOCASE AND id <> ? LIMIT 1"
    ).bind(documentNumber, id).first();
    if (duplicate) return NextResponse.json({ error: `Nomor quotation ${documentNumber} sudah digunakan.` }, { status: 409 });
    if (current.document_number === documentNumber) return NextResponse.json({ ok: true, document_number: documentNumber });
    const now = new Date().toISOString();
    const salesExists = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sales'").first();
    const statements = [
      db.prepare("UPDATE sales_documents SET document_number = ?, updated_at = ? WHERE id = ?").bind(documentNumber, now, id),
      db.prepare("UPDATE sales_documents SET reference_no = ?, updated_at = ? WHERE reference_no = ?").bind(documentNumber, now, current.document_number),
    ];
    if (salesExists) statements.push(
      db.prepare("UPDATE sales SET quotation_no = ?, updated_at = ? WHERE quotation_no = ?").bind(documentNumber, now, current.document_number)
    );
    await db.batch(statements);
    return NextResponse.json({ ok: true, document_number: documentNumber });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Nomor quotation belum berhasil diubah." }, { status: 500 });
  }
}
