"use client";

/**
 * Faz 3a — Classifier queue for AI import.
 *
 * Bekleyen dosyaları concurrency cap 3 ile sıralı POST eder.
 * Her dosya kartı: filename + size + remove + kind ikonu + confidence/language/
 * suggested_product_type rozetleri + summary + "Devam Et" (3a'da disabled, 3b'de aktive).
 *
 * Pure helpers live in @/lib/classifier-helpers and @/lib/import-file-helpers.
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { ImportDocumentRow, DocumentClassification } from "@/lib/database.types";
import { useIsDemo, DEMO_BLOCK_TOAST, DEMO_DISABLED_TOOLTIP } from "@/lib/demo-utils";
import Button from "@/components/ui/Button";
import { formatBytes, validateClassifyUpload } from "@/lib/import-file-helpers";
import {
    isExtractionSupportedType,
    isMigrationExcelType,
    selectClassifyCandidates,
    documentTypeIcon,
    formatLanguage,
    classifierResultBadge,
} from "@/lib/classifier-helpers";
export type { ConcurrencySelectableItem, ClassifierBadge } from "@/lib/classifier-helpers";
export {
    isExtractionSupportedType,
    isMigrationExcelType,
    chunkBy,
    selectClassifyCandidates,
    documentTypeLabel,
    documentTypeIcon,
    formatLanguage,
    confidenceColor,
    classifierResultBadge,
} from "@/lib/classifier-helpers";

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
    /**
     * Tekil kart × kaldırıldığında parent'a haber verir.
     * Parent aiFiles state'inden de düşürmezse stale File referansı useEffect'te
     * yeniden "uploading" item olarak eklenir → duplicate POST/AI cost (Faz 3a Review 3 bug).
     */
    onRemove?: (file: File) => void;
    /**
     * Faz 3d: migration_excel doc tespit edilirse parent'ın klasik mod
     * accordion'unu açmasına izin verir. Callback verilirse "Klasik Mod'a geçin"
     * CTA tıklanabilir button olur; verilmezse eski disabled span davranışı.
     */
    onOpenClassicMode?: () => void;
}

const CONCURRENCY = 3;

function newId(): string {
    return Math.random().toString(36).slice(2);
}

async function uploadAndClassify(
    file: File,
    signal?: AbortSignal,
): Promise<{ ok: true; document: ImportDocumentRow } | { ok: false; error: string; aborted?: boolean }> {
    const fd = new FormData();
    fd.append("file", file);
    try {
        const res = await fetch("/api/import/classify", { method: "POST", body: fd, signal });
        if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as { error?: string };
            return { ok: false, error: body.error ?? `HTTP ${res.status}` };
        }
        const body = await res.json() as { ok: true; document: ImportDocumentRow };
        return body;
    } catch (e) {
        // P3 (Review 3.b): kullanıcı remove/clear ile in-flight isteği iptal ettiyse
        // setQueue'ya error yansıması yapma — kart zaten state'ten silindi.
        if (signal?.aborted) return { ok: false, error: "İptal edildi", aborted: true };
        return { ok: false, error: e instanceof Error ? e.message : "Ağ hatası" };
    }
}

