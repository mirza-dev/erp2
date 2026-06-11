"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
    ArrowLeft,
    CheckCircle2,
    Download,
    Eye,
    FileSpreadsheet,
    GitMerge,
    Rows3,
    ShieldCheck,
    Table2,
    Upload,
} from "lucide-react";
import { invalidateAllData } from "@/lib/data-context";
import * as XLSX from "xlsx";
import { useIsDemo, DEMO_DISABLED_TOOLTIP, DEMO_BLOCK_TOAST } from "@/lib/demo-utils";
import { useToast } from "@/components/ui/Toast";
import { IMPORT_FIELDS, REQUIRED_FIELDS } from "@/lib/import-fields";
import { stashImportFile, takeImportFile } from "@/lib/import-file-transfer";
import {
    detectSheetEntityType,
    EXCEL_IMPORT_TEMPLATES,
    FINANCIAL_IMPORT_FIELDS,
    type ClassicImportEntityType,
    type ImportFieldApproval,
} from "@/lib/import-center";

// Excel/CSV toplu aktarım sihirbazı — kendi sayfası (2026-06-10 sadeleştirme).
// Önceden /dashboard/import içinde <details> accordion'daydı; hub artık
// dosya-önce yönlendirme yapar: Excel uzantısı buraya, PDF/görsel AI akışına.
// Hub'dan gelen dosya import-file-transfer singleton'ı ile taşınır; sayfa
// doğrudan açılırsa kendi dosya seçicisi gösterilir.

type ImportState = "idle" | "analyzing" | "sheet_select" | "column_mapping" | "preview" | "importing" | "done";

// ─── Sheet info derived from actual file ─────────────────────────────────────
interface SheetInfo {
    name: string;
    displayName: string;
    rows: number;
    entity: string;
    entityType: "customer" | "product" | "vendor" | "order" | "order_line" | "stock" | "quote" | "shipment" | "invoice" | "payment" | null;
    status: "importable" | "unsupported";
    selected: boolean;
    headers: string[];
    previewRows: Array<Record<string, string>>;
    allRows: Array<Record<string, string>>;
}

interface ColumnMapping {
    source_column: string;
    target_field: string | null;   // null or "skip" = skip this column
    confidence: number;
    source: "memory" | "ai" | "fallback" | "user";
}

interface DraftRow {
    id: string;
    batch_id: string;
    entity_type: string;
    raw_data: Record<string, unknown> | null;
    parsed_data: Record<string, unknown> | null;
    confidence: number | null;
    ai_reason: string | null;
    unmatched_fields: string[] | null;
    status: string;
    user_corrections?: Record<string, unknown> | null;
    sheet_name?: string | null;
    row_number?: number | null;
    match_status?: string | null;
    match_confidence?: number | null;
    risk_flags?: string[] | null;
    field_approvals?: Record<string, ImportFieldApproval> | null;
    row_errors?: string[] | null;
}

// ERP_FIELDS alias for backward compat with references in this file
const ERP_FIELDS = IMPORT_FIELDS;

// Known sheet → entity type mapping
const SHEET_ENTITY_MAP: Record<string, { entityType: "customer" | "product" | "vendor" | "order" | "order_line" | "stock" | "quote" | "shipment" | "invoice" | "payment"; displayName: string; entity: string; status: "importable" }> = {
    Urunler: { entityType: "product", displayName: "Ürünler", entity: "Ürünler", status: "importable" },
    Musteriler: { entityType: "customer", displayName: "Müşteriler", entity: "Müşteriler", status: "importable" },
    Tedarikciler: { entityType: "vendor", displayName: "Tedarikçiler", entity: "Tedarikçiler", status: "importable" },
    "Tedarikçiler": { entityType: "vendor", displayName: "Tedarikçiler", entity: "Tedarikçiler", status: "importable" },
    Tedarikci_Urunleri: { entityType: "product", displayName: "Tedarikçi Ürün İlişkileri", entity: "Tedarikçi Ürün İlişkileri", status: "importable" },
    "Tedarikçi_Ürünleri": { entityType: "product", displayName: "Tedarikçi Ürün İlişkileri", entity: "Tedarikçi Ürün İlişkileri", status: "importable" },
    Stok_Sayimi: { entityType: "stock", displayName: "Stok Sayımı", entity: "Stok Sayımı", status: "importable" },
    "Stok_Sayımı": { entityType: "stock", displayName: "Stok Sayımı", entity: "Stok Sayımı", status: "importable" },
    Stok_Hareketleri: { entityType: "stock", displayName: "Stok Hareketleri", entity: "Stok Hareketleri", status: "importable" },
    Teklifler: { entityType: "quote", displayName: "Teklifler", entity: "Teklifler", status: "importable" },
    Siparisler: { entityType: "order", displayName: "Siparişler", entity: "Siparişler", status: "importable" },
    Siparis_Kalemleri: { entityType: "order_line", displayName: "Sipariş Kalemleri", entity: "Sipariş Kalemleri", status: "importable" },
    Sevkiyatlar: { entityType: "shipment", displayName: "Sevkiyatlar", entity: "Sevkiyatlar", status: "importable" },
    Faturalar: { entityType: "invoice", displayName: "Faturalar", entity: "Faturalar", status: "importable" },
    Tahsilatlar: { entityType: "payment", displayName: "Tahsilatlar", entity: "Tahsilatlar", status: "importable" },
    Stok: { entityType: "stock", displayName: "Stok", entity: "Stok Güncellemesi", status: "importable" },
};

const CLASSIC_ENTITY_LABELS: Record<ClassicImportEntityType, string> = {
    product: "Ürünler",
    customer: "Müşteriler",
    vendor: "Tedarikçiler",
    stock: "Stok",
};

const entityTypeLabels: Record<string, string> = {
    customer: "Müşteriler", product: "Ürünler", vendor: "Tedarikçiler", quote: "Teklifler",
    order: "Siparişler", order_line: "Sipariş Kalemleri", shipment: "Sevkiyatlar",
    invoice: "Faturalar", payment: "Tahsilatlar", stock: "Stok",
};

// ─── Stok operasyon seçimi (sayım vs hareket) ───────────────────────────────
// İşlem Türü ızgarası kalktığı için stok sheet'lerinin sayım/hareket ayrımı
// artık burada, sheet seçim adımında yapılır. Sunucu (apply-mappings) sheet
// adından da çıkarır; explicit gönderim isim-çıkarımını yener.
export type StockOperationType = "stock_count" | "stock_movement";

export function inferStockOpFromSheetName(name: string): StockOperationType | null {
    const normalized = name
        .toLocaleLowerCase("tr-TR")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/ı/g, "i");
    if (/(sayim|sayimi|count)/.test(normalized)) return "stock_count";
    if (/(hareket|movement|giris|cikis|transfer)/.test(normalized)) return "stock_movement";
    return null;
}

const STOCK_OP_META: Record<StockOperationType, { label: string; hint: string }> = {
    stock_count: { label: "Sayım", hint: "Mevcut stok miktarını dosyadaki değerle YAZAR" },
    stock_movement: { label: "Hareket", hint: "Dosyadaki miktarı mevcut stoğa EKLER/ÇIKARIR" },
};

// ─── Styles ────────────────────────────────────────────────────────────────
const tabBtnStyle = (active: boolean): React.CSSProperties => ({
    fontSize: "12px", padding: "5px 12px",
    border: "var(--line-width) solid " + (active ? "var(--accent-border)" : "var(--border-secondary)"),
    borderRadius: "5px",
    background: active ? "var(--accent-bg)" : "transparent",
    color: active ? "var(--accent-text)" : "var(--text-interactive-muted)",
    cursor: "pointer", whiteSpace: "nowrap",
    fontWeight: active ? 600 : "var(--font-ui-weight)",
});

export function validateFileSize(size: number): { ok: boolean; sizeMb?: string } {
    const MAX = 25 * 1024 * 1024;
    if (size > MAX) return { ok: false, sizeMb: (size / (1024 * 1024)).toFixed(1) };
    return { ok: true };
}

export function sourceChipLabel(source: string, confidence: number): string {
    if (source === "memory") return "Hafıza";
    if (source === "ai") return confidence ? `AI %${Math.round(confidence * 100)}` : "AI";
    if (source === "user") return "Kullanıcı";
    if (source === "fallback") return "Otomatik";
    return "—";
}

const sourceChipStyle = (src: "memory" | "ai" | "fallback" | "user"): React.CSSProperties => {
    const map = {
        memory: { bg: "var(--success-bg)", color: "var(--success-text)" },
        ai: { bg: "var(--accent-bg)", color: "var(--accent-text)" },
        fallback: { bg: "var(--bg-tertiary)", color: "var(--text-tertiary)" },
        user: { bg: "var(--warning-bg)", color: "var(--warning-text)" },
    };
    const s = map[src];
    return { fontSize: "10px", padding: "2px 7px", borderRadius: "10px", background: s.bg, color: s.color, whiteSpace: "nowrap" };
};

const PAGE_SIZE = 100;
const INTERNAL_IMPORT_FIELDS = new Set(["__ai_import_operation"]);

