"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileBarChart,
  FileSpreadsheet,
  FileText,
  LayoutDashboard,
  Menu,
  PackageSearch,
  Pencil,
  Plus,
  Printer,
  ReceiptText,
  RefreshCw,
  Search,
  Send,
  ShoppingBag,
  Trash2,
  TrendingUp,
  Truck,
  Upload,
  Users,
  WalletCards,
  X,
} from "lucide-react";

type Sale = {
  id: number;
  source_key: string;
  customer: string;
  location: string;
  transaction_type: string;
  project: string;
  rfq_no: string;
  quotation_no: string;
  po_no: string;
  delivery_no: string;
  invoice_no: string;
  invoice_amount: number;
  amount_paid: number;
  due_date: string;
  payment_date: string;
  payment_status: string;
  transaction_status: string;
  notes: string;
  created_at: string;
};

type DraftSale = Omit<Sale, "id" | "created_at" | "source_key">;

type SparePart = {
  id: number;
  part_number: string;
  name: string;
  category: string;
  brand: string;
  unit: string;
  selling_price: number;
  notes: string;
};

type DraftPart = Omit<SparePart, "id">;

type DocumentLine = {
  key: string;
  spare_part_id: number | null;
  part_number: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
};

type SalesDocument = {
  id: number;
  document_type: "QUOTATION" | "INVOICE";
  document_number: string;
  customer: string;
  customer_address: string;
  customer_pic: string;
  project: string;
  reference_no: string;
  document_date: string;
  due_date: string;
  subtotal: number;
  tax_percent: number;
  tax_amount: number;
  grand_total: number;
  notes: string;
  status: string;
  items: (DocumentLine & { id: number; line_total: number })[];
};

type DocumentDraft = {
  type: "QUOTATION" | "INVOICE";
  customer: string;
  customer_address: string;
  customer_pic: string;
  project: string;
  reference_no: string;
  document_date: string;
  due_date: string;
  tax_percent: number;
  notes: string;
  items: DocumentLine[];
};

const emptyDraft: DraftSale = {
  customer: "",
  location: "",
  transaction_type: "Trading Part",
  project: "",
  rfq_no: "",
  quotation_no: "",
  po_no: "",
  delivery_no: "",
  invoice_no: "",
  invoice_amount: 0,
  amount_paid: 0,
  due_date: "",
  payment_date: "",
  payment_status: "OPEN",
  transaction_status: "Open",
  notes: "",
};

const emptyPart: DraftPart = {
  part_number: "",
  name: "",
  category: "",
  brand: "",
  unit: "Pcs",
  selling_price: 0,
  notes: "",
};

const newLine = (): DocumentLine => ({
  key: crypto.randomUUID(),
  spare_part_id: null,
  part_number: "",
  description: "",
  quantity: 1,
  unit: "Pcs",
  unit_price: 0,
});

const emptyDocument = (type: "QUOTATION" | "INVOICE"): DocumentDraft => ({
  type,
  customer: "",
  customer_address: "",
  customer_pic: "",
  project: "",
  reference_no: "",
  document_date: new Date().toISOString().slice(0, 10),
  due_date: "",
  tax_percent: 11,
  notes: type === "QUOTATION" ? "Harga berlaku selama 14 hari sejak tanggal penawaran." : "Mohon cantumkan nomor invoice pada berita transfer.",
  items: [newLine()],
});

const fallbackSales: Sale[] = [
  { id: 1, source_key: "demo-1", customer: "Pertamina Port and Logistic", location: "Jakarta", transaction_type: "Pengadaan", project: "Jaket Brand Wood", rfq_no: "027/MDA-HO/RFQ/V/2025", quotation_no: "062/MDA/XII-2025", po_no: "1286/PPB/XII/25", delivery_no: "037/SJ-MDA/XII/2025", invoice_no: "017/MDA-INV/XII/2025", invoice_amount: 1084947300, amount_paid: 1084947300, due_date: "2025-12-05", payment_date: "2025-12-05", payment_status: "CLOSED", transaction_status: "Done Invoice", notes: "Pembayaran diterima.", created_at: "2025-12-05T00:00:00Z" },
  { id: 2, source_key: "demo-2", customer: "Kementrian PanRB", location: "Jakarta", transaction_type: "Pengadaan", project: "Seragam Brand Executive", rfq_no: "028/MDA-HO/RFQ/V/2025", quotation_no: "068/MDA/XII-2025", po_no: "EP-01KC0MZ6M6DV5W9V5TXVPBM33A", delivery_no: "034/SJ-MDA/XII/2025", invoice_no: "022/MDA-INV/XII/2025", invoice_amount: 929628330, amount_paid: 929628330, due_date: "2026-01-30", payment_date: "2026-01-30", payment_status: "CLOSED", transaction_status: "Done Invoice", notes: "Transaksi selesai.", created_at: "2026-01-30T00:00:00Z" },
  { id: 3, source_key: "demo-3", customer: "Waskita Beton Preacast", location: "Jakarta", transaction_type: "Trading Part", project: "Part Repair", rfq_no: "029/MDA-HO/RFQ/I/2026", quotation_no: "070/MDA/I-2026", po_no: "4100013828/SPPB/Non-OA/1/2026", delivery_no: "047/SJ-MDA/I/2026", invoice_no: "031/MDA-INV/I/2026", invoice_amount: 11900310, amount_paid: 0, due_date: "2026-03-20", payment_date: "", payment_status: "OPEN", transaction_status: "Done Invoice", notes: "Invoice terkirim, pembayaran belum diterima.", created_at: "2026-03-20T00:00:00Z" },
  { id: 4, source_key: "demo-4", customer: "Waskita Beton Preacast", location: "Jakarta", transaction_type: "Trading Part", project: "Part QHSE", rfq_no: "030/MDA-HO/RFQ/I/2026", quotation_no: "067/MDA/I-2026", po_no: "4100013905/SPPB.NONOA/WBP/2026", delivery_no: "049/SJ-MDA/I/2026", invoice_no: "032/MDA-INV/I/2026", invoice_amount: 1356486.6, amount_paid: 0, due_date: "2026-03-29", payment_date: "", payment_status: "OPEN", transaction_status: "Done Invoice", notes: "Perlu follow up.", created_at: "2026-03-29T00:00:00Z" },
  { id: 5, source_key: "demo-5", customer: "Pilar Pratama Dinamika", location: "Balikpapan", transaction_type: "Trading Part", project: "Spare Part Hydraulic", rfq_no: "041/MDA-HO/RFQ/II/2026", quotation_no: "081/MDA/II-2026", po_no: "PPD/PO/026/2026", delivery_no: "", invoice_no: "", invoice_amount: 78500000, amount_paid: 0, due_date: "", payment_date: "", payment_status: "OPEN", transaction_status: "Open", notes: "Barang dalam proses pengiriman.", created_at: "2026-02-20T00:00:00Z" },
  { id: 6, source_key: "demo-6", customer: "GMT", location: "Cilegon", transaction_type: "Trading Part", project: "Safety Equipment", rfq_no: "044/MDA-HO/RFQ/II/2026", quotation_no: "087/MDA/II-2026", po_no: "", delivery_no: "", invoice_no: "", invoice_amount: 46250000, amount_paid: 0, due_date: "", payment_date: "", payment_status: "OPEN", transaction_status: "Open", notes: "Menunggu PO customer.", created_at: "2026-02-24T00:00:00Z" },
  { id: 7, source_key: "demo-7", customer: "PT. Auger Sistem Indonesia", location: "Balikpapan", transaction_type: "Trading Part", project: "Spare Part Mobil Crane", rfq_no: "001/MDA-HO/RFQ/II/2025", quotation_no: "001/MDA-HO/RFQ/II/2025", po_no: "", delivery_no: "", invoice_no: "", invoice_amount: 18500000, amount_paid: 0, due_date: "", payment_date: "", payment_status: "OPEN", transaction_status: "Closed", notes: "Waiting budget, last update 21 May.", created_at: "2025-02-26T00:00:00Z" },
  { id: 8, source_key: "demo-8", customer: "Sinarmas", location: "Riau", transaction_type: "Pengadaan", project: "Seragam Operasional", rfq_no: "050/MDA-HO/RFQ/III/2026", quotation_no: "", po_no: "", delivery_no: "", invoice_no: "", invoice_amount: 125000000, amount_paid: 0, due_date: "", payment_date: "", payment_status: "OPEN", transaction_status: "Open", notes: "RFQ sedang dihitung.", created_at: "2026-03-01T00:00:00Z" },
];