export default function ClassifierQueue({ files, suggestedProductTypes = [], onClear, onRemove, onOpenClassicMode }: ClassifierQueueProps) {
    const isDemo = useIsDemo();

    const [queue, setQueue] = useState<QueuedFile[]>([]);

    // mountedRef — fetch.then() callback'lerinin unmount sonrası setQueue
    // çağırmasını engeller. Cleanup'ı SADECE unmount'ta çalışan ayrı bir
    // useEffect ile yapıyoruz; queue-dep effect içindeki cleanup KULLANILMAZ
    // çünkü setQueue patch'i queue'yu değiştirir → effect re-run → cleanup
    // tetiklenir → tüm in-flight fetch'ler iptal olur (Faz 3a Review 2 bug).
    const mountedRef = useRef(true);
    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    // P3 (Review 3.b): per-item AbortController — remove/clear/unmount sırasında
    // in-flight /api/import/classify fetch'leri iptal edilir. Aksi halde kullanıcı
    // classifying durumundaki bir kartı kaldırsa bile route AI çalıştırır +
    // import_documents row + storage file yaratır; UI'da artık dönüş yolu yok.
    const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
    useEffect(() => {
        const controllers = abortControllersRef.current;
        return () => {
            for (const ctl of controllers.values()) ctl.abort();
            controllers.clear();
        };
    }, []);

    // Queue sync — yeni File referanslarını queue'ya ekler. Side-effect (state
    // mutation) olduğu için useEffect içinde; lint kuralı
    // react-hooks/set-state-in-effect "synchronous cascading render" konusunda
    // uyarır — burada bilinçli kabul: setState yalnız yeni dosya VARSA çağrılır
    // (idempotent guard) → cascade durur. Render-phase'de çalışmaz: bu önemli
    // çünkü Strict Mode'da render iki kez çalışır ve fetch tetiklenirse
    // duplicate POST/storage row/AI cost olur.
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- bilinçli: idempotent guard (yeni dosya yoksa setState atılmaz); render-phase fetch'i önlemek için useEffect içinde olmak ZORUNDA (Strict Mode safety)
        setQueue(prev => {
            const existing = new Set(prev.map(q => q.file));
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
            return additions.length > 0 ? [...prev, ...additions] : prev;
        });
    }, [files]);

    // Concurrency driver — fetch tetiklemesi yalnız useEffect içinde olmalı
    // (Strict Mode double-render güvenliği + render-phase side-effect yasağı).
    // `started: boolean` flag ile dedup; setQueue 'classifying' patch'i
    // başlatılan adayları işaretler, fetch sonucu .then içinde tek setQueue
    // çağrısı ile sonuçlanır. Cleanup: component unmount sonrası gelen
    // result'lar `cancelled` ref ile yutulur.
    useEffect(() => {
        if (isDemo) return;

        const candidates = selectClassifyCandidates(queue, CONCURRENCY);
        if (candidates.length === 0) return;

        const candidateIds = new Set(candidates.map(c => c.id));
        // eslint-disable-next-line react-hooks/set-state-in-effect -- bilinçli: classifying patch dedup için; fetch tetiklenecek adayları işaretler, kural yalın setter çağrılarını uyarır, burada yan etki tetiklemesinin parçası
        setQueue(prev => prev.map(q =>
            candidateIds.has(q.id) ? { ...q, status: "classifying", started: true } : q,
        ));

        for (const c of candidates) {
            const ctl = new AbortController();
            abortControllersRef.current.set(c.id, ctl);
            uploadAndClassify(c.file, ctl.signal).then(result => {
                abortControllersRef.current.delete(c.id);
                // Abort edildiyse (remove/clear/unmount): UI'a yansıma yok
                if (result.ok === false && result.aborted) return;
                // mountedRef yalnız UNMOUNT'ta false olur — re-render/queue patch
                // bu callback'i iptal etmez.
                if (!mountedRef.current) return;
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
        // NOT: cleanup return YOK — bkz. mountedRef comment'i.
    }, [queue, isDemo]);

    const retry = (id: string) => {
        // Önceki başarısız fetch için kalmış olabilecek controller'ı temizle
        // (zaten settle olmuştu ama defansif).
        abortControllersRef.current.delete(id);
        setQueue(prev => prev.map(q => {
            if (q.id !== id) return q;
            return { ...q, status: "uploading", started: false, errorMessage: null };
        }));
    };

    const remove = (id: string) => {
        // P3 (Review 3.b): in-flight fetch'i iptal et — orphan import_documents
        // row + storage file + AI cost önlenir; UI'da artık dönüş yolu yok.
        const ctl = abortControllersRef.current.get(id);
        if (ctl) {
            ctl.abort();
            abortControllersRef.current.delete(id);
        }
        // P2 (Review 3): parent aiFiles state'inden de düş — aksi halde aynı File
        // referansı yeni dosya eklendiğinde useEffect'te yeniden "uploading" olarak
        // eklenir ve duplicate POST/AI tokens harcanır.
        const item = queue.find(q => q.id === id);
        setQueue(prev => prev.filter(q => q.id !== id));
        if (item) onRemove?.(item.file);
    };

    const clearAll = () => {
        // P3 (Review 3.b): tüm in-flight fetch'leri iptal et — `remove` ile aynı
        // gerekçe; "Listeyi Temizle" bulk versiyonu.
        for (const ctl of abortControllersRef.current.values()) ctl.abort();
        abortControllersRef.current.clear();
        // P3-008: parent'a haber ver (files prop'unu boşaltır) AMA internal queue
        // de manuel temizlenir; aksi halde files=[] olmasına rağmen mevcut
        // queue item'ları useEffect dep array'inde tetiklenmediği için kalır.
        setQueue([]);
        onClear?.();
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
                        onClick={clearAll}
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
                                {q.status === "classified" && c && q.documentId && isExtractionSupportedType(c.document_type) && (
                                    <Link
                                        href={`/dashboard/import/extract/${q.documentId}`}
                                        style={{
                                            fontSize: "12px", padding: "6px 12px",
                                            background: "var(--accent-bg)", color: "var(--accent-text)",
                                            border: "0.5px solid var(--accent-border)", borderRadius: "5px",
                                            fontWeight: 600, textDecoration: "none", cursor: "pointer",
                                        }}
                                    >
                                        İncele →
                                    </Link>
                                )}
                                {q.status === "classified" && c && isMigrationExcelType(c.document_type) && (
                                    onOpenClassicMode ? (
                                        <button
                                            type="button"
                                            onClick={() => onOpenClassicMode()}
                                            aria-label="Klasik Mod accordion'unu aç"
                                            style={{
                                                fontSize: "11px", padding: "4px 10px",
                                                background: "var(--warning-bg)", color: "var(--warning-text)",
                                                border: "0.5px solid var(--warning-border)", borderRadius: "5px",
                                                cursor: "pointer", fontWeight: 500,
                                            }}
                                        >
                                            Klasik Mod&apos;a geç ↓
                                        </button>
                                    ) : (
                                        <span style={{
                                            fontSize: "11px", padding: "4px 10px",
                                            background: "var(--warning-bg)", color: "var(--warning-text)",
                                            border: "0.5px solid var(--warning-border)", borderRadius: "5px",
                                        }}>
                                            Klasik Mod&apos;a geçin
                                        </span>
                                    )
                                )}
                                {q.status === "classified" && c && !isExtractionSupportedType(c.document_type) && !isMigrationExcelType(c.document_type) && (
                                    <Button
                                        variant="secondary"
                                        disabled
                                        title="Bu belge tipi için ekstraksiyon kapsam dışı"
                                    >
                                        Kapsam dışı
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
