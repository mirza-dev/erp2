"use client";

import { useState, useRef, useCallback } from "react";
import Link from "next/link";
import { useData } from "@/lib/data-context";
import * as XLSX from "xlsx";
import { useIsDemo, DEMO_DISABLED_TOOLTIP, DEMO_BLOCK_TOAST } from "@/lib/demo-utils";
import { useToast } from "@/components/ui/Toast";
import { IMPORT_FIELDS, REQUIRED_FIELDS } from "@/lib/import-fields";

type ImportState = "idle" | "analyzing" | "sheet_select" | "column_mapping" | "preview" | "importing" | "done";

// ─── Sheet info derived from actual file ─────────────────────────────────────
interface SheetInfo {
    name: string;
    displayName: string;
    rows: number;
    entity: string;
    entityType: "customer" | "product" | "order" | "order_line" | "stock" | "quote" | "shipment" | "invoice" | "payment" | null;
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
}

// ERP_FIELDS alias for backward compat with references in this file
const ERP_FIELDS = IMPORT_FIELDS;

// Known sheet → entity type mapping
const SHEET_ENTITY_MAP: Record<string, { entityType: "customer" | "product" | "order" | "order_line" | "stock" | "quote" | "shipment" | "invoice" | "payment"; displayName: string; entity: string; status: "importable" }> = {
    Urunler: { entityType: "product", displayName: "Ürünler", entity: "Ürünler", status: "importable" },
    Musteriler: { entityType: "customer", displayName: "Müşteriler", entity: "Müşteriler", status: "importable" },
    Teklifler: { entityType: "quote", displayName: "Teklifler", entity: "Teklifler", status: "importable" },
    Siparisler: { entityType: "order", displayName: "Siparişler", entity: "Siparişler", status: "importable" },
    Siparis_Kalemleri: { entityType: "order_line", displayName: "Sipariş Kalemleri", entity: "Sipariş Kalemleri", status: "importable" },
    Sevkiyatlar: { entityType: "shipment", displayName: "Sevkiyatlar", entity: "Sevkiyatlar", status: "importable" },
    Faturalar: { entityType: "invoice", displayName: "Faturalar", entity: "Faturalar", status: "importable" },
    Tahsilatlar: { entityType: "payment", displayName: "Tahsilatlar", entity: "Tahsilatlar", status: "importable" },
    Stok: { entityType: "stock", displayName: "Stok", entity: "Stok Güncellemesi", status: "importable" },
};

const entityTypeLabels: Record<string, string> = {
    customer: "Müşteriler", product: "Ürünler", quote: "Teklifler",
    order: "Siparişler", order_line: "Sipariş Kalemleri", shipment: "Sevkiyatlar",
    invoice: "Faturalar", payment: "Tahsilatlar", stock: "Stok",
};

// ─── Styles ────────────────────────────────────────────────────────────────
const tabBtnStyle = (active: boolean): React.CSSProperties => ({
    fontSize: "12px", padding: "5px 12px",
    border: "0.5px solid " + (active ? "var(--accent-border)" : "var(--border-secondary)"),
    borderRadius: "5px",
    background: active ? "var(--accent-bg)" : "transparent",
    color: active ? "var(--accent-text)" : "var(--text-secondary)",
    cursor: "pointer", whiteSpace: "nowrap",
});

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

