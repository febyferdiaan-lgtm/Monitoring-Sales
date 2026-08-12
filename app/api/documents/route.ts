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
  delivery_sequence?: string;
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

type DocumentPatchInput = DocumentInput & {
  id?: number;
  action?: "update_content";
  document_number?: string;
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
  const sequenceLabel = type === "DELIVERY_NOTE" ? "surat jalan" : "quotation";
  if (requested && !/^[0-9]{1,3}$/.test(requested)) throw new Error(`Tiga digit awal nomor ${sequenceLabel} harus berupa angka.`);
  let nextSequence = Number(requested || 0);
  if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    const [{ data: documents, error: documentError }, salesResult] = await Promise.all([
      supabase.from("sales_documents").select("document_number").eq("document_type", type)
        .gte("document_date", `${year}-01-01`).lt("document_date", `${year + 1}-01-01`),
      type === "QUOTATION"
        ? supabase.from("sales").select("quotation_no").neq("quotation_no", "")
        : type === "DELIVERY_NOTE"
          ? supabase.from("sales").select("delivery_no").neq("delivery_no", "")
          : Promise.resolve({ data: [], error: null }),
    ]);
    if (documentError) throw documentError;
    if (salesResult.error) throw salesResult.error;
    if (!nextSequence) {
      const used = [
        ...(documents ?? []).map((document) => sequenceFromNumber(document.document_number, year)),
        ...((salesResult.data ?? []) as { quotation_no?: string; delivery_no?: string }[]).flatMap((sale) =>
          String(type === "DELIVERY_NOTE" ? sale.delivery_no || "" : sale.quotation_no || "")
            .split(",")
            .map((value) => sequenceFromNumber(value, year))
        ),
      ];
      nextSequence = Math.max(0, ...used) + 1;
    }
  } else {
    const db = await getDb();
    if (!nextSequence) {
      const documents = await db.prepare(
        "SELECT document_number FROM sales_documents WHERE document_type = ? AND substr(document_date, 1, 4) = ?"
      ).bind(type, String(year)).all<{ document_number: string }>();
      const salesExists = type === "QUOTATION" || type === "DELIVERY_NOTE"
        ? await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sales'").first()
        : null;
      const sales = salesExists
        ? type === "DELIVERY_NOTE"
          ? await db.prepare("SELECT delivery_no FROM sales WHERE delivery_no <> ''").all<{ delivery_no: string }>()
          : await db.prepare("SELECT quotation_no FROM sales WHERE quotation_no <> ''").all<{ quotation_no: string }>()
        : { results: [] as { quotation_no?: string; delivery_no?: string }[] };
      const used = [
        ...documents.results.map((document) => sequenceFromNumber(document.document_number, year)),
        ...(sales.results as { quotation_no?: string; delivery_no?: string }[]).flatMap((sale) =>
          String(type === "DELIVERY_NOTE" ? sale.delivery_no || "" : sale.quotation_no || "")
            .split(",")
            .map((value) => sequenceFromNumber(value, year))
        ),
      ];
      nextSequence = Math.max(0, ...used) + 1;
    }
  }
  if (nextSequence < 1 || nextSequence > 999) throw new Error(`Nomor urut ${sequenceLabel} harus berada di antara 001 dan 999.`);
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
    const requestedSequence = type === "QUOTATION"
      ? String(body.quotation_sequence || "")
      : type === "DELIVERY_NOTE"
        ? String(body.delivery_sequence || "")
        : "";
    const number = await nextDocumentNumber(type, documentDate, requestedSequence);
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

