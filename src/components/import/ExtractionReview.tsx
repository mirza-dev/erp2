"use client";

/**
 * Faz 3b — Extraction review screen.
 *
 * AI ekstraksiyonu ile çıkarılan satırları gösterir; her satırda match
 * candidate dropdown'u + aksiyon butonları. PATCH /api/import/document-lines/[id]
 * ile review override yapılır. "Çıkar" CTA POST /api/import/documents/[id]/extract
 * ile satırları üretir/yeniler.
 *
 * Pure helper exports: formatMatchAction, getMatchActionColor, pickSuggestedAction.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type {
    ImportDocumentRow,
    ImportDocumentLineRow,
    ImportDocumentLineMatchAction,
    ImportDocumentLineCandidate,
} from "@/lib/database.types";
import { useIsDemo, DEMO_BLOCK_TOAST, DEMO_DISABLED_TOOLTIP } from "@/lib/demo-utils";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

// ── Pure helpers (exported) ──────────────────────────────────────────────────

export function formatMatchAction(action: ImportDocumentLineMatchAction): string {
    switch (action) {
        case "pending": return "İnceleme bekliyor";
        case "matched": return "Eşleştirildi";
        case "new_product": return "Yeni ürün";
        case "skipped": return "Atlandı";
        case "reviewed": return "Onaylandı";
    }
}

export function getMatchActionColor(action: ImportDocumentLineMatchAction): { bg: string; text: string; border: string } {
    switch (action) {
        case "matched":
        case "reviewed":
            return { bg: "var(--success-bg)", text: "var(--success-text)", border: "var(--success-border)" };
        case "new_product":
            return { bg: "var(--accent-bg)", text: "var(--accent-text)", border: "var(--accent-border)" };
        case "skipped":
            return { bg: "var(--bg-tertiary)", text: "var(--text-tertiary)", border: "var(--border-tertiary)" };
        case "pending":
        default:
            return { bg: "var(--warning-bg)", text: "var(--warning-text)", border: "var(--warning-border)" };
    }
}

/**
 * AI tarafından seçilen initial action'ı verili score ile karşılaştırarak
 * UI'da "önerilen" işaret için kullanılır. Pure.
 */
export function pickSuggestedAction(topScore: number | null): ImportDocumentLineMatchAction {
    if (topScore === null) return "new_product";
    if (topScore >= 85) return "matched";
    if (topScore >= 60) return "pending";
    return "new_product";
}

// ── Props ────────────────────────────────────────────────────────────────────

export interface QueuedSuggestedType {
    id: string;
    name: string;
}

export interface ExtractionReviewProps {
    document: ImportDocumentRow;
    initialLines: ImportDocumentLineRow[];
    productTypes: QueuedSuggestedType[];
}

// ── Component ────────────────────────────────────────────────────────────────