function normalizeDraftApprovals(draft: DraftRow): Record<string, ImportFieldApproval> {
    if (!draft.field_approvals || typeof draft.field_approvals !== "object") return {};
    return Object.fromEntries(
        Object.entries(draft.field_approvals)
            .filter((entry): entry is [string, ImportFieldApproval] =>
                entry[1] === "apply" || entry[1] === "skip" || entry[1] === "clear"),
    );
}

export default function ImportExcelWizardPage() {
    const router = useRouter();
    const refetchAll = invalidateAllData;
    const { toast } = useToast();
    const isDemo = useIsDemo();

    const [state, setState] = useState<ImportState>("idle");
    const [fileName, setFileName] = useState<string | null>(null);
    const [dragOver, setDragOver] = useState(false);
    const [progress, setProgress] = useState(0);
    const [progressLabel, setProgressLabel] = useState("");
    const [sheets, setSheets] = useState<SheetInfo[]>([]);
    const [activeTab, setActiveTab] = useState("");
    const [importProgress, setImportProgress] = useState<Record<string, number>>({});
    // Faz C — mevcut dolu alanların üzerine yazma (varsayılan: yalnız boş doldur)
    const [overwriteExisting, setOverwriteExisting] = useState(false);
    const [confirmResult, setConfirmResult] = useState<{
        added: number;
        updated: number;
        skipped: number;
        errors: string[];
        byEntity?: Record<string, { added: number; updated: number; skipped: number }>;
    } | null>(null);
    const [drafts, setDrafts] = useState<DraftRow[]>([]);
    const [parseError, setParseError] = useState<string | null>(null);
    const [batchId, setBatchId] = useState<string | null>(null);
    // Column mapping state — keyed by sheet name
    const [columnMappings, setColumnMappings] = useState<Record<string, ColumnMapping[]>>({});
    const [detectingColumns, setDetectingColumns] = useState(false);
    const [rememberMappings, setRememberMappings] = useState(true);
    // Stok sheet'leri için sayım/hareket seçimi — keyed by sheet name
    const [stockOps, setStockOps] = useState<Record<string, StockOperationType>>({});
    // Inline editing in preview
    const [editingCell, setEditingCell] = useState<{ draftId: string; field: string } | null>(null);
    const [editingValue, setEditingValue] = useState("");
    const [draftEdits, setDraftEdits] = useState<Record<string, Record<string, unknown>>>({});
    const [draftApprovals, setDraftApprovals] = useState<Record<string, Record<string, ImportFieldApproval>>>({});
    // Bulk fill state
    const [bulkField, setBulkField] = useState("");
    const [bulkValue, setBulkValue] = useState("");
    const [previewPage, setPreviewPage] = useState(0);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const editInputRef = useRef<HTMLInputElement>(null);
    // AI akışına kaçış için orijinal dosya referansı (parse sonrası File elde kalmaz)
    const originalFileRef = useRef<File | null>(null);

    useEffect(() => {
        editInputRef.current?.focus();
    }, [editingCell]);

    // ─── Parse Excel file client-side ─────────────────────────────────
    const parseExcelFile = useCallback((file: File) => {
        setFileName(file.name);
        setState("analyzing");
        setProgress(0);
        setProgressLabel("Dosya okunuyor…");

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                setProgress(30);
                setProgressLabel("Excel ayrıştırılıyor…");
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: "array" });
                setProgress(60);
                setProgressLabel("Sheetler analiz ediliyor...");

                const detectedSheets: SheetInfo[] = workbook.SheetNames.map(name => {
                    const worksheet = workbook.Sheets[name];
                    const jsonRows = XLSX.utils.sheet_to_json<Record<string, string>>(worksheet, { defval: "" });
                    const headers = jsonRows.length > 0 ? Object.keys(jsonRows[0]) : [];
                    const known = SHEET_ENTITY_MAP[name];
                    const detected = known ? null : detectSheetEntityType(name, headers);
                    const detectedEntity = detected?.entityType ?? null;
                    const displayName = known?.displayName
                        ?? (detectedEntity ? CLASSIC_ENTITY_LABELS[detectedEntity] : name);

                    return {
                        name, displayName,
                        rows: jsonRows.length, entity: known?.entity ?? displayName,
                        entityType: known?.entityType ?? detectedEntity,
                        status: known || detectedEntity ? "importable" : "unsupported",
                        selected: !!known || !!detectedEntity, headers,
                        previewRows: jsonRows.slice(0, 5).map(row =>
                            Object.fromEntries(Object.entries(row).map(([k, v]) => [k, String(v)]))),
                        allRows: jsonRows.map(row =>
                            Object.fromEntries(Object.entries(row).map(([k, v]) => [k, String(v)]))),
                    } satisfies SheetInfo;
                });

                setProgress(100);
                setProgressLabel("Hazır");
                setTimeout(() => {
                    setSheets(detectedSheets);
                    const firstImportable = detectedSheets.find(s => s.status === "importable");
                    if (firstImportable) setActiveTab(firstImportable.name);
                    setState("sheet_select");
                }, 300);
            } catch (err) {
                console.error("Excel parse error:", err);
                setParseError("Dosya okunamadı. Lütfen geçerli bir Excel dosyası yükleyin.");
                setState("idle");
            }
        };
        reader.onerror = () => { setParseError("Dosya okuma hatası."); setState("idle"); };
        reader.readAsArrayBuffer(file);
    }, []);

    const handleFileSelect = useCallback((file: File) => {
        const allowed = ["xlsx", "xls", "csv"];
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
        if (!allowed.includes(ext)) {
            setParseError("Desteklenmeyen dosya formatı. Lütfen .xlsx, .xls veya .csv dosyası yükleyin.");
            return;
        }
        // Sprint B G1: Browser FileReader büyük dosyalarda RAM'i şişirir, sekme donar.
        const MAX_FILE_SIZE = 25 * 1024 * 1024;
        if (file.size > MAX_FILE_SIZE) {
            const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
            const msg = `Dosya çok büyük (${sizeMb} MB). En fazla 25 MB kabul edilir; dosyayı bölerek tekrar deneyin.`;
            setParseError(msg);
            toast({ type: "error", message: msg });
            return;
        }
        originalFileRef.current = file;
        setParseError(null);
        parseExcelFile(file);
    }, [parseExcelFile, toast]);

    // Hub'dan yönlendirilen dosyayı al (singleton oku-ve-temizle).
    useEffect(() => {
        const handed = takeImportFile("excel");
        if (handed) handleFileSelect(handed);
    }, [handleFileSelect]);

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) handleFileSelect(file);
    };

    const toggleSheet = (idx: number) => {
        const sh = sheets[idx];
        if (sh.status !== "importable") return;
        setSheets(prev => prev.map((s, i) => i === idx ? { ...s, selected: !s.selected } : s));
    };

    // Bu dosya aslında AI çıkarımı gerektiriyorsa (serbest katalog vb.) hub'ın
    // AI kuyruğuna geri gönder.
    const sendToAiFlow = () => {
        const file = originalFileRef.current;
        if (!file) return;
        stashImportFile(file, "ai");
        router.push("/dashboard/import");
    };

    const effectiveStockOp = (sheetName: string): StockOperationType =>
        stockOps[sheetName] ?? inferStockOpFromSheetName(sheetName) ?? "stock_count";

    // ─── Step 1: Create batch + detect column mappings ────────────────
    const handleDetectColumns = async () => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        setState("column_mapping");
        setDetectingColumns(true);
        setParseError(null);

        try {
            // 1. Create batch
            const batchRes = await fetch("/api/import", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ file_name: fileName ?? "import.xlsx" }),
            });
            if (!batchRes.ok) throw new Error("Batch oluşturulamadı.");
            const batch = await batchRes.json();
            setBatchId(batch.id);

            // 2. Detect columns for selected sheets
            const selectedSheets = sheets.filter(s => s.status === "importable" && s.selected);
            const detectRes = await fetch(`/api/import/${batch.id}/detect-columns`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    sheets: selectedSheets.map(s => ({
                        sheet_name: s.name,
                        entity_type: s.entityType,
                        headers: s.headers,
                        sample_rows: s.previewRows,
                    })),
                }),
            });
            if (!detectRes.ok) throw new Error("Kolon algılama başarısız.");
            const detectResult = await detectRes.json() as {
                sheets: Array<{ sheet_name: string; mappings: ColumnMapping[] }>;
            };

            const mappingMap: Record<string, ColumnMapping[]> = {};
            for (const sheet of detectResult.sheets) {
                mappingMap[sheet.sheet_name] = sheet.mappings;
            }
            setColumnMappings(mappingMap);
            const firstSheet = selectedSheets[0];
            if (firstSheet) setActiveTab(firstSheet.name);
        } catch (err) {
            console.error("Detect columns failed:", err);
            setParseError(err instanceof Error ? err.message : "Kolon algılama hatası.");
            setState("sheet_select");
        } finally {
            setDetectingColumns(false);
        }
    };

    // Update a single mapping field value
    const updateMapping = (sheetName: string, colIdx: number, targetField: string | null) => {
        setColumnMappings(prev => ({
            ...prev,
            [sheetName]: prev[sheetName].map((m, i) =>
                i === colIdx ? { ...m, target_field: targetField, source: "user" } : m
            ),
        }));
    };

    // ─── Step 2: Apply mappings → create drafts → preview ────────────
    const handleApplyMappings = async () => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        if (!batchId) return;
        setParseError(null);

        try {
            const selectedSheets = sheets.filter(s => s.status === "importable" && s.selected);
            const applyRes = await fetch(`/api/import/${batchId}/apply-mappings`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    sheets: selectedSheets.map(s => ({
                        sheet_name: s.name,
                        entity_type: s.entityType,
                        mappings: (columnMappings[s.name] ?? []).map(m => ({
                            source_column: m.source_column,
                            target_field: m.target_field ?? "skip",
                        })),
                        rows: s.allRows,
                        remember: rememberMappings,
                        // Stok sheet'lerinde sayım/hareket seçimi explicit gider
                        // (sunucudaki isim-çıkarımı her dosyada tutmaz).
                        ...(s.entityType === "stock" ? { operation_type: effectiveStockOp(s.name) } : {}),
                    })),
                }),
            });
            if (!applyRes.ok) {
                const err = await applyRes.json().catch(() => ({}));
                throw new Error(err.error ?? "Eşleştirme uygulaması başarısız.");
            }
            const applyResult = await applyRes.json();
            const createdDrafts: DraftRow[] = applyResult.drafts ?? [];
            setDrafts(createdDrafts);
            setDraftApprovals(Object.fromEntries(createdDrafts.map(d => [d.id, normalizeDraftApprovals(d)])));
            const firstType = createdDrafts[0]?.entity_type;
            if (firstType) setActiveTab(firstType);
            setState("preview");
        } catch (err) {
            console.error("Apply mappings failed:", err);
            setParseError(err instanceof Error ? err.message : "Eşleştirme hatası.");
        }
    };

    // ─── Inline edit helpers ──────────────────────────────────────────
    const startEdit = (draftId: string, field: string, currentValue: unknown) => {
        setEditingCell({ draftId, field });
        setEditingValue(currentValue !== undefined && currentValue !== null ? String(currentValue) : "");
    };

    const commitEdit = async (draftId: string, field: string) => {
        setEditingCell(null);
        const prev = draftEdits[draftId] ?? {};
        const newEdits = { ...prev, [field]: editingValue };
        // Optimistic UI: kullanıcı düzeltmeyi hemen görür
        setDraftEdits(d => ({ ...d, [draftId]: newEdits }));

        // Sprint B G2: Sunucu kayıt başarısızsa kullanıcının düzeltmesi
        // sessizce kayboluyordu — confirm anında orijinal data merge'leniyordu.
        // Şimdi rollback + toast.
        try {
            const res = await fetch(`/api/import/drafts/${draftId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user_corrections: newEdits }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
        } catch {
            setDraftEdits(d => ({ ...d, [draftId]: prev })); // rollback
            toast({ type: "error", message: "Düzeltme kaydedilemedi — tekrar deneyin." });
        }
    };

    const getEffectiveValue = (draft: DraftRow, field: string): unknown => {
        const corrections = draftEdits[draft.id];
        if (corrections && field in corrections) return corrections[field];
        const parsed = (draft.parsed_data ?? {}) as Record<string, unknown>;
        return parsed[field];
    };

    const getFieldApproval = (draft: DraftRow, field: string): ImportFieldApproval => {
        return draftApprovals[draft.id]?.[field] ?? normalizeDraftApprovals(draft)[field] ?? "apply";
    };

    const setFieldApproval = async (draft: DraftRow, field: string, approval: ImportFieldApproval) => {
        const prev = draftApprovals[draft.id] ?? normalizeDraftApprovals(draft);
        const next = { ...prev, [field]: approval };
        setDraftApprovals(current => ({ ...current, [draft.id]: next }));
        try {
            const res = await fetch(`/api/import/drafts/${draft.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ field_approvals: next }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
        } catch {
            setDraftApprovals(current => ({ ...current, [draft.id]: prev }));
            toast({ type: "error", message: "Alan onayı kaydedilemedi — tekrar deneyin." });
        }
    };

    // ─── Import (confirm) step ────────────────────────────────────────
    const handleImport = async () => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        if (!batchId) return;
        setState("importing");

        const selectedSheets = sheets.filter(s => s.status === "importable" && s.selected);
        const init: Record<string, number> = {};
        selectedSheets.forEach(s => (init[s.name] = 0));
        setImportProgress(init);

        const steps: Record<string, number> = {};
        selectedSheets.forEach(s => { steps[s.name] = Math.max(1, s.rows / 40); });

        let ticker: ReturnType<typeof setInterval> | null = setInterval(() => {
            setImportProgress(prev => {
                const next = { ...prev };
                selectedSheets.forEach(s => {
                    const ceiling = s.rows * 0.9;
                    next[s.name] = Math.min((next[s.name] ?? 0) + steps[s.name], ceiling);
                });
                return next;
            });
        }, 100);

        try {
            const confirmRes = await fetch(`/api/import/${batchId}/confirm`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ overwrite: overwriteExisting }),
            });
            clearInterval(ticker); ticker = null;

            const done: Record<string, number> = {};
            selectedSheets.forEach(s => (done[s.name] = s.rows));
            setImportProgress(done);

            if (confirmRes.ok) {
                const result = await confirmRes.json();
                setConfirmResult(result);
            } else {
                let errMsg = `Sunucu hatası (HTTP ${confirmRes.status})`;
                try {
                    const errBody = await confirmRes.json();
                    if (errBody?.error) errMsg = errBody.error;
                } catch { /* json parse fail — ham mesajı kullan */ }
                setConfirmResult({ added: 0, updated: 0, skipped: 0, errors: [errMsg] });
                toast({ type: "error", message: errMsg });
            }
            await refetchAll();
            setState("done");
        } catch (err) {
            if (ticker) clearInterval(ticker);
            console.error("Import failed:", err);
            setConfirmResult({ added: 0, updated: 0, skipped: 0, errors: [String(err)] });
            setState("done");
        }
    };

    const reset = () => {
        setState("idle"); setFileName(null); setProgress(0); setProgressLabel("");
        setImportProgress({}); setConfirmResult(null); setDrafts([]); setSheets([]);
        setActiveTab(""); setBatchId(null); setParseError(null);
        setColumnMappings({}); setDetectingColumns(false); setDraftEdits({}); setDraftApprovals({});
        setOverwriteExisting(false); setStockOps({});
        originalFileRef.current = null;
    };

    const importableSelected = sheets.filter(s => s.status === "importable" && s.selected);
    const draftEntityTypes = [...new Set(drafts.map(d => d.entity_type))];
    const filteredDrafts = drafts.filter(d => d.entity_type === activeTab);

    // Step indicator
    const STEPS = [
        { key: "analyzing", label: "Dosya", icon: FileSpreadsheet },
        { key: "sheet_select", label: "Sheet", icon: Rows3 },
        { key: "column_mapping", label: "Kolonlar", icon: GitMerge },
        { key: "preview", label: "Önizleme", icon: Eye },
        { key: "importing", label: "Aktarım", icon: Upload },
        { key: "done", label: "Tamamlandı", icon: CheckCircle2 },
    ];
    const stepOrder = STEPS.map(s => s.key);

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
                <div>
                    <Link href="/dashboard/import" style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "11px", color: "var(--text-tertiary)", textDecoration: "none", marginBottom: "4px" }}>
                        <ArrowLeft size={12} aria-hidden /> Veri Aktarım Merkezi
                    </Link>
                    <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
                        Excel/CSV ile Toplu Aktarım
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "3px" }}>
                        Şablonlu veya serbest tablo dosyalarını sheet, kolon ve alan bazlı onayla içe aktar.
                    </div>
                </div>
                {state !== "idle" && state !== "analyzing" && (
                    <button type="button" onClick={reset} style={{
                        fontSize: "12px", padding: "5px 12px",
                        border: "var(--line-width) solid var(--border-secondary)", borderRadius: "6px",
                        background: "transparent", color: "var(--text-secondary)", cursor: "pointer",
                    }}>Yeni Dosya</button>
                )}
            </div>

            {/* Step indicator */}
            {state !== "idle" && (
                <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", flexWrap: "wrap" }}>
                    {STEPS.map((step, i) => {
                        const currentIdx = stepOrder.indexOf(state);
                        const stepIdx = stepOrder.indexOf(step.key);
                        const isDone = stepIdx < currentIdx;
                        const isActive = stepIdx === currentIdx;
                        const StepIcon = step.icon;
                        return (
                            <div key={step.key} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                {i > 0 && <div style={{ width: "20px", height: "0.5px", background: isDone || isActive ? "var(--accent)" : "var(--border-secondary)" }} />}
                                <span style={{
                                    color: isDone ? "var(--success-text)" : isActive ? "var(--accent-text)" : "var(--text-tertiary)",
                                    fontWeight: isActive ? 600 : 400,
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "4px",
                                }}>
                                    {isDone ? <CheckCircle2 size={13} aria-hidden /> : <StepIcon size={13} aria-hidden />}{step.label}
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Error banner — Faz 3d Review 2 + E2E fix: role="alert" + aria-live
                (a11y); data-testid (E2E strict-mode scope — Next.js prod build
                route announcer da role="alert" enjekte ediyor, getByRole çakışır).
                Close button aria-label (&times; sr'da anlamsız). */}
            {parseError && (
                <div
                    data-testid="import-error-banner"
                    role="alert"
                    aria-live="polite"
                    style={{
                        padding: "10px 14px", background: "var(--danger-bg)",
                        border: "var(--line-width) solid var(--danger-border)", borderRadius: "6px",
                        fontSize: "12px", color: "var(--danger-text)", display: "flex", alignItems: "center", gap: "8px",
                    }}
                >
                    <span style={{ fontWeight: 600 }}>Hata:</span> {parseError}
                    <button
                        type="button"
                        onClick={() => setParseError(null)}
                        aria-label="Hata mesajını kapat"
                        style={{ marginLeft: "auto", background: "none", border: "none", color: "var(--danger-text)", cursor: "pointer", fontSize: "14px" }}
                    >&times;</button>
                </div>
            )}

            {/* ───── IDLE ───── */}
            {state === "idle" && (
                <>
                    <div
                        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={handleDrop}
                        style={{
                            border: `1px dashed ${dragOver ? "var(--accent-border)" : "var(--border-secondary)"}`,
                            borderRadius: "8px",
                            padding: "18px",
                            background: dragOver ? "var(--accent-bg)" : "var(--bg-primary)",
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                            gap: "16px",
                            alignItems: "stretch",
                        }}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".xlsx,.xls,.csv"
                            data-testid="classic-import-file"
                            aria-label="Excel veya CSV dosyası seç"
                            style={{ display: "none" }}
                            onChange={e => { if (e.target.files?.[0]) handleFileSelect(e.target.files[0]); }}
                        />
                        <div style={{ display: "flex", gap: "14px", alignItems: "center", minWidth: 0 }}>
                            <div style={{ width: "48px", height: "48px", flex: "0 0 auto", background: "var(--accent-bg)", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <Upload size={22} color="var(--accent)" aria-hidden />
                            </div>
                            <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "4px" }}>
                                    {dragOver ? "Dosyayı bırak" : "Excel/CSV dosyanı yükle"}
                                </div>
                                <div style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.5, maxWidth: "680px" }}>
                                    Şablonlu veya serbest tablo dosyalarını sheet, kolon ve alan bazlı onayla içe aktar.
                                    Veriler önizleme ve onaydan önce kaydedilmez.
                                </div>
                                <div style={{ display: "flex", gap: "8px", marginTop: "12px", flexWrap: "wrap", alignItems: "center" }}>
                                    <button type="button" onClick={() => fileInputRef.current?.click()} style={{
                                        padding: "8px 14px", background: "var(--accent)", color: "#fff",
                                        border: "none", borderRadius: "6px", fontSize: "12px", fontWeight: 700, cursor: "pointer",
                                        display: "inline-flex", alignItems: "center", gap: "7px",
                                    }}><Upload size={15} aria-hidden />Dosya Seç</button>
                                    <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>veya dosyayı buraya sürükle</span>
                                </div>
                            </div>
                        </div>
                        <div style={{ border: "var(--line-width) solid var(--border-tertiary)", borderRadius: "7px", padding: "12px", background: "var(--bg-secondary)", display: "flex", flexDirection: "column", gap: "10px" }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                                <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-primary)" }}>Örnek şablon indir</div>
                                <Download size={15} color="var(--text-tertiary)" aria-hidden />
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "6px" }}>
                                {Object.values(EXCEL_IMPORT_TEMPLATES).map(template => (
                                    <a
                                        key={template.kind}
                                        href={`/api/import/templates?kind=${template.kind}`}
                                        style={{
                                            fontSize: "11px",
                                            padding: "6px 8px",
                                            borderRadius: "5px",
                                            border: "var(--line-width) solid var(--border-tertiary)",
                                            color: "var(--text-secondary)",
                                            background: "var(--bg-primary)",
                                            textDecoration: "none",
                                            whiteSpace: "nowrap",
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                        }}
                                        title={`${template.title} şablonu`}
                                    >
                                        {template.title}
                                    </a>
                                ))}
                            </div>
                            <div style={{ fontSize: "11px", color: "var(--text-tertiary)", lineHeight: 1.45 }}>
                                PDF, görsel ve serbest katalog/datasheet analizi için{" "}
                                <Link href="/dashboard/import" style={{ color: "var(--accent-text)", textDecoration: "none" }}>
                                    Veri Aktarım Merkezi&apos;ndeki AI akışını
                                </Link>{" "}
                                kullan.
                            </div>
                        </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))", gap: "8px" }}>
                        {[
                            { icon: FileSpreadsheet, label: "Dosya" },
                            { icon: Rows3, label: "Sheet" },
                            { icon: GitMerge, label: "Kolonlar" },
                            { icon: Eye, label: "Önizleme" },
                            { icon: CheckCircle2, label: "Aktarım" },
                        ].map(step => {
                            const StepIcon = step.icon;
                            return (
                            <div key={step.label} style={{ textAlign: "center", padding: "10px 8px", border: "var(--line-width) solid var(--surface-border)", borderRadius: "6px", background: "var(--surface-raised)", boxShadow: "var(--surface-shadow-sm)", display: "flex", flexDirection: "column", alignItems: "center", gap: "5px", minWidth: 0 }}>
                                <StepIcon size={16} color="var(--text-tertiary)" aria-hidden />
                                <span style={{ fontSize: "10px", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{step.label}</span>
                            </div>
                            );
                        })}
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "10px" }}>
                        {[
                            { icon: Table2, title: "Çok sheet", desc: "Sheetler otomatik tespit edilir; belirsiz olanlar kullanıcı seçimine düşer." },
                            { icon: ShieldCheck, title: "Kontrollü onay", desc: "Satır ve alan bazında önizleme olmadan kayıt yazılmaz." },
                            { icon: GitMerge, title: "Kolon hafızası", desc: "Düzelttiğin eşleştirme sonraki dosyalarda hatırlanır." },
                        ].map(card => {
                            const CardIcon = card.icon;
                            return (
                            <div key={card.title} style={{ background: "var(--surface-raised)", border: "var(--line-width) solid var(--surface-border)", borderRadius: "6px", padding: "14px 16px", boxShadow: "var(--surface-shadow-sm)" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "4px" }}>
                                    <CardIcon size={15} aria-hidden />{card.title}
                                </div>
                                <div style={{ fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.5 }}>{card.desc}</div>
                            </div>
                            );
                        })}
                    </div>
                </>
            )}

            {/* ───── ANALYZING ───── */}
            {state === "analyzing" && (
                <div style={{ background: "var(--surface-raised)", border: "var(--line-width) solid var(--surface-border)", borderRadius: "8px", padding: "48px 24px", textAlign: "center", boxShadow: "var(--surface-shadow-sm)" }}>
                    <div style={{ display: "flex", gap: "8px", justifyContent: "center", marginBottom: "24px" }}>
                        {[0, 1, 2].map(i => (
                            <div key={i} style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--accent)", animation: `pulse-dot 1.2s ease-in-out ${i * 0.2}s infinite` }} />
                        ))}
                    </div>
                    <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "4px" }}>Dosya okunuyor…</div>
                    {fileName && <div style={{ fontSize: "12px", color: "var(--text-tertiary)", marginBottom: "20px" }}>{fileName}</div>}
                    <div style={{ maxWidth: "320px", margin: "0 auto", height: "4px", background: "var(--border-tertiary)", borderRadius: "2px", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: "100%", transform: `scaleX(${progress / 100})`, transformOrigin: "left", background: "var(--accent)", borderRadius: "2px", transition: "transform 0.35s ease" }} />
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "8px" }}>{progressLabel}</div>
                </div>
            )}

            {/* ───── SHEET SELECT ───── */}
            {state === "sheet_select" && (
                <>
                    <div style={{ background: "var(--surface-raised)", border: "var(--line-width) solid var(--surface-border)", borderRadius: "8px", overflow: "hidden", boxShadow: "var(--surface-shadow-sm)" }}>
                        <div style={{ padding: "12px 16px", borderBottom: "var(--line-width) solid var(--surface-border)", background: "var(--table-header-bg)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <div>
                                <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>Dosyada {sheets.length} sheet bulundu</span>
                                <span style={{ fontSize: "12px", color: "var(--text-tertiary)", marginLeft: "10px" }}>
                                    {importableSelected.length} içe aktarılabilir · {importableSelected.filter(s => s.selected).length} seçili
                                </span>
                            </div>
                            {fileName && <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>{fileName}</span>}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column" }}>
                            {sheets.map((sheet, idx) => (
                                <label key={sheet.name} style={{
                                    display: "flex", alignItems: "center", gap: "12px", padding: "10px 16px", flexWrap: "wrap",
                                    borderBottom: idx < sheets.length - 1 ? "var(--line-width) solid var(--border-tertiary)" : "none",
                                    cursor: sheet.status === "importable" ? "pointer" : "default",
                                    opacity: sheet.status === "unsupported" ? 0.5 : 1,
                                }}>
                                    <input type="checkbox" checked={sheet.selected} disabled={sheet.status !== "importable"}
                                        aria-label={`${sheet.displayName} sheet seçimi`}
                                        onChange={() => toggleSheet(idx)}
                                        style={{ cursor: sheet.status === "importable" ? "pointer" : "default", accentColor: "var(--accent)" }} />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                            <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-primary)" }}>{sheet.displayName}</span>
                                            <span style={{ fontSize: "10px", color: "var(--text-tertiary)", fontFamily: "monospace" }}>{sheet.name}</span>
                                        </div>
                                        {sheet.headers.length > 0 && (
                                            <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "2px" }}>
                                                Kolonlar: {sheet.headers.slice(0, 5).join(", ")}{sheet.headers.length > 5 ? ` +${sheet.headers.length - 5}` : ""}
                                            </div>
                                        )}
                                    </div>
                                    <span style={{ fontSize: "11px", color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>{sheet.rows.toLocaleString("tr-TR")} satır</span>
                                    <span style={{ fontSize: "10px", padding: "2px 8px", background: sheet.status === "importable" ? "var(--success-bg)" : "var(--bg-tertiary)", color: sheet.status === "importable" ? "var(--success-text)" : "var(--text-tertiary)", borderRadius: "10px", whiteSpace: "nowrap" }}>
                                        {sheet.status === "importable" ? "İçe Aktarılabilir" : "Desteklenmiyor"}
                                    </span>
                                    {/* Stok sheet'i: sayım/hareket seçimi — veri nereye nasıl gider, burada netleşir */}
                                    {sheet.entityType === "stock" && sheet.selected && (
                                        <div
                                            role="radiogroup"
                                            aria-label={`${sheet.displayName} stok işlem türü`}
                                            onClick={e => e.preventDefault()}
                                            style={{ display: "flex", gap: "10px", alignItems: "center", flexBasis: "100%", paddingLeft: "26px", marginTop: "4px" }}
                                        >
                                            {(Object.keys(STOCK_OP_META) as StockOperationType[]).map(op => {
                                                const checked = effectiveStockOp(sheet.name) === op;
                                                return (
                                                    <label key={op} title={STOCK_OP_META[op].hint} style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "11px", color: checked ? "var(--text-primary)" : "var(--text-tertiary)", cursor: "pointer" }}>
                                                        <input
                                                            type="radio"
                                                            name={`stock-op-${sheet.name}`}
                                                            checked={checked}
                                                            onChange={() => setStockOps(prev => ({ ...prev, [sheet.name]: op }))}
                                                            onClick={e => e.stopPropagation()}
                                                            style={{ accentColor: "var(--accent)", cursor: "pointer" }}
                                                        />
                                                        {STOCK_OP_META[op].label}
                                                    </label>
                                                );
                                            })}
                                            <span style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>
                                                {STOCK_OP_META[effectiveStockOp(sheet.name)].hint}
                                            </span>
                                        </div>
                                    )}
                                </label>
                            ))}
                        </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        <button type="button" onClick={sendToAiFlow} style={{ fontSize: "11px", padding: "4px 0", border: "none", background: "transparent", color: "var(--accent-text)", cursor: "pointer", textDecoration: "underline" }}>
                            Bu dosya serbest katalog/belge mi? AI ile analiz et →
                        </button>
                        <div style={{ marginLeft: "auto", display: "flex", gap: "8px" }}>
                            <button type="button" onClick={reset} style={{ fontSize: "12px", padding: "7px 14px", border: "var(--line-width) solid var(--border-secondary)", borderRadius: "6px", background: "transparent", color: "var(--text-secondary)", cursor: "pointer" }}>← Geri</button>
                            <button type="button" onClick={handleDetectColumns} disabled={isDemo || importableSelected.length === 0}
                                title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}
                                style={{ fontSize: "12px", padding: "7px 18px", border: "var(--line-width) solid var(--accent-border)", borderRadius: "6px", background: (!isDemo && importableSelected.length > 0) ? "var(--accent-bg)" : "var(--bg-tertiary)", color: (!isDemo && importableSelected.length > 0) ? "var(--accent-text)" : "var(--text-tertiary)", cursor: (!isDemo && importableSelected.length > 0) ? "pointer" : "not-allowed", fontWeight: 600 }}>
                                Kolon Eşleştirmeye Geç →
                            </button>
                        </div>
                    </div>
                </>
            )}

            {/* ───── COLUMN MAPPING ───── */}
            {state === "column_mapping" && (
                <>
                    {detectingColumns ? (
                        <div style={{ background: "var(--bg-primary)", border: "var(--line-width) solid var(--border-tertiary)", borderRadius: "8px", padding: "48px 24px", textAlign: "center" }}>
                            <div style={{ display: "flex", gap: "8px", justifyContent: "center", marginBottom: "24px" }}>
                                {[0, 1, 2].map(i => (
                                    <div key={i} style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--accent)", animation: `pulse-dot 1.2s ease-in-out ${i * 0.2}s infinite` }} />
                                ))}
                            </div>
                            <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "4px" }}>Kolonlar algılanıyor…</div>
                            <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>AI kolon adlarını ERP alanlarına eşleştiriyor</div>
                        </div>
                    ) : (
                        <>
                            {/* Sheet tabs */}
                            {importableSelected.length > 1 && (
                                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                                    {importableSelected.map(s => (
                                        <button type="button" key={s.name} onClick={() => setActiveTab(s.name)} style={tabBtnStyle(activeTab === s.name)}>
                                            {s.displayName}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {importableSelected.reduce<SheetInfo[]>((acc, sheet) => {
                                if (!activeTab || sheet.name === activeTab) acc.push(sheet);
                                return acc;
                            }, []).map(sheet => {
                                const mappings = columnMappings[sheet.name] ?? [];
                                const fields = ERP_FIELDS[sheet.entityType ?? ""] ?? [];

                                return (
                                    <div key={sheet.name} style={{ background: "var(--bg-primary)", border: "var(--line-width) solid var(--border-tertiary)", borderRadius: "8px", overflow: "hidden" }}>
                                        <div style={{ padding: "12px 16px", borderBottom: "var(--line-width) solid var(--border-tertiary)", background: "var(--bg-secondary)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                            <div>
                                                <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>{sheet.displayName}</span>
                                                <span style={{ fontSize: "12px", color: "var(--text-tertiary)", marginLeft: "10px" }}>{sheet.rows} satır · {sheet.headers.length} kolon</span>
                                            </div>
                                            <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>
                                                {entityTypeLabels[sheet.entityType ?? ""] ?? ""}
                                                {sheet.entityType === "stock" && ` · ${STOCK_OP_META[effectiveStockOp(sheet.name)].label}`}
                                            </span>
                                        </div>

                                        {/* Table header */}
                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 80px", gap: "0", borderBottom: "var(--line-width) solid var(--border-tertiary)", padding: "8px 16px", background: "var(--bg-secondary)" }}>
                                            <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)" }}>Excel Kolonu</span>
                                            <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)" }}>ERP Alanı</span>
                                            <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)" }}>Kaynak</span>
                                        </div>

                                        {mappings.map((m, colIdx) => (
                                            <div key={m.source_column} style={{
                                                display: "grid", gridTemplateColumns: "1fr 1fr 80px", gap: "0",
                                                alignItems: "center", padding: "8px 16px",
                                                borderBottom: colIdx < mappings.length - 1 ? "var(--line-width) solid var(--border-tertiary)" : "none",
                                                background: colIdx % 2 === 0 ? "transparent" : "var(--bg-secondary)",
                                            }}>
                                                <span style={{ fontSize: "12px", color: "var(--text-primary)", fontFamily: "monospace" }}>{m.source_column}</span>
                                                <select
                                                    value={m.target_field ?? "skip"}
                                                    onChange={e => updateMapping(sheet.name, colIdx, e.target.value === "skip" ? null : e.target.value)}
                                                    style={{
                                                        fontSize: "12px", padding: "4px 8px", marginRight: "16px",
                                                        background: "var(--bg-primary)", color: "var(--text-primary)",
                                                        border: "var(--line-width) solid var(--border-secondary)", borderRadius: "4px",
                                                        cursor: "pointer",
                                                    }}
                                                >
                                                    <option value="skip">— Atla —</option>
                                                    {fields.map(f => (
                                                        <option key={f.field} value={f.field}>{f.label} ({f.field})</option>
                                                    ))}
                                                </select>
                                                <span style={sourceChipStyle(m.source)}>
                                                    {sourceChipLabel(m.source, m.confidence)}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                );
                            })}

                            {/* Remember toggle */}
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <input type="checkbox" id="remember-mappings" checked={rememberMappings}
                                    aria-label="Kolon eşleştirmesini hatırla"
                                    onChange={e => setRememberMappings(e.target.checked)}
                                    style={{ accentColor: "var(--accent)", cursor: "pointer" }} />
                                <label htmlFor="remember-mappings" style={{ fontSize: "12px", color: "var(--text-secondary)", cursor: "pointer" }}>
                                    Bu eşleştirmeyi hatırla (aynı format tekrar gelince AI kullanılmaz)
                                </label>
                            </div>

                            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                                <button type="button" onClick={() => {
                                    if (batchId) { fetch(`/api/import/${batchId}`, { method: "DELETE" }).catch(() => {}); }
                                    setState("sheet_select"); setColumnMappings({}); setBatchId(null);
                                }} style={{ fontSize: "12px", padding: "7px 14px", border: "var(--line-width) solid var(--border-secondary)", borderRadius: "6px", background: "transparent", color: "var(--text-secondary)", cursor: "pointer" }}>← Geri</button>
                                <button type="button" onClick={handleApplyMappings} style={{ fontSize: "12px", padding: "7px 18px", border: "var(--line-width) solid var(--accent-border)", borderRadius: "6px", background: "var(--accent-bg)", color: "var(--accent-text)", cursor: "pointer", fontWeight: 600 }}>
                                    Eşleştirmeyi Uygula →
                                </button>
                            </div>
                        </>
                    )}
                </>
            )}

            {/* ───── PREVIEW / REVIEW ───── */}
            {state === "preview" && (
                <>
                    {/* Tab bar */}
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                        {draftEntityTypes.map(type => {
                            const count = drafts.filter(d => d.entity_type === type).length;
                            return (
                                <button type="button" key={type} onClick={() => { setActiveTab(type); setBulkField(""); setBulkValue(""); setPreviewPage(0); }} style={tabBtnStyle(activeTab === type)}>
                                    {entityTypeLabels[type] ?? type}
                                    <span style={{ marginLeft: "5px", fontSize: "10px", opacity: 0.7 }}>{count}</span>
                                </button>
                            );
                        })}
                    </div>

                    {/* Summary + bulk fill */}
                    {(() => {
                        const entityFields = ERP_FIELDS[activeTab] ?? [];
                        const warningRows = filteredDrafts.filter(d => (d.row_errors?.length ?? 0) > 0 || (d.risk_flags?.length ?? 0) > 0).length;
                        const skippedFieldCount = filteredDrafts.reduce((sum, draft) => {
                            const approvals = draftApprovals[draft.id] ?? normalizeDraftApprovals(draft);
                            return sum + Object.values(approvals).filter(v => v === "skip").length;
                        }, 0);
                        const applyBulkFill = () => {
                            if (!bulkField || bulkValue === "") return;
                            const ids = filteredDrafts.map(d => d.id);
                            const draftById = new Map(filteredDrafts.map(d => [d.id, d]));
                            setDraftEdits(prev => {
                                const next = { ...prev };
                                for (const id of ids) {
                                    const existing = prev[id] ?? {};
                                    // Only fill if empty
                                    const currentVal = existing[bulkField] ?? (draftById.get(id)?.parsed_data as Record<string, unknown> ?? {})[bulkField];
                                    if (currentVal === undefined || currentVal === null || currentVal === "") {
                                        next[id] = { ...existing, [bulkField]: bulkValue };
                                    }
                                }
                                return next;
                            });
                            // Best-effort server sync
                            for (const draft of filteredDrafts) {
                                const currentVal = (draftEdits[draft.id] ?? {})[bulkField] ?? ((draft.parsed_data as Record<string, unknown> ?? {})[bulkField]);
                                if (currentVal === undefined || currentVal === null || currentVal === "") {
                                    const corrections = { ...(draftEdits[draft.id] ?? {}), [bulkField]: bulkValue };
                                    fetch(`/api/import/drafts/${draft.id}`, {
                                        method: "PATCH",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ user_corrections: corrections }),
                                    }).catch(() => {});
                                }
                            }
                            setBulkValue("");
                        };
                        return (
                            <div style={{ display: "flex", gap: "8px", padding: "10px 14px", background: "var(--bg-secondary)", border: "var(--line-width) solid var(--border-tertiary)", borderRadius: "6px", fontSize: "12px", flexWrap: "wrap", alignItems: "center" }}>
                                <span style={{ color: "var(--text-secondary)" }}>Toplam: <strong>{filteredDrafts.length}</strong> satır</span>
                                {warningRows > 0 && <span style={{ color: "var(--warning-text)", fontSize: "11px" }}>{warningRows} satır gözden geçirme istiyor</span>}
                                {skippedFieldCount > 0 && <span style={{ color: "var(--text-tertiary)", fontSize: "11px" }}>{skippedFieldCount} alan atlanacak</span>}
                                {batchId && (
                                    <Link href={`/api/import/${batchId}/report?format=xlsx`} style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "11px", color: "var(--accent-text)", textDecoration: "none", marginRight: "auto" }}>
                                        <Download size={13} /> Rapor XLSX
                                    </Link>
                                )}
                                {!batchId && <span style={{ color: "var(--text-tertiary)", fontSize: "11px", marginRight: "auto" }}>Hücreye tıkla → düzelt</span>}
                                {/* Bulk fill */}
                                <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>Toplu doldur:</span>
                                <select aria-label="Toplu doldurulacak alan" value={bulkField} onChange={e => setBulkField(e.target.value)} style={{ fontSize: "11px", padding: "3px 6px", background: "var(--bg-primary)", color: "var(--text-primary)", border: "var(--line-width) solid var(--border-secondary)", borderRadius: "4px" }}>
                                    <option value="">Alan seç</option>
                                    {entityFields.map(f => <option key={f.field} value={f.field}>{f.label}</option>)}
                                </select>
                                <input aria-label="Toplu doldurma değeri" value={bulkValue} onChange={e => setBulkValue(e.target.value)} placeholder="Değer…" onKeyDown={e => { if (e.key === "Enter") applyBulkFill(); }}
                                    style={{ fontSize: "11px", padding: "3px 8px", background: "var(--bg-primary)", color: "var(--text-primary)", border: "var(--line-width) solid var(--border-secondary)", borderRadius: "4px", width: "120px" }} />
                                <button type="button" onClick={applyBulkFill} disabled={!bulkField || bulkValue === ""} style={{ fontSize: "11px", padding: "3px 10px", background: bulkField && bulkValue ? "var(--accent-bg)" : "var(--bg-tertiary)", color: bulkField && bulkValue ? "var(--accent-text)" : "var(--text-tertiary)", border: "var(--line-width) solid var(--border-secondary)", borderRadius: "4px", cursor: bulkField && bulkValue ? "pointer" : "not-allowed" }}>
                                    Boşlara Uygula
                                </button>
                            </div>
                        );
                    })()}

                    {/* Table preview */}
                    {filteredDrafts.length === 0 ? (
                        <div style={{ padding: "24px", textAlign: "center", background: "var(--bg-primary)", border: "var(--line-width) solid var(--border-tertiary)", borderRadius: "8px", color: "var(--text-tertiary)", fontSize: "12px" }}>
                            Bu kategoride satır bulunmuyor.
                        </div>
                    ) : (() => {
                        // Collect ALL fields from ALL drafts (union), required fields first
                        const required = REQUIRED_FIELDS[filteredDrafts[0].entity_type] ?? [];
                        const fieldSet = new Set<string>();
                        for (const d of filteredDrafts) {
                            for (const k of Object.keys((d.parsed_data ?? {}) as Record<string, unknown>)) {
                                if (!INTERNAL_IMPORT_FIELDS.has(k)) fieldSet.add(k);
                            }
                            const edits = draftEdits[d.id];
                            if (edits) {
                                for (const k of Object.keys(edits)) {
                                    if (!INTERNAL_IMPORT_FIELDS.has(k)) fieldSet.add(k);
                                }
                            }
                        }
                        // Required fields always shown (even if unmapped), then the rest
                        const visibleFields = [
                            ...required.filter(f => !INTERNAL_IMPORT_FIELDS.has(f)),
                            ...[...fieldSet].filter(f => !required.includes(f)),
                        ];
                        const fieldLabels = new Map((ERP_FIELDS[activeTab] ?? []).map(f => [f.field, f.label]));

                        return (
                            <div style={{ background: "var(--surface-raised)", border: "var(--line-width) solid var(--surface-border)", borderRadius: "8px", overflow: "auto", boxShadow: "var(--surface-shadow-sm)" }}>
                                {/* Table header */}
                                <div style={{ display: "grid", gridTemplateColumns: `72px repeat(${visibleFields.length}, minmax(150px, 1fr))`, borderBottom: "var(--line-width) solid var(--surface-border)", background: "var(--table-header-bg)", minWidth: "760px" }}>
                                    <div style={{ padding: "8px 12px", fontSize: "11px", fontWeight: "var(--font-table-heading-weight)", color: "var(--text-tertiary)" }}>Satır</div>
                                    {visibleFields.map(f => (
                                        <div key={f} style={{ padding: "8px 12px", fontSize: "11px", fontWeight: "var(--font-table-heading-weight)", color: required.includes(f) ? "var(--accent-text)" : "var(--text-secondary)", borderLeft: "var(--line-width) solid var(--border-tertiary)", display: "flex", gap: "6px", alignItems: "center", minWidth: 0 }}>
                                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fieldLabels.get(f) ?? f}{required.includes(f) ? " *" : ""}</span>
                                            {FINANCIAL_IMPORT_FIELDS.has(f) && <span style={{ fontSize: "9px", color: "var(--warning-text)", border: "var(--line-width) solid var(--warning-border)", borderRadius: "999px", padding: "1px 5px", flexShrink: 0 }}>finans</span>}
                                        </div>
                                    ))}
                                </div>

                                {filteredDrafts.slice(previewPage * PAGE_SIZE, (previewPage + 1) * PAGE_SIZE).map((draft, rowIdx) => {
                                    const globalIdx = previewPage * PAGE_SIZE + rowIdx;
                                    const rowHasMissing = required.some(f => {
                                        const v = getEffectiveValue(draft, f);
                                        return v === undefined || v === null || v === "";
                                    });
                                    return (
                                        <div key={draft.id} style={{ display: "grid", gridTemplateColumns: `72px repeat(${visibleFields.length}, minmax(150px, 1fr))`, borderBottom: rowIdx < filteredDrafts.length - 1 ? "var(--line-width) solid var(--border-tertiary)" : "none", background: rowHasMissing ? "rgba(var(--danger-rgb,248,81,73),0.06)" : globalIdx % 2 === 0 ? "transparent" : "var(--bg-secondary)", minWidth: "760px" }}>
                                            <div style={{ padding: "6px 10px", fontSize: "11px", fontWeight: "var(--font-table-cell-weight)", color: "var(--text-tertiary)", display: "flex", flexDirection: "column", justifyContent: "center", gap: "3px", minHeight: "42px" }}>
                                                <span style={{ color: rowHasMissing ? "var(--warning-text)" : "var(--text-secondary)", fontWeight: "var(--font-table-heading-weight)" }}>{draft.row_number ?? globalIdx + 1}</span>
                                                <span style={{ fontSize: "10px", color: draft.match_status === "blocked" ? "var(--danger-text)" : draft.match_status === "ambiguous" ? "var(--warning-text)" : "var(--text-tertiary)" }}>
                                                    {draft.match_status ?? "new"}
                                                </span>
                                            </div>
                                            {visibleFields.map(f => {
                                                const val = getEffectiveValue(draft, f);
                                                const isEditing = editingCell?.draftId === draft.id && editingCell?.field === f;
                                                const isEmpty = required.includes(f) && (val === undefined || val === null || val === "");
                                                const approval = getFieldApproval(draft, f);
                                                const isSkipped = approval === "skip";
                                                return (
                                                    <div key={f} style={{ borderLeft: "var(--line-width) solid var(--border-tertiary)", position: "relative" }}>
                                                        {isEditing ? (
                                                            <input
                                                                ref={editInputRef}
                                                                aria-label={`${fieldLabels.get(f) ?? f} değeri`}
                                                                value={editingValue}
                                                                onChange={e => setEditingValue(e.target.value)}
                                                                onBlur={() => commitEdit(draft.id, f)}
                                                                onKeyDown={e => { if (e.key === "Enter") commitEdit(draft.id, f); if (e.key === "Escape") setEditingCell(null); }}
                                                                style={{ width: "100%", padding: "6px 12px", background: "var(--accent-bg)", border: "none", borderTop: "1.5px solid var(--accent)", fontSize: "12px", fontWeight: "var(--font-table-cell-weight)", color: "var(--text-primary)", boxSizing: "border-box" }}
                                                            />
                                                        ) : (
                                                            <div style={{ padding: "6px 10px", fontSize: "12px", fontWeight: "var(--font-table-cell-weight)", color: isSkipped ? "var(--text-tertiary)" : isEmpty ? "var(--danger-text)" : "var(--text-primary)", outline: isEmpty && !isSkipped ? "1px solid var(--danger-border)" : "none", minHeight: "42px", display: "grid", gridTemplateColumns: "18px minmax(0, 1fr)", alignItems: "center", gap: "6px", opacity: isSkipped ? 0.62 : 1 }}>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={!isSkipped}
                                                                    aria-label={`${fieldLabels.get(f) ?? f} alanını uygula`}
                                                                    title={isSkipped ? "Bu alan aktarımda atlanacak" : "Bu alan aktarımda uygulanacak"}
                                                                    onClick={e => e.stopPropagation()}
                                                                    onChange={e => void setFieldApproval(draft, f, e.target.checked ? "apply" : "skip")}
                                                                    style={{ width: "14px", height: "14px", accentColor: "var(--accent)" }}
                                                                />
                                                                <button
                                                                    type="button"
                                                                    aria-label={`${fieldLabels.get(f) ?? f} alanını düzenle`}
                                                                    onClick={() => startEdit(draft.id, f, val)}
                                                                    style={{
                                                                        minWidth: 0,
                                                                        padding: 0,
                                                                        border: "none",
                                                                        background: "transparent",
                                                                        color: "inherit",
                                                                        cursor: "pointer",
                                                                        textAlign: "left",
                                                                        overflow: "hidden",
                                                                        textOverflow: "ellipsis",
                                                                        whiteSpace: "nowrap",
                                                                        textDecoration: isSkipped ? "line-through" : "none",
                                                                    }}
                                                                >
                                                                    {val !== undefined && val !== null && val !== "" ? String(val) : <span style={{ color: "var(--text-tertiary)", fontStyle: "italic" }}>boş</span>}
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    );
                                })}
                                {filteredDrafts.length > PAGE_SIZE && (() => {
                                    const totalPages = Math.ceil(filteredDrafts.length / PAGE_SIZE);
                                    return (
                                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "12px", padding: "10px 12px", background: "var(--bg-secondary)", borderTop: "var(--line-width) solid var(--border-tertiary)", fontSize: "12px", color: "var(--text-secondary)" }}>
                                            <button type="button" onClick={() => setPreviewPage(p => Math.max(0, p - 1))} disabled={previewPage === 0}
                                                style={{ fontSize: "12px", padding: "4px 12px", background: previewPage === 0 ? "var(--bg-tertiary)" : "var(--bg-primary)", color: previewPage === 0 ? "var(--text-tertiary)" : "var(--text-primary)", border: "var(--line-width) solid var(--border-secondary)", borderRadius: "4px", cursor: previewPage === 0 ? "not-allowed" : "pointer" }}>
                                                ← Önceki
                                            </button>
                                            <span>Sayfa {previewPage + 1} / {totalPages} (toplam {filteredDrafts.length} satır)</span>
                                            <button type="button" onClick={() => setPreviewPage(p => Math.min(totalPages - 1, p + 1))} disabled={previewPage >= totalPages - 1}
                                                style={{ fontSize: "12px", padding: "4px 12px", background: previewPage >= totalPages - 1 ? "var(--bg-tertiary)" : "var(--bg-primary)", color: previewPage >= totalPages - 1 ? "var(--text-tertiary)" : "var(--text-primary)", border: "var(--line-width) solid var(--border-secondary)", borderRadius: "4px", cursor: previewPage >= totalPages - 1 ? "not-allowed" : "pointer" }}>
                                                Sonraki →
                                            </button>
                                        </div>
                                    );
                                })()}
                            </div>
                        );
                    })()}

                    {/* Missing fields warning */}
                    {(() => {
                        const required = REQUIRED_FIELDS[activeTab] ?? [];
                        const missingCount = filteredDrafts.filter(d =>
                            required.some(f => { const v = getEffectiveValue(d, f); return v === undefined || v === null || v === ""; })
                        ).length;
                        return missingCount > 0 ? (
                            <div style={{ padding: "8px 14px", background: "var(--warning-bg)", border: "var(--line-width) solid var(--warning-border)", borderRadius: "6px", fontSize: "12px", color: "var(--warning-text)" }}>
                                {missingCount} satırda zorunlu alan eksik (*). İçe aktarımda bu satırlar atlanabilir.
                            </div>
                        ) : null;
                    })()}

                    {/* Faz C — mevcut dolu alanların üzerine yazma toggle'ı */}
                    <label style={{ display: "flex", alignItems: "flex-start", gap: "8px", padding: "10px 12px", background: "var(--surface-subtle)", border: "var(--line-width) solid var(--surface-border)", borderRadius: "6px", cursor: "pointer" }}>
                        <input
                            type="checkbox"
                            checked={overwriteExisting}
                            onChange={e => setOverwriteExisting(e.target.checked)}
                            aria-label="Mevcut dolu alanların üzerine yaz"
                            style={{ width: "14px", height: "14px", marginTop: "1px", accentColor: "var(--accent)" }}
                        />
                        <span style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                            <b style={{ color: "var(--text-primary)" }}>Mevcut dolu alanların üzerine yaz</b><br />
                            Varsayılan olarak yalnız <b>boş</b> alanlar doldurulur; mevcut/elle düzeltilmiş değerler korunur. İşaretlersen dosyadaki dolu değerler mevcut değerin de üzerine yazılır (birim, para birimi gibi alanlar dahil — dikkatli kullan).
                        </span>
                    </label>

                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                        <button type="button" onClick={() => { setState("column_mapping"); setDrafts([]); }} style={{ fontSize: "12px", padding: "7px 14px", border: "var(--line-width) solid var(--border-secondary)", borderRadius: "6px", background: "transparent", color: "var(--text-secondary)", cursor: "pointer" }}>← Geri</button>
                        <button type="button" onClick={handleImport} disabled={isDemo} title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}
                            style={{ fontSize: "12px", padding: "7px 18px", border: "var(--line-width) solid var(--accent-border)", borderRadius: "6px", background: isDemo ? "var(--bg-tertiary)" : "var(--accent-bg)", color: isDemo ? "var(--text-tertiary)" : "var(--accent-text)", cursor: isDemo ? "not-allowed" : "pointer", fontWeight: 600, opacity: isDemo ? 0.5 : 1 }}>
                            Onayla ve İçe Aktar →
                        </button>
                    </div>
                </>
            )}

            {/* ───── IMPORTING ───── */}
            {state === "importing" && (
                <div style={{ background: "var(--bg-primary)", border: "var(--line-width) solid var(--border-tertiary)", borderRadius: "8px", padding: "24px" }}>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "20px" }}>İçe aktarılıyor…</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                        {sheets.reduce<SheetInfo[]>((acc, sheet) => {
                            if (sheet.status === "importable" && sheet.selected) acc.push(sheet);
                            return acc;
                        }, []).map(sheet => {
                            const count = importProgress[sheet.name] ?? 0;
                            const total = sheet.rows;
                            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                            const done = count >= total;
                            return (
                                <div key={sheet.name}>
                                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
                                        <span style={{ fontSize: "12px", color: "var(--text-primary)" }}>{sheet.displayName}</span>
                                        <span style={{ fontSize: "11px", color: done ? "var(--success-text)" : "var(--text-tertiary)" }}>
                                            {done ? `✓ ${total.toLocaleString("tr-TR")}` : `${count.toLocaleString("tr-TR")} / ${total.toLocaleString("tr-TR")}`}
                                        </span>
                                    </div>
                                    <div style={{ height: "5px", background: "var(--border-tertiary)", borderRadius: "3px", overflow: "hidden" }}>
                                        <div style={{ height: "100%", width: "100%", transform: `scaleX(${pct / 100})`, transformOrigin: "left", background: done ? "var(--success)" : "var(--accent)", borderRadius: "3px", transition: "transform 0.2s ease" }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ───── DONE ───── */}
            {state === "done" && (
                <div style={{ background: "var(--bg-primary)", border: "var(--line-width) solid var(--success-border)", borderRadius: "8px", padding: "32px 24px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
                        <div style={{ width: "36px", height: "36px", background: "var(--success-bg)", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                                <path d="M3.5 9l3.5 3.5 7-7" stroke="var(--success)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </div>
                        <div>
                            <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>İçeri aktarım tamamlandı</div>
                            <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "2px" }}>{fileName}</div>
                        </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: "10px", marginBottom: "16px" }}>
                        {confirmResult ? (
                            <>
                                <div style={{ background: "var(--bg-secondary)", borderRadius: "6px", padding: "12px 14px" }}>
                                    <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginBottom: "2px" }}>Eklendi</div>
                                    <div style={{ fontSize: "18px", fontWeight: 600, color: "var(--success-text)", marginBottom: "2px" }}>{confirmResult.added}</div>
                                    <div style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>yeni kayıt</div>
                                </div>
                                <div style={{ background: "var(--bg-secondary)", borderRadius: "6px", padding: "12px 14px" }}>
                                    <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginBottom: "2px" }}>Güncellendi</div>
                                    <div style={{ fontSize: "18px", fontWeight: 600, color: "var(--accent-text)", marginBottom: "2px" }}>{confirmResult.updated}</div>
                                    <div style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>mevcut kayıt</div>
                                </div>
                                {confirmResult.skipped > 0 && (
                                    <div style={{ background: "var(--bg-secondary)", borderRadius: "6px", padding: "12px 14px" }}>
                                        <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginBottom: "2px" }}>Atlanan</div>
                                        <div style={{ fontSize: "18px", fontWeight: 600, color: "var(--warning-text)", marginBottom: "2px" }}>{confirmResult.skipped}</div>
                                        <div style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>kayıt atlandı</div>
                                    </div>
                                )}
                                {confirmResult.errors.length > 0 && (
                                    <div style={{ background: "var(--bg-secondary)", borderRadius: "6px", padding: "12px 14px" }}>
                                        <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginBottom: "2px" }}>Hatalar</div>
                                        <div style={{ fontSize: "18px", fontWeight: 600, color: "var(--danger-text)", marginBottom: "2px" }}>{confirmResult.errors.length}</div>
                                        <div style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>satırda sorun</div>
                                    </div>
                                )}
                            </>
                        ) : (
                            <div style={{ background: "var(--bg-secondary)", borderRadius: "6px", padding: "12px 14px", gridColumn: "1 / -1" }}>
                                <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>İçe aktarım tamamlandı</div>
                            </div>
                        )}
                    </div>
                    {/* Sprint B G6: Entity-bazlı kırılım — neyin ne kadar aktarıldığı */}
                    {confirmResult?.byEntity && (() => {
                        const ENTITY_LABELS: Record<string, string> = {
                            customer:   "Müşteri",
                            product:    "Ürün",
                            vendor:     "Tedarikçi",
                            quote:      "Teklif",
                            order:      "Sipariş",
                            order_line: "Sipariş Satırı",
                            stock:      "Stok Hareketi",
                            shipment:   "Sevkiyat",
                            invoice:    "Fatura",
                            payment:    "Tahsilat",
                        };
                        const rows = Object.entries(confirmResult.byEntity).reduce<Array<{ key: string; label: string; added: number; updated: number; skipped: number }>>((acc, [key, c]) => {
                            if (c.added + c.updated + c.skipped > 0) acc.push({ key, label: ENTITY_LABELS[key] ?? key, ...c });
                            return acc;
                        }, []);
                        if (rows.length === 0) return null;
                        return (
                            <div style={{ marginBottom: "16px", border: "var(--line-width) solid var(--border-tertiary)", borderRadius: "6px", overflow: "hidden" }}>
                                <div style={{
                                    display: "grid",
                                    gridTemplateColumns: "1fr 90px 90px 90px",
                                    fontSize: "10px", fontWeight: 600,
                                    color: "var(--text-tertiary)", letterSpacing: 0,
                                    padding: "8px 12px",
                                    background: "var(--bg-secondary)",
                                    borderBottom: "var(--line-width) solid var(--border-tertiary)",
                                }}>
                                    <div>TÜR</div>
                                    <div style={{ textAlign: "right" }}>EKLENDİ</div>
                                    <div style={{ textAlign: "right" }}>GÜNCELLENDİ</div>
                                    <div style={{ textAlign: "right" }}>ATLANDI</div>
                                </div>
                                {rows.map((r) => (
                                    <div key={r.key} style={{
                                        display: "grid",
                                        gridTemplateColumns: "1fr 90px 90px 90px",
                                        fontSize: "12px",
                                        color: "var(--text-secondary)",
                                        padding: "8px 12px",
                                        borderBottom: "var(--line-width) solid var(--border-tertiary)",
                                    }}>
                                        <div style={{ color: "var(--text-primary)" }}>{r.label}</div>
                                        <div style={{ textAlign: "right", color: r.added > 0 ? "var(--success-text)" : "var(--text-tertiary)" }}>{r.added}</div>
                                        <div style={{ textAlign: "right", color: r.updated > 0 ? "var(--accent-text)" : "var(--text-tertiary)" }}>{r.updated}</div>
                                        <div style={{ textAlign: "right", color: r.skipped > 0 ? "var(--warning-text)" : "var(--text-tertiary)" }}>{r.skipped}</div>
                                    </div>
                                ))}
                            </div>
                        );
                    })()}
                    {confirmResult && confirmResult.errors.length > 0 && (
                        <div style={{ marginBottom: "16px", background: "var(--danger-bg)", border: "var(--line-width) solid var(--danger-border)", borderRadius: "6px", padding: "12px 14px" }}>
                            <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--danger-text)", marginBottom: "8px" }}>{confirmResult.errors.length} satırda sorun oluştu</div>
                            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                                {confirmResult.errors.map((err) => (
                                    <div key={err} style={{ fontSize: "11px", color: "var(--text-secondary)" }}>· {err}</div>
                                ))}
                            </div>
                        </div>
                    )}
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        {batchId && (
                            <>
                                <Link href={`/api/import/${batchId}/report?format=xlsx`} style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", padding: "6px 14px", border: "var(--line-width) solid var(--border-secondary)", borderRadius: "6px", background: "var(--bg-secondary)", color: "var(--text-primary)", textDecoration: "none", fontWeight: 500 }}>
                                    <Download size={14} /> Rapor XLSX
                                </Link>
                                <Link href={`/api/import/${batchId}/report?format=csv`} style={{ fontSize: "12px", padding: "6px 14px", border: "var(--line-width) solid var(--border-secondary)", borderRadius: "6px", background: "var(--bg-secondary)", color: "var(--text-primary)", textDecoration: "none", fontWeight: 500 }}>
                                    Rapor CSV
                                </Link>
                            </>
                        )}
                        <Link href="/dashboard/customers" style={{ fontSize: "12px", padding: "6px 14px", border: "var(--line-width) solid var(--accent-border)", borderRadius: "6px", background: "var(--accent-bg)", color: "var(--accent-text)", textDecoration: "none", fontWeight: 500 }}>Cariler sayfasına git →</Link>
                        <Link href="/dashboard/orders" style={{ fontSize: "12px", padding: "6px 14px", border: "var(--line-width) solid var(--accent-border)", borderRadius: "6px", background: "var(--accent-bg)", color: "var(--accent-text)", textDecoration: "none", fontWeight: 500 }}>Siparişler sayfasına git →</Link>
                        <Link href="/dashboard/products" style={{ fontSize: "12px", padding: "6px 14px", border: "var(--line-width) solid var(--accent-border)", borderRadius: "6px", background: "var(--accent-bg)", color: "var(--accent-text)", textDecoration: "none", fontWeight: 500 }}>Stok & Ürünler →</Link>
                        <button type="button" onClick={reset} style={{ fontSize: "12px", padding: "6px 16px", border: "var(--line-width) solid var(--border-secondary)", borderRadius: "6px", background: "transparent", color: "var(--text-secondary)", cursor: "pointer" }}>Yeni Dosya Yükle</button>
                    </div>
                </div>
            )}
        </div>
    );
}