async function updateDocumentContent(body: DocumentPatchInput) {
  const id = Number(body.id || 0);
  const customer = String(body.customer || "").trim();
  const items = (body.items ?? []).filter((item) => String(item.description || "").trim() && Number(item.quantity || 0) > 0);
  if (!id || !customer || !items.length) {
    return NextResponse.json({ error: "Customer dan minimal satu item wajib diisi." }, { status: 400 });
  }

  if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    const { data: current, error: currentError } = await supabase.from("sales_documents")
      .select("*").eq("id", id).single();
    if (currentError || !current) return NextResponse.json({ error: "Dokumen tidak ditemukan." }, { status: 404 });
    const type = String(current.document_type) as DocumentType;
    if (!(["QUOTATION", "DELIVERY_NOTE", "INVOICE"] as string[]).includes(type)) {
      return NextResponse.json({ error: "Jenis dokumen ini tidak dapat diedit melalui formulir." }, { status: 400 });
    }
    const referenceNo = type === "DELIVERY_NOTE" ? String(current.reference_no || "").trim() : String(body.reference_no ?? current.reference_no ?? "").trim();
    let deliveryComplete = false;
    let deliverySale: { id: number; invoice_no?: string } | null = null;
    if (type === "DELIVERY_NOTE") {
      const [{ data: poDocuments, error: poError }, { data: saleRows, error: saleError }, { data: deliveryDocuments, error: deliveryError }] = await Promise.all([
        supabase.from("sales_documents").select("id").eq("document_type", "PURCHASE_ORDER").eq("document_number", referenceNo).limit(1),
        supabase.from("sales").select("id,quotation_no,invoice_no").eq("po_no", referenceNo).limit(1),
        supabase.from("sales_documents").select("id").eq("document_type", "DELIVERY_NOTE").eq("reference_no", referenceNo).neq("id", id),
      ]);
      if (poError) throw poError;
      if (saleError) throw saleError;
      if (deliveryError) throw deliveryError;
      const sale = saleRows?.[0];
      if (!sale) return NextResponse.json({ error: `PO ${referenceNo} tidak ditemukan atau belum terhubung ke transaksi.` }, { status: 404 });
      deliverySale = { id: Number(sale.id), invoice_no: String(sale.invoice_no || "") };
      let sourceDocumentId = Number(poDocuments?.[0]?.id || 0);
      if (!sourceDocumentId && sale.quotation_no) {
        const { data: quotations, error: quotationError } = await supabase.from("sales_documents")
          .select("id").eq("document_type", "QUOTATION").eq("document_number", sale.quotation_no).limit(1);
        if (quotationError) throw quotationError;
        sourceDocumentId = Number(quotations?.[0]?.id || 0);
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
    }

    const taxPercent = type === "DELIVERY_NOTE" ? 0 : Math.max(0, Number(body.tax_percent ?? current.tax_percent ?? 11));
    const subtotal = type === "DELIVERY_NOTE" ? 0 : items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_price || 0), 0);
    const taxAmount = subtotal * taxPercent / 100;
    const grandTotal = subtotal + taxAmount;
    const now = new Date().toISOString();
    const { error: deleteError } = await supabase.from("sales_document_items").delete().eq("document_id", id);
    if (deleteError) throw deleteError;
    const { error: itemError } = await supabase.from("sales_document_items").insert(items.map((item) => ({
      document_id: id,
      spare_part_id: item.spare_part_id ? Number(item.spare_part_id) : null,
      part_number: String(item.part_number || ""),
      description: String(item.description || ""),
      quantity: Number(item.quantity || 0),
      unit: String(item.unit || "Pcs"),
      unit_price: type === "DELIVERY_NOTE" ? 0 : Number(item.unit_price || 0),
      line_total: type === "DELIVERY_NOTE" ? 0 : Number(item.quantity || 0) * Number(item.unit_price || 0),
    })));
    if (itemError) throw itemError;
    const { error: documentError } = await supabase.from("sales_documents").update({
      customer,
      customer_address: String(body.customer_address || ""),
      customer_pic: String(body.customer_pic || ""),
      project: String(body.project || ""),
      reference_no: referenceNo,
      document_date: String(body.document_date || current.document_date),
      due_date: String(body.due_date || ""),
      subtotal,
      tax_percent: taxPercent,
      tax_amount: taxAmount,
      grand_total: grandTotal,
      notes: String(body.notes || ""),
      status: type === "DELIVERY_NOTE" ? (deliveryComplete ? "COMPLETE" : "PARTIAL") : String(current.status || "DRAFT"),
      updated_at: now,
    }).eq("id", id);
    if (documentError) throw documentError;

    if (type === "DELIVERY_NOTE" && deliverySale) {
      const { error: saleError } = await supabase.from("sales").update({
        customer,
        project: String(body.project || ""),
        transaction_status: deliverySale.invoice_no ? "Done Invoice" : deliveryComplete ? "Terkirim - Siap Invoice" : "Dikirim Partial",
        updated_at: now,
      }).eq("id", deliverySale.id);
      if (saleError) throw saleError;
    } else if (type === "INVOICE") {
      const { data: invoiceSales, error: saleReadError } = await supabase.from("sales")
        .select("id,amount_paid").eq("invoice_no", current.document_number);
      if (saleReadError) throw saleReadError;
      for (const sale of invoiceSales ?? []) {
        const closed = Number(sale.amount_paid || 0) >= grandTotal - 0.01;
        const { error: saleError } = await supabase.from("sales").update({
          customer,
          project: String(body.project || ""),
          invoice_amount: grandTotal,
          due_date: String(body.due_date || ""),
          payment_status: closed ? "CLOSED" : "OPEN",
          transaction_status: closed ? "Paid" : "Done Invoice",
          updated_at: now,
        }).eq("id", sale.id);
        if (saleError) throw saleError;
      }
    } else {
      const { data: saleRows, error: saleReadError } = await supabase.from("sales")
        .select("id,invoice_no").eq("quotation_no", current.document_number).limit(1);
      if (saleReadError) throw saleReadError;
      const linkedSale = saleRows?.[0];
      if (linkedSale) {
        const update: Record<string, unknown> = { customer, project: String(body.project || ""), updated_at: now };
        if (!linkedSale.invoice_no) update.invoice_amount = grandTotal;
        const { error: saleError } = await supabase.from("sales").update(update).eq("id", linkedSale.id);
        if (saleError) throw saleError;
      }
    }
    return NextResponse.json({ ok: true, id, document_number: current.document_number, delivery_complete: deliveryComplete });
  }

  const db = await getDb();
  const current = await db.prepare("SELECT * FROM sales_documents WHERE id = ? LIMIT 1")
    .bind(id).first<Record<string, unknown>>();
  if (!current) return NextResponse.json({ error: "Dokumen tidak ditemukan." }, { status: 404 });
  const type = String(current.document_type) as DocumentType;
  if (!(["QUOTATION", "DELIVERY_NOTE", "INVOICE"] as string[]).includes(type)) {
    return NextResponse.json({ error: "Jenis dokumen ini tidak dapat diedit melalui formulir." }, { status: 400 });
  }
  const referenceNo = type === "DELIVERY_NOTE" ? String(current.reference_no || "").trim() : String(body.reference_no ?? current.reference_no ?? "").trim();
  let deliveryComplete = false;
  let deliverySale: { id: number; invoice_no: string } | null = null;
  if (type === "DELIVERY_NOTE") {
    let sourceDocument = await db.prepare("SELECT id FROM sales_documents WHERE document_type = 'PURCHASE_ORDER' AND document_number = ? COLLATE NOCASE LIMIT 1")
      .bind(referenceNo).first<{ id: number }>();
    const sale = await db.prepare("SELECT id, quotation_no, invoice_no FROM sales WHERE po_no = ? COLLATE NOCASE LIMIT 1")
      .bind(referenceNo).first<{ id: number; quotation_no: string; invoice_no: string }>();
    if (!sale) return NextResponse.json({ error: `PO ${referenceNo} tidak ditemukan atau belum terhubung ke transaksi.` }, { status: 404 });
    deliverySale = { id: sale.id, invoice_no: sale.invoice_no };
    if (!sourceDocument && sale.quotation_no) {
      sourceDocument = await db.prepare("SELECT id FROM sales_documents WHERE document_type = 'QUOTATION' AND document_number = ? COLLATE NOCASE LIMIT 1")
        .bind(sale.quotation_no).first<{ id: number }>();
    }
    if (!sourceDocument) return NextResponse.json({ error: `Detail item PO ${referenceNo} belum tersedia.` }, { status: 404 });
    const orderedItems = await db.prepare("SELECT spare_part_id, part_number, description, quantity, unit FROM sales_document_items WHERE document_id = ?")
      .bind(sourceDocument.id).all<DocumentItem>();
    const deliveredItems = await db.prepare(
      `SELECT item.spare_part_id, item.part_number, item.description, item.quantity, item.unit
       FROM sales_document_items item INNER JOIN sales_documents document ON document.id = item.document_id
       WHERE document.document_type = 'DELIVERY_NOTE' AND document.reference_no = ? COLLATE NOCASE AND document.id <> ?`
    ).bind(referenceNo, id).all<DocumentItem>();
    deliveryComplete = validateDeliveryQuantities(orderedItems.results, deliveredItems.results, items);
  }
  const taxPercent = type === "DELIVERY_NOTE" ? 0 : Math.max(0, Number(body.tax_percent ?? current.tax_percent ?? 11));
  const subtotal = type === "DELIVERY_NOTE" ? 0 : items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_price || 0), 0);
  const taxAmount = subtotal * taxPercent / 100;
  const grandTotal = subtotal + taxAmount;
  const now = new Date().toISOString();
  const statements = [
    db.prepare(`UPDATE sales_documents SET customer = ?, customer_address = ?, customer_pic = ?, project = ?, reference_no = ?, document_date = ?, due_date = ?, subtotal = ?, tax_percent = ?, tax_amount = ?, grand_total = ?, notes = ?, status = ?, updated_at = ? WHERE id = ?`).bind(
      customer, String(body.customer_address || ""), String(body.customer_pic || ""), String(body.project || ""), referenceNo,
      String(body.document_date || current.document_date), String(body.due_date || ""), subtotal, taxPercent, taxAmount, grandTotal,
      String(body.notes || ""), type === "DELIVERY_NOTE" ? (deliveryComplete ? "COMPLETE" : "PARTIAL") : String(current.status || "DRAFT"), now, id
    ),
    db.prepare("DELETE FROM sales_document_items WHERE document_id = ?").bind(id),
    ...items.map((item) => db.prepare(`INSERT INTO sales_document_items (document_id, spare_part_id, part_number, description, quantity, unit, unit_price, line_total) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, item.spare_part_id ? Number(item.spare_part_id) : null, String(item.part_number || ""), String(item.description || ""), Number(item.quantity || 0), String(item.unit || "Pcs"), type === "DELIVERY_NOTE" ? 0 : Number(item.unit_price || 0), type === "DELIVERY_NOTE" ? 0 : Number(item.quantity || 0) * Number(item.unit_price || 0))),
  ];
  await db.batch(statements);
  const salesExists = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sales'").first();
  if (salesExists) {
    if (type === "DELIVERY_NOTE" && deliverySale) {
      await db.prepare("UPDATE sales SET customer = ?, project = ?, transaction_status = ?, updated_at = ? WHERE id = ?")
        .bind(customer, String(body.project || ""), deliverySale.invoice_no ? "Done Invoice" : deliveryComplete ? "Terkirim - Siap Invoice" : "Dikirim Partial", now, deliverySale.id).run();
    } else if (type === "INVOICE") {
      const invoiceSales = await db.prepare("SELECT id, amount_paid FROM sales WHERE invoice_no = ? COLLATE NOCASE")
        .bind(String(current.document_number)).all<{ id: number; amount_paid: number }>();
      for (const sale of invoiceSales.results) {
        const closed = Number(sale.amount_paid || 0) >= grandTotal - 0.01;
        await db.prepare("UPDATE sales SET customer = ?, project = ?, invoice_amount = ?, due_date = ?, payment_status = ?, transaction_status = ?, updated_at = ? WHERE id = ?")
          .bind(customer, String(body.project || ""), grandTotal, String(body.due_date || ""), closed ? "CLOSED" : "OPEN", closed ? "Paid" : "Done Invoice", now, sale.id).run();
      }
    } else {
      const linkedSale = await db.prepare("SELECT id, invoice_no FROM sales WHERE quotation_no = ? COLLATE NOCASE LIMIT 1")
        .bind(String(current.document_number)).first<{ id: number; invoice_no: string }>();
      if (linkedSale) {
        if (linkedSale.invoice_no) await db.prepare("UPDATE sales SET customer = ?, project = ?, updated_at = ? WHERE id = ?").bind(customer, String(body.project || ""), now, linkedSale.id).run();
        else await db.prepare("UPDATE sales SET customer = ?, project = ?, invoice_amount = ?, updated_at = ? WHERE id = ?").bind(customer, String(body.project || ""), grandTotal, now, linkedSale.id).run();
      }
    }
  }
  return NextResponse.json({ ok: true, id, document_number: current.document_number, delivery_complete: deliveryComplete });
}

const withoutDocumentNumber = (value: unknown, removed: string) => String(value || "")
  .split(",")
  .map((item) => item.trim())
  .filter((item) => item && item.toLowerCase() !== removed.trim().toLowerCase())
  .join(", ");

export async function DELETE(request: NextRequest) {
  try {
    const access = await requireRole(request, ["ADMIN"]);
    if (access.error || !access.identity) return NextResponse.json({ error: access.error }, { status: access.status });
    await ensureDatabase();
    const body = await request.json() as { id?: number };
    const id = Number(body.id || 0);
    if (!id) return NextResponse.json({ error: "Dokumen yang akan dihapus belum dipilih." }, { status: 400 });

    if (isSupabaseConfigured()) {
      const supabase = await createSupabaseServerClient();
      const { data: current, error: currentError } = await supabase.from("sales_documents").select("*").eq("id", id).maybeSingle();
      if (currentError) throw currentError;
      if (!current) return NextResponse.json({ error: "Dokumen tidak ditemukan." }, { status: 404 });
      const type = String(current.document_type);
      const documentNumber = String(current.document_number || "");
      if (type === "PURCHASE_ORDER") return NextResponse.json({ error: "PO diterima dikelola dari transaksi penjualan dan tidak dapat dihapus dari riwayat dokumen." }, { status: 400 });

      let linkedSale: Record<string, unknown> | null = null;
      if (type === "DELIVERY_NOTE") {
        const { data: sales, error: saleError } = await supabase.from("sales")
          .select("id,quotation_no,po_no,delivery_no,invoice_no").eq("po_no", String(current.reference_no || "")).limit(1);
        if (saleError) throw saleError;
        linkedSale = sales?.[0] ?? null;
        if (String(linkedSale?.invoice_no || "").trim()) {
          return NextResponse.json({ error: "Surat jalan sudah terhubung ke invoice. Hapus invoice lebih dahulu." }, { status: 409 });
        }
      } else if (type === "QUOTATION") {
        const { data: sales, error: saleError } = await supabase.from("sales")
          .select("id,source_key,po_no,delivery_no,invoice_no,amount_paid").eq("quotation_no", documentNumber).limit(1);
        if (saleError) throw saleError;
        linkedSale = sales?.[0] ?? null;
        if (linkedSale && (String(linkedSale.delivery_no || "").trim() || String(linkedSale.invoice_no || "").trim() || Number(linkedSale.amount_paid || 0) > 0)) {
          return NextResponse.json({ error: "Quotation sudah memiliki surat jalan, invoice, atau pembayaran. Hapus dokumen lanjutan terlebih dahulu." }, { status: 409 });
        }
      } else if (type === "INVOICE") {
        const { data: sales, error: saleError } = await supabase.from("sales")
          .select("id,delivery_no,po_no,amount_paid").eq("invoice_no", documentNumber).limit(1);
        if (saleError) throw saleError;
        linkedSale = sales?.[0] ?? null;
        if (Number(linkedSale?.amount_paid || 0) > 0) {
          return NextResponse.json({ error: "Invoice sudah memiliki pembayaran dan tidak dapat dihapus." }, { status: 409 });
        }
        if (linkedSale) {
          const { data: confirmations, error: confirmationError } = await supabase.from("payment_confirmations")
            .select("id").eq("sale_id", Number(linkedSale.id)).in("status", ["PENDING", "APPROVED"]).limit(1);
          if (confirmationError) throw confirmationError;
          if (confirmations?.length) return NextResponse.json({ error: "Invoice memiliki konfirmasi pembayaran aktif dan tidak dapat dihapus." }, { status: 409 });
        }
      }

      const { error: itemError } = await supabase.from("sales_document_items").delete().eq("document_id", id);
      if (itemError) throw itemError;
      const { error: documentError } = await supabase.from("sales_documents").delete().eq("id", id);
      if (documentError) throw documentError;
      const now = new Date().toISOString();

      if (type === "DELIVERY_NOTE" && linkedSale) {
        const referenceNo = String(current.reference_no || "");
        const [{ data: remainingDocuments, error: remainingError }, { data: poDocuments, error: poError }] = await Promise.all([
          supabase.from("sales_documents").select("id,document_number").eq("document_type", "DELIVERY_NOTE").eq("reference_no", referenceNo),
          supabase.from("sales_documents").select("id").eq("document_type", "PURCHASE_ORDER").eq("document_number", referenceNo).limit(1),
        ]);
        if (remainingError) throw remainingError;
        if (poError) throw poError;
        let sourceDocumentId = Number(poDocuments?.[0]?.id || 0);
        if (!sourceDocumentId && linkedSale.quotation_no) {
          const { data: quotations, error: quotationError } = await supabase.from("sales_documents")
            .select("id").eq("document_type", "QUOTATION").eq("document_number", String(linkedSale.quotation_no)).limit(1);
          if (quotationError) throw quotationError;
          sourceDocumentId = Number(quotations?.[0]?.id || 0);
        }
        const remainingIds = (remainingDocuments ?? []).map((document) => Number(document.id));
        let complete = false;
        if (sourceDocumentId && remainingIds.length) {
          const [{ data: ordered, error: orderedError }, { data: delivered, error: deliveredError }] = await Promise.all([
            supabase.from("sales_document_items").select("spare_part_id,part_number,description,quantity,unit").eq("document_id", sourceDocumentId),
            supabase.from("sales_document_items").select("spare_part_id,part_number,description,quantity,unit").in("document_id", remainingIds),
          ]);
          if (orderedError) throw orderedError;
          if (deliveredError) throw deliveredError;
          complete = validateDeliveryQuantities(ordered ?? [], delivered ?? [], []);
        }
        const deliveryNo = withoutDocumentNumber(linkedSale.delivery_no, documentNumber);
        const { error: saleUpdateError } = await supabase.from("sales").update({
          delivery_no: deliveryNo,
          transaction_status: !remainingIds.length ? "PO Diterima" : complete ? "Terkirim - Siap Invoice" : "Dikirim Partial",
          updated_at: now,
        }).eq("id", Number(linkedSale.id));
        if (saleUpdateError) throw saleUpdateError;
      } else if (type === "QUOTATION" && linkedSale) {
        const poNo = String(linkedSale.po_no || "").trim();
        if (poNo) {
          const { data: poDocuments, error: poReadError } = await supabase.from("sales_documents").select("id").eq("document_type", "PURCHASE_ORDER").eq("document_number", poNo);
          if (poReadError) throw poReadError;
          const poIds = (poDocuments ?? []).map((document) => Number(document.id));
          if (poIds.length) {
            const { error: poItemError } = await supabase.from("sales_document_items").delete().in("document_id", poIds);
            if (poItemError) throw poItemError;
            const { error: poDeleteError } = await supabase.from("sales_documents").delete().in("id", poIds);
            if (poDeleteError) throw poDeleteError;
          }
        }
        const { error: saleDeleteError } = await supabase.from("sales").delete().eq("id", Number(linkedSale.id));
        if (saleDeleteError) throw saleDeleteError;
      } else if (type === "INVOICE" && linkedSale) {
        const deliveryNo = String(linkedSale.delivery_no || "").trim();
        const poNo = String(linkedSale.po_no || "").trim();
        const { error: saleUpdateError } = await supabase.from("sales").update({
          invoice_no: "", invoice_amount: 0, due_date: "", payment_date: "", payment_status: "OPEN",
          transaction_status: deliveryNo ? "Terkirim - Siap Invoice" : poNo ? "PO Diterima" : "Open", updated_at: now,
        }).eq("id", Number(linkedSale.id));
        if (saleUpdateError) throw saleUpdateError;
      }
      return NextResponse.json({ ok: true, document_number: documentNumber });
    }

    const db = await getDb();
    const current = await db.prepare("SELECT * FROM sales_documents WHERE id = ? LIMIT 1").bind(id).first<Record<string, unknown>>();
    if (!current) return NextResponse.json({ error: "Dokumen tidak ditemukan." }, { status: 404 });
    const type = String(current.document_type);
    const documentNumber = String(current.document_number || "");
    if (type === "PURCHASE_ORDER") return NextResponse.json({ error: "PO diterima dikelola dari transaksi penjualan dan tidak dapat dihapus dari riwayat dokumen." }, { status: 400 });
    const salesExists = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sales'").first();
    let linkedSale: Record<string, unknown> | null = null;
    if (salesExists && type === "DELIVERY_NOTE") {
      linkedSale = await db.prepare("SELECT id, quotation_no, po_no, delivery_no, invoice_no FROM sales WHERE po_no = ? COLLATE NOCASE LIMIT 1")
        .bind(String(current.reference_no || "")).first<Record<string, unknown>>();
      if (String(linkedSale?.invoice_no || "").trim()) return NextResponse.json({ error: "Surat jalan sudah terhubung ke invoice. Hapus invoice lebih dahulu." }, { status: 409 });
    } else if (salesExists && type === "QUOTATION") {
      linkedSale = await db.prepare("SELECT id, source_key, po_no, delivery_no, invoice_no, amount_paid FROM sales WHERE quotation_no = ? COLLATE NOCASE LIMIT 1")
        .bind(documentNumber).first<Record<string, unknown>>();
      if (linkedSale && (String(linkedSale.delivery_no || "").trim() || String(linkedSale.invoice_no || "").trim() || Number(linkedSale.amount_paid || 0) > 0)) {
        return NextResponse.json({ error: "Quotation sudah memiliki surat jalan, invoice, atau pembayaran. Hapus dokumen lanjutan terlebih dahulu." }, { status: 409 });
      }
    } else if (salesExists && type === "INVOICE") {
      linkedSale = await db.prepare("SELECT id, delivery_no, po_no, amount_paid FROM sales WHERE invoice_no = ? COLLATE NOCASE LIMIT 1")
        .bind(documentNumber).first<Record<string, unknown>>();
      if (Number(linkedSale?.amount_paid || 0) > 0) return NextResponse.json({ error: "Invoice sudah memiliki pembayaran dan tidak dapat dihapus." }, { status: 409 });
      if (linkedSale) {
        const paymentsExist = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='payment_confirmations'").first();
        const confirmation = paymentsExist ? await db.prepare("SELECT id FROM payment_confirmations WHERE sale_id = ? AND status IN ('PENDING', 'APPROVED') LIMIT 1").bind(Number(linkedSale.id)).first() : null;
        if (confirmation) return NextResponse.json({ error: "Invoice memiliki konfirmasi pembayaran aktif dan tidak dapat dihapus." }, { status: 409 });
      }
    }

    await db.batch([
      db.prepare("DELETE FROM sales_document_items WHERE document_id = ?").bind(id),
      db.prepare("DELETE FROM sales_documents WHERE id = ?").bind(id),
    ]);
    const now = new Date().toISOString();
    if (type === "DELIVERY_NOTE" && linkedSale) {
      const referenceNo = String(current.reference_no || "");
      let sourceDocument = await db.prepare("SELECT id FROM sales_documents WHERE document_type = 'PURCHASE_ORDER' AND document_number = ? COLLATE NOCASE LIMIT 1").bind(referenceNo).first<{ id: number }>();
      if (!sourceDocument && linkedSale.quotation_no) sourceDocument = await db.prepare("SELECT id FROM sales_documents WHERE document_type = 'QUOTATION' AND document_number = ? COLLATE NOCASE LIMIT 1").bind(String(linkedSale.quotation_no)).first<{ id: number }>();
      const remainingDocuments = await db.prepare("SELECT id FROM sales_documents WHERE document_type = 'DELIVERY_NOTE' AND reference_no = ? COLLATE NOCASE").bind(referenceNo).all<{ id: number }>();
      let complete = false;
      if (sourceDocument && remainingDocuments.results.length) {
        const ordered = await db.prepare("SELECT spare_part_id, part_number, description, quantity, unit FROM sales_document_items WHERE document_id = ?").bind(sourceDocument.id).all<DocumentItem>();
        const placeholders = remainingDocuments.results.map(() => "?").join(",");
        const delivered = await db.prepare(`SELECT spare_part_id, part_number, description, quantity, unit FROM sales_document_items WHERE document_id IN (${placeholders})`).bind(...remainingDocuments.results.map((document) => document.id)).all<DocumentItem>();
        complete = validateDeliveryQuantities(ordered.results, delivered.results, []);
      }
      await db.prepare("UPDATE sales SET delivery_no = ?, transaction_status = ?, updated_at = ? WHERE id = ?")
        .bind(withoutDocumentNumber(linkedSale.delivery_no, documentNumber), !remainingDocuments.results.length ? "PO Diterima" : complete ? "Terkirim - Siap Invoice" : "Dikirim Partial", now, Number(linkedSale.id)).run();
    } else if (type === "QUOTATION" && linkedSale) {
      const poNo = String(linkedSale.po_no || "").trim();
      if (poNo) {
        const poDocuments = await db.prepare("SELECT id FROM sales_documents WHERE document_type = 'PURCHASE_ORDER' AND document_number = ? COLLATE NOCASE").bind(poNo).all<{ id: number }>();
        for (const poDocument of poDocuments.results) {
          await db.batch([
            db.prepare("DELETE FROM sales_document_items WHERE document_id = ?").bind(poDocument.id),
            db.prepare("DELETE FROM sales_documents WHERE id = ?").bind(poDocument.id),
          ]);
        }
      }
      await db.prepare("DELETE FROM sales WHERE id = ?").bind(Number(linkedSale.id)).run();
    } else if (type === "INVOICE" && linkedSale) {
      const status = String(linkedSale.delivery_no || "").trim() ? "Terkirim - Siap Invoice" : String(linkedSale.po_no || "").trim() ? "PO Diterima" : "Open";
      await db.prepare("UPDATE sales SET invoice_no = '', invoice_amount = 0, due_date = '', payment_date = '', payment_status = 'OPEN', transaction_status = ?, updated_at = ? WHERE id = ?")
        .bind(status, now, Number(linkedSale.id)).run();
    }
    return NextResponse.json({ ok: true, document_number: documentNumber });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Dokumen belum berhasil dihapus." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const access = await requireRole(request, ["ADMIN", "EDITOR"]);
    if (access.error) return NextResponse.json({ error: access.error }, { status: access.status });
    await ensureDatabase();
    const body = await request.json() as DocumentPatchInput;
    if (body.action === "update_content") {
      if (access.identity?.role !== "ADMIN") return NextResponse.json({ error: "Hanya Admin yang dapat mengedit isi dokumen yang sudah terbit." }, { status: 403 });
      return updateDocumentContent(body);
    }
    const id = Number(body.id || 0);
    const documentNumber = String(body.document_number || "").trim().toUpperCase();
    if (!id || !/^[0-9]{3}\/.+/.test(documentNumber)) {
      return NextResponse.json({ error: "Nomor dokumen wajib diawali tepat tiga digit." }, { status: 400 });
    }

    if (isSupabaseConfigured()) {
      const supabase = await createSupabaseServerClient();
      const [{ data: current, error: currentError }, { data: duplicate, error: duplicateError }] = await Promise.all([
        supabase.from("sales_documents").select("id,document_type,document_number").eq("id", id).single(),
        supabase.from("sales_documents").select("id").eq("document_number", documentNumber).neq("id", id).limit(1),
      ]);
      if (currentError || !current) throw currentError ?? new Error("Dokumen tidak ditemukan.");
      if (duplicateError) throw duplicateError;
      const documentType = String(current.document_type);
      if (documentType !== "QUOTATION" && documentType !== "DELIVERY_NOTE") return NextResponse.json({ error: "Hanya nomor quotation atau surat jalan yang dapat diubah." }, { status: 400 });
      if (documentType === "QUOTATION" && access.identity?.role !== "ADMIN") return NextResponse.json({ error: "Hanya Admin yang dapat mengubah nomor quotation yang sudah tersimpan." }, { status: 403 });
      const oldNumber = String(current.document_number);
      if (oldNumber.replace(/^\d{1,3}/, "") !== documentNumber.replace(/^\d{3}/, "")) {
        return NextResponse.json({ error: "Hanya tiga digit awal nomor dokumen yang dapat diubah." }, { status: 400 });
      }
      const documentLabel = documentType === "DELIVERY_NOTE" ? "surat jalan" : "quotation";
      if (duplicate?.length) return NextResponse.json({ error: `Nomor ${documentLabel} ${documentNumber} sudah digunakan.` }, { status: 409 });
      if (oldNumber === documentNumber) return NextResponse.json({ ok: true, document_number: documentNumber });
      const now = new Date().toISOString();
      const { error: documentError } = await supabase.from("sales_documents")
        .update({ document_number: documentNumber, updated_at: now }).eq("id", id);
      if (documentError) throw documentError;
      const { error: referenceError } = await supabase.from("sales_documents")
        .update({ reference_no: documentNumber, updated_at: now }).eq("reference_no", oldNumber);
      if (referenceError) throw referenceError;
      if (documentType === "QUOTATION") {
        const { error: saleError } = await supabase.from("sales")
          .update({ quotation_no: documentNumber, updated_at: now }).eq("quotation_no", oldNumber);
        if (saleError) throw saleError;
      } else {
        const { data: saleRows, error: saleReadError } = await supabase.from("sales")
          .select("id,delivery_no").ilike("delivery_no", `%${oldNumber}%`);
        if (saleReadError) throw saleReadError;
        for (const sale of saleRows ?? []) {
          const deliveryNo = String(sale.delivery_no || "").split(",").map((value) => value.trim() === oldNumber ? documentNumber : value.trim()).filter(Boolean).join(", ");
          const { error: saleError } = await supabase.from("sales").update({ delivery_no: deliveryNo, updated_at: now }).eq("id", sale.id);
          if (saleError) throw saleError;
        }
      }
      return NextResponse.json({ ok: true, document_number: documentNumber });
    }

    const db = await getDb();
    const current = await db.prepare(
      "SELECT id, document_type, document_number FROM sales_documents WHERE id = ? LIMIT 1"
    ).bind(id).first<{ id: number; document_type: string; document_number: string }>();
    if (!current) return NextResponse.json({ error: "Dokumen tidak ditemukan." }, { status: 404 });
    if (current.document_type !== "QUOTATION" && current.document_type !== "DELIVERY_NOTE") return NextResponse.json({ error: "Hanya nomor quotation atau surat jalan yang dapat diubah." }, { status: 400 });
    if (current.document_type === "QUOTATION" && access.identity?.role !== "ADMIN") return NextResponse.json({ error: "Hanya Admin yang dapat mengubah nomor quotation yang sudah tersimpan." }, { status: 403 });
    if (current.document_number.replace(/^\d{1,3}/, "") !== documentNumber.replace(/^\d{3}/, "")) {
      return NextResponse.json({ error: "Hanya tiga digit awal nomor dokumen yang dapat diubah." }, { status: 400 });
    }
    const duplicate = await db.prepare(
      "SELECT id FROM sales_documents WHERE document_number = ? COLLATE NOCASE AND id <> ? LIMIT 1"
    ).bind(documentNumber, id).first();
    const documentLabel = current.document_type === "DELIVERY_NOTE" ? "surat jalan" : "quotation";
    if (duplicate) return NextResponse.json({ error: `Nomor ${documentLabel} ${documentNumber} sudah digunakan.` }, { status: 409 });
    if (current.document_number === documentNumber) return NextResponse.json({ ok: true, document_number: documentNumber });
    const now = new Date().toISOString();
    const salesExists = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sales'").first();
    const statements = [
      db.prepare("UPDATE sales_documents SET document_number = ?, updated_at = ? WHERE id = ?").bind(documentNumber, now, id),
      db.prepare("UPDATE sales_documents SET reference_no = ?, updated_at = ? WHERE reference_no = ?").bind(documentNumber, now, current.document_number),
    ];
    if (salesExists && current.document_type === "QUOTATION") statements.push(
      db.prepare("UPDATE sales SET quotation_no = ?, updated_at = ? WHERE quotation_no = ?").bind(documentNumber, now, current.document_number)
    );
    if (salesExists && current.document_type === "DELIVERY_NOTE") {
      const saleRows = await db.prepare("SELECT id, delivery_no FROM sales WHERE delivery_no LIKE ?")
        .bind(`%${current.document_number}%`).all<{ id: number; delivery_no: string }>();
      saleRows.results.forEach((sale) => {
        const deliveryNo = String(sale.delivery_no || "").split(",").map((value) => value.trim() === current.document_number ? documentNumber : value.trim()).filter(Boolean).join(", ");
        statements.push(db.prepare("UPDATE sales SET delivery_no = ?, updated_at = ? WHERE id = ?").bind(deliveryNo, now, sale.id));
      });
    }
    await db.batch(statements);
    return NextResponse.json({ ok: true, document_number: documentNumber });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Nomor dokumen belum berhasil diubah." }, { status: 500 });
  }
}