const navItems = [
  { id: "Dashboard", label: "Ringkasan", caption: "Kondisi hari ini", icon: LayoutDashboard },
  { id: "Pipeline", label: "Proses Penjualan", caption: "RFQ sampai lunas", icon: TrendingUp },
  { id: "Tagihan", label: "Tagihan", caption: "Invoice & jatuh tempo", icon: FileText },
  { id: "Customer", label: "Customer", caption: "PO & invoice", icon: Users },
  { id: "Sparepart", label: "Master Sparepart", caption: "Part number & harga", icon: PackageSearch },
  { id: "Dokumen", label: "Quotation & Invoice", caption: "Buat dokumen jual", icon: ReceiptText },
  { id: "Laporan", label: "Laporan", caption: "Rekap data", icon: FileBarChart },
];

const money = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

const compactMoney = (value: number) => {
  if (value >= 1_000_000_000) return `Rp${(value / 1_000_000_000).toFixed(2).replace(".", ",")} M`;
  if (value >= 1_000_000) return `Rp${(value / 1_000_000).toFixed(1).replace(".", ",")} Jt`;
  return money.format(value);
};

const isoDate = (value: unknown) => {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString().slice(0, 10);
  if (typeof value === "number") {
    const date = new Date(Math.round((value - 25569) * 86400 * 1000));
    return Number.isNaN(date.valueOf()) ? "" : date.toISOString().slice(0, 10);
  }
  const date = new Date(String(value));
  return Number.isNaN(date.valueOf()) ? "" : date.toISOString().slice(0, 10);
};

const stageOf = (sale: Sale) => {
  if (sale.payment_status?.toUpperCase() === "CLOSED" || sale.amount_paid >= sale.invoice_amount && sale.invoice_amount > 0) return "Payment";
  if (sale.invoice_no) return "Invoice";
  if (sale.delivery_no) return "Surat Jalan";
  if (sale.po_no) return "PO";
  if (sale.quotation_no) return "Quotation";
  return "RFQ";
};

const agingDays = (sale: Sale) => {
  if (!sale.due_date || stageOf(sale) === "Payment") return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(sale.due_date).getTime()) / 86400000));
};

const agingStatus = (sale: Sale) => {
  if (stageOf(sale) === "Payment") return "Lunas";
  if (!sale.due_date) return "Belum Ada Tempo";
  const diff = Math.ceil((new Date(sale.due_date).getTime() - Date.now()) / 86400000);
  if (diff < 0) return "Terlambat";
  if (diff <= 14) return "Segera Jatuh Tempo";
  return "Lancar";
};

function Sparkline({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 104 40" className="sparkline" aria-hidden="true">
      <path d="M2 33 C12 31,13 19,23 23 S36 28,42 15 S52 8,59 19 S70 34,77 17 S91 25,102 9" fill="none" stroke={color} strokeWidth="2" />
    </svg>
  );
}

function Donut({ stages }: { stages: { name: string; count: number; color: string }[] }) {
  const rawTotal = stages.reduce((sum, stage) => sum + stage.count, 0);
  const total = Math.max(1, rawTotal);
  const segments = stages.map((stage, index) => ({
    ...stage,
    size: (stage.count / total) * 100,
    offset: stages.slice(0, index).reduce((sum, item) => sum + (item.count / total) * 100, 0),
  }));
  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 42 42" className="donut" aria-label="Komposisi pipeline per tahap">
        <circle cx="21" cy="21" r="15.9" fill="transparent" stroke="#eee9e5" strokeWidth="5.4" />
        {segments.map((stage) => (
            <circle
              key={stage.name}
              cx="21"
              cy="21"
              r="15.9"
              fill="transparent"
              stroke={stage.color}
              strokeWidth="5.4"
              strokeDasharray={`${stage.size} ${100 - stage.size}`}
              strokeDashoffset={25 - stage.offset}
            />
        ))}
      </svg>
      <div className="donut-label"><span>Total</span><strong>{rawTotal}</strong><small>transaksi</small></div>
    </div>
  );
}

