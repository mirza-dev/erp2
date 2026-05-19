"use client";

/**
 * Faz 3a — Classifier queue for AI import.
 *
 * Bekleyen dosyaları concurrency cap 3 ile sıralı POST eder.
 * Her dosya kartı: filename + size + remove + kind ikonu + confidence/language/
 * suggested_product_type rozetleri + summary + "Devam Et" (3a'da disabled, 3b'de aktive).
 *
 * Pure helpers exported: classifierResultBadge, formatLanguage,
 * documentTypeLabel, documentTypeIcon, confidenceColor, chunkBy.
 */
import { useState } from "react";
import type { DocumentType, DocumentClassification, ImportDocumentRow } from "@/lib/database.types";
import { useIsDemo, DEMO_BLOCK_TOAST, DEMO_DISABLED_TOOLTIP } from "@/lib/demo-utils";
import Button from "@/components/ui/Button";
import { formatBytes, validateClassifyUpload } from "@/components/import/DropZone";

// ── Pure helpers (exported for tests) ────────────────────────────────────────

export function chunkBy<T>(arr: T[], size: number): T[][] {
    if (size <= 0) return [arr];
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
        out.push(arr.slice(i, i + size));
    }
    return out;
}

const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
    product_catalog: "Ürün Kataloğu",
    product_datasheet: "Veri Sayfası",
    material_certificate: "Sertifika",
    compliance_doc: "Uygunluk Belgesi",
    test_report: "Test Raporu",
    msds: "MSDS",
    vendor_profile: "Tedarikçi Profili",
    product_photo: "Ürün Fotoğrafı",
    migration_excel: "Migration Excel",
    unknown: "Belirsiz",
};

const DOCUMENT_TYPE_ICONS: Record<DocumentType, string> = {
    product_catalog: "📚",
    product_datasheet: "📄",
    material_certificate: "📜",
    compliance_doc: "✅",
    test_report: "🧪",
    msds: "⚠️",
    vendor_profile: "🏢",
    product_photo: "🖼️",
    migration_excel: "📊",
    unknown: "❓",
};

export function documentTypeLabel(t: DocumentType): string {
    return DOCUMENT_TYPE_LABELS[t] ?? "Belirsiz";
}

export function documentTypeIcon(t: DocumentType): string {
    return DOCUMENT_TYPE_ICONS[t] ?? "❓";
}

const LANG_LABELS: Record<string, string> = {
    tr: "Türkçe",
    en: "İngilizce",
    de: "Almanca",
    fr: "Fransızca",
    it: "İtalyanca",
    es: "İspanyolca",
    unknown: "Bilinmiyor",
};

export function formatLanguage(code: string): string {
    return LANG_LABELS[code?.toLowerCase()] ?? code ?? "Bilinmiyor";
}

export function confidenceColor(c: number): string {
    if (c >= 0.8) return "var(--success-text)";
    if (c >= 0.5) return "var(--warning-text)";
    return "var(--danger-text)";
}

export interface ClassifierBadge {
    label: string;
    color: string;
    background: string;
}

export function classifierResultBadge(c: DocumentClassification): ClassifierBadge {
    const pct = Math.round(c.confidence * 100);
    return {
        label: `${documentTypeLabel(c.document_type)} · %${pct}`,
        color: confidenceColor(c.confidence),
        background: c.confidence >= 0.8 ? "var(--success-bg)"
            : c.confidence >= 0.5 ? "var(--warning-bg)"
                : "var(--danger-bg)",
    };
}

// ── Component ────────────────────────────────────────────────────────────────

type FileStatus = "uploading" | "classifying" | "classified" | "error";

interface QueuedFile {
    id: string; // local UUID for React key
    file: File;
    status: FileStatus;
    /** True once we've fired uploadAndClassify for this item (prevents duplicate fetch). */
    started: boolean;
    classification: DocumentClassification | null;
    documentId: string | null;
    errorMessage: string | null;
}

