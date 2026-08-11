"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Database,
  Download,
  Eye,
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
  ShieldCheck,
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
  sold_quantity: number;
  top_customer: string;
  top_customer_quantity: number;
};

type DraftPart = Omit<SparePart, "id" | "sold_quantity" | "top_customer" | "top_customer_quantity">;

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

type AppRole = "ADMIN" | "EDITOR" | "VIEWER";

type AppIdentity = {
  email: string;
  name: string;
  role: AppRole;
};

type ManagedUser = AppIdentity & {
  id: number;
  is_active: number;
  created_at: string;
  updated_at: string;
};

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
  reviewed_by_name: string;
  reviewed_at: string;
  review_notes: string;
};

type ExcelRecord = {
  id: number;
  row_number: number;
  customer: string;
  project: string;
  rfq_no: string;
  quotation_no: string;
  po_no: string;
  invoice_no: string;
  part_number: string;
  description: string;
  amount: number;
  payment_status: string;
  raw: Record<string, string | number>;
};

type ExcelSource = {
  source_file: string;
  imported_at: string;
  row_count: number;
};

type PendingExcelImport = {
  source_file: string;
  rows: Array<Record<string, unknown>>;
  records: Array<DraftSale & { source_key: string; created_at: string }>;
};

const excelRawKeys = [
  "no", "customer", "location", "transaction", "project", "rfq_date", "rfq_no",
  "rfq_part_number", "rfq_description", "rfq_qty", "rfq_uom", "quotation_date",
  "quotation_no", "quotation_part_number", "quotation_description", "quotation_qty",
  "quotation_uom", "quotation_price", "quotation_amount", "po_date", "po_no",
  "po_part_number", "po_description", "po_qty", "po_uom", "po_price", "po_amount",
  "delivery_date", "delivery_no", "invoice_date", "invoice_no", "invoice_part_number",
  "invoice_description", "invoice_qty", "invoice_uom", "invoice_dpp", "invoice_amount_dpp",
  "invoice_ppn", "invoice_amount", "invoice_pph23", "total_ar", "payment_type",
  "payment_term", "invoice_due_date", "invoice_aging", "received_due_date", "payment_amount",
  "transfer_date", "payment_status", "payment_difference", "payment_note",
  "transaction_status", "remark",
] as const;

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