export default function Home() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeNav, setActiveNav] = useState("Dashboard");
  const [search, setSearch] = useState("");
  const [year, setYear] = useState("Semua Periode");
  const [stageFilter, setStageFilter] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showPart, setShowPart] = useState(false);
  const [showDocument, setShowDocument] = useState(false);
  const [selected, setSelected] = useState<Sale | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<SalesDocument | null>(null);
  const [draft, setDraft] = useState<DraftSale>(emptyDraft);
  const [parts, setParts] = useState<SparePart[]>([]);
  const [documents, setDocuments] = useState<SalesDocument[]>([]);
  const [partDraft, setPartDraft] = useState<DraftPart>(emptyPart);
  const [editingPartId, setEditingPartId] = useState<number | null>(null);
  const [documentDraft, setDocumentDraft] = useState<DocumentDraft>(() => emptyDocument("QUOTATION"));
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadSales = async () => {
    setLoading(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch("/api/sales", { signal: controller.signal });
      if (!response.ok) throw new Error("server");
      const payload = await response.json();
      setSales(payload.data ?? []);
    } catch {
      setSales(fallbackSales);
      setNotice("Menampilkan data contoh. Data server akan tersinkron saat aplikasi dipublikasikan.");
    } finally {
      window.clearTimeout(timeout);
      setLoading(false);
    }
  };

  const loadBusinessData = async () => {
    try {
      const [partsResponse, documentsResponse] = await Promise.all([
        fetch("/api/spareparts"),
        fetch("/api/documents"),
      ]);
      if (partsResponse.ok) setParts((await partsResponse.json()).data ?? []);
      if (documentsResponse.ok) setDocuments((await documentsResponse.json()).data ?? []);
    } catch {
      setNotice("Master sparepart dan dokumen belum berhasil dimuat.");
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadSales();
      loadBusinessData();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const years = useMemo(() => {
    const list = Array.from(new Set(sales.flatMap((sale) => {
      const source = sale.due_date || sale.created_at;
      return source ? [String(new Date(source).getFullYear())] : [];
    }))).sort().reverse();
    return ["Semua Periode", ...list];
  }, [sales]);

  const filtered = useMemo(() => sales.filter((sale) => {
    const haystack = `${sale.customer} ${sale.project} ${sale.rfq_no} ${sale.quotation_no} ${sale.po_no} ${sale.invoice_no}`.toLowerCase();
    const matchesSearch = haystack.includes(search.toLowerCase());
    const source = sale.due_date || sale.created_at;
    const matchesYear = year === "Semua Periode" || (source && String(new Date(source).getFullYear()) === year);
    const matchesStage = !stageFilter || stageOf(sale) === stageFilter;
    return matchesSearch && matchesYear && matchesStage;
  }), [sales, search, year, stageFilter]);

  const outstanding = filtered.reduce((sum, sale) => sum + Math.max(0, Number(sale.invoice_amount) - Number(sale.amount_paid)), 0);
  const pipelineValue = filtered.reduce((sum, sale) => sum + Number(sale.invoice_amount || 0), 0);
  const overdue = filtered.filter((sale) => agingStatus(sale) === "Terlambat");
  const completed = filtered.filter((sale) => stageOf(sale) === "Payment").length;
  const winRate = filtered.length ? Math.round((completed / filtered.length) * 100) : 0;

  const stages = [
    { name: "RFQ", label: "RFQ Masuk", hint: "Permintaan diterima", icon: Send, color: "#3478E5", soft: "#E7F0FF" },
    { name: "Quotation", label: "Penawaran", hint: "Harga dikirim", icon: FileSpreadsheet, color: "#3478E5", soft: "#E7F0FF" },
    { name: "PO", label: "PO Diterima", hint: "Pesanan disetujui", icon: ShoppingBag, color: "#7944D8", soft: "#EFE7FC" },
    { name: "Surat Jalan", label: "Pengiriman", hint: "Barang dikirim", icon: Truck, color: "#F59B23", soft: "#FFF0D9" },
    { name: "Invoice", label: "Ditagihkan", hint: "Menunggu bayar", icon: FileText, color: "#E56B2F", soft: "#FFF0E8" },
    { name: "Payment", label: "Lunas", hint: "Pembayaran masuk", icon: CheckCircle2, color: "#3EA45A", soft: "#E3F3E7" },
  ].map((stage) => {
    const records = filtered.filter((sale) => stageOf(sale) === stage.name);
    return { ...stage, count: records.length, value: records.reduce((sum, sale) => sum + Number(sale.invoice_amount || 0), 0) };
  });

  const customers = useMemo(() => {
    const grouped = new Map<string, {
      transactions: number;
      poNumbers: Set<string>;
      invoiceNumbers: Set<string>;
      invoiceValue: number;
      paid: number;
      outstanding: number;
    }>();
    filtered.forEach((sale) => {
      const customerName = sale.customer.trim() || "Tanpa Nama";
      const current = grouped.get(customerName) ?? {
        transactions: 0,
        poNumbers: new Set<string>(),
        invoiceNumbers: new Set<string>(),
        invoiceValue: 0,
        paid: 0,
        outstanding: 0,
      };
      current.transactions += 1;
      if (sale.po_no.trim()) current.poNumbers.add(sale.po_no.trim());
      if (sale.invoice_no.trim()) {
        current.invoiceNumbers.add(sale.invoice_no.trim());
        current.invoiceValue += Number(sale.invoice_amount || 0);
        current.paid += Number(sale.amount_paid || 0);
        current.outstanding += Math.max(0, Number(sale.invoice_amount) - Number(sale.amount_paid));
      }
      grouped.set(customerName, current);
    });
    return Array.from(grouped.entries())
      .map(([name, info]) => ({
        name,
        transactions: info.transactions,
        poCount: info.poNumbers.size,
        invoiceCount: info.invoiceNumbers.size,
        invoiceValue: info.invoiceValue,
        paid: info.paid,
        outstanding: info.outstanding,
      }))
      .sort((a, b) => b.invoiceValue - a.invoiceValue || b.poCount - a.poCount);
  }, [filtered]);

  const customerTotals = useMemo(() => customers.reduce((total, customer) => ({
    poCount: total.poCount + customer.poCount,
    invoiceCount: total.invoiceCount + customer.invoiceCount,
    invoiceValue: total.invoiceValue + customer.invoiceValue,
    outstanding: total.outstanding + customer.outstanding,
  }), { poCount: 0, invoiceCount: 0, invoiceValue: 0, outstanding: 0 }), [customers]);

  const openAdd = () => {
    setDraft(emptyDraft);
    setShowAdd(true);
  };

  const submitAdd = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", record: draft }),
      });
      if (!response.ok) throw new Error();
      setShowAdd(false);
      setNotice("Data penjualan berhasil ditambahkan.");
      await loadSales();
    } catch {
      setNotice("Data belum berhasil disimpan.");
    } finally {
      setSaving(false);
    }
  };

  const importExcel = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setSaving(true);
    setNotice("Membaca dan menyiapkan data Excel…");
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      const sheet = workbook.Sheets.RAW ?? workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
      const records = rows.slice(5).filter((row) => row[2] || row[7]).map((row, index) => ({
        source_key: `xlsx-${row[1] || index}-${row[7]}-${row[14] || row[32] || index}`,
        customer: String(row[2] || "Tanpa Nama"),
        location: String(row[3] || ""),
        transaction_type: String(row[4] || ""),
        project: String(row[5] || ""),
        rfq_no: String(row[7] || ""),
        quotation_no: String(row[13] || ""),
        po_no: String(row[21] || ""),
        delivery_no: String(row[29] || ""),
        invoice_no: String(row[31] || ""),
        invoice_amount: Number(row[41] || row[39] || 0),
        amount_paid: Number(row[47] || 0),
        due_date: isoDate(row[44]),
        payment_date: isoDate(row[48]),
        payment_status: String(row[49] || "OPEN"),
        transaction_status: String(row[52] || ""),
        notes: String(row[53] || row[51] || ""),
      }));
      if (!records.length) throw new Error("empty");
      const response = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "import", records }),
      });
      if (!response.ok) throw new Error("server");
      const payload = await response.json();
      setNotice(`${payload.imported ?? records.length} baris Excel berhasil disinkronkan.`);
      await loadSales();
    } catch {
      setNotice("Format Excel belum dikenali. Pastikan sheet RAW mengikuti file Monitoring Sales MDA.");
    } finally {
      setSaving(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const markPaid = async (sale: Sale) => {
    setSaving(true);
    try {
      const response = await fetch("/api/sales", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: sale.id, amount_paid: sale.invoice_amount, payment_status: "CLOSED" }),
      });
      if (!response.ok) throw new Error();
      setSelected(null);
      setNotice("Pembayaran telah dikonfirmasi lunas.");
      await loadSales();
    } catch {
      setNotice("Status pembayaran belum berhasil diperbarui.");
    } finally {
      setSaving(false);
    }
  };

  const openPartForm = (part?: SparePart) => {
    if (part) {
      setEditingPartId(part.id);
      setPartDraft({
        part_number: part.part_number,
        name: part.name,
        category: part.category,
        brand: part.brand,
        unit: part.unit,
        selling_price: Number(part.selling_price),
        notes: part.notes,
      });
    } else {
      setEditingPartId(null);
      setPartDraft(emptyPart);
    }
    setShowPart(true);
  };

  const savePart = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch("/api/spareparts", {
        method: editingPartId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingPartId ? { ...partDraft, id: editingPartId } : partDraft),
      });
      if (!response.ok) throw new Error();
      setShowPart(false);
      setNotice(editingPartId ? "Data sparepart berhasil diperbarui." : "Sparepart berhasil didaftarkan.");
      await loadBusinessData();
    } catch {
      setNotice("Sparepart belum berhasil disimpan. Pastikan part number tidak duplikat.");
    } finally {
      setSaving(false);
    }
  };

  const archivePart = async (part: SparePart) => {
    setSaving(true);
    try {
      const response = await fetch("/api/spareparts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...part, is_active: false }),
      });
      if (!response.ok) throw new Error();
      setNotice(`${part.part_number} telah dinonaktifkan.`);
      await loadBusinessData();
    } catch {
      setNotice("Sparepart belum berhasil dinonaktifkan.");
    } finally {
      setSaving(false);
    }
  };

  const openDocumentForm = (type: "QUOTATION" | "INVOICE", source?: SalesDocument) => {
    if (source) {
      setDocumentDraft({
        ...emptyDocument(type),
        type,
        customer: source.customer,
        customer_address: source.customer_address,
        customer_pic: source.customer_pic,
        project: source.project,
        reference_no: type === "INVOICE" ? source.document_number : source.reference_no,
        tax_percent: Number(source.tax_percent),
        notes: type === "INVOICE" ? "Mohon cantumkan nomor invoice pada berita transfer." : source.notes,
        items: source.items.map((item) => ({
          key: crypto.randomUUID(),
          spare_part_id: item.spare_part_id,
          part_number: item.part_number,
          description: item.description,
          quantity: Number(item.quantity),
          unit: item.unit,
          unit_price: Number(item.unit_price),
        })),
      });
    } else {
      setDocumentDraft(emptyDocument(type));
    }
    setShowDocument(true);
  };

  const updateDocumentLine = (key: string, patch: Partial<DocumentLine>) => {
    setDocumentDraft((current) => ({
      ...current,
      items: current.items.map((item) => item.key === key ? { ...item, ...patch } : item),
    }));
  };

  const selectPartForLine = (key: string, id: string) => {
    const part = parts.find((item) => item.id === Number(id));
    if (!part) {
      updateDocumentLine(key, { spare_part_id: null, part_number: "", description: "", unit: "Pcs", unit_price: 0 });
      return;
    }
    updateDocumentLine(key, {
      spare_part_id: part.id,
      part_number: part.part_number,
      description: part.name,
      unit: part.unit,
      unit_price: Number(part.selling_price),
    });
  };

  const documentSubtotal = documentDraft.items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_price || 0), 0);
  const documentTax = documentSubtotal * Number(documentDraft.tax_percent || 0) / 100;
  const documentTotal = documentSubtotal + documentTax;

  const saveDocument = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(documentDraft),
      });
      if (!response.ok) throw new Error();
      const payload = await response.json();
      setShowDocument(false);
      setNotice(`${documentDraft.type === "INVOICE" ? "Invoice" : "Quotation"} ${payload.document_number} berhasil dibuat.`);
      await Promise.all([loadBusinessData(), loadSales()]);
      setActiveNav("Dokumen");
    } catch {
      setNotice("Dokumen belum berhasil dibuat. Lengkapi customer dan minimal satu item.");
    } finally {
      setSaving(false);
    }
  };

  const printDocument = (document: SalesDocument) => {
    setSelectedDocument(document);
    window.setTimeout(() => window.print(), 120);
  };

  const exportCsv = () => {
    const header = ["Customer", "Project", "RFQ", "Quotation", "PO", "Surat Jalan", "Invoice", "Nilai", "Terbayar", "Jatuh Tempo", "Status"];
    const lines = filtered.map((sale) => [
      sale.customer, sale.project, sale.rfq_no, sale.quotation_no, sale.po_no, sale.delivery_no,
      sale.invoice_no, sale.invoice_amount, sale.amount_paid, sale.due_date, agingStatus(sale),
    ]);
    const csv = [header, ...lines].map((line) => line.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "laporan-monitoring-sales-mda.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const renderDashboard = () => (
    <>
      <section className="welcome-strip">
        <div className="welcome-copy">
          <span className="welcome-icon"><TrendingUp size={22} /></span>
          <div>
            <p className="eyebrow">RINGKASAN PENJUALAN</p>
            <h2>Pantau pekerjaan yang perlu diselesaikan</h2>
            <p>Semua proses dari permintaan customer sampai pembayaran dalam satu tampilan.</p>
          </div>
        </div>
        <button className="welcome-action" onClick={() => setActiveNav(overdue.length ? "Tagihan" : "Pipeline")}>
          <span><b>{overdue.length}</b> tagihan terlambat</span>
          <ArrowUpRight size={20} />
        </button>
      </section>

      <section className="kpi-grid" aria-label="Ringkasan kinerja penjualan">
        {[
          { label: "Nilai Transaksi", value: compactMoney(pipelineValue), helper: `${filtered.length} pekerjaan terpantau`, icon: TrendingUp, color: "#F3222B", soft: "#FDE8E9", target: "Pipeline" },
          { label: "Belum Dibayar", value: compactMoney(outstanding), helper: `${filtered.filter((s) => stageOf(s) === "Invoice").length} invoice menunggu bayar`, icon: WalletCards, color: "#E98218", soft: "#FFF0D9", target: "Tagihan" },
          { label: "Lewat Jatuh Tempo", value: String(overdue.length), helper: "perlu segera ditindaklanjuti", icon: AlertTriangle, color: "#D91D26", soft: "#FDE8E9", target: "Tagihan" },
          { label: "Customer Aktif", value: String(customers.length), helper: `${customerTotals.poCount} PO & ${customerTotals.invoiceCount} invoice`, icon: Users, color: "#3478E5", soft: "#E7F0FF", target: "Customer" },
        ].map((kpi) => (
          <button className="kpi-card" key={kpi.label} onClick={() => setActiveNav(kpi.target)}>
            <div className="kpi-top"><span className="icon-well" style={{ color: kpi.color, background: kpi.soft }}><kpi.icon size={21} /></span><span>{kpi.label}</span><ChevronRight className="kpi-arrow" size={17} /></div>
            <div className="kpi-value-row"><strong>{loading ? "—" : kpi.value}</strong></div>
            <p><span style={{ background: kpi.soft, color: kpi.color }}>Lihat detail</span><b>{kpi.helper}</b></p>
          </button>
        ))}
      </section>

      <section className="panel pipeline-panel">
        <div className="section-head">
          <div><p className="eyebrow">POSISI SETIAP PEKERJAAN</p><h2>Alur Penjualan</h2></div>
          <button className="text-button" onClick={() => setActiveNav("Pipeline")}>Lihat Detail <ChevronRight size={16} /></button>
        </div>
        <div className="pipeline-flow">
          {stages.map((stage, index) => (
            <div className="stage-fragment" key={stage.name}>
              <button
                className={`stage-card ${stageFilter === stage.name ? "selected" : ""}`}
                onClick={() => setStageFilter(stageFilter === stage.name ? "" : stage.name)}
              >
                <span className="stage-icon" style={{ color: stage.color, background: stage.soft }}><stage.icon size={20} /></span>
                <span><b>{stage.label}</b><strong>{stage.count}</strong><small>{stage.hint}</small><em style={{ color: stage.color }}>{compactMoney(stage.value)}</em></span>
              </button>
              {index < stages.length - 1 && <span className="connector" aria-hidden="true" />}
            </div>
          ))}
        </div>
      </section>

      <section className="bottom-grid">
        <article className="panel analysis-panel">
          <div className="section-head"><div><p className="eyebrow">KOMPOSISI PEKERJAAN</p><h2>Jumlah per Tahap</h2></div><span className="period-chip">{year}</span></div>
          <div className="donut-content">
            <Donut stages={stages} />
            <div className="legend">
              {stages.map((stage) => <button key={stage.name} onClick={() => setStageFilter(stage.name)}><i style={{ background: stage.color }} /> <span>{stage.label}</span><b>{stage.count}</b></button>)}
            </div>
          </div>
        </article>

        <article className="panel aging-panel">
          <div className="section-head"><div><p className="eyebrow">PERLU DITINDAKLANJUTI</p><h2>Umur Tagihan</h2></div><button className="icon-button" aria-label="Muat ulang data" onClick={loadSales}><RefreshCw size={17} /></button></div>
          <InvoiceTable rows={filtered.filter((sale) => sale.invoice_no).sort((a, b) => agingDays(b) - agingDays(a)).slice(0, 7)} onSelect={setSelected} />
          <button className="see-all" onClick={() => setActiveNav("Tagihan")}>Lihat Semua <ChevronRight size={16} /></button>
        </article>
      </section>
    </>
  );

  const renderModule = () => {
    if (activeNav === "Dashboard") return renderDashboard();
    if (activeNav === "Pipeline") return (
      <section className="module-stack">
        <div className="module-banner"><span className="banner-icon"><TrendingUp /></span><div><p className="eyebrow">PROSES PENJUALAN</p><h2>Lihat posisi setiap pekerjaan</h2><p>Pilih salah satu tahap untuk melihat pekerjaan yang sedang berada pada proses tersebut.</p></div></div>
        <div className="panel pipeline-panel">
          <div className="section-head"><div><p className="eyebrow">RFQ SAMPAI LUNAS</p><h2>Alur Penjualan</h2></div></div>
          <div className="pipeline-flow">
            {stages.map((stage, index) => (
              <div className="stage-fragment" key={stage.name}>
                <button className={`stage-card ${stageFilter === stage.name ? "selected" : ""}`} onClick={() => setStageFilter(stageFilter === stage.name ? "" : stage.name)}>
                  <span className="stage-icon" style={{ color: stage.color, background: stage.soft }}><stage.icon size={20} /></span>
                  <span><b>{stage.label}</b><strong>{stage.count}</strong><small>{stage.hint}</small><em style={{ color: stage.color }}>{compactMoney(stage.value)}</em></span>
                </button>
                {index < stages.length - 1 && <span className="connector" aria-hidden="true" />}
              </div>
            ))}
          </div>
        </div>
        <SalesTable rows={filtered} onSelect={setSelected} />
      </section>
    );
    if (activeNav === "Tagihan") return (
      <section className="module-stack">
        <div className="module-banner red"><span className="banner-icon"><Clock3 /></span><div><p className="eyebrow">KONTROL TAGIHAN</p><h2>{compactMoney(outstanding)} belum diterima</h2><p>{overdue.length} invoice melewati tanggal jatuh tempo dan perlu ditindaklanjuti.</p></div></div>
        <article className="panel full-table"><div className="section-head"><div><p className="eyebrow">DAFTAR TAGIHAN</p><h2>Invoice dan Umur Tagihan</h2></div></div><InvoiceTable rows={filtered.filter((sale) => sale.invoice_no).sort((a, b) => agingDays(b) - agingDays(a))} onSelect={setSelected} /></article>
      </section>
    );
    if (activeNav === "Customer") return (
      <section className="module-stack">
        <div className="customer-summary">
          <div className="customer-summary-copy">
            <p className="eyebrow">REKAP CUSTOMER</p>
            <h2>{customers.length} customer terpantau</h2>
            <p>Total PO dan invoice dihitung berdasarkan nomor dokumen unik.</p>
          </div>
          <div className="customer-summary-metrics">
            <div><span>Total PO</span><strong>{customerTotals.poCount}</strong></div>
            <div><span>Total Invoice</span><strong>{customerTotals.invoiceCount}</strong></div>
            <div><span>Nilai Invoice</span><strong>{compactMoney(customerTotals.invoiceValue)}</strong></div>
            <div><span>Outstanding</span><strong>{compactMoney(customerTotals.outstanding)}</strong></div>
          </div>
        </div>
        <section className="customer-grid">
          {customers.map((customer) => (
            <article className="customer-card" key={customer.name}>
              <div className="customer-identity">
                <span className="customer-avatar">{customer.name.slice(0, 2).toUpperCase()}</span>
                <div><h3>{customer.name}</h3><p>{customer.transactions} transaksi tercatat</p></div>
              </div>
              <div className="customer-document-counts">
                <div><span>PO</span><strong>{customer.poCount}</strong><small>dokumen</small></div>
                <div><span>Invoice</span><strong>{customer.invoiceCount}</strong><small>dokumen</small></div>
              </div>
              <div className="customer-finance">
                <div><span>Nilai Invoice</span><strong>{money.format(customer.invoiceValue)}</strong></div>
                <div><span>Terbayar</span><strong className="paid-value">{money.format(customer.paid)}</strong></div>
                <div><span>Outstanding</span><strong className={customer.outstanding > 0 ? "outstanding-value" : ""}>{money.format(customer.outstanding)}</strong></div>
              </div>
            </article>
          ))}
          {!customers.length && <div className="panel customer-empty">Belum ada customer pada filter ini.</div>}
        </section>
      </section>
    );
    if (activeNav === "Sparepart") {
      const visibleParts = parts.filter((part) =>
        `${part.part_number} ${part.name} ${part.category} ${part.brand}`.toLowerCase().includes(search.toLowerCase())
      );
      return (
        <section className="module-stack">
          <div className="module-banner parts-banner">
            <span className="banner-icon"><PackageSearch /></span>
            <div><p className="eyebrow">MASTER SPAREPART</p><h2>{parts.length} sparepart terdaftar</h2><p>Pilih part number saat membuat penawaran agar harga jual dan satuan terisi otomatis.</p></div>
            <button className="primary-button" onClick={() => openPartForm()}><Plus size={17} /> Tambah Sparepart</button>
          </div>
          <article className="panel full-table">
            <div className="section-head"><div><p className="eyebrow">KATALOG HARGA JUAL</p><h2>Part Number & Harga</h2></div><span className="period-chip">{visibleParts.length} item</span></div>
            <div className="table-scroll">
              <table className="data-table parts-table">
                <thead><tr><th>Part Number</th><th>Nama Sparepart</th><th>Kategori / Brand</th><th>Satuan</th><th className="number">Harga Jual</th><th>Aksi</th></tr></thead>
                <tbody>
                  {visibleParts.map((part) => (
                    <tr key={part.id}>
                      <td><span className="part-number">{part.part_number}</span></td>
                      <td><b>{part.name}</b><small>{part.notes || "Tidak ada catatan"}</small></td>
                      <td><b>{part.category || "Umum"}</b><small>{part.brand || "Tanpa brand"}</small></td>
                      <td>{part.unit}</td>
                      <td className="number"><strong>{money.format(part.selling_price)}</strong></td>
                      <td><div className="row-actions"><button aria-label={`Edit ${part.part_number}`} onClick={() => openPartForm(part)}><Pencil size={15} /></button><button className="danger" aria-label={`Nonaktifkan ${part.part_number}`} onClick={() => archivePart(part)}><Trash2 size={15} /></button></div></td>
                    </tr>
                  ))}
                  {!visibleParts.length && <tr><td colSpan={6} className="empty-state">Belum ada sparepart. Klik “Tambah Sparepart” untuk mendaftarkan part number dan harga jual pertama.</td></tr>}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      );
    }
    if (activeNav === "Dokumen") return (
      <section className="module-stack">
        <div className="document-actions">
          <article className="document-action-card quotation">
            <span><FileSpreadsheet /></span><div><p className="eyebrow">PENAWARAN HARGA</p><h2>Buat Quotation</h2><p>Pilih sparepart, harga jual terisi otomatis, lalu simpan dan cetak.</p></div>
            <button className="primary-button" onClick={() => openDocumentForm("QUOTATION")}><Plus size={17} /> Buat Quotation</button>
          </article>
          <article className="document-action-card invoice">
            <span><ReceiptText /></span><div><p className="eyebrow">PENAGIHAN CUSTOMER</p><h2>Buat Invoice</h2><p>Buat invoice baru atau konversikan langsung dari quotation.</p></div>
            <button className="primary-button" onClick={() => openDocumentForm("INVOICE")}><Plus size={17} /> Buat Invoice</button>
          </article>
        </div>
        <article className="panel full-table">
          <div className="section-head"><div><p className="eyebrow">RIWAYAT DOKUMEN</p><h2>{documents.length} dokumen tersimpan</h2></div></div>
          <div className="table-scroll">
            <table className="data-table documents-table">
              <thead><tr><th>Jenis</th><th>Nomor Dokumen</th><th>Customer / Proyek</th><th>Tanggal</th><th className="number">Total</th><th>Aksi</th></tr></thead>
              <tbody>
                {documents.map((document) => (
                  <tr key={document.id}>
                    <td><span className={`document-kind ${document.document_type.toLowerCase()}`}>{document.document_type === "INVOICE" ? "Invoice" : "Quotation"}</span></td>
                    <td><b>{document.document_number}</b><small>{document.reference_no ? `Ref: ${document.reference_no}` : document.status}</small></td>
                    <td><b>{document.customer}</b><small>{document.project || `${document.items.length} item`}</small></td>
                    <td>{document.document_date}</td>
                    <td className="number"><strong>{money.format(document.grand_total)}</strong></td>
                    <td><div className="row-actions"><button aria-label="Lihat dokumen" onClick={() => setSelectedDocument(document)}><FileText size={15} /></button><button aria-label="Cetak dokumen" onClick={() => printDocument(document)}><Printer size={15} /></button>{document.document_type === "QUOTATION" && <button className="convert-button" onClick={() => openDocumentForm("INVOICE", document)}>Jadi Invoice</button>}</div></td>
                  </tr>
                ))}
                {!documents.length && <tr><td colSpan={6} className="empty-state">Belum ada quotation atau invoice yang dibuat dari aplikasi.</td></tr>}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    );
    return (
      <section className="module-stack">
        <div className="module-banner green"><span className="banner-icon"><FileBarChart /></span><div><p className="eyebrow">LAPORAN PENJUALAN</p><h2>Ringkasan siap diunduh</h2><p>Data mengikuti pencarian, periode, dan tahap pipeline yang aktif.</p></div><button className="primary-button" onClick={exportCsv}><Upload size={17} /> Unduh CSV</button></div>
        <section className="report-grid">
          <article className="panel report-card"><p>Total transaksi</p><strong>{filtered.length}</strong><span>{customers.length} customer</span></article>
          <article className="panel report-card"><p>Nilai penjualan</p><strong>{compactMoney(pipelineValue)}</strong><span>{winRate}% selesai</span></article>
          <article className="panel report-card"><p>Piutang aktif</p><strong>{compactMoney(outstanding)}</strong><span>{overdue.length} terlambat</span></article>
        </section>
        <SalesTable rows={filtered} onSelect={setSelected} />
      </section>
    );
  };

  return (
    <main className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="brand"><span className="brand-mark">MDA</span><div><strong>PT MDA</strong><small>Amanah Sejahtera</small></div><button className="mobile-close" aria-label="Tutup menu" onClick={() => setSidebarOpen(false)}><X /></button></div>
        <p className="nav-heading">MENU UTAMA</p>
        <nav aria-label="Navigasi utama">
          {navItems.map((item) => <button key={item.id} className={activeNav === item.id ? "active" : ""} onClick={() => { setActiveNav(item.id); setSidebarOpen(false); }}><item.icon size={20} /><span><b>{item.label}</b><small>{item.caption}</small></span>{activeNav === item.id && <ChevronRight size={16} />}</button>)}
        </nav>
        <div className="last-update"><div><span><RefreshCw size={15} /> Update Terakhir</span><b>Sinkron otomatis</b></div><button aria-label="Sinkronkan data" onClick={loadSales}><RefreshCw size={18} /></button></div>
      </aside>
      {sidebarOpen && <button className="backdrop" aria-label="Tutup menu" onClick={() => setSidebarOpen(false)} />}

      <section className="workspace">
        <header className="topbar">
          <div className="title-wrap"><button className="menu-button" aria-label="Buka menu" onClick={() => setSidebarOpen(true)}><Menu /></button><div><p className="eyebrow">PT MDA AMANAH SEJAHTERA</p><h1>{{ Dashboard: "Ringkasan Penjualan", Pipeline: "Proses Penjualan", Tagihan: "Kontrol Tagihan", Customer: "Data Customer", Sparepart: "Master Sparepart", Dokumen: "Quotation & Invoice", Laporan: "Laporan Penjualan" }[activeNav]}</h1><p className="page-description">{{ Dashboard: "Lihat kondisi bisnis dan prioritas hari ini.", Pipeline: "Pantau perjalanan setiap pekerjaan dari RFQ hingga lunas.", Tagihan: "Fokus pada invoice yang belum dibayar dan jatuh tempo.", Customer: "Bandingkan jumlah PO, invoice, pembayaran, dan outstanding.", Sparepart: "Kelola part number, satuan, brand, dan harga jual.", Dokumen: "Buat penawaran dan invoice itemized yang siap dicetak.", Laporan: "Unduh dan periksa rekap penjualan sesuai filter." }[activeNav]}</p></div></div>
          <div className="top-actions">
            <label className="select-control"><CalendarDays size={17} /><select value={year} onChange={(event) => setYear(event.target.value)}>{years.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label className="search-control"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={activeNav === "Sparepart" ? "Cari part number atau nama…" : "Cari customer, RFQ, invoice…"} /></label>
            <button className="notification-button" aria-label="Notifikasi tagihan" onClick={() => setActiveNav("Tagihan")}><Bell size={20} />{overdue.length > 0 && <span>{Math.min(overdue.length, 99)}</span>}</button>
            <input ref={fileRef} className="visually-hidden" type="file" accept=".xlsx,.xls" onChange={importExcel} />
            <button className="secondary-button desktop-import" onClick={() => fileRef.current?.click()} disabled={saving}><FileSpreadsheet size={17} /> Impor Excel</button>
            <button className="primary-button" onClick={openAdd}><Plus size={18} /> Tambah Data</button>
          </div>
        </header>

        {(stageFilter || search) && <div className="filter-row"><span>Filter aktif:</span>{stageFilter && <button onClick={() => setStageFilter("")}>{stageFilter} <X size={13} /></button>}{search && <button onClick={() => setSearch("")}>“{search}” <X size={13} /></button>}</div>}
        <div className="mobile-import"><button className="secondary-button" onClick={() => fileRef.current?.click()}><FileSpreadsheet size={17} /> Impor Excel</button></div>
        <div className={`content ${loading ? "loading" : ""}`}>{renderModule()}</div>
      </section>

      {notice && <div className="toast" role="status">{notice}</div>}

      {showAdd && (
        <div className="modal-backdrop" onMouseDown={() => setShowAdd(false)}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="add-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head"><div><p className="eyebrow">INPUT TRANSAKSI</p><h2 id="add-title">Tambah Data Penjualan</h2></div><button className="icon-button" onClick={() => setShowAdd(false)} aria-label="Tutup"><X /></button></div>
            <form onSubmit={submitAdd} className="sales-form">
              <label className="wide">Customer<input required value={draft.customer} onChange={(e) => setDraft({ ...draft, customer: e.target.value })} placeholder="Nama perusahaan/customer" /></label>
              <label>Lokasi<input value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} placeholder="Kota / site" /></label>
              <label>Jenis transaksi<select value={draft.transaction_type} onChange={(e) => setDraft({ ...draft, transaction_type: e.target.value })}><option>Trading Part</option><option>Jasa</option><option>Pengadaan</option><option>Project</option></select></label>
              <label className="wide">Proyek<input required value={draft.project} onChange={(e) => setDraft({ ...draft, project: e.target.value })} placeholder="Nama proyek atau kebutuhan" /></label>
              <label>No. RFQ<input value={draft.rfq_no} onChange={(e) => setDraft({ ...draft, rfq_no: e.target.value })} /></label>
              <label>No. Quotation<input value={draft.quotation_no} onChange={(e) => setDraft({ ...draft, quotation_no: e.target.value })} /></label>
              <label>No. PO<input value={draft.po_no} onChange={(e) => setDraft({ ...draft, po_no: e.target.value })} /></label>
              <label>No. Surat Jalan<input value={draft.delivery_no} onChange={(e) => setDraft({ ...draft, delivery_no: e.target.value })} /></label>
              <label>No. Invoice<input value={draft.invoice_no} onChange={(e) => setDraft({ ...draft, invoice_no: e.target.value })} /></label>
              <label>Nilai Invoice<input type="number" min="0" value={draft.invoice_amount} onChange={(e) => setDraft({ ...draft, invoice_amount: Number(e.target.value) })} /></label>
              <label>Jatuh Tempo<input type="date" value={draft.due_date} onChange={(e) => setDraft({ ...draft, due_date: e.target.value })} /></label>
              <label className="wide">Catatan<textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="Catatan follow up, PIC, atau informasi penting" /></label>
              <div className="form-actions wide"><button type="button" className="secondary-button" onClick={() => setShowAdd(false)}>Batal</button><button className="primary-button" disabled={saving}>{saving ? "Menyimpan…" : "Simpan Data"}</button></div>
            </form>
          </section>
        </div>
      )}

      {showPart && (
        <div className="modal-backdrop" onMouseDown={() => setShowPart(false)}>
          <section className="modal part-modal" role="dialog" aria-modal="true" aria-labelledby="part-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head"><div><p className="eyebrow">MASTER SPAREPART</p><h2 id="part-title">{editingPartId ? "Edit Sparepart" : "Daftarkan Sparepart"}</h2><p>Part number menjadi referensi utama saat membuat quotation dan invoice.</p></div><button className="icon-button" onClick={() => setShowPart(false)} aria-label="Tutup"><X /></button></div>
            <form onSubmit={savePart} className="sales-form">
              <label>Part Number<input required value={partDraft.part_number} onChange={(e) => setPartDraft({ ...partDraft, part_number: e.target.value.toUpperCase() })} placeholder="Contoh: 600-185-5100" /></label>
              <label>Nama Sparepart<input required value={partDraft.name} onChange={(e) => setPartDraft({ ...partDraft, name: e.target.value })} placeholder="Nama/deskripsi barang" /></label>
              <label>Kategori<input value={partDraft.category} onChange={(e) => setPartDraft({ ...partDraft, category: e.target.value })} placeholder="Engine, hydraulic, electrical…" /></label>
              <label>Brand<input value={partDraft.brand} onChange={(e) => setPartDraft({ ...partDraft, brand: e.target.value })} placeholder="Komatsu, Hino, Weidmuller…" /></label>
              <label>Satuan<select value={partDraft.unit} onChange={(e) => setPartDraft({ ...partDraft, unit: e.target.value })}><option>Pcs</option><option>Unit</option><option>Set</option><option>Pack</option><option>Lot</option><option>Meter</option><option>Roll</option></select></label>
              <label>Harga Jual<input required type="number" min="0" value={partDraft.selling_price} onChange={(e) => setPartDraft({ ...partDraft, selling_price: Number(e.target.value) })} /></label>
              <label className="wide">Catatan<textarea value={partDraft.notes} onChange={(e) => setPartDraft({ ...partDraft, notes: e.target.value })} placeholder="Spesifikasi, lead time, atau informasi tambahan" /></label>
              <div className="form-actions wide"><button type="button" className="secondary-button" onClick={() => setShowPart(false)}>Batal</button><button className="primary-button" disabled={saving}>{saving ? "Menyimpan…" : editingPartId ? "Simpan Perubahan" : "Daftarkan Sparepart"}</button></div>
            </form>
          </section>
        </div>
      )}

      {showDocument && (
        <div className="modal-backdrop document-backdrop" onMouseDown={() => setShowDocument(false)}>
          <section className="modal document-modal" role="dialog" aria-modal="true" aria-labelledby="document-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head"><div><p className="eyebrow">{documentDraft.type === "INVOICE" ? "INVOICE BARU" : "QUOTATION BARU"}</p><h2 id="document-title">Buat {documentDraft.type === "INVOICE" ? "Invoice" : "Quotation"}</h2><p>Pilih sparepart agar part number, satuan, dan harga jual terisi otomatis.</p></div><button className="icon-button" onClick={() => setShowDocument(false)} aria-label="Tutup"><X /></button></div>
            <form onSubmit={saveDocument} className="document-form">
              <section className="document-meta">
                <label>Jenis Dokumen<select value={documentDraft.type} onChange={(e) => setDocumentDraft({ ...documentDraft, type: e.target.value as "QUOTATION" | "INVOICE" })}><option value="QUOTATION">Quotation</option><option value="INVOICE">Invoice</option></select></label>
                <label>Customer<input required list="customer-list" value={documentDraft.customer} onChange={(e) => setDocumentDraft({ ...documentDraft, customer: e.target.value })} placeholder="Nama perusahaan/customer" /><datalist id="customer-list">{customers.map((customer) => <option key={customer.name} value={customer.name} />)}</datalist></label>
                <label>PIC Customer<input value={documentDraft.customer_pic} onChange={(e) => setDocumentDraft({ ...documentDraft, customer_pic: e.target.value })} placeholder="Nama PIC" /></label>
                <label>Tanggal Dokumen<input required type="date" value={documentDraft.document_date} onChange={(e) => setDocumentDraft({ ...documentDraft, document_date: e.target.value })} /></label>
                <label className="wide">Alamat Customer<input value={documentDraft.customer_address} onChange={(e) => setDocumentDraft({ ...documentDraft, customer_address: e.target.value })} placeholder="Alamat lengkap untuk dokumen" /></label>
                <label>Proyek / Kebutuhan<input value={documentDraft.project} onChange={(e) => setDocumentDraft({ ...documentDraft, project: e.target.value })} /></label>
                <label>{documentDraft.type === "INVOICE" ? "Referensi Quotation / PO" : "Referensi RFQ"}<input value={documentDraft.reference_no} onChange={(e) => setDocumentDraft({ ...documentDraft, reference_no: e.target.value })} /></label>
                {documentDraft.type === "INVOICE" && <label>Jatuh Tempo<input type="date" value={documentDraft.due_date} onChange={(e) => setDocumentDraft({ ...documentDraft, due_date: e.target.value })} /></label>}
                <label>PPN (%)<input type="number" min="0" step="0.1" value={documentDraft.tax_percent} onChange={(e) => setDocumentDraft({ ...documentDraft, tax_percent: Number(e.target.value) })} /></label>
              </section>

              <section className="line-items">
                <div className="line-items-head"><div><p className="eyebrow">ITEM DOKUMEN</p><h3>Sparepart & Harga Jual</h3></div><button type="button" className="secondary-button" onClick={() => setDocumentDraft({ ...documentDraft, items: [...documentDraft.items, newLine()] })}><Plus size={15} /> Tambah Baris</button></div>
                {documentDraft.items.map((item, index) => (
                  <div className="line-item" key={item.key}>
                    <span className="line-number">{index + 1}</span>
                    <label className="part-select">Pilih Sparepart<select value={item.spare_part_id ?? ""} onChange={(e) => selectPartForLine(item.key, e.target.value)}><option value="">Item manual</option>{parts.map((part) => <option key={part.id} value={part.id}>{part.part_number} — {part.name}</option>)}</select></label>
                    <label>Part Number<input value={item.part_number} onChange={(e) => updateDocumentLine(item.key, { part_number: e.target.value.toUpperCase() })} /></label>
                    <label className="description">Deskripsi<input required value={item.description} onChange={(e) => updateDocumentLine(item.key, { description: e.target.value })} /></label>
                    <label>QTY<input required type="number" min="0.01" step="0.01" value={item.quantity} onChange={(e) => updateDocumentLine(item.key, { quantity: Number(e.target.value) })} /></label>
                    <label>Satuan<input value={item.unit} onChange={(e) => updateDocumentLine(item.key, { unit: e.target.value })} /></label>
                    <label>Harga Jual<input required type="number" min="0" value={item.unit_price} onChange={(e) => updateDocumentLine(item.key, { unit_price: Number(e.target.value) })} /></label>
                    <div className="line-total"><span>Jumlah</span><strong>{money.format(item.quantity * item.unit_price)}</strong></div>
                    <button type="button" className="remove-line" aria-label={`Hapus item ${index + 1}`} disabled={documentDraft.items.length === 1} onClick={() => setDocumentDraft({ ...documentDraft, items: documentDraft.items.filter((line) => line.key !== item.key) })}><Trash2 size={16} /></button>
                  </div>
                ))}
              </section>

              <div className="document-footer-form">
                <label>Catatan<textarea value={documentDraft.notes} onChange={(e) => setDocumentDraft({ ...documentDraft, notes: e.target.value })} /></label>
                <div className="document-totals">
                  <div><span>Subtotal</span><strong>{money.format(documentSubtotal)}</strong></div>
                  <div><span>PPN {documentDraft.tax_percent}%</span><strong>{money.format(documentTax)}</strong></div>
                  <div className="grand-total"><span>Total</span><strong>{money.format(documentTotal)}</strong></div>
                </div>
              </div>
              <div className="form-actions"><button type="button" className="secondary-button" onClick={() => setShowDocument(false)}>Batal</button><button className="primary-button" disabled={saving}>{saving ? "Membuat Dokumen…" : `Simpan ${documentDraft.type === "INVOICE" ? "Invoice" : "Quotation"}`}</button></div>
            </form>
          </section>
        </div>
      )}

      {selectedDocument && (
        <div className="modal-backdrop document-preview-backdrop" onMouseDown={() => setSelectedDocument(null)}>
          <section className="modal document-preview-modal" role="dialog" aria-modal="true" aria-labelledby="preview-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="preview-toolbar"><button className="secondary-button" onClick={() => setSelectedDocument(null)}><X size={16} /> Tutup</button><button className="primary-button" onClick={() => window.print()}><Printer size={16} /> Cetak / Simpan PDF</button></div>
            <DocumentPreview document={selectedDocument} />
          </section>
        </div>
      )}

      {selected && (
        <div className="modal-backdrop" onMouseDown={() => setSelected(null)}>
          <section className="modal detail-modal" role="dialog" aria-modal="true" aria-labelledby="detail-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head"><div><p className="eyebrow">{stageOf(selected).toUpperCase()}</p><h2 id="detail-title">{selected.customer}</h2><p>{selected.project}</p></div><button className="icon-button" onClick={() => setSelected(null)} aria-label="Tutup"><X /></button></div>
            <div className="detail-timeline">
              {stages.map((stage, index) => {
                const current = stages.findIndex((item) => item.name === stageOf(selected));
                return <div className={index <= current ? "done" : ""} key={stage.name}><span>{index < current ? "✓" : index + 1}</span><small>{stage.name}</small></div>;
              })}
            </div>
            <dl className="detail-grid">
              <div><dt>RFQ</dt><dd>{selected.rfq_no || "—"}</dd></div><div><dt>Quotation</dt><dd>{selected.quotation_no || "—"}</dd></div>
              <div><dt>PO Customer</dt><dd>{selected.po_no || "—"}</dd></div><div><dt>Surat Jalan</dt><dd>{selected.delivery_no || "—"}</dd></div>
              <div><dt>Invoice</dt><dd>{selected.invoice_no || "—"}</dd></div><div><dt>Jatuh Tempo</dt><dd>{selected.due_date || "—"}</dd></div>
              <div><dt>Nilai Invoice</dt><dd>{money.format(selected.invoice_amount)}</dd></div><div><dt>Outstanding</dt><dd>{money.format(Math.max(0, selected.invoice_amount - selected.amount_paid))}</dd></div>
              <div className="wide"><dt>Catatan</dt><dd>{selected.notes || "Tidak ada catatan."}</dd></div>
            </dl>
            <div className="form-actions">{stageOf(selected) !== "Payment" && selected.invoice_no && <button className="primary-button" disabled={saving} onClick={() => markPaid(selected)}><CheckCircle2 size={17} /> Konfirmasi Lunas</button>}<button className="secondary-button" onClick={() => setSelected(null)}>Tutup</button></div>
          </section>
        </div>
      )}
    </main>
  );
}