interface QueuedSuggestedType {
    id: string;
    name: string;
}

export interface ClassifierQueueProps {
    files: File[];
    suggestedProductTypes?: QueuedSuggestedType[];
    onClear?: () => void;
}

const CONCURRENCY = 3;

function newId(): string {
    return Math.random().toString(36).slice(2);
}

async function uploadAndClassify(file: File): Promise<{ ok: true; document: ImportDocumentRow } | { ok: false; error: string }> {
    const fd = new FormData();
    fd.append("file", file);
    try {
        const res = await fetch("/api/import/classify", { method: "POST", body: fd });
        if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as { error?: string };
            return { ok: false, error: body.error ?? `HTTP ${res.status}` };
        }
        const body = await res.json() as { ok: true; document: ImportDocumentRow };
        return body;
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Ağ hatası" };
    }
}

export default function ClassifierQueue({ files, suggestedProductTypes = [], onClear }: ClassifierQueueProps) {
    const isDemo = useIsDemo();

    const [queue, setQueue] = useState<QueuedFile[]>([]);

    // Render-time queue sync. Yeni File referanslarını queue'ya ekler.
    // Dedup: queue içindeki File object identity'sine bakılır (Set of File refs).
    // Bu bloğun çalışması idempotent — files prop değişse de aynı dosya iki kez eklenmez.
    {
        const existing = new Set(queue.map(q => q.file));
        const additions: QueuedFile[] = [];
        for (const f of files) {
            if (existing.has(f)) continue;
            existing.add(f);
            const v = validateClassifyUpload(f);
            if (!v.ok) {
                additions.push({
                    id: newId(), file: f, status: "error", started: true,
                    classification: null, documentId: null,
                    errorMessage: v.reason ?? "Dosya reddedildi.",
                });
                continue;
            }
            additions.push({
                id: newId(), file: f, status: "uploading", started: false,
                classification: null, documentId: null, errorMessage: null,
            });
        }
        if (additions.length > 0) {
            setQueue(prev => [...prev, ...additions]);
        }
    }

    // Concurrency driver (render-time). queue içindeki `started` flag'i ile
    // duplicate fetch önlenir. setQueue render içinde çağrılır (Adjusting state
    // based on prop change pattern); set sonrası render yeniden tetiklenir,
    // bu blok tekrar çalışır ama `started=true` olduğu için fetch tetiklenmez.
    if (!isDemo) {
        const inFlight = queue.filter(q => q.status === "classifying").length;
        const free = Math.max(0, CONCURRENCY - inFlight);
        if (free > 0) {
            const candidates = queue.filter(q => !q.started && q.status === "uploading").slice(0, free);
            if (candidates.length > 0) {
                const candidateIds = new Set(candidates.map(c => c.id));
                setQueue(prev => prev.map(q =>
                    candidateIds.has(q.id) ? { ...q, status: "classifying", started: true } : q,
                ));
                for (const c of candidates) {
                    uploadAndClassify(c.file).then(result => {
                        setQueue(prev => prev.map(q => {
                            if (q.id !== c.id) return q;
                            if (result.ok) {
                                return {
                                    ...q,
                                    status: "classified",
                                    classification: (result.document.classification ?? null) as DocumentClassification | null,
                                    documentId: result.document.id,
                                    errorMessage: null,
                                };
                            }
                            return { ...q, status: "error", errorMessage: result.error };
                        }));
                    });
                }
            }
        }
    }

    const retry = (id: string) => {
        setQueue(prev => prev.map(q => {
            if (q.id !== id) return q;
            return { ...q, status: "uploading", started: false, errorMessage: null };
        }));
    };

    const remove = (id: string) => {
        setQueue(prev => prev.filter(q => q.id !== id));
    };

    if (queue.length === 0) {
        return null;
    }

    const suggestedTypeName = (id: string | null) => {
        if (!id) return null;
        return suggestedProductTypes.find(t => t.id === id)?.name ?? null;
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)" }}>
                    Sınıflandırma kuyruğu ({queue.length})
                </div>
                {onClear && (
                    <button
                        type="button"
                        onClick={onClear}
                        style={{
                            fontSize: "11px", padding: "3px 8px",
                            background: "transparent", border: "0.5px solid var(--border-secondary)",
                            borderRadius: "4px", color: "var(--text-secondary)", cursor: "pointer",
                        }}
                    >
                        Listeyi Temizle
                    </button>
                )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {queue.map(q => {
                    const c = q.classification;
                    const badge = c ? classifierResultBadge(c) : null;
                    const suggestedName = suggestedTypeName(c?.suggested_product_type_id ?? null);
                    return (
                        <div
                            key={q.id}
                            style={{
                                display: "grid",
                                gridTemplateColumns: "32px 1fr auto",
                                gap: "12px",
                                alignItems: "center",
                                padding: "10px 12px",
                                background: "var(--bg-secondary)",
                                border: "0.5px solid var(--border-tertiary)",
                                borderRadius: "6px",
                            }}
                        >
                            <span aria-hidden style={{ fontSize: "22px" }}>
                                {c ? documentTypeIcon(c.document_type) : "📎"}
                            </span>
                            <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                    {q.file.name}
                                </div>
                                <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "2px" }}>
                                    {formatBytes(q.file.size)}
                                    {q.status === "uploading" && " · sırada"}
                                    {q.status === "classifying" && " · sınıflandırılıyor…"}
                                    {q.status === "error" && q.errorMessage && (
                                        <span style={{ color: "var(--danger-text)" }}> · {q.errorMessage}</span>
                                    )}
                                </div>
                                {c && (
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "6px", alignItems: "center" }}>
                                        {badge && (
                                            <span style={{
                                                fontSize: "11px", padding: "2px 8px", borderRadius: "10px",
                                                background: badge.background, color: badge.color, fontWeight: 600,
                                            }}>{badge.label}</span>
                                        )}
                                        <span style={{
                                            fontSize: "11px", padding: "2px 8px", borderRadius: "10px",
                                            background: "var(--bg-tertiary)", color: "var(--text-secondary)",
                                        }}>{formatLanguage(c.language)}</span>
                                        {suggestedName && (
                                            <span style={{
                                                fontSize: "11px", padding: "2px 8px", borderRadius: "10px",
                                                background: "var(--accent-bg)", color: "var(--accent-text)",
                                            }}>Tip: {suggestedName}</span>
                                        )}
                                    </div>
                                )}
                                {c?.summary && (
                                    <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "6px", lineHeight: 1.4 }}>
                                        {c.summary}
                                    </div>
                                )}
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: "4px", alignItems: "flex-end" }}>
                                {q.status === "error" && (
                                    <Button variant="secondary" onClick={() => retry(q.id)} disabled={isDemo}>
                                        Yeniden dene
                                    </Button>
                                )}
                                {q.status === "classified" && (
                                    <Button
                                        variant="primary"
                                        disabled
                                        title="3b'de aktive olacak — type-aware extraction"
                                    >
                                        Devam Et
                                    </Button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => remove(q.id)}
                                    aria-label="Kuyruktan kaldır"
                                    style={{
                                        fontSize: "11px", padding: "2px 8px",
                                        background: "transparent", color: "var(--text-tertiary)",
                                        border: "0.5px solid var(--border-tertiary)", borderRadius: "4px",
                                        cursor: "pointer",
                                    }}
                                >
                                    ×
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
            {isDemo && (
                <div style={{
                    fontSize: "11px", color: "var(--warning-text)",
                    background: "var(--warning-bg)", border: "0.5px solid var(--warning-border)",
                    borderRadius: "5px", padding: "6px 10px",
                }}>
                    {DEMO_BLOCK_TOAST} ({DEMO_DISABLED_TOOLTIP})
                </div>
            )}
        </div>
    );
}
