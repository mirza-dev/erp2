"use client";

import { useState, useRef, useCallback } from "react";
import Link from "next/link";
import { useData } from "@/lib/data-context";
import * as XLSX from "xlsx";

type ImportState = "idle" | "analyzing" | "sheet_select" | "parsing" | "preview" | "importing" | "done";

// ─── Sheet info derived from actual file ─────────────────────────────────────
interface SheetInfo {
    name: string;
    displayName: string;
    rows: number;
    entity: string;
    entityType: "customer" | "product" | "order" | "order_line" | "stock" | null;
    status: "importable" | "parasut" | "unsupported";
    selected: boolean;
    headers: string[];
    previewRows: Array<Record<string, string>>;
    allRows: Array<Record<string, string>>;
}

// Known sheet → entity type mapping
const SHEET_ENTITY_MAP: Record<string, { entityType: "customer" | "product" | "order" | "order_line" | "stock"; displayName: string; entity: string; status: "importable" }> = {
    Urunler: { entityType: "product", displayName: "Ürünler", entity: "Ürünler", status: "importable" },
    Musteriler: { entityType: "customer", displayName: "Müşteriler", entity: "Müşteriler", status: "importable" },
    Siparisler: { entityType: "order", displayName: "Siparişler", entity: "Siparişler", status: "importable" },
    Siparis_Kalemleri: { entityType: "order_line", displayName: "Sipariş Kalemleri", entity: "Sipariş Kalemleri", status: "importable" },
    Stok: { entityType: "stock", displayName: "Stok", entity: "Stok Güncellemesi", status: "importable" },
};

const PARASUT_SHEETS = new Set(["Faturalar", "Tahsilatlar"]);

// Entity types that support AI parse (customer/product/order only)
const AI_PARSEABLE: Set<string> = new Set(["customer", "product", "order"]);

// ─── Draft type from API ─────────────────────────────────────────────────────
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
}

// ─── Styles ────────────────────────────────────────────────────────────────
const tabBtnStyle = (active: boolean): React.CSSProperties => ({
    fontSize: "12px",
    padding: "5px 12px",
    border: "0.5px solid " + (active ? "var(--accent-border)" : "var(--border-secondary)"),
    borderRadius: "5px",
    background: active ? "var(--accent-bg)" : "transparent",
    color: active ? "var(--accent-text)" : "var(--text-secondary)",
    cursor: "pointer",
    whiteSpace: "nowrap",
});

// ─── Confidence helpers ─────────────────────────────────────────────────────
function confidenceColor(c: number): string {
    if (c >= 0.8) return "var(--success-text)";
    if (c >= 0.5) return "var(--warning-text)";
    return "var(--danger-text)";
}

function confidenceBg(c: number): string {
    if (c >= 0.8) return "var(--success-bg)";
    if (c >= 0.5) return "var(--warning-bg)";
    return "var(--danger-bg)";
}

function confidenceLabel(c: number): string {
    if (c >= 0.8) return "Yüksek";
    if (c >= 0.5) return "Orta";
    return "Düşük";
}