function DocumentPreview({ document }: { document: SalesDocument }) {
  return (
    <article className="print-document">
      <header className="print-header">
        <div className="print-brand"><span>MDA</span><div><strong>PT MDA AMANAH SEJAHTERA</strong><small>General Supply & Industrial Solutions</small></div></div>
        <div className="print-title"><p>{document.document_type === "INVOICE" ? "INVOICE" : "QUOTATION"}</p><strong>{document.document_number}</strong></div>
      </header>
      <section className="print-info">
        <div><span>DITUJUKAN KEPADA</span><strong>{document.customer}</strong><p>{document.customer_pic ? `Up. ${document.customer_pic}` : ""}</p><p>{document.customer_address || "Alamat customer belum diisi"}</p></div>
        <dl>
          <div><dt>Tanggal</dt><dd>{document.document_date}</dd></div>
          {document.reference_no && <div><dt>Referensi</dt><dd>{document.reference_no}</dd></div>}
          {document.project && <div><dt>Proyek</dt><dd>{document.project}</dd></div>}
          {document.due_date && <div><dt>Jatuh Tempo</dt><dd>{document.due_date}</dd></div>}
        </dl>
      </section>
      <table className="print-table">
        <thead><tr><th>No</th><th>Part Number / Deskripsi</th><th>QTY</th><th>Satuan</th><th>Harga</th><th>Jumlah</th></tr></thead>
        <tbody>{document.items.map((item, index) => <tr key={item.id}><td>{index + 1}</td><td><b>{item.part_number || "—"}</b><span>{item.description}</span></td><td>{item.quantity}</td><td>{item.unit}</td><td>{money.format(item.unit_price)}</td><td>{money.format(item.line_total)}</td></tr>)}</tbody>
      </table>
      <section className="print-summary">
        <div className="print-notes"><span>CATATAN</span><p>{document.notes || "—"}</p></div>
        <div className="print-totals"><div><span>Subtotal</span><strong>{money.format(document.subtotal)}</strong></div><div><span>PPN {document.tax_percent}%</span><strong>{money.format(document.tax_amount)}</strong></div><div><span>TOTAL</span><strong>{money.format(document.grand_total)}</strong></div></div>
      </section>
      <footer className="print-footer"><p>Terima kasih atas kepercayaan Anda kepada PT MDA Amanah Sejahtera.</p><div><span>Hormat kami,</span><strong>PT MDA AMANAH SEJAHTERA</strong></div></footer>
    </article>
  );
}