export default function ExtractionReview({ document: doc, initialLines, productTypes }: ExtractionReviewProps) {
    const isDemo = useIsDemo();
    const { toast } = useToast();
    const router = useRouter();

    const [lines, setLines] = useState<ImportDocumentLineRow[]>(initialLines);
    const [extracting, setExtracting] = useState(false);
    const [overrideTypeId, setOverrideTypeId] = useState<string>(doc.classification?.suggested_product_type_id ?? "");

    async function handleExtract() {
        if (isDemo) {
            toast({ type: "info", message: DEMO_BLOCK_TOAST });
            return;
        }
        setExtracting(true);
        try {
            const body: Record<string, unknown> = {};
            if (overrideTypeId) body.productTypeId = overrideTypeId;
            const res = await fetch(`/api/import/documents/${doc.id}/extract`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            // Review 3b P2-C: 422 → AI hiç çıkaramadı, eski satırlar korundu
            if (res.status === 422) {
                const err = await res.json().catch(() => ({}));
                toast({ type: "info", message: err.error ?? "AI hiçbir satır çıkaramadı." });
                return;
            }
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                toast({ type: "error", message: err.error ?? "Ekstraksiyon başarısız" });
                return;
            }
            const data = await res.json() as { lines: ImportDocumentLineRow[] };
            setLines(data.lines);
            toast({ type: "success", message: `${data.lines.length} satır çıkarıldı` });
        } catch (e) {
            toast({ type: "error", message: e instanceof Error ? e.message : "Bilinmeyen hata" });
        } finally {
            setExtracting(false);
        }
    }

    async function patchLine(lineId: string, payload: { match_action: ImportDocumentLineMatchAction; matched_product_id?: string | null; match_confidence?: number | null }) {
        if (isDemo) {
            toast({ type: "info", message: DEMO_BLOCK_TOAST });
            return;
        }
        try {
            const res = await fetch(`/api/import/document-lines/${lineId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                toast({ type: "error", message: err.error ?? "Güncelleme başarısız" });
                return;
            }
            const data = await res.json() as { line: ImportDocumentLineRow };
            setLines(prev => prev.map(l => l.id === lineId ? data.line : l));
        } catch (e) {
            toast({ type: "error", message: e instanceof Error ? e.message : "Bilinmeyen hata" });
        }
    }

    function handleSelectCandidate(line: ImportDocumentLineRow, candidate: ImportDocumentLineCandidate) {
        void patchLine(line.id, {
            match_action: "matched",
            matched_product_id: candidate.id,
            match_confidence: candidate.score,
        });
    }

    function handleMarkNew(line: ImportDocumentLineRow) {
        void patchLine(line.id, { match_action: "new_product", matched_product_id: null });
    }

    function handleSkip(line: ImportDocumentLineRow) {
        void patchLine(line.id, { match_action: "skipped", matched_product_id: null });
    }

    function handleApproveAll() {
        if (isDemo) {
            toast({ type: "info", message: DEMO_BLOCK_TOAST });
            return;
        }
        // Tüm 'matched' önerileri 'reviewed' olarak kilitle
        const pending = lines.filter(l => l.match_action === "matched");
        if (pending.length === 0) {
            toast({ type: "info", message: "Onaylanacak satır yok" });
            return;
        }
        // Review 3b P2-E: res.ok kontrolü — 400/403/500 sessiz başarı olmasın
        Promise.all(pending.map(async l => {
            try {
                const res = await fetch(`/api/import/document-lines/${l.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        match_action: "reviewed",
                        matched_product_id: l.matched_product_id,
                        match_confidence: l.match_confidence,
                    }),
                });
                return { ok: res.ok };
            } catch {
                return { ok: false };
            }
        })).then(results => {
            const okCount = results.filter(r => r.ok).length;
            const failedCount = results.length - okCount;
            if (okCount > 0) {
                router.refresh();
                toast({ type: "success", message: `${okCount} satır onaylandı` });
            }
            if (failedCount > 0) {
                toast({ type: "error", message: `${failedCount} satır onaylanamadı` });
            }
        });
    }

    const docType = doc.classification?.document_type ?? "unknown";
    const docConf = doc.classification?.confidence ?? 0;

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
                <div>
                    <Link href="/dashboard/import" style={{ fontSize: "12px", color: "var(--text-tertiary)", textDecoration: "none" }}>
                        ← İçeri Aktar
                    </Link>
                    <h1 style={{ fontSize: "20px", fontWeight: 600, color: "var(--text-primary)", margin: "8px 0 4px" }}>
                        {doc.file_name}
                    </h1>
                    <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>
                        Tip: <strong style={{ color: "var(--text-secondary)" }}>{docType}</strong>
                        {" · "}Güven: <strong>{Math.round(docConf * 100)}%</strong>
                        {doc.classification?.summary && (
                            <>{" · "}<span style={{ fontStyle: "italic" }}>{doc.classification.summary}</span></>
                        )}
                    </div>
                </div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    {/* Product type override (datasheet için anlamlı) */}
                    <select
                        value={overrideTypeId}
                        onChange={e => setOverrideTypeId(e.target.value)}
                        aria-label="Ürün tipi şablonu"
                        style={{
                            padding: "6px 10px", fontSize: "12px",
                            background: "var(--bg-secondary)", color: "var(--text-primary)",
                            border: "0.5px solid var(--border-secondary)", borderRadius: "5px",
                        }}
                    >
                        <option value="">— Tip otomatik —</option>
                        {productTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                    <Button
                        variant="primary"
                        onClick={handleExtract}
                        disabled={isDemo || extracting}
                        title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}
                    >
                        {extracting ? "Çıkarılıyor…" : lines.length > 0 ? "Yeniden Çıkar" : "Çıkar"}
                    </Button>
                </div>
            </div>

            {/* Empty state */}
            {lines.length === 0 && (
                <div style={{
                    padding: "32px", textAlign: "center",
                    background: "var(--bg-secondary)", border: "0.5px dashed var(--border-secondary)",
                    borderRadius: "8px", color: "var(--text-tertiary)",
                }}>
                    Bu belgeden henüz satır çıkarılmadı. &quot;Çıkar&quot; ile AI ekstraksiyonunu başlatın.
                </div>
            )}

            {/* Lines table */}
            {lines.length > 0 && (
                <>
                    {/* Bulk action */}
                    <div style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "10px 12px", background: "var(--bg-secondary)",
                        border: "0.5px solid var(--border-tertiary)", borderRadius: "6px",
                    }}>
                        <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                            {lines.length} satır çıkarıldı · {lines.filter(l => l.match_action === "matched").length} otomatik eşleşti · {lines.filter(l => l.match_action === "pending").length} inceleme bekliyor
                        </span>
                        <Button
                            variant="secondary"
                            onClick={handleApproveAll}
                            disabled={isDemo}
                            title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}
                        >
                            Eşleşmeleri Onayla
                        </Button>
                    </div>

                    <div style={{ overflow: "auto", border: "0.5px solid var(--border-tertiary)", borderRadius: "6px" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                            <thead>
                                <tr style={{ background: "var(--bg-secondary)" }}>
                                    <th style={th}>#</th>
                                    <th style={th}>Ad / SKU</th>
                                    <th style={th}>Adaylar</th>
                                    <th style={th}>Skor</th>
                                    <th style={th}>Durum</th>
                                    <th style={th}>Aksiyon</th>
                                </tr>
                            </thead>
                            <tbody>
                                {lines.map(line => {
                                    const colors = getMatchActionColor(line.match_action);
                                    return (
                                        <tr key={line.id} style={{ borderTop: "0.5px solid var(--border-tertiary)" }}>
                                            <td style={td}>{line.line_number}</td>
                                            <td style={td}>
                                                <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>{line.extracted_name ?? "—"}</div>
                                                {line.extracted_sku && (
                                                    <div style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "monospace" }}>{line.extracted_sku}</div>
                                                )}
                                            </td>
                                            <td style={td}>
                                                {line.candidate_matches.length === 0 ? (
                                                    <span style={{ color: "var(--text-tertiary)" }}>Aday yok</span>
                                                ) : (
                                                    <select
                                                        value={line.matched_product_id ?? ""}
                                                        onChange={e => {
                                                            const candId = e.target.value;
                                                            const cand = line.candidate_matches.find(c => c.id === candId);
                                                            if (cand) handleSelectCandidate(line, cand);
                                                        }}
                                                        disabled={isDemo}
                                                        aria-label={`Satır ${line.line_number} aday seç`}
                                                        style={{
                                                            padding: "4px 8px", fontSize: "11px",
                                                            background: "var(--bg-primary)", color: "var(--text-primary)",
                                                            border: "0.5px solid var(--border-secondary)", borderRadius: "4px",
                                                            minWidth: "200px",
                                                        }}
                                                    >
                                                        <option value="">— Seçilmedi —</option>
                                                        {line.candidate_matches.map(c => (
                                                            <option key={c.id} value={c.id}>
                                                                {c.sku} · {c.name} ({c.score})
                                                            </option>
                                                        ))}
                                                    </select>
                                                )}
                                            </td>
                                            <td style={td}>
                                                {line.match_confidence !== null ? `${line.match_confidence}` : "—"}
                                            </td>
                                            <td style={td}>
                                                <span style={{
                                                    fontSize: "11px", padding: "2px 8px", borderRadius: "10px",
                                                    background: colors.bg, color: colors.text,
                                                    border: `0.5px solid ${colors.border}`, fontWeight: 600,
                                                }}>
                                                    {formatMatchAction(line.match_action)}
                                                </span>
                                            </td>
                                            <td style={td}>
                                                <div style={{ display: "flex", gap: "4px" }}>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleMarkNew(line)}
                                                        disabled={isDemo}
                                                        aria-label={`Satır ${line.line_number} yeni ürün`}
                                                        style={btnSecondary}
                                                    >
                                                        Yeni
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleSkip(line)}
                                                        disabled={isDemo}
                                                        aria-label={`Satır ${line.line_number} atla`}
                                                        style={btnSecondary}
                                                    >
                                                        Atla
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Apply footer (3c'de aktive) */}
                    <div style={{
                        display: "flex", justifyContent: "flex-end", gap: "8px",
                        padding: "12px 0", borderTop: "0.5px solid var(--border-tertiary)",
                    }}>
                        <Button variant="primary" disabled title="3c'de aktive olacak — apply pipeline">
                            Uygula (Faz 3c)
                        </Button>
                    </div>
                </>
            )}
        </div>
    );
}

const th: React.CSSProperties = {
    padding: "8px 10px", textAlign: "left",
    color: "var(--text-secondary)", fontWeight: 600,
    fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.5px",
};

const td: React.CSSProperties = {
    padding: "10px", color: "var(--text-primary)", verticalAlign: "top",
};

const btnSecondary: React.CSSProperties = {
    padding: "4px 10px", fontSize: "11px",
    background: "transparent", color: "var(--text-secondary)",
    border: "0.5px solid var(--border-secondary)", borderRadius: "4px",
    cursor: "pointer",
};