export default function ImportPage() {
    const { refetchAll } = useData();
    const [state, setState] = useState<ImportState>("idle");
    const [fileName, setFileName] = useState<string | null>(null);
    const [dragOver, setDragOver] = useState(false);
    const [progress, setProgress] = useState(0);
    const [progressLabel, setProgressLabel] = useState("");
    const [sheets, setSheets] = useState<SheetInfo[]>([]);
    const [activeTab, setActiveTab] = useState("");
    const [importProgress, setImportProgress] = useState<Record<string, number>>({});
    const [confirmResult, setConfirmResult] = useState<{ merged: number; skipped: number; errors: string[] } | null>(null);
    const [drafts, setDrafts] = useState<DraftRow[]>([]);
    const [aiAvailable, setAiAvailable] = useState(true);
    const [parseError, setParseError] = useState<string | null>(null);
    const [batchId, setBatchId] = useState<string | null>(null);
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

                    // Determine entity type and status
                    const known = SHEET_ENTITY_MAP[name];
                    const isParasut = PARASUT_SHEETS.has(name);

                    return {
                        name,
                        displayName: known?.displayName ?? name,
                        rows: jsonRows.length,
                        entity: known?.entity ?? (isParasut ? name : name),
                        entityType: known?.entityType ?? null,
                        status: known ? "importable" : isParasut ? "parasut" : "unsupported",
                        selected: !!known,
                        headers,
                        previewRows: jsonRows.slice(0, 5).map(row =>
                            Object.fromEntries(Object.entries(row).map(([k, v]) => [k, String(v)]))
                        ),
                        allRows: jsonRows.map(row =>
                            Object.fromEntries(Object.entries(row).map(([k, v]) => [k, String(v)]))
                        ),
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
        reader.onerror = () => {
            setParseError("Dosya okuma hatası.");
            setState("idle");
        };
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

    // ─── AI Parse step ────────────────────────────────────────────────
    const handleParse = async () => {
        setState("parsing");
        setProgress(0);
        setProgressLabel("AI analiz başlatılıyor...");
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

            setProgress(20);
            setProgressLabel("AI analiz ediyor...");

            // 2. Prepare sheets for parse — only AI-parseable entity types
            const selectedSheets = sheets.filter(s => s.status === "importable" && s.selected);
            const parseableSheets = selectedSheets
                .filter(s => s.entityType && AI_PARSEABLE.has(s.entityType))
                .map(s => ({
                    sheet_name: s.name,
                    entity_type: s.entityType as "customer" | "product" | "order",
                    rows: s.allRows,
                }));

            let parsedDrafts: DraftRow[] = [];
            let isAiAvailable = true;

            if (parseableSheets.length > 0) {
                // 3. Call AI parse endpoint
                const parseRes = await fetch(`/api/import/${batch.id}/parse`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ sheets: parseableSheets }),
                });

                setProgress(70);
                setProgressLabel("Sonuçlar işleniyor...");

                if (!parseRes.ok) {
                    const err = await parseRes.json().catch(() => ({}));
                    throw new Error(err.error ?? "AI parse başarısız.");
                }

                const parseResult = await parseRes.json();
                parsedDrafts = parseResult.drafts ?? [];
                isAiAvailable = parseResult.ai_available ?? true;
            }

            // 4. For non-AI-parseable sheets (order_line, stock), create simple drafts
            const nonParseableSheets = selectedSheets.filter(s => s.entityType && !AI_PARSEABLE.has(s.entityType));
            if (nonParseableSheets.length > 0) {
                for (const sheet of nonParseableSheets) {
                    const simpleDrafts = sheet.allRows.map(row => ({
                        entity_type: sheet.entityType!,
                        parsed_data: row as Record<string, unknown>,
                        raw_data: row as Record<string, unknown>,
                        confidence: 0.5,
                        ai_reason: "Doğrudan kolon eşleştirmesi (AI parse desteklenmiyor)",
                    }));

                    const draftRes = await fetch(`/api/import/${batch.id}/drafts`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(simpleDrafts),
                    });
                    if (draftRes.ok) {
                        const created = await draftRes.json();
                        parsedDrafts.push(...created);
                    }
                }
            }

            setProgress(100);
            setProgressLabel("Analiz tamamlandı");
            setDrafts(parsedDrafts);
            setAiAvailable(isAiAvailable);

            // Set active tab to first entity type with drafts
            const firstType = parsedDrafts[0]?.entity_type;
            if (firstType) setActiveTab(firstType);

            setTimeout(() => setState("preview"), 300);
        } catch (err) {
            console.error("Parse failed:", err);
            setParseError(err instanceof Error ? err.message : "Parse hatası.");
            setState("sheet_select");
        }
    };

    // ─── Import (confirm) step ────────────────────────────────────────
    const handleImport = async () => {
        if (!batchId) return;
        setState("importing");

        const selectedSheets = sheets.filter(s => s.status === "importable" && s.selected);
        const init: Record<string, number> = {};
        selectedSheets.forEach(s => (init[s.name] = 0));
        setImportProgress(init);

        try {
            // Simulate progress per sheet
            for (const sheet of selectedSheets) {
                setImportProgress(prev => ({ ...prev, [sheet.name]: sheet.rows }));
            }

            // Confirm batch → merge drafts to real entities
            const confirmRes = await fetch(`/api/import/${batchId}/confirm`, { method: "POST" });
            if (confirmRes.ok) {
                const result = await confirmRes.json();
                setConfirmResult(result);
            }

            await refetchAll();
            setState("done");
        } catch (err) {
            console.error("Import failed:", err);
            setConfirmResult({ merged: 0, skipped: 0, errors: [String(err)] });
            setState("done");
        }
    };

    const reset = () => {
        setState("idle");
        setFileName(null);
        setProgress(0);
        setProgressLabel("");
        setImportProgress({});
        setConfirmResult(null);
        setDrafts([]);
        setSheets([]);
        setActiveTab("");
        setBatchId(null);
        setParseError(null);
        setAiAvailable(true);
    };

    const importableSelected = sheets.filter(s => s.status === "importable" && s.selected);
    const parasutSheets = sheets.filter(s => s.status === "parasut");

    // Group drafts by entity_type for the preview/review step
    const draftEntityTypes = [...new Set(drafts.map(d => d.entity_type))];
    const filteredDrafts = drafts.filter(d => d.entity_type === activeTab);

    // Entity type labels
    const entityTypeLabels: Record<string, string> = {
        customer: "Müşteriler",
        product: "Ürünler",
        order: "Siparişler",
        order_line: "Sipariş Kalemleri",
        stock: "Stok",
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
                <div>
                    <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
                        Veri İçe Aktarım
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "3px" }}>
                        Excel dosyasını yükle — AI ile otomatik ayrıştırma, güven skoru ve inceleme
                    </div>
                </div>
                {(state !== "idle" && state !== "analyzing") && (
                    <button
                        onClick={reset}
                        style={{
                            fontSize: "12px",
                            padding: "5px 12px",
                            border: "0.5px solid var(--border-secondary)",
                            borderRadius: "6px",
                            background: "transparent",
                            color: "var(--text-secondary)",
                            cursor: "pointer",
                        }}
                    >
                        Yeni Dosya
                    </button>
                )}
            </div>

            {/* Step indicator */}
            {state !== "idle" && (
                <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px" }}>
                    {[
                        { key: "analyzing", label: "Dosya Okuma" },
                        { key: "sheet_select", label: "Sheet Seçimi" },
                        { key: "parsing", label: "AI Analiz" },
                        { key: "preview", label: "İnceleme" },
                        { key: "importing", label: "İçe Aktarım" },
                        { key: "done", label: "Tamamlandı" },
                    ].map((step, i) => {
                        const order = ["analyzing", "sheet_select", "parsing", "preview", "importing", "done"];
                        const currentIdx = order.indexOf(state);
                        const stepIdx = order.indexOf(step.key);
                        const isDone = stepIdx < currentIdx;
                        const isActive = stepIdx === currentIdx;
                        return (
                            <div key={step.key} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                {i > 0 && <div style={{ width: "20px", height: "0.5px", background: isDone || isActive ? "var(--accent)" : "var(--border-secondary)" }} />}
                                <span style={{
                                    color: isDone ? "var(--success-text)" : isActive ? "var(--accent-text)" : "var(--text-tertiary)",
                                    fontWeight: isActive ? 600 : 400,
                                }}>
                                    {isDone ? "\u2713 " : ""}{step.label}
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Parse error banner */}
            {parseError && (
                <div style={{
                    padding: "10px 14px",
                    background: "var(--danger-bg)",
                    border: "0.5px solid var(--danger-border)",
                    borderRadius: "6px",
                    fontSize: "12px",
                    color: "var(--danger-text)",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                }}>
                    <span style={{ fontWeight: 600 }}>Hata:</span> {parseError}
                    <button
                        onClick={() => setParseError(null)}
                        style={{ marginLeft: "auto", background: "none", border: "none", color: "var(--danger-text)", cursor: "pointer", fontSize: "14px" }}
                    >&times;</button>
                </div>
            )}

            {/* ───── IDLE ───── */}
            {state === "idle" && (
                <>
                    {/* Drop zone */}
                    <div
                        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={handleDrop}
                        style={{
                            border: `2px dashed ${dragOver ? "var(--accent-border)" : "var(--border-secondary)"}`,
                            borderRadius: "8px",
                            padding: "48px 24px",
                            textAlign: "center",
                            background: dragOver ? "rgba(56,139,253,0.07)" : "var(--bg-primary)",
                            transition: "border-color 0.15s, background 0.15s",
                        }}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".xlsx,.xls,.csv"
                            style={{ display: "none" }}
                            onChange={e => { if (e.target.files?.[0]) handleFileSelect(e.target.files[0]); }}
                        />
                        <div style={{
                            width: "56px", height: "56px", margin: "0 auto 16px",
                            background: "var(--accent-bg)", borderRadius: "10px",
                            display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                            <svg width="24" height="24" viewBox="0 0 22 22" fill="none">
                                <path d="M11 14V4M11 4L7 8M11 4L15 8" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="M3 17h16" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" />
                            </svg>
                        </div>
                        <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "6px" }}>
                            {dragOver ? "Dosyay\u0131 b\u0131rak" : "Dosyan\u0131 i\u00e7e aktar"}
                        </div>
                        <div style={{ fontSize: "12px", color: "var(--text-tertiary)", marginBottom: "20px" }}>
                            Excel ve CSV dosyalar\u0131n\u0131 destekliyoruz
                        </div>
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            style={{
                                padding: "8px 20px",
                                background: "var(--accent)",
                                color: "#fff",
                                border: "none",
                                borderRadius: "6px",
                                fontSize: "13px",
                                fontWeight: 600,
                                cursor: "pointer",
                            }}
                        >
                            Dosya Se\u00e7
                        </button>
                        <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "8px" }}>
                            veya dosyay\u0131 buraya s\u00fcr\u00fckle
                        </div>
                        {/* File type chips */}
                        <div style={{ display: "flex", gap: "6px", justifyContent: "center", marginTop: "20px", flexWrap: "wrap", alignItems: "center" }}>
                            {["XLSX", "XLS", "CSV"].map(ext => (
                                <span key={ext} style={{
                                    fontSize: "11px", padding: "3px 10px",
                                    background: "var(--bg-secondary)",
                                    border: "0.5px solid var(--border-secondary)",
                                    borderRadius: "4px",
                                    color: "var(--text-secondary)",
                                    fontFamily: "monospace",
                                    fontWeight: 600,
                                }}>{ext}</span>
                            ))}
                            <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>\u00b7 \u00e7ok-sheet desteklenir</span>
                        </div>
                    </div>

                    {/* Flow indicator */}
                    <div style={{
                        display: "flex", alignItems: "center", gap: "0",
                        background: "var(--bg-primary)", border: "0.5px solid var(--border-tertiary)",
                        borderRadius: "6px", overflow: "hidden",
                    }}>
                        {[
                            { icon: "\ud83d\udd0d", label: "Dosya Oku" },
                            { icon: "\ud83d\uddc2", label: "Sheet Se\u00e7" },
                            { icon: "\ud83e\udde0", label: "AI Analiz" },
                            { icon: "\ud83d\udc41", label: "\u0130ncele" },
                            { icon: "\u2705", label: "\u0130\u00e7e Aktar" },
                        ].map((step, i) => (
                            <div key={step.label} style={{
                                flex: 1, textAlign: "center", padding: "10px 8px",
                                borderRight: i < 4 ? "0.5px solid var(--border-tertiary)" : "none",
                                display: "flex", flexDirection: "column", alignItems: "center", gap: "3px",
                            }}>
                                <span style={{ fontSize: "14px" }}>{step.icon}</span>
                                <span style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>{step.label}</span>
                            </div>
                        ))}
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px" }}>
                        {[
                            { title: "\u00c7ok-Sheet Deste\u011fi", desc: "Excel dosyan\u0131zdaki t\u00fcm sheetler otomatik tespit edilir." },
                            { title: "AI Ayr\u0131\u015ft\u0131rma", desc: "Her sat\u0131r AI ile analiz edilir, g\u00fcven skoru ve e\u015fle\u015ftirme \u00f6nerisi verilir." },
                            { title: "Se\u00e7ici \u0130\u00e7e Aktar\u0131m", desc: "D\u00fc\u015f\u00fck g\u00fcvenli sat\u0131rlar\u0131 inceleyip onaylay\u0131n veya reddedin." },
                        ].map(card => (
                            <div key={card.title} style={{
                                background: "var(--bg-primary)", border: "0.5px solid var(--border-tertiary)",
                                borderRadius: "6px", padding: "14px 16px",
                            }}>
                                <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "4px" }}>{card.title}</div>
                                <div style={{ fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.5 }}>{card.desc}</div>
                            </div>
                        ))}
                    </div>
                </>
            )}

            {/* ───── ANALYZING ───── */}
            {state === "analyzing" && (
                <div style={{
                    background: "var(--bg-primary)", border: "0.5px solid var(--border-tertiary)",
                    borderRadius: "8px", padding: "48px 24px", textAlign: "center",
                }}>
                    <div style={{ display: "flex", gap: "8px", justifyContent: "center", marginBottom: "24px" }}>
                        {[0, 1, 2].map(i => (
                            <div key={i} style={{
                                width: "8px", height: "8px", borderRadius: "50%",
                                background: "var(--accent)",
                                animation: `pulse-dot 1.2s ease-in-out ${i * 0.2}s infinite`,
                            }} />
                        ))}
                    </div>
                    <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "4px" }}>
                        Dosya okunuyor...
                    </div>
                    {fileName && (
                        <div style={{ fontSize: "12px", color: "var(--text-tertiary)", marginBottom: "20px" }}>{fileName}</div>
                    )}
                    <div style={{ maxWidth: "320px", margin: "0 auto", height: "4px", background: "var(--border-tertiary)", borderRadius: "2px", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${progress}%`, background: "var(--accent)", borderRadius: "2px", transition: "width 0.35s ease" }} />
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "8px" }}>{progressLabel}</div>
                </div>
            )}

            {/* ───── SHEET SELECT ───── */}
            {state === "sheet_select" && (
                <>
                    <div style={{
                        background: "var(--bg-primary)", border: "0.5px solid var(--border-tertiary)",
                        borderRadius: "8px", overflow: "hidden",
                    }}>
                        {/* Header */}
                        <div style={{
                            padding: "12px 16px", borderBottom: "0.5px solid var(--border-tertiary)",
                            background: "var(--bg-secondary)", display: "flex", alignItems: "center", justifyContent: "space-between",
                        }}>
                            <div>
                                <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
                                    Dosyada {sheets.length} sheet bulundu
                                </span>
                                <span style={{ fontSize: "12px", color: "var(--text-tertiary)", marginLeft: "10px" }}>
                                    {importableSelected.length} i\u00e7e aktar\u0131labilir \u00b7 {importableSelected.filter(s => s.selected).length} se\u00e7ili
                                </span>
                            </div>
                            {fileName && <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>{fileName}</span>}
                        </div>

                        {/* Sheet rows */}
                        <div style={{ display: "flex", flexDirection: "column" }}>
                            {sheets.map((sheet, idx) => {
                                const statusColor = sheet.status === "importable"
                                    ? "var(--success-text)"
                                    : sheet.status === "parasut"
                                    ? "var(--accent-text)"
                                    : "var(--text-tertiary)";
                                const statusBg = sheet.status === "importable"
                                    ? "var(--success-bg)"
                                    : sheet.status === "parasut"
                                    ? "var(--accent-bg)"
                                    : "var(--bg-tertiary)";
                                const statusLabel = sheet.status === "importable"
                                    ? "\u0130\u00e7e Aktar\u0131labilir"
                                    : sheet.status === "parasut"
                                    ? "Para\u015f\u00fct ile sync"
                                    : "Desteklenmiyor";

                                return (
                                    <div
                                        key={sheet.name}
                                        onClick={() => toggleSheet(idx)}
                                        style={{
                                            display: "flex", alignItems: "center", gap: "12px",
                                            padding: "10px 16px",
                                            borderBottom: idx < sheets.length - 1 ? "0.5px solid var(--border-tertiary)" : "none",
                                            cursor: sheet.status === "importable" ? "pointer" : "default",
                                            opacity: sheet.status === "unsupported" ? 0.5 : 1,
                                        }}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={sheet.selected}
                                            disabled={sheet.status !== "importable"}
                                            onChange={() => toggleSheet(idx)}
                                            onClick={e => e.stopPropagation()}
                                            style={{ cursor: sheet.status === "importable" ? "pointer" : "default", accentColor: "var(--accent)" }}
                                        />
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                                <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-primary)" }}>
                                                    {sheet.displayName}
                                                </span>
                                                <span style={{ fontSize: "10px", color: "var(--text-tertiary)", fontFamily: "monospace" }}>
                                                    {sheet.name}
                                                </span>
                                            </div>
                                            {sheet.headers.length > 0 && (
                                                <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "2px" }}>
                                                    Kolonlar: {sheet.headers.slice(0, 5).join(", ")}{sheet.headers.length > 5 ? ` +${sheet.headers.length - 5}` : ""}
                                                </div>
                                            )}
                                        </div>
                                        <span style={{ fontSize: "11px", color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>
                                            {sheet.rows.toLocaleString("tr-TR")} sat\u0131r
                                        </span>
                                        <span style={{
                                            fontSize: "10px", padding: "2px 8px",
                                            background: statusBg, color: statusColor,
                                            borderRadius: "10px", whiteSpace: "nowrap",
                                        }}>
                                            {statusLabel}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                        <button onClick={reset} style={{
                            fontSize: "12px", padding: "7px 14px",
                            border: "0.5px solid var(--border-secondary)", borderRadius: "6px",
                            background: "transparent", color: "var(--text-secondary)", cursor: "pointer",
                        }}>\u2190 Geri</button>
                        <button
                            onClick={handleParse}
                            disabled={importableSelected.length === 0}
                            style={{
                                fontSize: "12px", padding: "7px 18px",
                                border: "0.5px solid var(--accent-border)", borderRadius: "6px",
                                background: importableSelected.length > 0 ? "var(--accent-bg)" : "var(--bg-tertiary)",
                                color: importableSelected.length > 0 ? "var(--accent-text)" : "var(--text-tertiary)",
                                cursor: importableSelected.length > 0 ? "pointer" : "not-allowed", fontWeight: 600,
                            }}
                        >
                            AI Analiz Ba\u015flat \u2192
                        </button>
                    </div>
                </>
            )}

            {/* ───── PARSING (AI Analysis) ───── */}
            {state === "parsing" && (
                <div style={{
                    background: "var(--bg-primary)", border: "0.5px solid var(--border-tertiary)",
                    borderRadius: "8px", padding: "48px 24px", textAlign: "center",
                }}>
                    <div style={{ display: "flex", gap: "8px", justifyContent: "center", marginBottom: "24px" }}>
                        {[0, 1, 2].map(i => (
                            <div key={i} style={{
                                width: "8px", height: "8px", borderRadius: "50%",
                                background: "var(--accent)",
                                animation: `pulse-dot 1.2s ease-in-out ${i * 0.2}s infinite`,
                            }} />
                        ))}
                    </div>
                    <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "4px" }}>
                        AI analiz ediyor...
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--text-tertiary)", marginBottom: "20px" }}>
                        {importableSelected.reduce((sum, s) => sum + s.rows, 0).toLocaleString("tr-TR")} sat\u0131r i\u015fleniyor
                    </div>
                    <div style={{ maxWidth: "320px", margin: "0 auto", height: "4px", background: "var(--border-tertiary)", borderRadius: "2px", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${progress}%`, background: "var(--accent)", borderRadius: "2px", transition: "width 0.35s ease" }} />
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "8px" }}>{progressLabel}</div>
                </div>
            )}

            {/* ───── PREVIEW / REVIEW ───── */}
            {state === "preview" && (
                <>
                    {/* AI availability banner */}
                    {!aiAvailable && (
                        <div style={{
                            padding: "10px 14px",
                            background: "var(--warning-bg)",
                            border: "0.5px solid var(--warning-border)",
                            borderRadius: "6px",
                            fontSize: "12px",
                            color: "var(--warning-text)",
                        }}>
                            AI devre d\u0131\u015f\u0131 \u2014 basit kolon e\u015fle\u015ftirmesi kullan\u0131ld\u0131. G\u00fcven skorlar\u0131 d\u00fc\u015f\u00fck olabilir.
                        </div>
                    )}

                    {/* Tab bar — entity types */}
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                        {draftEntityTypes.map(type => {
                            const count = drafts.filter(d => d.entity_type === type).length;
                            return (
                                <button key={type} onClick={() => setActiveTab(type)} style={tabBtnStyle(activeTab === type)}>
                                    {entityTypeLabels[type] ?? type}
                                    <span style={{ marginLeft: "5px", fontSize: "10px", opacity: 0.7 }}>{count}</span>
                                </button>
                            );
                        })}
                    </div>

                    {/* Summary bar */}
                    <div style={{
                        display: "flex", gap: "12px", padding: "10px 14px",
                        background: "var(--bg-secondary)", border: "0.5px solid var(--border-tertiary)",
                        borderRadius: "6px", fontSize: "12px", flexWrap: "wrap", alignItems: "center",
                    }}>
                        <span style={{ color: "var(--text-secondary)" }}>Toplam: <strong>{drafts.length}</strong> draft</span>
                        <span style={{ color: "var(--success-text)" }}>
                            Y\u00fcksek: {drafts.filter(d => (d.confidence ?? 0) >= 0.8).length}
                        </span>
                        <span style={{ color: "var(--warning-text)" }}>
                            Orta: {drafts.filter(d => (d.confidence ?? 0) >= 0.5 && (d.confidence ?? 0) < 0.8).length}
                        </span>
                        <span style={{ color: "var(--danger-text)" }}>
                            D\u00fc\u015f\u00fck: {drafts.filter(d => (d.confidence ?? 0) < 0.5).length}
                        </span>
                        <span style={{ marginLeft: "auto", fontSize: "11px", color: "var(--text-tertiary)" }}>
                            {aiAvailable ? "AI \u00d6nerisi" : "Basit E\u015fle\u015ftirme"}
                        </span>
                    </div>

                    {/* Draft cards */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        {filteredDrafts.length === 0 && (
                            <div style={{
                                padding: "24px", textAlign: "center",
                                background: "var(--bg-primary)", border: "0.5px solid var(--border-tertiary)",
                                borderRadius: "8px", color: "var(--text-tertiary)", fontSize: "12px",
                            }}>
                                Bu kategoride draft bulunmuyor.
                            </div>
                        )}
                        {filteredDrafts.slice(0, 50).map((draft, idx) => {
                            const conf = draft.confidence ?? 0;
                            const parsedData = (draft.parsed_data ?? {}) as Record<string, unknown>;
                            const unmatchedFields = draft.unmatched_fields ?? [];
                            const needsReview = conf < 0.5;

                            return (
                                <div key={draft.id} style={{
                                    background: "var(--bg-primary)",
                                    border: `0.5px solid ${needsReview ? "var(--danger-border)" : "var(--border-tertiary)"}`,
                                    borderRadius: "8px",
                                    padding: "12px 16px",
                                }}>
                                    {/* Card header */}
                                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
                                        <span style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "monospace" }}>
                                            #{idx + 1}
                                        </span>
                                        {/* Confidence badge */}
                                        <span style={{
                                            fontSize: "10px",
                                            padding: "2px 8px",
                                            borderRadius: "10px",
                                            background: confidenceBg(conf),
                                            color: confidenceColor(conf),
                                            fontWeight: 600,
                                        }}>
                                            %{Math.round(conf * 100)} {confidenceLabel(conf)}
                                        </span>
                                        {needsReview && (
                                            <span style={{
                                                fontSize: "10px",
                                                padding: "2px 8px",
                                                borderRadius: "10px",
                                                background: "var(--danger-bg)",
                                                color: "var(--danger-text)",
                                                fontWeight: 600,
                                            }}>
                                                \u0130nceleme Gerekli
                                            </span>
                                        )}
                                        {!aiAvailable && (
                                            <span style={{
                                                fontSize: "10px",
                                                padding: "2px 8px",
                                                borderRadius: "10px",
                                                background: "var(--bg-tertiary)",
                                                color: "var(--text-tertiary)",
                                            }}>
                                                Basit E\u015fle\u015ftirme
                                            </span>
                                        )}
                                    </div>

                                    {/* Parsed data fields */}
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", marginBottom: "6px" }}>
                                        {Object.entries(parsedData).slice(0, 8).map(([key, value]) => (
                                            <div key={key} style={{ fontSize: "11px" }}>
                                                <span style={{ color: "var(--text-tertiary)" }}>{key}: </span>
                                                <span style={{ color: "var(--text-primary)" }}>{String(value)}</span>
                                            </div>
                                        ))}
                                        {Object.keys(parsedData).length > 8 && (
                                            <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>
                                                +{Object.keys(parsedData).length - 8} alan
                                            </span>
                                        )}
                                    </div>

                                    {/* AI reason */}
                                    {draft.ai_reason && (
                                        <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginBottom: "4px" }}>
                                            {draft.ai_reason}
                                        </div>
                                    )}

                                    {/* Unmatched fields warning */}
                                    {unmatchedFields.length > 0 && unmatchedFields[0] !== "all" && (
                                        <div style={{
                                            fontSize: "11px", color: "var(--warning-text)",
                                            padding: "4px 8px",
                                            background: "var(--warning-bg)",
                                            borderRadius: "4px",
                                            marginTop: "4px",
                                        }}>
                                            E\u015fle\u015ftirilemeyen alanlar: {unmatchedFields.join(", ")}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        {filteredDrafts.length > 50 && (
                            <div style={{
                                padding: "12px", textAlign: "center",
                                fontSize: "12px", color: "var(--text-tertiary)",
                                background: "var(--bg-secondary)",
                                borderRadius: "6px",
                            }}>
                                +{filteredDrafts.length - 50} daha fazla draft (toplam {filteredDrafts.length})
                            </div>
                        )}
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                        <button onClick={() => { setState("sheet_select"); setDrafts([]); setBatchId(null); }} style={{
                            fontSize: "12px", padding: "7px 14px",
                            border: "0.5px solid var(--border-secondary)", borderRadius: "6px",
                            background: "transparent", color: "var(--text-secondary)", cursor: "pointer",
                        }}>\u2190 Geri</button>
                        <button onClick={handleImport} style={{
                            fontSize: "12px", padding: "7px 18px",
                            border: "0.5px solid var(--accent-border)", borderRadius: "6px",
                            background: "var(--accent-bg)", color: "var(--accent-text)",
                            cursor: "pointer", fontWeight: 600,
                        }}>
                            Onayla ve \u0130\u00e7e Aktar \u2192
                        </button>
                    </div>
                </>
            )}

            {/* ───── IMPORTING ───── */}
            {state === "importing" && (
                <div style={{
                    background: "var(--bg-primary)", border: "0.5px solid var(--border-tertiary)",
                    borderRadius: "8px", padding: "24px",
                }}>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "20px" }}>
                        \u0130\u00e7e aktar\u0131l\u0131yor...
                    </div>
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
                                            {done ? `\u2713 ${total.toLocaleString("tr-TR")}` : `${count.toLocaleString("tr-TR")} / ${total.toLocaleString("tr-TR")}`}
                                        </span>
                                    </div>
                                    <div style={{ height: "5px", background: "var(--border-tertiary)", borderRadius: "3px", overflow: "hidden" }}>
                                        <div style={{
                                            height: "100%", width: `${pct}%`,
                                            background: done ? "var(--success)" : "var(--accent)",
                                            borderRadius: "3px", transition: "width 0.2s ease",
                                        }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ───── DONE ───── */}
            {state === "done" && (
                <div style={{
                    background: "var(--bg-primary)", border: "0.5px solid var(--success-border)",
                    borderRadius: "8px", padding: "32px 24px",
                }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
                        <div style={{
                            width: "36px", height: "36px", background: "var(--success-bg)", borderRadius: "8px",
                            display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                                <path d="M3.5 9l3.5 3.5 7-7" stroke="var(--success)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </div>
                        <div>
                            <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>\u0130\u00e7eri aktar\u0131m tamamland\u0131</div>
                            <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "2px" }}>{fileName}</div>
                        </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px", marginBottom: "16px" }}>
                        {confirmResult ? (
                            <>
                                <div style={{ background: "var(--bg-secondary)", borderRadius: "6px", padding: "12px 14px" }}>
                                    <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginBottom: "2px" }}>Ba\u015far\u0131l\u0131</div>
                                    <div style={{ fontSize: "18px", fontWeight: 600, color: "var(--success-text)", marginBottom: "2px" }}>{confirmResult.merged}</div>
                                    <div style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>{confirmResult.merged} kay\u0131t eklendi</div>
                                </div>
                                {confirmResult.skipped > 0 && (
                                    <div style={{ background: "var(--bg-secondary)", borderRadius: "6px", padding: "12px 14px" }}>
                                        <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginBottom: "2px" }}>Atlanan</div>
                                        <div style={{ fontSize: "18px", fontWeight: 600, color: "var(--warning-text)", marginBottom: "2px" }}>{confirmResult.skipped}</div>
                                        <div style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>{confirmResult.skipped} kay\u0131t atland\u0131</div>
                                    </div>
                                )}
                                {confirmResult.errors.length > 0 && (
                                    <div style={{ background: "var(--bg-secondary)", borderRadius: "6px", padding: "12px 14px" }}>
                                        <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginBottom: "2px" }}>Hatalar</div>
                                        <div style={{ fontSize: "18px", fontWeight: 600, color: "var(--danger-text)", marginBottom: "2px" }}>{confirmResult.errors.length}</div>
                                        <div style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>{confirmResult.errors[0]}</div>
                                    </div>
                                )}
                                {parasutSheets.length > 0 && parasutSheets.map(ps => (
                                    <div key={ps.name} style={{ background: "var(--bg-secondary)", borderRadius: "6px", padding: "12px 14px" }}>
                                        <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginBottom: "2px" }}>{ps.displayName}</div>
                                        <div style={{ fontSize: "18px", fontWeight: 600, color: "var(--accent-text)", marginBottom: "2px" }}>{ps.rows}</div>
                                        <div style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>Para\u015f\u00fct Sync ile i\u015flenecek</div>
                                    </div>
                                ))}
                            </>
                        ) : (
                            <div style={{ background: "var(--bg-secondary)", borderRadius: "6px", padding: "12px 14px", gridColumn: "1 / -1" }}>
                                <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>\u0130\u00e7e aktar\u0131m tamamland\u0131</div>
                            </div>
                        )}
                    </div>

                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        <Link href="/dashboard/customers" style={{
                            fontSize: "12px", padding: "6px 14px",
                            border: "0.5px solid var(--accent-border)", borderRadius: "6px",
                            background: "var(--accent-bg)", color: "var(--accent-text)",
                            textDecoration: "none", fontWeight: 500,
                        }}>
                            Cariler sayfas\u0131na git \u2192
                        </Link>
                        <Link href="/dashboard/orders" style={{
                            fontSize: "12px", padding: "6px 14px",
                            border: "0.5px solid var(--accent-border)", borderRadius: "6px",
                            background: "var(--accent-bg)", color: "var(--accent-text)",
                            textDecoration: "none", fontWeight: 500,
                        }}>
                            Sipari\u015fler sayfas\u0131na git \u2192
                        </Link>
                        <Link href="/dashboard/products" style={{
                            fontSize: "12px", padding: "6px 14px",
                            border: "0.5px solid var(--accent-border)", borderRadius: "6px",
                            background: "var(--accent-bg)", color: "var(--accent-text)",
                            textDecoration: "none", fontWeight: 500,
                        }}>
                            Stok & \u00dcr\u00fcnler \u2192
                        </Link>
                        <button onClick={reset} style={{
                            fontSize: "12px", padding: "6px 16px",
                            border: "0.5px solid var(--border-secondary)", borderRadius: "6px",
                            background: "transparent", color: "var(--text-secondary)", cursor: "pointer",
                        }}>
                            Yeni Dosya Y\u00fckle
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