export default function ImportPage() {
    const { refetchAll } = useData();
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
    const [confirmResult, setConfirmResult] = useState<{ added: number; updated: number; skipped: number; errors: string[] } | null>(null);
    const [drafts, setDrafts] = useState<DraftRow[]>([]);
    const [parseError, setParseError] = useState<string | null>(null);
    const [batchId, setBatchId] = useState<string | null>(null);
    // Column mapping state — keyed by sheet name
    const [columnMappings, setColumnMappings] = useState<Record<string, ColumnMapping[]>>({});
    const [detectingColumns, setDetectingColumns] = useState(false);
    const [rememberMappings, setRememberMappings] = useState(true);
    // Inline editing in preview
    const [editingCell, setEditingCell] = useState<{ draftId: string; field: string } | null>(null);
    const [editingValue, setEditingValue] = useState("");
    const [draftEdits, setDraftEdits] = useState<Record<string, Record<string, unknown>>>({});
    // Bulk fill state
    const [bulkField, setBulkField] = useState("");
    const [bulkValue, setBulkValue] = useState("");;
    const [previewPage, setPreviewPage] = useState(0);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // ─── Parse Excel file client-side ─────────────────────────────────
    const parseExcelFile = useCallback((file: File) => {
        setFileName(file.name);
        setState("analyzing");
        setProgress(0);
        setProgressLabel("Dosya okunuyor...");

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                setProgress(30);
                setProgressLabel("Excel ayrıştırılıyor...");
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: "array" });
                setProgress(60);
                setProgressLabel("Sheetler analiz ediliyor...");

                const detectedSheets: SheetInfo[] = workbook.SheetNames.map(name => {
                    const worksheet = workbook.Sheets[name];
                    const jsonRows = XLSX.utils.sheet_to_json<Record<string, string>>(worksheet, { defval: "" });
                    const headers = jsonRows.length > 0 ? Object.keys(jsonRows[0]) : [];
                    const known = SHEET_ENTITY_MAP[name];

                    return {
                        name, displayName: known?.displayName ?? name,
                        rows: jsonRows.length, entity: known?.entity ?? name,
                        entityType: known?.entityType ?? null,
                        status: known ? "importable" : "unsupported",
                        selected: !!known, headers,
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

    const handleFileSelect = (file: File) => {
        const allowed = ["xlsx", "xls", "csv"];
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
        if (!allowed.includes(ext)) {
            setParseError("Desteklenmeyen dosya formatı. Lütfen .xlsx, .xls veya .csv dosyası yükleyin.");
            return;
        }
        setParseError(null);
        parseExcelFile(file);
    };

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
        setDraftEdits(d => ({ ...d, [draftId]: newEdits }));

        // Persist to server (best-effort)
        try {
            await fetch(`/api/import/drafts/${draftId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user_corrections: newEdits }),
            });
        } catch { /* ignore */ }
    };

    const getEffectiveValue = (draft: DraftRow, field: string): unknown => {
        const corrections = draftEdits[draft.id];
        if (corrections && field in corrections) return corrections[field];
        const parsed = (draft.parsed_data ?? {}) as Record<string, unknown>;
        return parsed[field];
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
            const confirmRes = await fetch(`/api/import/${batchId}/confirm`, { method: "POST" });
            clearInterval(ticker); ticker = null;

            const done: Record<string, number> = {};
            selectedSheets.forEach(s => (done[s.name] = s.rows));
            setImportProgress(done);

            if (confirmRes.ok) {
                const result = await confirmRes.json();
                setConfirmResult(result);
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
        setColumnMappings({}); setDetectingColumns(false); setDraftEdits({});
    };

    const importableSelected = sheets.filter(s => s.status === "importable" && s.selected);
    const draftEntityTypes = [...new Set(drafts.map(d => d.entity_type))];
    const filteredDrafts = drafts.filter(d => d.entity_type === activeTab);

    // Step indicator
    const STEPS = [
        { key: "analyzing", label: "Dosya Okuma" },
        { key: "sheet_select", label: "Sheet Seçimi" },
        { key: "column_mapping", label: "Kolon Eşleştirme" },
        { key: "preview", label: "İnceleme" },
        { key: "importing", label: "İçe Aktarım" },
        { key: "done", label: "Tamamlandı" },
    ];
    const stepOrder = STEPS.map(s => s.key);

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
                <div>
                    <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
                        Veri İçe Aktarım
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "3px" }}>
                        Excel dosyasını yükle — kolon eşleştirme, önizleme ve içe aktarım
                    </div>
                </div>
                {(state !== "idle" && state !== "analyzing") && (
                    <button onClick={reset} style={{
                        fontSize: "12px", padding: "5px 12px",
                        border: "0.5px solid var(--border-secondary)", borderRadius: "6px",
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
                        return (
                            <div key={step.key} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                {i > 0 && <div style={{ width: "20px", height: "0.5px", background: isDone || isActive ? "var(--accent)" : "var(--border-secondary)" }} />}
                                <span style={{
                                    color: isDone ? "var(--success-text)" : isActive ? "var(--accent-text)" : "var(--text-tertiary)",
                                    fontWeight: isActive ? 600 : 400,
                                }}>
                                    {isDone ? "✓ " : ""}{step.label}
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Error banner */}
            {parseError && (
                <div style={{
                    padding: "10px 14px", background: "var(--danger-bg)",
                    border: "0.5px solid var(--danger-border)", borderRadius: "6px",
                    fontSize: "12px", color: "var(--danger-text)", display: "flex", alignItems: "center", gap: "8px",
                }}>
                    <span style={{ fontWeight: 600 }}>Hata:</span> {parseError}
                    <button onClick={() => setParseError(null)} style={{ marginLeft: "auto", background: "none", border: "none", color: "var(--danger-text)", cursor: "pointer", fontSize: "14px" }}>&times;</button>
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
                            border: `2px dashed ${dragOver ? "var(--accent-border)" : "var(--border-secondary)"}`,
                            borderRadius: "8px", padding: "48px 24px", textAlign: "center",
                            background: dragOver ? "rgba(56,139,253,0.07)" : "var(--bg-primary)",
                        }}
                    >
                        <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }}
                            onChange={e => { if (e.target.files?.[0]) handleFileSelect(e.target.files[0]); }} />
                        <div style={{ width: "56px", height: "56px", margin: "0 auto 16px", background: "var(--accent-bg)", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <svg width="24" height="24" viewBox="0 0 22 22" fill="none">
                                <path d="M11 14V4M11 4L7 8M11 4L15 8" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="M3 17h16" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" />
                            </svg>
                        </div>
                        <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "6px" }}>
                            {dragOver ? "Dosyayı bırak" : "Dosyanı içe aktar"}
                        </div>
                        <div style={{ fontSize: "12px", color: "var(--text-tertiary)", marginBottom: "20px" }}>
                            Excel ve CSV dosyalarını destekliyoruz
                        </div>
                        <button onClick={() => fileInputRef.current?.click()} style={{
                            padding: "8px 20px", background: "var(--accent)", color: "#fff",
                            border: "none", borderRadius: "6px", fontSize: "13px", fontWeight: 600, cursor: "pointer",
                        }}>Dosya Seç</button>
                        <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "8px" }}>veya dosyayı buraya sürükle</div>
                        <div style={{ display: "flex", gap: "6px", justifyContent: "center", marginTop: "20px", flexWrap: "wrap", alignItems: "center" }}>
                            {["XLSX", "XLS", "CSV"].map(ext => (
                                <span key={ext} style={{ fontSize: "11px", padding: "3px 10px", background: "var(--bg-secondary)", border: "0.5px solid var(--border-secondary)", borderRadius: "4px", color: "var(--text-secondary)", fontFamily: "monospace", fontWeight: 600 }}>{ext}</span>
                            ))}
                            <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>· çok-sheet desteklenir</span>
                        </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "0", background: "var(--bg-primary)", border: "0.5px solid var(--border-tertiary)", borderRadius: "6px", overflow: "hidden" }}>
                        {[
                            { icon: "🔍", label: "Dosya Oku" }, { icon: "🗂", label: "Sheet Seç" },
                            { icon: "🔗", label: "Kolon Eşleştir" }, { icon: "👁", label: "İncele" }, { icon: "✅", label: "İçe Aktar" },
                        ].map((step, i) => (
                            <div key={step.label} style={{ flex: 1, textAlign: "center", padding: "10px 8px", borderRight: i < 4 ? "0.5px solid var(--border-tertiary)" : "none", display: "flex", flexDirection: "column", alignItems: "center", gap: "3px" }}>
                                <span style={{ fontSize: "14px" }}>{step.icon}</span>
                                <span style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>{step.label}</span>
                            </div>
                        ))}
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px" }}>
                        {[
                            { title: "Çok-Sheet Desteği", desc: "Excel dosyanızdaki tüm sheetler otomatik tespit edilir." },
                            { title: "Akıllı Kolon Eşleştirme", desc: "AI kolonları ERP alanlarına eşleştirir, hafızaya kaydedilir." },
                            { title: "Seçici İçe Aktarım", desc: "Her alanı önizleyin, düzeltin, sonra onaylayın." },
                        ].map(card => (
                            <div key={card.title} style={{ background: "var(--bg-primary)", border: "0.5px solid var(--border-tertiary)", borderRadius: "6px", padding: "14px 16px" }}>
                                <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "4px" }}>{card.title}</div>
                                <div style={{ fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.5 }}>{card.desc}</div>
                            </div>
                        ))}
                    </div>
                </>
            )}

            {/* ───── ANALYZING ───── */}
            {state === "analyzing" && (
                <div style={{ background: "var(--bg-primary)", border: "0.5px solid var(--border-tertiary)", borderRadius: "8px", padding: "48px 24px", textAlign: "center" }}>
                    <div style={{ display: "flex", gap: "8px", justifyContent: "center", marginBottom: "24px" }}>
                        {[0, 1, 2].map(i => (
                            <div key={i} style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--accent)", animation: `pulse-dot 1.2s ease-in-out ${i * 0.2}s infinite` }} />
                        ))}
                    </div>
                    <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "4px" }}>Dosya okunuyor...</div>
                    {fileName && <div style={{ fontSize: "12px", color: "var(--text-tertiary)", marginBottom: "20px" }}>{fileName}</div>}
                    <div style={{ maxWidth: "320px", margin: "0 auto", height: "4px", background: "var(--border-tertiary)", borderRadius: "2px", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${progress}%`, background: "var(--accent)", borderRadius: "2px", transition: "width 0.35s ease" }} />
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "8px" }}>{progressLabel}</div>
                </div>
            )}

            {/* ───── SHEET SELECT ───── */}
            {state === "sheet_select" && (
                <>
                    <div style={{ background: "var(--bg-primary)", border: "0.5px solid var(--border-tertiary)", borderRadius: "8px", overflow: "hidden" }}>
                        <div style={{ padding: "12px 16px", borderBottom: "0.5px solid var(--border-tertiary)", background: "var(--bg-secondary)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
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
                                <div key={sheet.name} onClick={() => toggleSheet(idx)} style={{
                                    display: "flex", alignItems: "center", gap: "12px", padding: "10px 16px",
                                    borderBottom: idx < sheets.length - 1 ? "0.5px solid var(--border-tertiary)" : "none",
                                    cursor: sheet.status === "importable" ? "pointer" : "default",
                                    opacity: sheet.status === "unsupported" ? 0.5 : 1,
                                }}>
                                    <input type="checkbox" checked={sheet.selected} disabled={sheet.status !== "importable"}
                                        onChange={() => toggleSheet(idx)} onClick={e => e.stopPropagation()}
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
                                </div>
                            ))}
                        </div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                        <button onClick={reset} style={{ fontSize: "12px", padding: "7px 14px", border: "0.5px solid var(--border-secondary)", borderRadius: "6px", background: "transparent", color: "var(--text-secondary)", cursor: "pointer" }}>← Geri</button>
                        <button onClick={handleDetectColumns} disabled={isDemo || importableSelected.length === 0}
                            title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}
                            style={{ fontSize: "12px", padding: "7px 18px", border: "0.5px solid var(--accent-border)", borderRadius: "6px", background: (!isDemo && importableSelected.length > 0) ? "var(--accent-bg)" : "var(--bg-tertiary)", color: (!isDemo && importableSelected.length > 0) ? "var(--accent-text)" : "var(--text-tertiary)", cursor: (!isDemo && importableSelected.length > 0) ? "pointer" : "not-allowed", fontWeight: 600 }}>
                            Kolon Eşleştirmeye Geç →
                        </button>
                    </div>
                </>
            )}

            {/* ───── COLUMN MAPPING ───── */}
            {state === "column_mapping" && (
                <>
                    {detectingColumns ? (
                        <div style={{ background: "var(--bg-primary)", border: "0.5px solid var(--border-tertiary)", borderRadius: "8px", padding: "48px 24px", textAlign: "center" }}>
                            <div style={{ display: "flex", gap: "8px", justifyContent: "center", marginBottom: "24px" }}>
                                {[0, 1, 2].map(i => (
                                    <div key={i} style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--accent)", animation: `pulse-dot 1.2s ease-in-out ${i * 0.2}s infinite` }} />
                                ))}
                            </div>
                            <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "4px" }}>Kolonlar algılanıyor...</div>
                            <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>AI kolon adlarını ERP alanlarına eşleştiriyor</div>
                        </div>
                    ) : (
                        <>
                            {/* Sheet tabs */}
                            {importableSelected.length > 1 && (
                                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                                    {importableSelected.map(s => (
                                        <button key={s.name} onClick={() => setActiveTab(s.name)} style={tabBtnStyle(activeTab === s.name)}>
                                            {s.displayName}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {importableSelected.filter(s => !activeTab || s.name === activeTab).map(sheet => {
                                const mappings = columnMappings[sheet.name] ?? [];
                                const fields = ERP_FIELDS[sheet.entityType ?? ""] ?? [];

                                return (
                                    <div key={sheet.name} style={{ background: "var(--bg-primary)", border: "0.5px solid var(--border-tertiary)", borderRadius: "8px", overflow: "hidden" }}>
                                        <div style={{ padding: "12px 16px", borderBottom: "0.5px solid var(--border-tertiary)", background: "var(--bg-secondary)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                            <div>
                                                <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>{sheet.displayName}</span>
                                                <span style={{ fontSize: "12px", color: "var(--text-tertiary)", marginLeft: "10px" }}>{sheet.rows} satır · {sheet.headers.length} kolon</span>
                                            </div>
                                            <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>{entityTypeLabels[sheet.entityType ?? ""] ?? ""}</span>
                                        </div>

                                        {/* Table header */}
                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 80px", gap: "0", borderBottom: "0.5px solid var(--border-tertiary)", padding: "8px 16px", background: "var(--bg-secondary)" }}>
                                            <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)" }}>Excel Kolonu</span>
                                            <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)" }}>ERP Alanı</span>
                                            <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)" }}>Kaynak</span>
                                        </div>

                                        {mappings.map((m, colIdx) => (
                                            <div key={m.source_column} style={{
                                                display: "grid", gridTemplateColumns: "1fr 1fr 80px", gap: "0",
                                                alignItems: "center", padding: "8px 16px",
                                                borderBottom: colIdx < mappings.length - 1 ? "0.5px solid var(--border-tertiary)" : "none",
                                                background: colIdx % 2 === 0 ? "transparent" : "var(--bg-secondary)",
                                            }}>
                                                <span style={{ fontSize: "12px", color: "var(--text-primary)", fontFamily: "monospace" }}>{m.source_column}</span>
                                                <select
                                                    value={m.target_field ?? "skip"}
                                                    onChange={e => updateMapping(sheet.name, colIdx, e.target.value === "skip" ? null : e.target.value)}
                                                    style={{
                                                        fontSize: "12px", padding: "4px 8px", marginRight: "16px",
                                                        background: "var(--bg-primary)", color: "var(--text-primary)",
                                                        border: "0.5px solid var(--border-secondary)", borderRadius: "4px",
                                                        cursor: "pointer",
                                                    }}
                                                >
                                                    <option value="skip">— Atla —</option>
                                                    {fields.map(f => (
                                                        <option key={f.field} value={f.field}>{f.label} ({f.field})</option>
                                                    ))}
                                                </select>
                                                <span style={sourceChipStyle(m.source)}>
                                                    {m.source === "memory" ? "Hafıza" : m.source === "ai" ? "AI" : m.source === "user" ? "Kullanıcı" : "?"}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                );
                            })}

                            {/* Remember toggle */}
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <input type="checkbox" id="remember-mappings" checked={rememberMappings}
                                    onChange={e => setRememberMappings(e.target.checked)}
                                    style={{ accentColor: "var(--accent)", cursor: "pointer" }} />
                                <label htmlFor="remember-mappings" style={{ fontSize: "12px", color: "var(--text-secondary)", cursor: "pointer" }}>
                                    Bu eşleştirmeyi hatırla (aynı format tekrar gelince AI kullanılmaz)
                                </label>
                            </div>

                            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                                <button onClick={() => {
                                    if (batchId) { fetch(`/api/import/${batchId}`, { method: "DELETE" }).catch(() => {}); }
                                    setState("sheet_select"); setColumnMappings({}); setBatchId(null);
                                }} style={{ fontSize: "12px", padding: "7px 14px", border: "0.5px solid var(--border-secondary)", borderRadius: "6px", background: "transparent", color: "var(--text-secondary)", cursor: "pointer" }}>← Geri</button>
                                <button onClick={handleApplyMappings} style={{ fontSize: "12px", padding: "7px 18px", border: "0.5px solid var(--accent-border)", borderRadius: "6px", background: "var(--accent-bg)", color: "var(--accent-text)", cursor: "pointer", fontWeight: 600 }}>
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
                                <button key={type} onClick={() => { setActiveTab(type); setBulkField(""); setBulkValue(""); setPreviewPage(0); }} style={tabBtnStyle(activeTab === type)}>
                                    {entityTypeLabels[type] ?? type}
                                    <span style={{ marginLeft: "5px", fontSize: "10px", opacity: 0.7 }}>{count}</span>
                                </button>
                            );
                        })}
                    </div>

                    {/* Summary + bulk fill */}
                    {(() => {
                        const entityFields = ERP_FIELDS[activeTab] ?? [];
                        const applyBulkFill = () => {
                            if (!bulkField || bulkValue === "") return;
                            const ids = filteredDrafts.map(d => d.id);
                            setDraftEdits(prev => {
                                const next = { ...prev };
                                for (const id of ids) {
                                    const existing = prev[id] ?? {};
                                    // Only fill if empty
                                    const currentVal = existing[bulkField] ?? (filteredDrafts.find(d => d.id === id)?.parsed_data as Record<string, unknown> ?? {})[bulkField];
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
                            <div style={{ display: "flex", gap: "8px", padding: "10px 14px", background: "var(--bg-secondary)", border: "0.5px solid var(--border-tertiary)", borderRadius: "6px", fontSize: "12px", flexWrap: "wrap", alignItems: "center" }}>
                                <span style={{ color: "var(--text-secondary)" }}>Toplam: <strong>{filteredDrafts.length}</strong> satır</span>
                                <span style={{ color: "var(--text-tertiary)", fontSize: "11px", marginRight: "auto" }}>Hücreye tıkla → düzelt</span>
                                {/* Bulk fill */}
                                <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>Toplu doldur:</span>
                                <select value={bulkField} onChange={e => setBulkField(e.target.value)} style={{ fontSize: "11px", padding: "3px 6px", background: "var(--bg-primary)", color: "var(--text-primary)", border: "0.5px solid var(--border-secondary)", borderRadius: "4px" }}>
                                    <option value="">Alan seç</option>
                                    {entityFields.map(f => <option key={f.field} value={f.field}>{f.label}</option>)}
                                </select>
                                <input value={bulkValue} onChange={e => setBulkValue(e.target.value)} placeholder="Değer..." onKeyDown={e => { if (e.key === "Enter") applyBulkFill(); }}
                                    style={{ fontSize: "11px", padding: "3px 8px", background: "var(--bg-primary)", color: "var(--text-primary)", border: "0.5px solid var(--border-secondary)", borderRadius: "4px", width: "120px" }} />
                                <button onClick={applyBulkFill} disabled={!bulkField || bulkValue === ""} style={{ fontSize: "11px", padding: "3px 10px", background: bulkField && bulkValue ? "var(--accent-bg)" : "var(--bg-tertiary)", color: bulkField && bulkValue ? "var(--accent-text)" : "var(--text-tertiary)", border: "0.5px solid var(--border-secondary)", borderRadius: "4px", cursor: bulkField && bulkValue ? "pointer" : "not-allowed" }}>
                                    Boşlara Uygula
                                </button>
                            </div>
                        );
                    })()}

                    {/* Table preview */}
                    {filteredDrafts.length === 0 ? (
                        <div style={{ padding: "24px", textAlign: "center", background: "var(--bg-primary)", border: "0.5px solid var(--border-tertiary)", borderRadius: "8px", color: "var(--text-tertiary)", fontSize: "12px" }}>
                            Bu kategoride satır bulunmuyor.
                        </div>
                    ) : (() => {
                        // Collect ALL fields from ALL drafts (union), required fields first
                        const required = REQUIRED_FIELDS[filteredDrafts[0].entity_type] ?? [];
                        const fieldSet = new Set<string>();
                        for (const d of filteredDrafts) {
                            for (const k of Object.keys((d.parsed_data ?? {}) as Record<string, unknown>)) fieldSet.add(k);
                            const edits = draftEdits[d.id];
                            if (edits) { for (const k of Object.keys(edits)) fieldSet.add(k); }
                        }
                        // Required fields always shown (even if unmapped), then the rest
                        const visibleFields = [
                            ...required,
                            ...[...fieldSet].filter(f => !required.includes(f)),
                        ];

                        return (
                            <div style={{ background: "var(--bg-primary)", border: "0.5px solid var(--border-tertiary)", borderRadius: "8px", overflow: "auto" }}>
                                {/* Table header */}
                                <div style={{ display: "grid", gridTemplateColumns: `32px repeat(${visibleFields.length}, minmax(110px, 1fr))`, borderBottom: "0.5px solid var(--border-secondary)", background: "var(--bg-secondary)", minWidth: "600px" }}>
                                    <div style={{ padding: "8px 12px", fontSize: "11px", fontWeight: 600, color: "var(--text-tertiary)" }}>#</div>
                                    {visibleFields.map(f => (
                                        <div key={f} style={{ padding: "8px 12px", fontSize: "11px", fontWeight: 600, color: required.includes(f) ? "var(--accent-text)" : "var(--text-secondary)", borderLeft: "0.5px solid var(--border-tertiary)" }}>
                                            {f}{required.includes(f) ? " *" : ""}
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
                                        <div key={draft.id} style={{ display: "grid", gridTemplateColumns: `32px repeat(${visibleFields.length}, minmax(110px, 1fr))`, borderBottom: rowIdx < filteredDrafts.length - 1 ? "0.5px solid var(--border-tertiary)" : "none", background: rowHasMissing ? "rgba(var(--danger-rgb,248,81,73),0.06)" : globalIdx % 2 === 0 ? "transparent" : "var(--bg-secondary)", minWidth: "600px" }}>
                                            <div style={{ padding: "6px 12px", fontSize: "11px", color: "var(--text-tertiary)", display: "flex", alignItems: "center" }}>
                                                {rowHasMissing ? <span style={{ color: "var(--warning-text)", fontSize: "12px" }}>⚠</span> : globalIdx + 1}
                                            </div>
                                            {visibleFields.map(f => {
                                                const val = getEffectiveValue(draft, f);
                                                const isEditing = editingCell?.draftId === draft.id && editingCell?.field === f;
                                                const isEmpty = required.includes(f) && (val === undefined || val === null || val === "");
                                                return (
                                                    <div key={f} style={{ borderLeft: "0.5px solid var(--border-tertiary)", position: "relative" }}
                                                        onClick={() => { if (!isEditing) startEdit(draft.id, f, val); }}>
                                                        {isEditing ? (
                                                            <input
                                                                autoFocus
                                                                value={editingValue}
                                                                onChange={e => setEditingValue(e.target.value)}
                                                                onBlur={() => commitEdit(draft.id, f)}
                                                                onKeyDown={e => { if (e.key === "Enter") commitEdit(draft.id, f); if (e.key === "Escape") setEditingCell(null); }}
                                                                style={{ width: "100%", padding: "6px 12px", background: "var(--accent-bg)", border: "none", borderTop: "1.5px solid var(--accent)", fontSize: "12px", color: "var(--text-primary)", outline: "none", boxSizing: "border-box" }}
                                                            />
                                                        ) : (
                                                            <div style={{ padding: "6px 12px", fontSize: "12px", color: isEmpty ? "var(--danger-text)" : "var(--text-primary)", cursor: "pointer", outline: isEmpty ? "1px solid var(--danger-border)" : "none", minHeight: "30px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                                {val !== undefined && val !== null && val !== "" ? String(val) : <span style={{ color: "var(--text-tertiary)", fontStyle: "italic" }}>boş</span>}
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
                                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "12px", padding: "10px 12px", background: "var(--bg-secondary)", borderTop: "0.5px solid var(--border-tertiary)", fontSize: "12px", color: "var(--text-secondary)" }}>
                                            <button onClick={() => setPreviewPage(p => Math.max(0, p - 1))} disabled={previewPage === 0}
                                                style={{ fontSize: "12px", padding: "4px 12px", background: previewPage === 0 ? "var(--bg-tertiary)" : "var(--bg-primary)", color: previewPage === 0 ? "var(--text-tertiary)" : "var(--text-primary)", border: "0.5px solid var(--border-secondary)", borderRadius: "4px", cursor: previewPage === 0 ? "not-allowed" : "pointer" }}>
                                                ← Önceki
                                            </button>
                                            <span>Sayfa {previewPage + 1} / {totalPages} (toplam {filteredDrafts.length} satır)</span>
                                            <button onClick={() => setPreviewPage(p => Math.min(totalPages - 1, p + 1))} disabled={previewPage >= totalPages - 1}
                                                style={{ fontSize: "12px", padding: "4px 12px", background: previewPage >= totalPages - 1 ? "var(--bg-tertiary)" : "var(--bg-primary)", color: previewPage >= totalPages - 1 ? "var(--text-tertiary)" : "var(--text-primary)", border: "0.5px solid var(--border-secondary)", borderRadius: "4px", cursor: previewPage >= totalPages - 1 ? "not-allowed" : "pointer" }}>
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
                            <div style={{ padding: "8px 14px", background: "var(--warning-bg)", border: "0.5px solid var(--warning-border)", borderRadius: "6px", fontSize: "12px", color: "var(--warning-text)" }}>
                                ⚠ {missingCount} satırda zorunlu alan eksik (*). İçe aktarımda bu satırlar atlanabilir.
                            </div>
                        ) : null;
                    })()}

                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                        <button onClick={() => { setState("column_mapping"); setDrafts([]); }} style={{ fontSize: "12px", padding: "7px 14px", border: "0.5px solid var(--border-secondary)", borderRadius: "6px", background: "transparent", color: "var(--text-secondary)", cursor: "pointer" }}>← Geri</button>
                        <button onClick={handleImport} disabled={isDemo} title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}
                            style={{ fontSize: "12px", padding: "7px 18px", border: "0.5px solid var(--accent-border)", borderRadius: "6px", background: isDemo ? "var(--bg-tertiary)" : "var(--accent-bg)", color: isDemo ? "var(--text-tertiary)" : "var(--accent-text)", cursor: isDemo ? "not-allowed" : "pointer", fontWeight: 600, opacity: isDemo ? 0.5 : 1 }}>
                            Onayla ve İçe Aktar →
                        </button>
                    </div>
                </>
            )}

            {/* ───── IMPORTING ───── */}
            {state === "importing" && (
                <div style={{ background: "var(--bg-primary)", border: "0.5px solid var(--border-tertiary)", borderRadius: "8px", padding: "24px" }}>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "20px" }}>İçe aktarılıyor...</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                        {sheets.filter(s => s.status === "importable" && s.selected).map(sheet => {
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
                                        <div style={{ height: "100%", width: `${pct}%`, background: done ? "var(--success)" : "var(--accent)", borderRadius: "3px", transition: "width 0.2s ease" }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ───── DONE ───── */}
            {state === "done" && (
                <div style={{ background: "var(--bg-primary)", border: "0.5px solid var(--success-border)", borderRadius: "8px", padding: "32px 24px" }}>
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
                    {confirmResult && confirmResult.errors.length > 0 && (
                        <div style={{ marginBottom: "16px", background: "var(--danger-bg)", border: "0.5px solid var(--danger-border)", borderRadius: "6px", padding: "12px 14px" }}>
                            <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--danger-text)", marginBottom: "8px" }}>{confirmResult.errors.length} satırda sorun oluştu</div>
                            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                                {confirmResult.errors.map((err, i) => (
                                    <div key={i} style={{ fontSize: "11px", color: "var(--text-secondary)" }}>· {err}</div>
                                ))}
                            </div>
                        </div>
                    )}
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        <Link href="/dashboard/customers" style={{ fontSize: "12px", padding: "6px 14px", border: "0.5px solid var(--accent-border)", borderRadius: "6px", background: "var(--accent-bg)", color: "var(--accent-text)", textDecoration: "none", fontWeight: 500 }}>Cariler sayfasına git →</Link>
                        <Link href="/dashboard/orders" style={{ fontSize: "12px", padding: "6px 14px", border: "0.5px solid var(--accent-border)", borderRadius: "6px", background: "var(--accent-bg)", color: "var(--accent-text)", textDecoration: "none", fontWeight: 500 }}>Siparişler sayfasına git →</Link>
                        <Link href="/dashboard/products" style={{ fontSize: "12px", padding: "6px 14px", border: "0.5px solid var(--accent-border)", borderRadius: "6px", background: "var(--accent-bg)", color: "var(--accent-text)", textDecoration: "none", fontWeight: 500 }}>Stok & Ürünler →</Link>
                        <button onClick={reset} style={{ fontSize: "12px", padding: "6px 16px", border: "0.5px solid var(--border-secondary)", borderRadius: "6px", background: "transparent", color: "var(--text-secondary)", cursor: "pointer" }}>Yeni Dosya Yükle</button>
                    </div>
                </div>
            )}
        </div>
    );
}