function InvoiceTable({ rows, onSelect }: { rows: Sale[]; onSelect: (sale: Sale) => void }) {
  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead><tr><th>Customer</th><th>No. Invoice</th><th>Amount</th><th>Aging</th><th>Status</th></tr></thead>
        <tbody>
          {rows.length ? rows.map((sale) => {
            const status = agingStatus(sale);
            return <tr key={sale.id} tabIndex={0} onClick={() => onSelect(sale)} onKeyDown={(event) => event.key === "Enter" && onSelect(sale)}><td><b>{sale.customer}</b><small>{sale.project}</small></td><td>{sale.invoice_no}</td><td className="number">{money.format(sale.invoice_amount)}</td><td className="number">{agingDays(sale)} hari</td><td><span className={`status ${status.toLowerCase().replaceAll(" ", "-")}`}>{status}</span></td></tr>;
          }) : <tr><td colSpan={5} className="empty-state">Belum ada invoice pada filter ini.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function SalesTable({ rows, onSelect }: { rows: Sale[]; onSelect: (sale: Sale) => void }) {
  return (
    <article className="panel full-table">
      <div className="section-head"><div><p className="eyebrow">DATA TRANSAKSI</p><h2>{rows.length} pekerjaan terpantau</h2></div></div>
      <div className="table-scroll"><table className="data-table sales-table"><thead><tr><th>Customer / Project</th><th>RFQ</th><th>PO</th><th>Invoice</th><th>Nilai</th><th>Tahap</th></tr></thead><tbody>
        {rows.map((sale) => <tr key={sale.id} tabIndex={0} onClick={() => onSelect(sale)} onKeyDown={(event) => event.key === "Enter" && onSelect(sale)}><td><b>{sale.customer}</b><small>{sale.project}</small></td><td>{sale.rfq_no || "—"}</td><td>{sale.po_no || "—"}</td><td>{sale.invoice_no || "—"}</td><td className="number">{money.format(sale.invoice_amount)}</td><td><span className="status stage">{stageOf(sale)}</span></td></tr>)}
      </tbody></table></div>
    </article>
  );
}