const localKey = () => globalThis.crypto?.randomUUID?.() ?? `item-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const newLine = (): DocumentLine => ({
  key: localKey(),
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
  { id: "Dashboard", label: "Summary", caption: "Penjualan & piutang", icon: LayoutDashboard },
  { id: "Pipeline", label: "Proses Penjualan", caption: "RFQ sampai lunas", icon: TrendingUp },
  { id: "Tagihan", label: "Tagihan", caption: "Invoice & jatuh tempo", icon: FileText },
  { id: "Customer", label: "Customer", caption: "PO & invoice", icon: Users },
  { id: "Sparepart", label: "Master Sparepart", caption: "Part number & harga", icon: PackageSearch },
  { id: "Dokumen", label: "Quotation & Invoice", caption: "Buat dokumen jual", icon: ReceiptText },
  { id: "Excel", label: "Data Excel Lengkap", caption: "Sumber data utama", icon: Database },
  { id: "Laporan", label: "Laporan", caption: "Rekap data", icon: FileBarChart },
  { id: "Akses", label: "Akses Pengguna", caption: "Admin, editor, viewer", icon: ShieldCheck },
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

const documentYear = (value: string) => {
  const text = String(value || "").trim();
  if (!text) return "";
  const fullYears = text.match(/\b(20\d{2})\b/g);
  if (fullYears?.length) return fullYears.at(-1) ?? "";
  const shortYear = text.match(/(?:^|[\/-])(\d{2})(?:$|[\/-])/);
  if (!shortYear) return "";
  const year = Number(shortYear[1]);
  return year >= 0 && year <= 99 ? String(2000 + year) : "";
};

const transactionYear = (sale: Sale) => {
  const documentSources = [
    sale.invoice_no,
    sale.po_no,
    sale.delivery_no,
    sale.quotation_no,
    sale.rfq_no,
  ];
  for (const source of documentSources) {
    const year = documentYear(source);
    if (year) return year;
  }
  const dateSource = sale.due_date || sale.payment_date || sale.created_at;
  if (!dateSource) return "";
  const parsed = new Date(dateSource);
  return Number.isNaN(parsed.valueOf()) ? "" : String(parsed.getFullYear());
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

export default function DashboardClient() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeNav, setActiveNav] = useState("Dashboard");
  const [search, setSearch] = useState("");
  const [year, setYear] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showDirectPo, setShowDirectPo] = useState(false);
  const [directPoSource, setDirectPoSource] = useState<Sale | null>(null);
  const [directPoItems, setDirectPoItems] = useState<DocumentLine[]>([newLine()]);
  const [showPart, setShowPart] = useState(false);
  const [showDocument, setShowDocument] = useState(false);
  const [selected, setSelected] = useState<Sale | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const [editSaleDraft, setEditSaleDraft] = useState<DraftSale>(emptyDraft);
  const [selectedDocument, setSelectedDocument] = useState<SalesDocument | null>(null);
  const [draft, setDraft] = useState<DraftSale>(emptyDraft);
  const [directPoDraft, setDirectPoDraft] = useState<DraftSale>(emptyDraft);
  const [parts, setParts] = useState<SparePart[]>([]);
  const [documents, setDocuments] = useState<SalesDocument[]>([]);
  const [partDraft, setPartDraft] = useState<DraftPart>(emptyPart);
  const [editingPartId, setEditingPartId] = useState<number | null>(null);
  const [documentDraft, setDocumentDraft] = useState<DocumentDraft>(() => emptyDocument("QUOTATION"));
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [identity, setIdentity] = useState<AppIdentity | null>(null);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [excelRows, setExcelRows] = useState<ExcelRecord[]>([]);
  const [excelPage, setExcelPage] = useState(1);
  const [excelPages, setExcelPages] = useState(1);
  const [excelTotal, setExcelTotal] = useState(0);
  const [excelSource, setExcelSource] = useState<ExcelSource | null>(null);
  const [pendingExcelImport, setPendingExcelImport] = useState<PendingExcelImport | null>(null);
  const [selectedExcelRow, setSelectedExcelRow] = useState<ExcelRecord | null>(null);
  const [selectedParts, setSelectedParts] = useState<ExcelRecord[]>([]);
  const [selectedPartsLoading, setSelectedPartsLoading] = useState(false);
  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null);
  const [paymentConfirmations, setPaymentConfirmations] = useState<PaymentConfirmation[]>([]);
  const [paymentTarget, setPaymentTarget] = useState<Sale | null>(null);
  const [paymentDraft, setPaymentDraft] = useState({ amount: 0, payment_date: "", reference_no: "", notes: "" });
  const [verificationTarget, setVerificationTarget] = useState<PaymentConfirmation | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [userDraft, setUserDraft] = useState<{ name: string; email: string; role: AppRole }>({ name: "", email: "", role: "VIEWER" });
  const fileRef = useRef<HTMLInputElement>(null);
  const sparePartFileRef = useRef<HTMLInputElement>(null);

  const role = identity?.role ?? "VIEWER";
  const canEdit = role === "ADMIN" || role === "EDITOR";
  const isAdmin = role === "ADMIN";

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
      const documentsResponse = await fetch("/api/documents");
      if (documentsResponse.ok) setDocuments(((await documentsResponse.json()).data ?? []).filter((document: SalesDocument) => document.document_type === "QUOTATION" || document.document_type === "INVOICE"));
      const partsResponse = await fetch("/api/spareparts");
      if (partsResponse.ok) setParts((await partsResponse.json()).data ?? []);
    } catch {
      setNotice("Master sparepart dan dokumen belum berhasil dimuat.");
    }
  };

  const loadSession = async () => {
    const response = await fetch("/api/me");
    if (!response.ok) return null;
    const data = (await response.json()).data as AppIdentity;
    setIdentity(data);
    return data;
  };

  const loadUsers = async () => {
    const response = await fetch("/api/users");
    if (response.ok) setUsers((await response.json()).data ?? []);
  };

  const loadPaymentConfirmations = async () => {
    const response = await fetch("/api/payments");
    if (response.ok) setPaymentConfirmations((await response.json()).data ?? []);
  };

  const loadExcelData = async (page = excelPage, query = search) => {
    const response = await fetch(`/api/excel?page=${page}&q=${encodeURIComponent(query)}`);
    if (!response.ok) return;
    const payload = await response.json();
    setExcelRows(payload.data ?? []);
    setExcelPage(payload.page ?? 1);
    setExcelPages(payload.pages ?? 1);
    setExcelTotal(payload.total ?? 0);
    setExcelSource(payload.source ?? null);
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void (async () => {
        const session = await loadSession();
        await Promise.all([loadSales(), loadBusinessData(), loadExcelData(1, ""), loadPaymentConfirmations()]);
        if (session?.role === "ADMIN") await loadUsers();
      })();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const years = useMemo(() => {
    const list = Array.from(new Set(sales.map(transactionYear).filter(Boolean))).sort().reverse();
    return ["Semua Periode", ...list];
  }, [sales]);

  const latestYear = years.find((item) => item !== "Semua Periode") || String(new Date().getFullYear());
  const selectedYear = year || latestYear;

  const filtered = useMemo(() => sales.filter((sale) => {
    const haystack = `${sale.customer} ${sale.project} ${sale.rfq_no} ${sale.quotation_no} ${sale.po_no} ${sale.invoice_no}`.toLowerCase();
    const matchesSearch = haystack.includes(search.toLowerCase());
    const matchesYear = selectedYear === "Semua Periode" || transactionYear(sale) === selectedYear;
    const matchesStage = !stageFilter || stageOf(sale) === stageFilter;
    return matchesSearch && matchesYear && matchesStage;
  }), [sales, search, selectedYear, stageFilter]);

  const summaryFiltered = useMemo(
    () => filtered.filter((sale) => sale.po_no.trim()),
    [filtered],
  );

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

  const summaryStages = stages.map((stage) => {
    const records = summaryFiltered.filter((sale) => stageOf(sale) === stage.name);
    return { ...stage, count: records.length, value: records.reduce((sum, sale) => sum + Number(sale.invoice_amount || 0), 0) };
  });
  const summaryOutstanding = summaryFiltered.reduce((sum, sale) => sum + Math.max(0, Number(sale.invoice_amount) - Number(sale.amount_paid)), 0);
  const summaryPipelineValue = summaryFiltered.reduce((sum, sale) => sum + Number(sale.invoice_amount || 0), 0);
  const summaryOverdue = summaryFiltered.filter((sale) => agingStatus(sale) === "Terlambat");
  const summaryCustomerCount = new Set(summaryFiltered.map((sale) => sale.customer.trim()).filter(Boolean)).size;
  const summaryPoCount = new Set(summaryFiltered.map((sale) => sale.po_no.trim()).filter(Boolean)).size;
  const summaryInvoiceCount = new Set(summaryFiltered.map((sale) => sale.invoice_no.trim()).filter(Boolean)).size;

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

  const outstandingCustomers = useMemo(() => {
    const grouped = new Map<string, { name: string; invoices: Sale[] }>();
    summaryFiltered.forEach((sale) => {
      if (!sale.invoice_no.trim()) return;
      const remaining = Math.max(0, Number(sale.invoice_amount) - Number(sale.amount_paid));
      if (remaining <= 0) return;
      const name = sale.customer.trim() || "Tanpa Nama";
      const key = name.toLocaleLowerCase("id-ID");
      const current = grouped.get(key) ?? { name, invoices: [] };
      const existing = current.invoices.find((invoice) => invoice.invoice_no.trim() === sale.invoice_no.trim());
      if (existing) {
        existing.invoice_amount += Number(sale.invoice_amount || 0);
        existing.amount_paid += Number(sale.amount_paid || 0);
      } else {
        current.invoices.push({ ...sale });
      }
      grouped.set(key, current);
    });

    return Array.from(grouped.values())
      .map((customer) => {
        const totalInvoice = customer.invoices.reduce((sum, invoice) => sum + Number(invoice.invoice_amount || 0), 0);
        const totalPaid = customer.invoices.reduce((sum, invoice) => sum + Number(invoice.amount_paid || 0), 0);
        const totalOutstanding = customer.invoices.reduce((sum, invoice) => sum + Math.max(0, Number(invoice.invoice_amount) - Number(invoice.amount_paid)), 0);
        const overdueInvoices = customer.invoices.filter((invoice) => agingStatus(invoice) === "Terlambat").length;
        return {
          ...customer,
          totalInvoice,
          totalPaid,
          totalOutstanding,
          overdueInvoices,
        };
      })
      .sort((a, b) => b.totalOutstanding - a.totalOutstanding);
  }, [summaryFiltered]);

  const outstandingSummary = useMemo(() => outstandingCustomers.reduce((total, customer) => ({
    customers: total.customers + 1,
    invoices: total.invoices + customer.invoices.length,
    outstanding: total.outstanding + customer.totalOutstanding,
    overdue: total.overdue + customer.overdueInvoices,
  }), { customers: 0, invoices: 0, outstanding: 0, overdue: 0 }), [outstandingCustomers]);

  const pendingPayments = useMemo(
    () => paymentConfirmations.filter((confirmation) => confirmation.status === "PENDING"),
    [paymentConfirmations],
  );
  const pendingPaymentBySale = useMemo(
    () => new Map(pendingPayments.map((confirmation) => [confirmation.sale_id, confirmation])),
    [pendingPayments],
  );

  const openAdd = () => {
    setDraft(emptyDraft);
    setShowAdd(true);
  };

  const openDirectPo = (sale?: Sale) => {
    const quotation = sale ? documents.find((document) => document.document_type === "QUOTATION" && document.document_number === sale.quotation_no) : null;
    setDirectPoSource(sale ?? null);
    setDirectPoDraft(sale ? {
      customer: sale.customer,
      location: sale.location,
      transaction_type: sale.transaction_type || "Trading Part",
      project: sale.project,
      rfq_no: sale.rfq_no,
      quotation_no: sale.quotation_no,
      po_no: "",
      delivery_no: "",
      invoice_no: "",
      invoice_amount: Number(sale.invoice_amount || 0),
      amount_paid: 0,
      due_date: "",
      payment_date: "",
      payment_status: "OPEN",
      transaction_status: "PO Diterima",
      notes: sale.notes,
    } : { ...emptyDraft, rfq_no: "", quotation_no: "", transaction_status: "PO Diterima" });
    setDirectPoItems(quotation?.items?.length ? quotation.items.map((item) => ({ ...item, key: localKey() })) : [newLine()]);
    setShowDirectPo(true);
  };

  const updateDirectPoLine = (key: string, patch: Partial<DocumentLine>) => {
    setDirectPoItems((current) => current.map((item) => item.key === key ? { ...item, ...patch } : item));
  };

  const openPoFromQuotationDocument = (document: SalesDocument) => {
    const sale = sales.find((item) => item.quotation_no === document.document_number);
    if (!sale) {
      setNotice("Transaksi quotation belum ditemukan. Sinkronkan data lalu coba kembali.");
      return;
    }
    if (sale.po_no) {
      setNotice(`Quotation ini sudah menjadi PO ${sale.po_no}.`);
      return;
    }
    openDirectPo(sale);
  };

  const selectPartForDirectPo = (key: string, id: string) => {
    const part = parts.find((item) => item.id === Number(id));
    updateDirectPoLine(key, part ? {
      spare_part_id: part.id,
      part_number: part.part_number,
      description: part.name,
      unit: part.unit,
      unit_price: Number(part.selling_price),
    } : { spare_part_id: null, part_number: "", description: "", unit: "Pcs", unit_price: 0 });
  };

  const directPoTotal = directPoItems.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_price || 0), 0);

  const submitDirectPo = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const validItems = directPoItems.filter((item) => item.description.trim() && Number(item.quantity) > 0);
      if (!validItems.length) throw new Error("Tambahkan minimal satu produk pada PO.");
      const response = await fetch("/api/sales", {
        method: directPoSource ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: directPoSource ? "accept_po" : "add_po",
          id: directPoSource?.id,
          record: { ...directPoDraft, invoice_amount: directPoTotal },
          items: validItems,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "PO belum berhasil disimpan.");
      setShowDirectPo(false);
      setDirectPoSource(null);
      setSelected(null);
      setStageFilter("PO");
      setNotice(directPoSource ? `Quotation ${directPoSource.quotation_no} berhasil diperbarui menjadi PO ${directPoDraft.po_no.trim()}.` : `PO ${directPoDraft.po_no.trim()} berhasil ditambahkan tanpa RFQ.`);
      await Promise.all([loadSales(), loadBusinessData()]);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "PO belum berhasil disimpan.");
    } finally {
      setSaving(false);
    }
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

  const openTransactionEdit = (sale: Sale) => {
    setEditingSale(sale);
    setEditSaleDraft({
      customer: sale.customer,
      location: sale.location,
      transaction_type: sale.transaction_type,
      project: sale.project,
      rfq_no: sale.rfq_no,
      quotation_no: sale.quotation_no,
      po_no: sale.po_no,
      delivery_no: sale.delivery_no,
      invoice_no: sale.invoice_no,
      invoice_amount: Number(sale.invoice_amount),
      amount_paid: Number(sale.amount_paid),
      due_date: sale.due_date,
      payment_date: sale.payment_date,
      payment_status: sale.payment_status,
      transaction_status: sale.transaction_status,
      notes: sale.notes,
    });
  };

  const saveTransactionEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingSale || !isAdmin) return;
    setSaving(true);
    try {
      const response = await fetch("/api/sales", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingSale.id, ...editSaleDraft }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Transaksi belum berhasil diperbarui.");
      setEditingSale(null);
      setSelectedCustomer(editSaleDraft.customer.trim() || selectedCustomer);
      setNotice("Data transaksi customer berhasil diperbarui.");
      await loadSales();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Transaksi belum berhasil diperbarui.");
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
      const headerIndex = rows.slice(0, 10).findIndex((row) => row.some((cell) => String(cell).trim().toLowerCase() === "customer"));
      const canonicalLayout = headerIndex >= 0 && rows[headerIndex].some((cell) => String(cell).trim().toLowerCase() === "rfq_no");
      const dataStart = canonicalLayout ? headerIndex + 1 : 5;
      const columnOffset = canonicalLayout ? 0 : 1;
      const sourceRows = rows.slice(dataStart).map((row, index) => {
        const raw = Object.fromEntries(excelRawKeys.map((key, keyIndex) => {
          const value = row[keyIndex + columnOffset];
          return [key, value instanceof Date ? isoDate(value) : typeof value === "number" ? value : String(value ?? "").trim()];
        })) as Record<(typeof excelRawKeys)[number], string | number>;
        return { raw, rowNumber: index + dataStart + 1 };
      }).filter(({ raw }) => raw.customer || raw.rfq_no);
      const rawRows = sourceRows.map(({ raw, rowNumber }) => {
        return {
          row_number: rowNumber,
          customer: String(raw.customer || ""), project: String(raw.project || ""), rfq_no: String(raw.rfq_no || ""),
          quotation_no: String(raw.quotation_no || ""), po_no: String(raw.po_no || ""), invoice_no: String(raw.invoice_no || ""),
          part_number: String(raw.invoice_part_number || raw.po_part_number || raw.quotation_part_number || raw.rfq_part_number || ""),
          description: String(raw.invoice_description || raw.po_description || raw.quotation_description || raw.rfq_description || ""),
          amount: Number(raw.total_ar || raw.invoice_amount || 0), payment_status: String(raw.payment_status || ""), raw,
        };
      });
      const grouped = new Map<string, DraftSale & { source_key: string; created_at: string }>();
      sourceRows.forEach(({ raw, rowNumber }) => {
        const documentType = raw.invoice_no ? "invoice" : raw.po_no ? "po" : raw.quotation_no ? "quotation" : raw.rfq_no ? "rfq" : "row";
        const documentNo = String(raw.invoice_no || raw.po_no || raw.quotation_no || raw.rfq_no || rowNumber).trim();
        const key = `upload:${documentType}:${documentNo.toLocaleLowerCase("id-ID")}`;
        const current = grouped.get(key) ?? {
          source_key: key, customer: String(raw.customer || "Tanpa Nama"), location: String(raw.location || ""),
          transaction_type: String(raw.transaction || ""), project: String(raw.project || ""), rfq_no: String(raw.rfq_no || ""),
          quotation_no: String(raw.quotation_no || ""), po_no: String(raw.po_no || ""), delivery_no: String(raw.delivery_no || ""),
          invoice_no: String(raw.invoice_no || ""), invoice_amount: 0, amount_paid: 0, due_date: isoDate(raw.invoice_due_date),
          payment_date: isoDate(raw.transfer_date), payment_status: String(raw.payment_status || "OPEN"), transaction_status: String(raw.transaction_status || ""),
          notes: String(raw.remark || raw.payment_note || ""), created_at: isoDate(raw.invoice_date || raw.delivery_date || raw.po_date || raw.quotation_date || raw.rfq_date) || new Date().toISOString(),
        };
        current.invoice_amount += Number(raw.total_ar || raw.invoice_amount || 0);
        current.amount_paid += Number(raw.payment_amount || 0);
        if (raw.payment_status) current.payment_status = String(raw.payment_status);
        if (raw.transaction_status) current.transaction_status = String(raw.transaction_status);
        if (raw.remark || raw.payment_note) current.notes = String(raw.remark || raw.payment_note);
        grouped.set(key, current);
      });
      const records = Array.from(grouped.values());
      if (!rawRows.length || !records.length) throw new Error("File tidak memiliki baris data pada sheet RAW.");
      setPendingExcelImport({ source_file: file.name, rows: rawRows, records });
      setNotice(`${rawRows.length} baris siap diproses. Konfirmasikan pergantian sumber data utama.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Format Excel belum dikenali. Pastikan tersedia sheet RAW dengan format Monitoring Sales MDA.");
    } finally {
      setSaving(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const openPaymentConfirmation = (sale: Sale) => {
    setSelected(null);
    setPaymentTarget(sale);
    setPaymentDraft({
      amount: Math.max(0, Number(sale.invoice_amount) - Number(sale.amount_paid)),
      payment_date: new Date().toISOString().slice(0, 10),
      reference_no: "",
      notes: "",
    });
  };

  const submitPaymentConfirmation = async (event: FormEvent) => {
    event.preventDefault();
    if (!paymentTarget) return;
    setSaving(true);
    try {
      const response = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sale_id: paymentTarget.id, ...paymentDraft }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Konfirmasi pembayaran gagal.");
      setPaymentTarget(null);
      setNotice("Konfirmasi pembayaran dikirim dan menunggu verifikasi Admin.");
      await loadPaymentConfirmations();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Konfirmasi pembayaran belum berhasil dikirim.");
    } finally {
      setSaving(false);
    }
  };

  const confirmExcelImport = async () => {
    if (!pendingExcelImport) return;
    setSaving(true);
    try {
      const response = await fetch("/api/excel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pendingExcelImport),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Sumber Excel belum berhasil diperbarui.");
      const sourceFile = pendingExcelImport.source_file;
      setPendingExcelImport(null);
      setNotice(`${payload.imported_rows ?? 0} baris dari ${sourceFile} menjadi sumber utama. Summary telah diperbarui.`);
      setSearch("");
      await Promise.all([loadSales(), loadExcelData(1, ""), loadPaymentConfirmations()]);
      setActiveNav("Dashboard");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Sumber Excel belum berhasil diperbarui.");
    } finally {
      setSaving(false);
    }
  };

  const verifyPayment = async (action: "approve" | "reject") => {
    if (!verificationTarget) return;
    setSaving(true);
    try {
      const response = await fetch("/api/payments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: verificationTarget.id, action, review_notes: reviewNotes }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Verifikasi pembayaran gagal.");
      setVerificationTarget(null);
      setReviewNotes("");
      setNotice(action === "approve" ? "Pembayaran disetujui. Seluruh Summary telah diperbarui." : "Konfirmasi pembayaran ditolak.");
      await Promise.all([loadSales(), loadPaymentConfirmations()]);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Verifikasi pembayaran belum berhasil.");
    } finally {
      setSaving(false);
    }
  };

  const openSaleDetail = async (sale: Sale) => {
    setSelected(sale);
    setSelectedParts([]);
    const documentType = sale.invoice_no ? "invoice" : sale.po_no ? "po" : "";
    const documentNo = sale.invoice_no || sale.po_no;
    if (!documentType || !documentNo) return;
    setSelectedPartsLoading(true);
    try {
      if (sale.po_no) {
        const directResponse = await fetch(`/api/sales/items?po_no=${encodeURIComponent(sale.po_no)}`);
        if (directResponse.ok) {
          const directItems = (await directResponse.json()).data ?? [];
          if (directItems.length) {
            setSelectedParts(directItems);
            return;
          }
        }
      }
      const response = await fetch(`/api/excel?document_type=${documentType}&document_no=${encodeURIComponent(documentNo)}`);
      if (!response.ok) throw new Error();
      setSelectedParts((await response.json()).data ?? []);
    } catch {
      setNotice("Detail part belum berhasil dimuat.");
    } finally {
      setSelectedPartsLoading(false);
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
          key: localKey(),
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

  const importSpareParts = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setSaving(true);
    setNotice("Membaca template Master Spare Part…");
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = workbook.Sheets["DATA SPARE PART"] ?? workbook.Sheets[workbook.SheetNames[0]];
      if (!sheet) throw new Error("Sheet DATA SPARE PART tidak ditemukan.");
      const normalizeHeader = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
      const tableRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
      const headerIndex = tableRows.slice(0, 12).findIndex((row) => row.some((cell) => normalizeHeader(String(cell)) === "part_number"));
      if (headerIndex < 0) throw new Error("Kolom Part Number tidak ditemukan. Gunakan template yang tersedia.");
      const headers = tableRows[headerIndex].map((cell) => String(cell));
      const sourceRows = tableRows.slice(headerIndex + 1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index]])));
      const valueFrom = (row: Record<string, unknown>, aliases: string[]) => {
        const normalizedRow = new Map(Object.entries(row).map(([key, value]) => [normalizeHeader(key), value]));
        return aliases.map((alias) => normalizedRow.get(alias)).find((value) => value !== undefined) ?? "";
      };
      const items = sourceRows.map((row) => ({
        part_number: String(valueFrom(row, ["part_number", "part_no", "kode_part"]) || "").trim(),
        name: String(valueFrom(row, ["nama_spare_part", "nama_part", "name", "description", "deskripsi"]) || "").trim(),
        category: String(valueFrom(row, ["kategori", "category"]) || "").trim(),
        brand: String(valueFrom(row, ["merek", "brand"]) || "").trim(),
        unit: String(valueFrom(row, ["satuan", "unit", "uom"]) || "Pcs").trim(),
        selling_price: Number(valueFrom(row, ["harga_jual", "selling_price", "price"]) || 0),
        notes: String(valueFrom(row, ["catatan", "notes", "remark"]) || "").trim(),
      })).filter((item) => item.part_number || item.name);
      if (!items.length) throw new Error("Template belum berisi data spare part.");
      const invalidPriceRow = items.findIndex((item) => !Number.isFinite(item.selling_price) || item.selling_price < 0);
      if (invalidPriceRow >= 0) throw new Error(`Harga Jual pada baris data ${invalidPriceRow + 1} harus berupa angka yang valid.`);
      const response = await fetch("/api/spareparts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Data spare part belum berhasil diimpor.");
      setNotice(`${payload.imported} sparepart berhasil diimpor${payload.duplicates_in_file ? `; ${payload.duplicates_in_file} part number duplikat diperbarui.` : "."}`);
      await loadBusinessData();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Format template spare part belum dikenali.");
    } finally {
      setSaving(false);
      if (sparePartFileRef.current) sparePartFileRef.current.value = "";
    }
  };

  const downloadUpdatedExcel = async () => {
    setSaving(true);
    setNotice("Menyiapkan file Excel dengan Summary terbaru…");
    try {
      const [XLSX, response] = await Promise.all([import("xlsx"), fetch("/api/excel?all=1")]);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Data sumber Excel belum dapat diunduh.");
      const allRows = (payload.data ?? []) as ExcelRecord[];
      const sourceSheet = XLSX.utils.json_to_sheet(
        allRows.map((row) => row.raw),
        { header: [...excelRawKeys] },
      );
      sourceSheet["!cols"] = excelRawKeys.map((key) => ({ wch: key.includes("description") || key.includes("note") || key === "remark" ? 28 : key.includes("no") ? 22 : 15 }));

      const currentSummary = sales.filter((sale) => sale.po_no.trim());
      const totalInvoice = currentSummary.reduce((sum, sale) => sum + Number(sale.invoice_amount || 0), 0);
      const totalPaid = currentSummary.reduce((sum, sale) => sum + Number(sale.amount_paid || 0), 0);
      const totalOutstanding = currentSummary.reduce((sum, sale) => sum + Math.max(0, Number(sale.invoice_amount) - Number(sale.amount_paid)), 0);
      const overdueCount = currentSummary.filter((sale) => agingStatus(sale) === "Terlambat").length;
      const summaryRows: (string | number)[][] = [
        ["MONITORING SALES MDA — SUMMARY TERBARU"],
        ["Sumber Data", payload.source?.source_file || excelSource?.source_file || "Monitoring Sales.xlsx"],
        ["Diperbarui", new Date().toLocaleString("id-ID")],
        [],
        ["Jumlah PO", "Jumlah Invoice", "Nilai Transaksi", "Sudah Dibayar", "Belum Dibayar", "Lewat Jatuh Tempo"],
        [new Set(currentSummary.map((sale) => sale.po_no).filter(Boolean)).size, new Set(currentSummary.map((sale) => sale.invoice_no).filter(Boolean)).size, totalInvoice, totalPaid, totalOutstanding, overdueCount],
        [],
        ["Customer", "Project", "RFQ", "Quotation", "PO", "Surat Jalan", "Invoice", "Nilai Invoice", "Terbayar", "Outstanding", "Jatuh Tempo", "Status Pembayaran", "Status Aging"],
        ...currentSummary.map((sale) => [
          sale.customer, sale.project, sale.rfq_no, sale.quotation_no, sale.po_no, sale.delivery_no,
          sale.invoice_no, sale.invoice_amount, sale.amount_paid, Math.max(0, sale.invoice_amount - sale.amount_paid),
          sale.due_date, sale.payment_status, agingStatus(sale),
        ]),
      ];
      const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
      summarySheet["!cols"] = [{ wch: 28 }, { wch: 28 }, { wch: 22 }, { wch: 22 }, { wch: 25 }, { wch: 22 }, { wch: 24 }, { wch: 17 }, { wch: 17 }, { wch: 17 }, { wch: 16 }, { wch: 18 }, { wch: 18 }];

      const customerMap = new Map<string, { invoices: number; total: number; paid: number; outstanding: number; overdue: number }>();
      currentSummary.forEach((sale) => {
        const current = customerMap.get(sale.customer) ?? { invoices: 0, total: 0, paid: 0, outstanding: 0, overdue: 0 };
        if (sale.invoice_no) current.invoices += 1;
        current.total += Number(sale.invoice_amount || 0);
        current.paid += Number(sale.amount_paid || 0);
        current.outstanding += Math.max(0, Number(sale.invoice_amount) - Number(sale.amount_paid));
        if (agingStatus(sale) === "Terlambat") current.overdue += 1;
        customerMap.set(sale.customer, current);
      });
      const customerSheet = XLSX.utils.json_to_sheet(Array.from(customerMap, ([customer, value]) => ({
        Customer: customer, "Jumlah Invoice": value.invoices, "Total Tagihan": value.total,
        "Sudah Dibayar": value.paid, "Belum Dibayar": value.outstanding, "Invoice Terlambat": value.overdue,
      })));
      customerSheet["!cols"] = [{ wch: 32 }, { wch: 15 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sourceSheet, "RAW");
      XLSX.utils.book_append_sheet(workbook, summarySheet, "SUMMARY");
      XLSX.utils.book_append_sheet(workbook, customerSheet, "PIUTANG CUSTOMER");
      XLSX.writeFile(workbook, `Monitoring Sales MDA - Updated ${new Date().toISOString().slice(0, 10)}.xlsx`, { compression: true });
      setNotice("File Excel sumber dengan Summary terbaru berhasil diunduh.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "File Excel belum berhasil dibuat.");
    } finally {
      setSaving(false);
    }
  };

  const saveUser = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(userDraft),
      });
      if (!response.ok) throw new Error();
      setUserDraft({ name: "", email: "", role: "VIEWER" });
      setNotice("Peran pengguna tersimpan. Tambahkan email yang sama ke daftar akses situs agar orang tersebut dapat login.");
      await loadUsers();
    } catch {
      setNotice("Akses pengguna belum berhasil disimpan.");
    } finally {
      setSaving(false);
    }
  };

  const updateUser = async (user: ManagedUser, patch: { role?: AppRole; is_active?: boolean }) => {
    setSaving(true);
    try {
      const response = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: user.id, role: patch.role ?? user.role, is_active: patch.is_active ?? Boolean(user.is_active) }),
      });
      if (!response.ok) throw new Error();
      setNotice("Hak akses pengguna diperbarui.");
      await loadUsers();
    } catch {
      setNotice("Hak akses belum berhasil diperbarui.");
    } finally {
      setSaving(false);
    }
  };

  const renderReceivableSummary = () => (
    <section className="module-stack summary-receivables">
      <div className="customer-summary receivable-summary">
        <div className="customer-summary-copy">
          <p className="eyebrow">SUMMARY PIUTANG CUSTOMER</p>
          <h2>{compactMoney(outstandingSummary.outstanding)} belum dibayar</h2>
          <p>Hanya transaksi yang sudah memiliki PO. Buka customer untuk melihat nomor invoice, umur tagihan, dan rincian part.</p>
        </div>
        <div className="customer-summary-metrics">
          <div><span>Customer Menunggak</span><strong>{outstandingSummary.customers}</strong></div>
          <div><span>Invoice Terbuka</span><strong>{outstandingSummary.invoices}</strong></div>
          <div><span>Lewat Jatuh Tempo</span><strong>{outstandingSummary.overdue}</strong></div>
          <div><span>Total Outstanding</span><strong>{compactMoney(outstandingSummary.outstanding)}</strong></div>
        </div>
      </div>

      {isAdmin && pendingPayments.length > 0 && (
        <article className="panel payment-verification-panel">
          <div className="section-head">
            <div>
              <p className="eyebrow">VERIFIKASI PEMBAYARAN</p>
              <h2>{pendingPayments.length} konfirmasi menunggu pemeriksaan</h2>
              <p className="section-note">Periksa nominal, tanggal, dan referensi sebelum pembayaran dimasukkan ke Summary.</p>
            </div>
            <span className="verification-count"><ShieldCheck size={16} /> {pendingPayments.length} Pending</span>
          </div>
          <div className="verification-list">
            {pendingPayments.map((confirmation) => (
              <div className="verification-item" key={confirmation.id}>
                <span className="verification-icon"><Clock3 size={18} /></span>
                <div><b>{confirmation.customer}</b><small>{confirmation.invoice_no} · diajukan {confirmation.requested_by_name || confirmation.requested_by_email}</small></div>
                <div className="verification-amount"><strong>{money.format(confirmation.amount)}</strong><small>{new Date(confirmation.payment_date).toLocaleDateString("id-ID")}{confirmation.reference_no ? ` · ${confirmation.reference_no}` : ""}</small></div>
                <button className="part-detail-button" type="button" onClick={() => { setVerificationTarget(confirmation); setReviewNotes(""); }}><ShieldCheck size={14} /> Verifikasi</button>
              </div>
            ))}
          </div>
        </article>
      )}

      <article className="panel full-table receivable-panel">
        <div className="section-head">
          <div>
            <p className="eyebrow">OUTSTANDING PER CUSTOMER</p>
            <h2>Customer yang Belum Melakukan Pembayaran Keseluruhan</h2>
            <p className="section-note">Quotation tanpa PO tidak masuk Summary. Klik customer untuk membuka daftar invoice dan detail part.</p>
          </div>
          <span className="period-chip">{selectedYear}{selectedYear === latestYear ? " • Terbaru" : ""}</span>
        </div>
        <div className="table-scroll">
          <table className="data-table receivable-table">
            <thead><tr><th>Customer</th><th className="number">Invoice Terbuka</th><th className="number">Total Tagihan</th><th className="number">Sudah Dibayar</th><th className="number">Belum Dibayar</th><th className="number">Umur Tagihan</th><th>Detail</th></tr></thead>
            <tbody>
              {outstandingCustomers.map((customer) => {
                const expanded = expandedCustomer === customer.name;
                const oldestAge = Math.max(0, ...customer.invoices.map((invoice) => agingDays(invoice)));
                return [
                  <tr className="receivable-customer-row" key={customer.name} tabIndex={0} onClick={() => setExpandedCustomer(expanded ? null : customer.name)} onKeyDown={(event) => event.key === "Enter" && setExpandedCustomer(expanded ? null : customer.name)}>
                    <td><b>{customer.name}</b><small>{customer.overdueInvoices ? `${customer.overdueInvoices} invoice terlambat` : "Belum melewati jatuh tempo"}</small></td>
                    <td className="number">{customer.invoices.length}</td>
                    <td className="number">{money.format(customer.totalInvoice)}</td>
                    <td className="number paid-cell">{money.format(customer.totalPaid)}</td>
                    <td className="number outstanding-cell">{money.format(customer.totalOutstanding)}</td>
                    <td className="number"><b>{oldestAge} hari</b><small>tagihan tertua</small></td>
                    <td><button className="part-detail-button" type="button" aria-expanded={expanded}>{expanded ? "Tutup" : "Lihat Invoice"} <ChevronDown className={expanded ? "rotate-chevron" : ""} size={14} /></button></td>
                  </tr>,
                  expanded && (
                    <tr className="receivable-detail-row" key={`${customer.name}-detail`}>
                      <td colSpan={7}>
                        <div className="receivable-invoices">
                          <div className="receivable-invoices-head"><strong>Detail Invoice — {customer.name}</strong><span>{customer.invoices.length} invoice belum lunas</span></div>
                          <div className="table-scroll">
                            <table className="data-table invoice-detail-table">
                              <thead><tr><th>No. Invoice</th><th>Proyek / PO</th><th className="number">Umur Tagihan</th><th className="number">Total Tagihan</th><th className="number">Terbayar</th><th className="number">Sisa</th><th>Status</th><th>Pembayaran</th><th>Part</th></tr></thead>
                              <tbody>
                                {customer.invoices.sort((a, b) => agingDays(b) - agingDays(a)).map((invoice) => {
                                  const status = agingStatus(invoice);
                                  return <tr key={invoice.id}>
                                    <td><b>{invoice.invoice_no}</b><small>{invoice.created_at ? new Date(invoice.created_at).toLocaleDateString("id-ID") : "—"}</small></td>
                                    <td><b>{invoice.project || "—"}</b><small>{invoice.po_no}</small></td>
                                    <td className="number"><b>{agingDays(invoice)} hari</b><small>{invoice.due_date ? `Tempo ${new Date(invoice.due_date).toLocaleDateString("id-ID")}` : "Tanggal tempo belum ada"}</small></td>
                                    <td className="number">{money.format(invoice.invoice_amount)}</td>
                                    <td className="number paid-cell">{money.format(invoice.amount_paid)}</td>
                                    <td className="number outstanding-cell">{money.format(Math.max(0, invoice.invoice_amount - invoice.amount_paid))}</td>
                                    <td><span className={`status ${status.toLowerCase().replaceAll(" ", "-")}`}>{status}</span></td>
                                    <td>{pendingPaymentBySale.has(invoice.id)
                                      ? <span className="payment-pending-badge"><Clock3 size={12} /> Menunggu Verifikasi</span>
                                      : canEdit && <button className="payment-confirm-button" type="button" onClick={(event) => { event.stopPropagation(); openPaymentConfirmation(invoice); }}><CheckCircle2 size={13} /> Konfirmasi</button>}
                                    </td>
                                    <td><button className="part-detail-button" type="button" onClick={(event) => { event.stopPropagation(); void openSaleDetail(invoice); }}><Eye size={13} /> Buka Detail</button></td>
                                  </tr>;
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ),
                ];
              })}
              {!outstandingCustomers.length && <tr><td colSpan={7} className="empty-state">Tidak ada tagihan customer yang belum dibayar dari transaksi ber-PO pada filter ini.</td></tr>}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );

  const renderDashboard = () => (
    <>
      <section className="welcome-strip">
        <div className="welcome-copy">
          <span className="welcome-icon"><TrendingUp size={22} /></span>
          <div>
            <p className="eyebrow">SUMMARY TRANSAKSI {selectedYear === "Semua Periode" ? "SELURUH TAHUN" : `TAHUN ${selectedYear}`}</p>
            <h2>{selectedYear === latestYear ? `Transaksi terbaru tahun ${latestYear}` : selectedYear === "Semua Periode" ? "Ringkasan seluruh transaksi" : `Ringkasan transaksi tahun ${selectedYear}`}</h2>
            <p>Hanya transaksi yang sudah memiliki PO, dari pesanan sampai pembayaran.</p>
          </div>
        </div>
        <button className="welcome-action" onClick={() => setActiveNav(summaryOverdue.length ? "Tagihan" : "Pipeline")}>
          <span><b>{summaryOverdue.length}</b> tagihan terlambat</span>
          <ArrowUpRight size={20} />
        </button>
      </section>

      <section className="kpi-grid" aria-label="Summary kinerja penjualan">
        {[
          { label: "Nilai Transaksi", value: compactMoney(summaryPipelineValue), helper: `${summaryPoCount} PO terpantau`, icon: TrendingUp, color: "#F3222B", soft: "#FDE8E9", target: "Pipeline" },
          { label: "Belum Dibayar", value: compactMoney(summaryOutstanding), helper: `${summaryInvoiceCount} invoice dari transaksi ber-PO`, icon: WalletCards, color: "#E98218", soft: "#FFF0D9", target: "Tagihan" },
          { label: "Lewat Jatuh Tempo", value: String(summaryOverdue.length), helper: "perlu segera ditindaklanjuti", icon: AlertTriangle, color: "#D91D26", soft: "#FDE8E9", target: "Tagihan" },
          { label: "Customer Aktif", value: String(summaryCustomerCount), helper: `${summaryPoCount} PO & ${summaryInvoiceCount} invoice`, icon: Users, color: "#3478E5", soft: "#E7F0FF", target: "Customer" },
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
          {summaryStages.map((stage, index) => (
            <div className="stage-fragment" key={stage.name}>
              <div className="stage-card-shell">
                <button
                  className={`stage-card ${stage.name === "PO" && canEdit ? "addable" : ""} ${stageFilter === stage.name ? "selected" : ""}`}
                  onClick={() => setStageFilter(stageFilter === stage.name ? "" : stage.name)}
                >
                  <span className="stage-icon" style={{ color: stage.color, background: stage.soft }}><stage.icon size={20} /></span>
                  <span><b>{stage.label}</b><strong>{stage.count}</strong><small>{stage.hint}</small><em style={{ color: stage.color }}>{compactMoney(stage.value)}</em></span>
                </button>
                {stage.name === "PO" && canEdit && <button className="stage-quick-add" type="button" onClick={() => openDirectPo()}><Plus size={12} /> Tambah PO</button>}
              </div>
              {index < summaryStages.length - 1 && <span className="connector" aria-hidden="true" />}
            </div>
          ))}
        </div>
      </section>

      <section className="bottom-grid">
        <article className="panel analysis-panel">
          <div className="section-head"><div><p className="eyebrow">KOMPOSISI PEKERJAAN</p><h2>Jumlah per Tahap</h2></div><span className="period-chip">{selectedYear}{selectedYear === latestYear ? " • Terbaru" : ""}</span></div>
          <div className="donut-content">
            <Donut stages={summaryStages} />
            <div className="legend">
              {summaryStages.map((stage) => <button key={stage.name} onClick={() => setStageFilter(stage.name)}><i style={{ background: stage.color }} /> <span>{stage.label}</span><b>{stage.count}</b></button>)}
            </div>
          </div>
        </article>

        <article className="panel aging-panel">
          <div className="section-head"><div><p className="eyebrow">PERLU DITINDAKLANJUTI</p><h2>Umur Tagihan</h2></div><button className="icon-button" aria-label="Muat ulang data" onClick={loadSales}><RefreshCw size={17} /></button></div>
          <InvoiceTable rows={summaryFiltered.filter((sale) => sale.invoice_no).sort((a, b) => agingDays(b) - agingDays(a)).slice(0, 7)} onSelect={openSaleDetail} />
          <button className="see-all" onClick={() => setActiveNav("Tagihan")}>Lihat Semua <ChevronRight size={16} /></button>
        </article>
      </section>
      {renderReceivableSummary()}
    </>
  );

  const renderModule = () => {
    if (activeNav === "Dashboard") return renderDashboard();
    if (activeNav === "Pipeline") return (
      <section className="module-stack">
        <div className="module-banner"><span className="banner-icon"><TrendingUp /></span><div><p className="eyebrow">PROSES PENJUALAN</p><h2>Lihat posisi setiap pekerjaan</h2><p>Pilih salah satu tahap untuk melihat pekerjaan yang sedang berada pada proses tersebut.</p></div>{canEdit && <button className="primary-button" type="button" onClick={() => openDirectPo()}><ShoppingBag size={17} /> Tambah PO Tanpa RFQ</button>}</div>
        <div className="panel pipeline-panel">
          <div className="section-head"><div><p className="eyebrow">RFQ SAMPAI LUNAS</p><h2>Alur Penjualan</h2></div></div>
          <div className="pipeline-flow">
            {stages.map((stage, index) => (
              <div className="stage-fragment" key={stage.name}>
                <div className="stage-card-shell">
                  <button className={`stage-card ${stage.name === "PO" && canEdit ? "addable" : ""} ${stageFilter === stage.name ? "selected" : ""}`} onClick={() => setStageFilter(stageFilter === stage.name ? "" : stage.name)}>
                    <span className="stage-icon" style={{ color: stage.color, background: stage.soft }}><stage.icon size={20} /></span>
                    <span><b>{stage.label}</b><strong>{stage.count}</strong><small>{stage.hint}</small><em style={{ color: stage.color }}>{compactMoney(stage.value)}</em></span>
                  </button>
                  {stage.name === "PO" && canEdit && <button className="stage-quick-add" type="button" onClick={() => openDirectPo()}><Plus size={12} /> Tambah PO</button>}
                </div>
                {index < stages.length - 1 && <span className="connector" aria-hidden="true" />}
              </div>
            ))}
          </div>
        </div>
        <SalesTable rows={filtered} onSelect={openSaleDetail} onAcceptPo={canEdit ? openDirectPo : undefined} />
      </section>
    );
    if (activeNav === "Tagihan") return (
      <section className="module-stack">
        <div className="module-banner red"><span className="banner-icon"><Clock3 /></span><div><p className="eyebrow">KONTROL TAGIHAN</p><h2>{compactMoney(outstanding)} belum diterima</h2><p>{overdue.length} invoice melewati tanggal jatuh tempo dan perlu ditindaklanjuti.</p></div></div>
        <article className="panel full-table"><div className="section-head"><div><p className="eyebrow">DAFTAR TAGIHAN</p><h2>Invoice dan Umur Tagihan</h2><p className="section-note">Satu nomor invoice ditampilkan satu kali dengan total seluruh part. Klik baris untuk melihat rinciannya.</p></div></div><InvoiceTable rows={filtered.filter((sale) => sale.invoice_no).sort((a, b) => agingDays(b) - agingDays(a))} onSelect={openSaleDetail} /></article>
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
              <button className="customer-detail-button" type="button" onClick={() => setSelectedCustomer(customer.name)}><Eye size={14} /> Lihat Detail Transaksi</button>
            </article>
          ))}
          {!customers.length && <div className="panel customer-empty">Belum ada customer pada filter ini.</div>}
        </section>
      </section>
    );
    if (activeNav === "Sparepart") {
      const summaryParts = parts.filter((part) => Number(part.selling_price) > 0 && Number(part.sold_quantity) > 0);
      const visibleParts = summaryParts.filter((part) =>
        `${part.part_number} ${part.name} ${part.category} ${part.brand} ${part.top_customer}`.toLowerCase().includes(search.toLowerCase())
      );
      return (
        <section className="module-stack">
          <div className="module-banner parts-banner">
            <span className="banner-icon"><PackageSearch /></span>
            <div><p className="eyebrow">SUMMARY SPAREPART</p><h2>{summaryParts.length} sparepart terjual</h2><p>Hanya menampilkan part dengan harga jual dan riwayat penjualan berdasarkan invoice.</p></div>
            {canEdit && <div className="banner-actions">
              <a className="secondary-button" href="/template-import-sparepart.xlsx" download><Download size={17} /> Template Excel</a>
              <input ref={sparePartFileRef} className="visually-hidden" type="file" accept=".xlsx,.xls" onChange={importSpareParts} />
              <button className="secondary-button" onClick={() => sparePartFileRef.current?.click()} disabled={saving}><Upload size={17} /> Impor Massal</button>
              <button className="primary-button" onClick={() => openPartForm()}><Plus size={17} /> Tambah Sparepart</button>
            </div>}
          </div>
          <article className="panel full-table">
            <div className="section-head"><div><p className="eyebrow">SUMMARY SPAREPART</p><h2>Penjualan per Part Number</h2></div><span className="period-chip">{visibleParts.length} item</span></div>
            <div className="table-scroll">
              <table className="data-table parts-table">
                <thead><tr><th>Part Number</th><th>Nama Spare Part</th><th className="number">Harga Jual</th><th className="number">Jumlah Terjual</th><th>Customer Pembeli Terbanyak</th><th>Aksi</th></tr></thead>
                <tbody>
                  {visibleParts.map((part) => (
                    <tr key={part.id}>
                      <td><span className="part-number">{part.part_number}</span></td>
                      <td><b>{part.name}</b><small>{[part.category, part.brand].filter(Boolean).join(" · ") || "Kategori belum diisi"}</small></td>
                      <td className="number"><strong>{money.format(part.selling_price)}</strong></td>
                      <td className="number"><strong>{Number(part.sold_quantity || 0).toLocaleString("id-ID")} {part.unit}</strong></td>
                      <td>{part.top_customer ? <><b>{part.top_customer}</b><small>{Number(part.top_customer_quantity || 0).toLocaleString("id-ID")} {part.unit} terbeli</small></> : <span className="readonly-label">Belum ada penjualan</span>}</td>
                      <td>{canEdit ? <div className="row-actions"><button aria-label={`Edit ${part.part_number}`} onClick={() => openPartForm(part)}><Pencil size={15} /></button><button className="danger" aria-label={`Nonaktifkan ${part.part_number}`} onClick={() => archivePart(part)}><Trash2 size={15} /></button></div> : <span className="readonly-label"><Eye size={13} /> Lihat saja</span>}</td>
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
    if (activeNav === "Excel") return (
      <section className="module-stack">
        <div className="module-banner excel-banner">
          <span className="banner-icon"><Database /></span>
          <div><p className="eyebrow">SUMBER DATA UTAMA</p><h2>{excelTotal} baris Excel tersinkron</h2><p>Unggah file terbaru untuk mengganti sumber utama dan menghitung ulang seluruh Summary.</p>{excelSource && <small className="excel-source-meta">{excelSource.source_file} · diperbarui {new Date(excelSource.imported_at).toLocaleString("id-ID")}</small>}</div>
          <div className="excel-source-actions">
            {canEdit && <button className="secondary-button" onClick={() => fileRef.current?.click()} disabled={saving}><Upload size={16} /> Update Sumber Excel</button>}
            <button className="primary-button" onClick={downloadUpdatedExcel} disabled={saving}><Download size={16} /> Download Excel + Summary</button>
          </div>
        </div>
        <article className="panel full-table">
          <div className="section-head"><div><p className="eyebrow">DATA RAW EXCEL</p><h2>Baris {excelRows[0]?.row_number ?? 0}–{excelRows.at(-1)?.row_number ?? 0}</h2></div><span className="period-chip">Halaman {excelPage} / {excelPages}</span></div>
          <div className="table-scroll">
            <table className="data-table excel-table">
              <thead><tr><th>Baris</th><th>Customer / Project</th><th>Dokumen</th><th>Part Number / Deskripsi</th><th className="number">Nilai</th><th>Status</th><th>Detail</th></tr></thead>
              <tbody>
                {excelRows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.row_number}</td>
                    <td><b>{row.customer || "—"}</b><small>{row.project || "Tanpa nama proyek"}</small></td>
                    <td><b>{row.invoice_no || row.po_no || row.quotation_no || row.rfq_no || "—"}</b><small>{row.invoice_no ? "Invoice" : row.po_no ? "PO" : row.quotation_no ? "Quotation" : "RFQ"}</small></td>
                    <td><b>{row.part_number || "—"}</b><small>{row.description || "Tanpa deskripsi"}</small></td>
                    <td className="number">{money.format(Number(row.amount || 0))}</td>
                    <td><span className="status stage">{row.payment_status || "—"}</span></td>
                    <td><button className="text-button" onClick={() => setSelectedExcelRow(row)}><Eye size={15} /> Lihat Semua</button></td>
                  </tr>
                ))}
                {!excelRows.length && <tr><td colSpan={7} className="empty-state">Data tidak ditemukan.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="pagination">
            <button className="secondary-button" disabled={excelPage <= 1} onClick={() => loadExcelData(excelPage - 1, search)}>Sebelumnya</button>
            <span>{excelTotal} baris data lengkap</span>
            <button className="secondary-button" disabled={excelPage >= excelPages} onClick={() => loadExcelData(excelPage + 1, search)}>Berikutnya</button>
          </div>
        </article>
      </section>
    );
    if (activeNav === "Akses" && isAdmin) return (
      <section className="module-stack">
        <div className="access-role-grid">
          <article className="access-role admin"><ShieldCheck /><div><strong>Admin</strong><p>Akses penuh, kelola data, dokumen, sparepart, pembayaran, dan pengguna.</p></div></article>
          <article className="access-role editor"><Pencil /><div><strong>Sales / Editor</strong><p>Dapat menambah dan memperbarui transaksi, sparepart, quotation, dan invoice.</p></div></article>
          <article className="access-role viewer"><Eye /><div><strong>Viewer</strong><p>Hanya melihat dashboard, customer, laporan, dan data Excel tanpa bisa mengubah.</p></div></article>
        </div>
        <div className="access-layout">
          <article className="panel access-form-panel">
            <div className="section-head"><div><p className="eyebrow">TAMBAH AKSES</p><h2>Daftarkan pengguna</h2></div></div>
            <form className="sales-form one-column" onSubmit={saveUser}>
              <label>Nama<input required value={userDraft.name} onChange={(event) => setUserDraft({ ...userDraft, name: event.target.value })} placeholder="Nama pengguna" /></label>
              <label>Email akun ChatGPT<input required type="email" value={userDraft.email} onChange={(event) => setUserDraft({ ...userDraft, email: event.target.value })} placeholder="nama@perusahaan.com" /></label>
              <label>Peran<select value={userDraft.role} onChange={(event) => setUserDraft({ ...userDraft, role: event.target.value as AppRole })}><option value="VIEWER">Viewer</option><option value="EDITOR">Sales / Editor</option><option value="ADMIN">Admin</option></select></label>
              <button className="primary-button" disabled={saving}><Plus size={16} /> Simpan Peran</button>
            </form>
            <p className="access-note">Untuk keamanan berlapis, email juga harus dimasukkan ke daftar pengunjung situs. Website tetap tidak tersedia untuk publik.</p>
          </article>
          <article className="panel full-table">
            <div className="section-head"><div><p className="eyebrow">PENGGUNA TERDAFTAR</p><h2>{users.filter((user) => user.is_active).length} akses aktif</h2></div></div>
            <div className="table-scroll">
              <table className="data-table users-table">
                <thead><tr><th>Pengguna</th><th>Peran</th><th>Status</th><th>Aksi</th></tr></thead>
                <tbody>{users.map((user) => (
                  <tr key={user.id}>
                    <td><b>{user.name || user.email}</b><small>{user.email}</small></td>
                    <td><select value={user.role} disabled={user.email === identity?.email || !user.is_active || saving} onChange={(event) => updateUser(user, { role: event.target.value as AppRole })}><option value="ADMIN">Admin</option><option value="EDITOR">Sales / Editor</option><option value="VIEWER">Viewer</option></select></td>
                    <td><span className={`status ${user.is_active ? "lunas" : "terlambat"}`}>{user.is_active ? "Aktif" : "Nonaktif"}</span></td>
                    <td><button className="text-button" disabled={user.email === identity?.email || saving} onClick={() => updateUser(user, { is_active: !user.is_active })}>{user.is_active ? "Nonaktifkan" : "Aktifkan"}</button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </article>
        </div>
      </section>
    );
    if (activeNav === "Dokumen") return (
      <section className="module-stack">
        <div className="document-actions">
          <article className="document-action-card quotation">
            <span><FileSpreadsheet /></span><div><p className="eyebrow">PENAWARAN HARGA</p><h2>Buat Quotation</h2><p>Pilih sparepart, harga jual terisi otomatis, lalu simpan dan cetak.</p></div>
            {canEdit && <button className="primary-button" onClick={() => openDocumentForm("QUOTATION")}><Plus size={17} /> Buat Quotation</button>}
          </article>
          <article className="document-action-card invoice">
            <span><ReceiptText /></span><div><p className="eyebrow">PENAGIHAN CUSTOMER</p><h2>Buat Invoice</h2><p>Buat invoice baru atau konversikan langsung dari quotation.</p></div>
            {canEdit && <button className="primary-button" onClick={() => openDocumentForm("INVOICE")}><Plus size={17} /> Buat Invoice</button>}
          </article>
        </div>
        <article className="panel full-table">
          <div className="section-head"><div><p className="eyebrow">RIWAYAT DOKUMEN</p><h2>{documents.length} dokumen tersimpan</h2></div></div>
          <div className="table-scroll">
            <table className="data-table documents-table">
              <thead><tr><th>Jenis</th><th>Nomor Dokumen</th><th>Customer / Proyek</th><th>Tanggal</th><th className="number">Total</th><th>Aksi</th></tr></thead>
              <tbody>
                {documents.map((document) => {
                  const linkedSale = document.document_type === "QUOTATION" ? sales.find((sale) => sale.quotation_no === document.document_number) : null;
                  return <tr key={document.id}>
                    <td><span className={`document-kind ${document.document_type.toLowerCase()}`}>{document.document_type === "INVOICE" ? "Invoice" : "Quotation"}</span></td>
                    <td>{document.document_type === "QUOTATION" && canEdit && !linkedSale?.po_no ? <button className="quotation-select-link" type="button" onClick={() => openPoFromQuotationDocument(document)}><b>{document.document_number}</b><small>Klik untuk terima PO</small></button> : <><b>{document.document_number}</b><small>{linkedSale?.po_no ? `PO: ${linkedSale.po_no}` : document.reference_no ? `Ref: ${document.reference_no}` : document.status}</small></>}</td>
                    <td><b>{document.customer}</b><small>{document.project || `${document.items.length} item`}</small></td>
                    <td>{document.document_date}</td>
                    <td className="number"><strong>{money.format(document.grand_total)}</strong></td>
                    <td><div className="row-actions"><button aria-label="Lihat dokumen" onClick={() => setSelectedDocument(document)}><FileText size={15} /></button><button aria-label="Cetak dokumen" onClick={() => printDocument(document)}><Printer size={15} /></button>{canEdit && document.document_type === "QUOTATION" && !linkedSale?.po_no && <button className="convert-button po-convert" onClick={() => openPoFromQuotationDocument(document)}><ShoppingBag size={13} /> PO Diterima</button>}{linkedSale?.po_no && <span className="po-linked-badge"><CheckCircle2 size={12} /> PO Diterima</span>}{canEdit && document.document_type === "QUOTATION" && <button className="convert-button" onClick={() => openDocumentForm("INVOICE", document)}>Jadi Invoice</button>}</div></td>
                  </tr>;
                })}
                {!documents.length && <tr><td colSpan={6} className="empty-state">Belum ada quotation atau invoice yang dibuat dari aplikasi.</td></tr>}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    );
    return (
      <section className="module-stack">
        <div className="module-banner green"><span className="banner-icon"><FileBarChart /></span><div><p className="eyebrow">LAPORAN PENJUALAN</p><h2>Ringkasan siap diunduh</h2><p>Unduh CSV sesuai filter atau file sumber Excel lengkap dengan Summary terbaru.</p></div><div className="report-download-actions"><button className="secondary-button" onClick={exportCsv}><Download size={17} /> Unduh CSV</button><button className="primary-button" onClick={downloadUpdatedExcel} disabled={saving}><FileSpreadsheet size={17} /> Excel + Summary</button></div></div>
        <section className="report-grid">
          <article className="panel report-card"><p>Total transaksi</p><strong>{filtered.length}</strong><span>{customers.length} customer</span></article>
          <article className="panel report-card"><p>Nilai penjualan</p><strong>{compactMoney(pipelineValue)}</strong><span>{winRate}% selesai</span></article>
          <article className="panel report-card"><p>Piutang aktif</p><strong>{compactMoney(outstanding)}</strong><span>{overdue.length} terlambat</span></article>
        </section>
        <SalesTable rows={filtered} onSelect={setSelected} onAcceptPo={canEdit ? openDirectPo : undefined} />
      </section>
    );
  };

  return (
    <main className="app-shell">
      {loading && (
        <div className="site-loading-screen" role="status" aria-live="polite" aria-label="Menyinkronkan data website">
          <div className="site-loading-card">
            <div className="site-loading-logo-wrap" aria-hidden="true">
              <span className="site-loading-orbit" />
              <span className="site-loading-orbit orbit-secondary" />
              <div className="site-loading-logo-shell">
                <img src="/mda-logo.svg" alt="" />
              </div>
            </div>
            <p>PT. MDA Amanah Sejahtera Monitoring RAB</p>
            <h2>Menyinkronkan data</h2>
            <span className="site-loading-message">Mohon tunggu, dashboard sedang diperbarui.</span>
            <span className="site-loading-progress" aria-hidden="true"><i /></span>
          </div>
        </div>
      )}
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="brand">
          <div className="brand-logo-shell">
            <img className="brand-logo" src="/mda-logo-sidebar.svg" alt="PT MDA Amanah Sejahtera" />
          </div>
          <button className="mobile-close" aria-label="Tutup menu" onClick={() => setSidebarOpen(false)}><X /></button>
        </div>
        <p className="nav-heading">MENU UTAMA</p>
        <nav aria-label="Navigasi utama">
          {navItems.filter((item) => item.id !== "Akses" || isAdmin).map((item) => <button key={item.id} className={activeNav === item.id ? "active" : ""} onClick={() => { setActiveNav(item.id); setSidebarOpen(false); }}><item.icon size={20} /><span><b>{item.label}</b><small>{item.caption}</small></span>{activeNav === item.id && <ChevronRight size={16} />}</button>)}
        </nav>
        <div className="last-update"><div><span><RefreshCw size={15} /> Update Terakhir</span><b>Sinkron otomatis</b></div><button aria-label="Sinkronkan data" onClick={loadSales}><RefreshCw size={18} /></button></div>
      </aside>
      {sidebarOpen && <button className="backdrop" aria-label="Tutup menu" onClick={() => setSidebarOpen(false)} />}

      <section className="workspace">
        <header className="topbar">
          <div className="title-wrap"><button className="menu-button" aria-label="Buka menu" onClick={() => setSidebarOpen(true)}><Menu /></button><div><p className="eyebrow">PT. MDA AMANAH SEJAHTERA MONITORING RAB</p><h1>{{ Dashboard: "Summary", Pipeline: "Proses Penjualan", Tagihan: "Kontrol Tagihan", Customer: "Data Customer", Sparepart: "Master Sparepart", Dokumen: "Quotation & Invoice", Excel: "Data Excel Lengkap", Akses: "Akses Pengguna", Laporan: "Laporan Penjualan" }[activeNav]}</h1><p className="page-description">{{ Dashboard: "Lihat penjualan ber-PO, umur tagihan, dan piutang customer.", Pipeline: "Pantau perjalanan setiap pekerjaan dari RFQ hingga lunas.", Tagihan: "Fokus pada invoice yang belum dibayar dan jatuh tempo.", Customer: "Bandingkan jumlah PO, invoice, pembayaran, dan outstanding.", Sparepart: "Kelola part number, satuan, brand, dan harga jual.", Dokumen: "Buat penawaran dan invoice itemized yang siap dicetak.", Excel: "Telusuri seluruh baris dan kolom sumber Monitoring Sales.xlsx.", Akses: "Atur peran Admin, Sales/Editor, dan Viewer.", Laporan: "Unduh dan periksa rekap penjualan sesuai filter." }[activeNav]}</p></div></div>
          <div className="top-actions">
            {activeNav !== "Akses" && activeNav !== "Excel" && (
              <label className="select-control year-control">
                <CalendarDays size={17} />
                <span>Tahun</span>
                <select value={selectedYear} onChange={(event) => setYear(event.target.value)} aria-label="Filter transaksi berdasarkan tahun">
                  {years.map((item) => <option key={item} value={item}>{item === latestYear ? `${item} (Terbaru)` : item}</option>)}
                </select>
              </label>
            )}
            {activeNav !== "Akses" && <label className="search-control"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={activeNav === "Sparepart" ? "Cari part number atau nama…" : activeNav === "Excel" ? "Cari semua data Excel…" : "Cari customer, RFQ, invoice…"} /></label>}
            {activeNav !== "Akses" && <button className="notification-button" aria-label="Notifikasi tagihan" onClick={() => setActiveNav("Tagihan")}><Bell size={20} />{overdue.length > 0 && <span>{Math.min(overdue.length, 99)}</span>}</button>}
            <div className="user-badge"><span>{identity?.name?.slice(0, 1).toUpperCase() || "U"}</span><div><b>{identity?.name || "Pengguna"}</b><small>{role === "ADMIN" ? "Admin" : role === "EDITOR" ? "Sales / Editor" : "Viewer"}</small></div></div>
            <a className="signout-link" href="/signout-with-chatgpt?return_to=%2F">Keluar</a>
            <input ref={fileRef} className="visually-hidden" type="file" accept=".xlsx,.xls" onChange={importExcel} />
            {canEdit && activeNav !== "Akses" && <button className="secondary-button desktop-import" onClick={() => fileRef.current?.click()} disabled={saving}><FileSpreadsheet size={17} /> Impor Excel</button>}
            {canEdit && activeNav !== "Akses" && <button className="primary-button" onClick={openAdd}><Plus size={18} /> Tambah Data</button>}
          </div>
        </header>

        {(stageFilter || search) && <div className="filter-row"><span>Filter aktif:</span>{stageFilter && <button onClick={() => setStageFilter("")}>{stageFilter} <X size={13} /></button>}{search && <button onClick={() => setSearch("")}>“{search}” <X size={13} /></button>}</div>}
        {canEdit && activeNav !== "Akses" && <div className="mobile-import"><button className="secondary-button" onClick={() => fileRef.current?.click()}><FileSpreadsheet size={17} /> Impor Excel</button></div>}
        <div className={`content ${loading ? "loading" : ""}`}>{renderModule()}</div>
      </section>

      {notice && <div className="toast" role="status">{notice}</div>}

      {pendingExcelImport && (
        <div className="modal-backdrop" onMouseDown={() => !saving && setPendingExcelImport(null)}>
          <section className="modal excel-import-modal" role="dialog" aria-modal="true" aria-labelledby="excel-import-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head"><div><p className="eyebrow">UPDATE SUMBER DATA UTAMA</p><h2 id="excel-import-title">Konfirmasi file Excel baru</h2><p>{pendingExcelImport.source_file}</p></div><button className="icon-button" onClick={() => setPendingExcelImport(null)} aria-label="Tutup"><X /></button></div>
            <div className="excel-import-overview">
              <div><span>Baris RAW</span><strong>{pendingExcelImport.rows.length}</strong></div>
              <div><span>Transaksi terhitung</span><strong>{pendingExcelImport.records.length}</strong></div>
            </div>
            <div className="excel-import-warning"><AlertTriangle size={20} /><div><b>File ini akan menggantikan sumber Excel utama</b><p>Data Excel sebelumnya diganti, lalu Summary, customer, piutang, dan pipeline dihitung ulang. Data manual tetap dipertahankan.</p></div></div>
            <div className="form-actions"><button className="secondary-button" disabled={saving} onClick={() => setPendingExcelImport(null)}>Batal</button><button className="primary-button" disabled={saving} onClick={confirmExcelImport}><Upload size={16} /> {saving ? "Memperbarui…" : "Ganti Sumber & Update Summary"}</button></div>
          </section>
        </div>
      )}

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

      {showDirectPo && (
        <div className="modal-backdrop" onMouseDown={() => !saving && setShowDirectPo(false)}>
          <section className="modal direct-po-modal" role="dialog" aria-modal="true" aria-labelledby="direct-po-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head"><div><p className="eyebrow">{directPoSource ? "QUOTATION MENJADI PO" : "PO CUSTOMER LANGSUNG"}</p><h2 id="direct-po-title">{directPoSource ? "Konfirmasi PO Diterima" : "Tambah PO Baru Tanpa RFQ"}</h2><p>{directPoSource ? `Quotation ${directPoSource.quotation_no} · ${directPoSource.customer}` : "Catat PO customer beserta seluruh detail produk yang ditransaksikan."}</p></div><button className="icon-button" onClick={() => setShowDirectPo(false)} aria-label="Tutup"><X /></button></div>
            <div className="direct-po-note"><ShoppingBag size={20} /><div><b>Transaksi langsung masuk tahap PO Diterima</b><span>{directPoSource ? "Data customer dan produk disalin dari quotation; lengkapi nomor PO customer." : "RFQ dan quotation dikosongkan, sementara detail produk disimpan bersama PO."}</span></div></div>
            <form onSubmit={submitDirectPo} className="document-form direct-po-form">
              {directPoSource ? <section className="quotation-po-summary">
                <label className="quotation-po-number">Nomor PO Customer<input autoFocus required value={directPoDraft.po_no} onChange={(event) => setDirectPoDraft({ ...directPoDraft, po_no: event.target.value })} placeholder="Masukkan nomor PO yang diterima" /></label>
                <dl><div><dt>Quotation</dt><dd>{directPoSource.quotation_no}</dd></div><div><dt>Customer</dt><dd>{directPoDraft.customer}</dd></div><div><dt>Proyek</dt><dd>{directPoDraft.project || "—"}</dd></div><div><dt>Lokasi</dt><dd>{directPoDraft.location || "—"}</dd></div></dl>
              </section> : <section className="document-meta">
                <label>Customer<input required list="direct-po-customers" value={directPoDraft.customer} onChange={(event) => setDirectPoDraft({ ...directPoDraft, customer: event.target.value })} placeholder="Pilih atau ketik nama customer" /><datalist id="direct-po-customers">{customers.map((customer) => <option key={customer.name} value={customer.name} />)}</datalist></label>
                <label>No. PO Customer<input required value={directPoDraft.po_no} onChange={(event) => setDirectPoDraft({ ...directPoDraft, po_no: event.target.value })} placeholder="Nomor PO customer" /></label>
                <label>Jenis transaksi<select value={directPoDraft.transaction_type} onChange={(event) => setDirectPoDraft({ ...directPoDraft, transaction_type: event.target.value })}><option>Trading Part</option><option>Jasa</option><option>Pengadaan</option><option>Project</option></select></label>
                <label>Lokasi<input value={directPoDraft.location} onChange={(event) => setDirectPoDraft({ ...directPoDraft, location: event.target.value })} placeholder="Kota / site" /></label>
                <label className="wide">Proyek / Kebutuhan<input required value={directPoDraft.project} onChange={(event) => setDirectPoDraft({ ...directPoDraft, project: event.target.value })} placeholder="Nama proyek atau kebutuhan customer" /></label>
              </section>}
              <section className="line-items direct-po-items">
                <div className="line-items-head"><div><p className="eyebrow">DETAIL PRODUK PO</p><h3>{directPoSource ? "Data transaksi dari quotation" : "Part, jumlah, dan harga transaksi"}</h3></div>{!directPoSource && <button type="button" className="secondary-button" onClick={() => setDirectPoItems((current) => [...current, newLine()])}><Plus size={15} /> Tambah Baris</button>}</div>
                {directPoSource ? <div className="table-scroll"><table className="data-table quotation-po-items"><thead><tr><th>Part Number / Deskripsi</th><th className="number">QTY</th><th>Satuan</th><th className="number">Harga</th><th className="number">Jumlah</th></tr></thead><tbody>{directPoItems.map((item) => <tr key={item.key}><td><b>{item.part_number || "—"}</b><small>{item.description}</small></td><td className="number">{item.quantity}</td><td>{item.unit}</td><td className="number">{money.format(item.unit_price)}</td><td className="number"><strong>{money.format(item.quantity * item.unit_price)}</strong></td></tr>)}</tbody></table></div> : directPoItems.map((item, index) => (
                  <div className="line-item" key={item.key}>
                    <span className="line-number">{index + 1}</span>
                    <label className="part-select">Pilih Sparepart<select value={item.spare_part_id ?? ""} onChange={(event) => selectPartForDirectPo(item.key, event.target.value)}><option value="">Item manual</option>{parts.map((part) => <option key={part.id} value={part.id}>{part.part_number} — {part.name}</option>)}</select></label>
                    <label>Part Number<input value={item.part_number} onChange={(event) => updateDirectPoLine(item.key, { part_number: event.target.value.toUpperCase() })} /></label>
                    <label className="description">Deskripsi<input required value={item.description} onChange={(event) => updateDirectPoLine(item.key, { description: event.target.value })} /></label>
                    <label>QTY<input required type="number" min="0.01" step="0.01" value={item.quantity} onChange={(event) => updateDirectPoLine(item.key, { quantity: Number(event.target.value) })} /></label>
                    <label>Satuan<input value={item.unit} onChange={(event) => updateDirectPoLine(item.key, { unit: event.target.value })} /></label>
                    <label>Harga<input required type="number" min="0" step="0.01" value={item.unit_price} onChange={(event) => updateDirectPoLine(item.key, { unit_price: Number(event.target.value) })} /></label>
                    <div className="line-total"><span>Jumlah</span><strong>{money.format(item.quantity * item.unit_price)}</strong></div>
                    <button type="button" className="remove-line" aria-label={`Hapus item ${index + 1}`} disabled={directPoItems.length === 1} onClick={() => setDirectPoItems((current) => current.filter((line) => line.key !== item.key))}><Trash2 size={16} /></button>
                  </div>
                ))}
              </section>
              <div className={`document-footer-form ${directPoSource ? "quotation-po-footer" : ""}`}>{!directPoSource && <label>Catatan<textarea value={directPoDraft.notes} onChange={(event) => setDirectPoDraft({ ...directPoDraft, notes: event.target.value })} placeholder="PIC, jadwal pengiriman, atau informasi penting lainnya" /></label>}<div className="document-totals"><div className="grand-total"><span>Total Nilai PO</span><strong>{money.format(directPoTotal)}</strong></div></div></div>
              <div className="form-actions"><button type="button" className="secondary-button" disabled={saving} onClick={() => setShowDirectPo(false)}>Batal</button><button className="primary-button" disabled={saving}><ShoppingBag size={16} /> {saving ? "Menyimpan…" : directPoSource ? "Simpan PO Diterima" : "Simpan PO Baru"}</button></div>
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

      {selectedExcelRow && (
        <div className="modal-backdrop" onMouseDown={() => setSelectedExcelRow(null)}>
          <section className="modal excel-detail-modal" role="dialog" aria-modal="true" aria-labelledby="excel-detail-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div><p className="eyebrow">BARIS {selectedExcelRow.row_number} — MONITORING SALES.XLSX</p><h2 id="excel-detail-title">{selectedExcelRow.customer || "Data Excel"}</h2><p>{selectedExcelRow.project || "Seluruh kolom sumber ditampilkan di bawah."}</p></div>
              <button className="icon-button" onClick={() => setSelectedExcelRow(null)} aria-label="Tutup"><X /></button>
            </div>
            <div className="excel-detail-grid">
              {Object.entries(selectedExcelRow.raw).filter(([, value]) => value !== "" && value !== null).map(([key, value]) => (
                <div key={key}><span>{key.replaceAll("_", " ")}</span><strong>{typeof value === "number" && /(price|amount|payment_difference|invoice_dpp|invoice_ppn|invoice_pph23|total_ar)$/.test(key) ? money.format(value) : String(value)}</strong></div>
              ))}
            </div>
          </section>
        </div>
      )}

      {selectedCustomer && (
        <div className="modal-backdrop" onMouseDown={() => setSelectedCustomer(null)}>
          <section className="modal customer-detail-modal" role="dialog" aria-modal="true" aria-labelledby="customer-detail-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div><p className="eyebrow">DETAIL TRANSAKSI CUSTOMER</p><h2 id="customer-detail-title">{selectedCustomer}</h2><p>{filtered.filter((sale) => sale.customer.trim() === selectedCustomer).length} transaksi pada periode dan filter aktif.</p></div>
              <button className="icon-button" onClick={() => setSelectedCustomer(null)} aria-label="Tutup"><X /></button>
            </div>
            <div className="table-scroll customer-transaction-scroll">
              <table className="data-table customer-transaction-table">
                <thead><tr><th>Proyek / Jenis</th><th>Dokumen</th><th className="number">Nilai Invoice</th><th className="number">Terbayar</th><th>Status</th><th>Aksi</th></tr></thead>
                <tbody>
                  {filtered.filter((sale) => sale.customer.trim() === selectedCustomer).map((sale) => (
                    <tr key={sale.id}>
                      <td><b>{sale.project || "Tanpa proyek"}</b><small>{sale.transaction_type || "Jenis transaksi belum diisi"}{sale.location ? ` · ${sale.location}` : ""}</small></td>
                      <td><b>{sale.invoice_no || sale.po_no || sale.quotation_no || sale.rfq_no || "—"}</b><small>{sale.invoice_no ? "Invoice" : sale.po_no ? "PO" : sale.quotation_no ? "Quotation" : sale.rfq_no ? "RFQ" : "Belum ada dokumen"}</small></td>
                      <td className="number">{money.format(Number(sale.invoice_amount || 0))}</td>
                      <td className="number">{money.format(Number(sale.amount_paid || 0))}</td>
                      <td><span className={`status ${stageOf(sale) === "Payment" ? "paid" : "stage"}`}>{sale.payment_status || stageOf(sale)}</span></td>
                      <td><div className="customer-transaction-actions"><button className="part-detail-button" type="button" onClick={() => void openSaleDetail(sale)}><Eye size={13} /> Detail</button>{canEdit && sale.quotation_no && !sale.po_no && <button className="part-detail-button po" type="button" onClick={() => openDirectPo(sale)}><ShoppingBag size={13} /> PO Diterima</button>}{isAdmin && <button className="part-detail-button edit" type="button" onClick={() => openTransactionEdit(sale)}><Pencil size={13} /> Edit</button>}</div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {editingSale && isAdmin && (
        <div className="modal-backdrop" onMouseDown={() => !saving && setEditingSale(null)}>
          <section className="modal transaction-edit-modal" role="dialog" aria-modal="true" aria-labelledby="transaction-edit-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head"><div><p className="eyebrow">EDIT TRANSAKSI · ADMIN</p><h2 id="transaction-edit-title">Perbarui transaksi customer</h2><p>{editingSale.customer} · {editingSale.invoice_no || editingSale.po_no || editingSale.project}</p></div><button className="icon-button" onClick={() => setEditingSale(null)} aria-label="Tutup"><X /></button></div>
            <form onSubmit={saveTransactionEdit} className="sales-form transaction-edit-form">
              <label className="wide">Customer<input required value={editSaleDraft.customer} onChange={(event) => setEditSaleDraft({ ...editSaleDraft, customer: event.target.value })} /></label>
              <label>Lokasi<input value={editSaleDraft.location} onChange={(event) => setEditSaleDraft({ ...editSaleDraft, location: event.target.value })} /></label>
              <label>Jenis transaksi<select value={editSaleDraft.transaction_type} onChange={(event) => setEditSaleDraft({ ...editSaleDraft, transaction_type: event.target.value })}><option>Trading Part</option><option>Jasa</option><option>Pengadaan</option><option>Project</option></select></label>
              <label className="wide">Proyek<input value={editSaleDraft.project} onChange={(event) => setEditSaleDraft({ ...editSaleDraft, project: event.target.value })} /></label>
              <label>No. RFQ<input value={editSaleDraft.rfq_no} onChange={(event) => setEditSaleDraft({ ...editSaleDraft, rfq_no: event.target.value })} /></label>
              <label>No. Quotation<input value={editSaleDraft.quotation_no} onChange={(event) => setEditSaleDraft({ ...editSaleDraft, quotation_no: event.target.value })} /></label>
              <label>No. PO<input value={editSaleDraft.po_no} onChange={(event) => setEditSaleDraft({ ...editSaleDraft, po_no: event.target.value })} /></label>
              <label>No. Surat Jalan<input value={editSaleDraft.delivery_no} onChange={(event) => setEditSaleDraft({ ...editSaleDraft, delivery_no: event.target.value })} /></label>
              <label>No. Invoice<input value={editSaleDraft.invoice_no} onChange={(event) => setEditSaleDraft({ ...editSaleDraft, invoice_no: event.target.value })} /></label>
              <label>Nilai Invoice<input type="number" min="0" step="0.01" value={editSaleDraft.invoice_amount} onChange={(event) => setEditSaleDraft({ ...editSaleDraft, invoice_amount: Number(event.target.value) })} /></label>
              <label>Nominal Terbayar<input type="number" min="0" max={Math.max(0, editSaleDraft.invoice_amount)} step="0.01" value={editSaleDraft.amount_paid} onChange={(event) => setEditSaleDraft({ ...editSaleDraft, amount_paid: Number(event.target.value) })} /></label>
              <label>Jatuh Tempo<input type="date" value={editSaleDraft.due_date} onChange={(event) => setEditSaleDraft({ ...editSaleDraft, due_date: event.target.value })} /></label>
              <label>Tanggal Pembayaran<input type="date" value={editSaleDraft.payment_date} onChange={(event) => setEditSaleDraft({ ...editSaleDraft, payment_date: event.target.value })} /></label>
              <label>Status Pembayaran<select value={editSaleDraft.payment_status} onChange={(event) => setEditSaleDraft({ ...editSaleDraft, payment_status: event.target.value })}><option value="OPEN">OPEN</option><option value="CLOSED">CLOSED</option></select></label>
              <label>Status Transaksi<input value={editSaleDraft.transaction_status} onChange={(event) => setEditSaleDraft({ ...editSaleDraft, transaction_status: event.target.value })} placeholder="Open, Done Invoice, Closed…" /></label>
              <label className="wide">Catatan<textarea value={editSaleDraft.notes} onChange={(event) => setEditSaleDraft({ ...editSaleDraft, notes: event.target.value })} /></label>
              <div className="form-actions wide"><button type="button" className="secondary-button" onClick={() => setEditingSale(null)}>Batal</button><button className="primary-button" disabled={saving}>{saving ? "Menyimpan…" : "Simpan Perubahan"}</button></div>
            </form>
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
            {(selected.invoice_no || selected.po_no) && (
              <section className="part-detail-section">
                <div className="part-detail-head">
                  <div>
                    <p className="eyebrow">LAMPIRAN DETAIL</p>
                    <h3>{selectedPartsLoading ? "Memuat part…" : `${selectedParts.length} part dalam dokumen`}</h3>
                  </div>
                  <strong>{money.format(selected.invoice_amount)}</strong>
                </div>
                {!selectedPartsLoading && selectedParts.length > 0 && (
                  <div className="table-scroll">
                    <table className="data-table detail-parts-table">
                      <thead><tr><th>Part Number / Deskripsi</th><th>QTY</th><th>Satuan</th><th>Nilai Part</th><th>Detail</th></tr></thead>
                      <tbody>
                        {selectedParts.map((part) => {
                          const prefix = selected.invoice_no ? "invoice" : "po";
                          const partNumber = part.raw[`${prefix}_part_number`] || part.part_number || "—";
                          const description = part.raw[`${prefix}_description`] || part.description || "—";
                          const quantity = part.raw[`${prefix}_qty`] || "—";
                          const unit = part.raw[`${prefix}_uom`] || "—";
                          return (
                            <tr key={part.id}>
                              <td><b>{String(partNumber)}</b><small>{String(description)}</small></td>
                              <td>{String(quantity)}</td>
                              <td>{String(unit)}</td>
                              <td className="number">{money.format(Number(part.amount || 0))}</td>
                              <td><button className="part-detail-button" onClick={() => setSelectedExcelRow(part)}><Eye size={14} /> Buka</button></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                {!selectedPartsLoading && !selectedParts.length && <p className="part-empty">Belum ada rincian part dari sumber Excel untuk dokumen ini.</p>}
              </section>
            )}
            <div className="form-actions">
              {canEdit && selected.quotation_no && !selected.po_no && <button className="primary-button" disabled={saving} onClick={() => openDirectPo(selected)}><ShoppingBag size={17} /> PO Diterima</button>}
              {pendingPaymentBySale.has(selected.id)
                ? <span className="payment-pending-badge"><Clock3 size={13} /> Pembayaran menunggu verifikasi Admin</span>
                : canEdit && stageOf(selected) !== "Payment" && selected.invoice_no && <button className="primary-button" disabled={saving} onClick={() => openPaymentConfirmation(selected)}><CheckCircle2 size={17} /> Konfirmasi Pembayaran</button>}
              <button className="secondary-button" onClick={() => setSelected(null)}>Tutup</button>
            </div>
          </section>
        </div>
      )}

      {paymentTarget && (
        <div className="modal-backdrop" onMouseDown={() => !saving && setPaymentTarget(null)}>
          <section className="modal payment-modal" role="dialog" aria-modal="true" aria-labelledby="payment-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head"><div><p className="eyebrow">KONFIRMASI PEMBAYARAN</p><h2 id="payment-title">Ajukan pembayaran invoice</h2><p>{paymentTarget.customer} · {paymentTarget.invoice_no}</p></div><button className="icon-button" onClick={() => setPaymentTarget(null)} aria-label="Tutup"><X /></button></div>
            <div className="payment-invoice-summary"><span>Sisa tagihan</span><strong>{money.format(Math.max(0, paymentTarget.invoice_amount - paymentTarget.amount_paid))}</strong></div>
            <form className="payment-form" onSubmit={submitPaymentConfirmation}>
              <label>Nominal pembayaran<input required type="number" min="1" max={Math.max(0, paymentTarget.invoice_amount - paymentTarget.amount_paid)} step="0.01" value={paymentDraft.amount} onChange={(event) => setPaymentDraft({ ...paymentDraft, amount: Number(event.target.value) })} /></label>
              <label>Tanggal pembayaran<input required type="date" value={paymentDraft.payment_date} onChange={(event) => setPaymentDraft({ ...paymentDraft, payment_date: event.target.value })} /></label>
              <label className="wide">Nomor referensi / bukti transfer<input value={paymentDraft.reference_no} maxLength={100} onChange={(event) => setPaymentDraft({ ...paymentDraft, reference_no: event.target.value })} placeholder="Contoh: TRX-20260810-001" /></label>
              <label className="wide">Catatan<textarea value={paymentDraft.notes} maxLength={500} onChange={(event) => setPaymentDraft({ ...paymentDraft, notes: event.target.value })} placeholder="Tambahkan keterangan pembayaran bila diperlukan" /></label>
              <div className="payment-flow-note wide"><ShieldCheck size={18} /><span><b>Memerlukan verifikasi Admin</b><small>Summary baru diperbarui setelah pembayaran disetujui.</small></span></div>
              <div className="form-actions wide"><button type="button" className="secondary-button" onClick={() => setPaymentTarget(null)}>Batal</button><button className="primary-button" disabled={saving}><Send size={16} /> {saving ? "Mengirim…" : "Kirim Konfirmasi"}</button></div>
            </form>
          </section>
        </div>
      )}

      {verificationTarget && (
        <div className="modal-backdrop" onMouseDown={() => !saving && setVerificationTarget(null)}>
          <section className="modal verification-modal" role="dialog" aria-modal="true" aria-labelledby="verification-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head"><div><p className="eyebrow">VERIFIKASI ADMIN</p><h2 id="verification-title">Periksa konfirmasi pembayaran</h2><p>{verificationTarget.customer} · {verificationTarget.invoice_no}</p></div><button className="icon-button" onClick={() => setVerificationTarget(null)} aria-label="Tutup"><X /></button></div>
            <dl className="verification-detail">
              <div><dt>Nominal</dt><dd>{money.format(verificationTarget.amount)}</dd></div><div><dt>Tanggal Bayar</dt><dd>{new Date(verificationTarget.payment_date).toLocaleDateString("id-ID")}</dd></div>
              <div><dt>Referensi</dt><dd>{verificationTarget.reference_no || "—"}</dd></div><div><dt>Diajukan Oleh</dt><dd>{verificationTarget.requested_by_name || verificationTarget.requested_by_email}</dd></div>
              <div className="wide"><dt>Catatan Pengaju</dt><dd>{verificationTarget.notes || "Tidak ada catatan."}</dd></div>
            </dl>
            <label className="verification-notes">Catatan verifikasi<textarea value={reviewNotes} maxLength={500} onChange={(event) => setReviewNotes(event.target.value)} placeholder="Alasan penolakan atau catatan pemeriksaan (opsional)" /></label>
            <div className="verification-actions"><button className="reject-button" disabled={saving} onClick={() => verifyPayment("reject")}><X size={16} /> Tolak</button><button className="approve-button" disabled={saving} onClick={() => verifyPayment("approve")}><CheckCircle2 size={16} /> Setujui & Perbarui Summary</button></div>
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
        <div className="print-brand">
          <img src="/mda-logo.svg" alt="PT MDA Amanah Sejahtera" />
        </div>
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
        <thead><tr><th>Customer</th><th>No. Invoice</th><th>Total Tagihan</th><th>Aging</th><th>Status</th></tr></thead>
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

function SalesTable({ rows, onSelect, onAcceptPo }: { rows: Sale[]; onSelect: (sale: Sale) => void; onAcceptPo?: (sale: Sale) => void }) {
  return (
    <article className="panel full-table">
      <div className="section-head"><div><p className="eyebrow">DATA TRANSAKSI</p><h2>{rows.length} dokumen terpantau</h2><p className="section-note">Nomor PO atau invoice yang sama diringkas menjadi satu total. Klik untuk membuka rincian part.</p></div></div>
      <div className="table-scroll"><table className="data-table sales-table"><thead><tr><th>Customer / Project</th><th>RFQ</th><th>Quotation</th><th>PO</th><th>Invoice</th><th>Total Transaksi</th><th>Tahap</th><th>Aksi</th></tr></thead><tbody>
        {rows.map((sale) => <tr key={sale.id} tabIndex={0} onClick={() => onSelect(sale)} onKeyDown={(event) => event.key === "Enter" && onSelect(sale)}><td><b>{sale.customer}</b><small>{sale.project}</small></td><td>{sale.rfq_no || "—"}</td><td>{sale.quotation_no || "—"}</td><td>{sale.po_no || "—"}</td><td>{sale.invoice_no || "—"}</td><td className="number">{money.format(sale.invoice_amount)}</td><td><span className="status stage">{stageOf(sale)}</span></td><td>{onAcceptPo && sale.quotation_no && !sale.po_no ? <button className="part-detail-button po" type="button" onClick={(event) => { event.stopPropagation(); onAcceptPo(sale); }}><ShoppingBag size={13} /> PO Diterima</button> : <button className="part-detail-button" type="button" onClick={(event) => { event.stopPropagation(); onSelect(sale); }}><Eye size={13} /> Detail</button>}</td></tr>)}
      </tbody></table></div>
    </article>
  );
}
