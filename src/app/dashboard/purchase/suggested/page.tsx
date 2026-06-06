"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useData } from "@/lib/data-context";
import { computeCoverageDays, computeTargetStock, daysColor, daysBg, dateDaysFromToday } from "@/lib/stock-utils";
import type { Product } from "@/lib/mock-data";
import AIDetailDrawer from "@/components/ai/AIDetailDrawer";
import { AiUnavailableBanner } from "@/components/ai/AiUnavailableBanner";
import { useToast } from "@/components/ui/Toast";
import { useIsDemo, DEMO_BLOCK_TOAST, DEMO_DISABLED_TOOLTIP } from "@/lib/demo-utils";
import { formatCurrency } from "@/lib/utils";
import { computeOrderTotals, scheduleRefetchAfterMutation, shouldSkipAiFetch } from "@/lib/purchase-utils";
import PurchaseOrderModal, { type ModalItem, type VendorOption, type PoModalMode } from "@/components/purchase/PurchaseOrderModal";
import type { LinkedPO } from "@/lib/supabase/purchase-orders";
import Button from "@/components/ui/Button";
import { Check, CircleOff, ClipboardList, Pencil } from "lucide-react";

interface AiEnrichmentItem {
    productId: string;
    aiWhyNow: string | null;
    aiQuantityRationale: string | null;
    aiUrgencyLevel: "critical" | "high" | "moderate" | null;
    aiConfidence: number | null;
}

type UrgencyLevel = "critical" | "high" | "moderate";

const AI_ENRICH_SOFT_TIMEOUT_MS = 30_000;

interface RecEntry {
    id: string;
    status: string;
    decidedAt?: string | null;
    /** G11: decided rec'lerde mevcut state ile dondurulan metadata arası fark.
     *  null ise drift yok; objeyse "Stok değişti" rozeti gösterilir. */
    currentDrift?: { suggestQty: number; urgencyLevel: UrgencyLevel } | null;
    /** Audit 11. tur Fix 2: kararı verildiğinde dondurulan suggestQty.
     *  accepted/rejected ürünlerde UI bu değeri gösterir; edited durumda
     *  editedQty önceliklidir. Suggested ya da legacy rec'lerde null. */
    frozenSuggestQty?: number | null;
    /** Faz 6: junction üzerinden reverse lookup — bu rec'e bağlı PO'lar. */
    linkedPOs?: LinkedPO[];
}

/**
 * Audit 11. tur Fix 2: decided rec'lerde "frozen" suggestQty UI'a yansımalı.
 * Backend zaten metadata.suggestQty üretiyor; ama UI satır render'ı her zaman
 * computeSuggestion(p) ile güncel hesap yapıyordu. Bu helper karar mantığını
 * tek yerde tutar:
 *   - rec yok / suggested → güncel hesap (computedQty)
 *   - edited → editedQty (kullanıcının düzenlediği miktar)
 *   - accepted / rejected → frozenSuggestQty (kararı verildiği andaki miktar)
 *   - legacy (frozenSuggestQty undefined) → fallback computedQty
 */
export function selectDisplaySuggestQty(
    rec: (RecEntry & { editedQty?: number }) | undefined,
    computedQty: number,
): number {
    if (!rec) return computedQty;
    if (rec.status === "edited" && rec.editedQty != null) return rec.editedQty;
    if ((rec.status === "accepted" || rec.status === "rejected") && rec.frozenSuggestQty != null) {
        return rec.frozenSuggestQty;
    }
    return computedQty;
}

const URGENCY_LABEL: Record<UrgencyLevel, string> = {
    critical: "Kritik",
    high: "Yüksek",
    moderate: "Orta",
};

const PO_STATUS_LABELS: Record<string, string> = {
    draft: "Taslak",
    sent: "Gönderildi",
    confirmed: "Onaylandı",
    partially_received: "Kısmi Kabul",
    received: "Tamamlandı",
    cancelled: "İptal",
};

// ── Module-level styles (no-inline-exhaustive-style) ──────────

const staleDriftBadgeStyle: React.CSSProperties = {
    display: "inline-block",
    marginTop: "4px",
    fontSize: "10px",
    fontWeight: 500,
    padding: "2px 6px",
    borderRadius: "3px",
    background: "var(--warning-bg)",
    color: "var(--warning-text)",
    border: "0.5px solid var(--warning-border)",
};

const aiLoadingStyle: React.CSSProperties = {
    marginTop: "4px", fontSize: "10px", color: "var(--text-tertiary)", fontStyle: "italic",
};

// AiSignalButton — 3-variant lookup map (urgency-based)
const AI_SIGNAL_BUTTON_STYLES: Record<UrgencyLevel, React.CSSProperties> = {
    critical: {
        marginTop: "4px",
        background: "var(--danger-bg)",
        color: "var(--danger-text)",
        border: "0.5px solid var(--danger-border)",
        borderRadius: "4px",
        padding: "2px 7px",
        fontSize: "10px",
        fontWeight: 600,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
    },
    high: {
        marginTop: "4px",
        background: "var(--warning-bg)",
        color: "var(--warning-text)",
        border: "0.5px solid var(--warning-border)",
        borderRadius: "4px",
        padding: "2px 7px",
        fontSize: "10px",
        fontWeight: 600,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
    },
    moderate: {
        marginTop: "4px",
        background: "var(--accent-bg)",
        color: "var(--accent-text)",
        border: "0.5px solid var(--accent-border)",
        borderRadius: "4px",
        padding: "2px 7px",
        fontSize: "10px",
        fontWeight: 600,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
    },
};

const aiSignalArrowStyle: React.CSSProperties = { opacity: 0.6 };

const whyBadgeWrapperStyle: React.CSSProperties = {
    display: "flex", flexDirection: "column", gap: "3px", marginTop: "4px",
};

const whyBadgeItemBaseStyle: React.CSSProperties = {
    display: "inline-block",
    fontSize: "10px",
    fontWeight: 500,
    padding: "1px 6px",
    borderRadius: "3px",
    width: "fit-content",
};

const segmentBannerStyle: React.CSSProperties = {
    marginTop: "12px",
    padding: "12px 16px",
    background: "var(--accent-bg)",
    border: "1px solid var(--accent-border)",
    borderRadius: "8px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    flexWrap: "wrap",
};

const segmentBannerTitleStyle: React.CSSProperties = {
    fontSize: "13px", fontWeight: 600, color: "var(--accent-text)",
};

const segmentBannerSubtitleStyle: React.CSSProperties = {
    fontSize: "12px", color: "var(--text-tertiary)", marginTop: "2px",
};

const segmentBannerBadgeStyle: React.CSSProperties = {
    fontSize: "13px", fontWeight: 600, color: "var(--accent-text)", whiteSpace: "nowrap",
};

/** G11: Decided rec'lerde stok/aciliyet drift'i varsa gösterilen rozet. */
function StaleDriftBadge({ drift, unit }: {
    drift: { suggestQty: number; urgencyLevel: UrgencyLevel };
    unit: string;
}) {
    return (
        <span
            title="Karar verildikten sonra ürün state'i değişti. Güncel öneri değerleri yanda."
            style={staleDriftBadgeStyle}
        >
            Stok değişti — güncel: {drift.suggestQty} {unit}, {URGENCY_LABEL[drift.urgencyLevel]} aciliyet
        </span>
    );
}

/** Compact AI signal button — click to open drawer */
function AiSignalButton({ enrichment, loading, onClick }: {
    enrichment: AiEnrichmentItem | undefined;
    loading: boolean;
    onClick: () => void;
}) {
    if (loading) {
        return (
            <div style={aiLoadingStyle}>
                AI...
            </div>
        );
    }
    if (!enrichment) return null;

    const urgency: UrgencyLevel = enrichment.aiUrgencyLevel ?? "moderate";
    const urgencyLabel = urgency === "critical" ? "Kritik" : urgency === "high" ? "Yüksek" : "Orta";
    return (
        <button
            onClick={onClick}
            aria-label="AI analizi detaylarını gör"
            style={AI_SIGNAL_BUTTON_STYLES[urgency]}
        >
            <span>✦ AI</span>
            <span>{urgencyLabel}</span>
            <span style={aiSignalArrowStyle}>→</span>
        </button>
    );
}

type FilterType = "all" | "manufactured" | "commercial";

function WhyBadge({ daysLeft, urgency, leadTimeDays }: {
    daysLeft: number | null;
    urgency: number;
    leadTimeDays?: number;
}) {
    const lines: { text: string; color: string; bg: string }[] = [];

    if (daysLeft !== null && daysLeft <= 7) {
        lines.push({ text: "⚡ 7 günde tükeniyor", color: "var(--danger-text)", bg: "var(--danger-bg)" });
    } else if (daysLeft !== null && daysLeft <= 14) {
        lines.push({ text: "⚠ 14 günde tükeniyor", color: "var(--warning-text)", bg: "var(--warning-bg)" });
    } else if (daysLeft === null) {
        lines.push({ text: "Günlük kullanım verisi yok — stok min altında", color: "var(--warning-text)", bg: "var(--warning-bg)" });
    }

    if (daysLeft !== null && leadTimeDays != null && leadTimeDays > 0 && daysLeft < leadTimeDays) {
        lines.push({
            text: `Stok, tedarik süresinden (${leadTimeDays} gün) önce tükenecek`,
            color: "var(--danger-text)",
            bg: "var(--danger-bg)",
        });
    }

    if (urgency >= 80) {
        lines.push({ text: `Kritik: min'in %${urgency - 100 < 0 ? Math.abs(urgency - 100) : urgency} altında`, color: "var(--danger-text)", bg: "var(--danger-bg)" });
    }

    if (lines.length === 0) return null;

    return (
        <div style={whyBadgeWrapperStyle}>
            {lines.map((l, i) => (
                <span key={i} style={{
                    ...whyBadgeItemBaseStyle,
                    background: l.bg,
                    color: l.color,
                }}>
                    {l.text}
                </span>
            ))}
        </div>
    );
}

function SegmentBanner({ filter, count }: {
    filter: "manufactured" | "commercial";
    count: number;
}) {
    const isManufactured = filter === "manufactured";
    const title    = isManufactured
        ? `Üretim emri bekleyen ${count} ürün`
        : `Satın alma siparişi bekleyen ${count} ürün`;
    const subtitle = isManufactured
        ? "Üretim kapasitesine göre önceliklendirin — kritik olanlar önce planlanmalı"
        : "Tedarikçi kapasitesine göre önceliklendirin — kritik stoklar önce sipariş edilmeli";
    const badge    = isManufactured
        ? `${count} üretim planı bekliyor`
        : `${count} satın alma planı bekliyor`;

    return (
        <div style={segmentBannerStyle}>
            <div>
                <div style={segmentBannerTitleStyle}>
                    {title}
                </div>
                <div style={segmentBannerSubtitleStyle}>
                    {subtitle}
                </div>
            </div>
            <div style={segmentBannerBadgeStyle}>
                {badge}
            </div>
        </div>
    );
}

function useIsMobile(breakpoint = 768): boolean {
    const [isMobile, setIsMobile] = useState(() =>
        typeof window !== "undefined"
            ? window.matchMedia(`(max-width: ${breakpoint - 1}px)`).matches
            : false
    );
    useEffect(() => {
        const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
        const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
        mq.addEventListener("change", handler);
        return () => mq.removeEventListener("change", handler);
    }, [breakpoint]);
    return isMobile;
}

type DecisionFilter = "all" | "pending" | "accepted" | "rejected";

/**
 * Compute suggestion for a single product row.
 *
 * Audit 5-6. tur: hesap promisable (= available_now - quoted) üzerinden;
 * over-quoted durum için 0'a clamp. Backend purchase-copilot route'uyla
 * aynı semantik: needed = max(0, target - max(0, promisable)).
 */
export function computeSuggestion(p: Product) {
    const { target, formula, leadTimeDemand } = computeTargetStock(
        p.minStockLevel, p.dailyUsage ?? null, p.leadTimeDays ?? null
    );
    const moq = Math.max(1, p.reorderQty ?? p.minStockLevel);
    const stock = pickStock(p);
    const needed = Math.max(0, target - stock);
    const suggestQty = needed === 0 ? moq : Math.max(moq, Math.ceil(needed / moq) * moq);
    return { suggestQty, target, formula, leadTimeDemand, moq };
}

/**
 * Audit 5. tur Fix 2: row-level UI hesapları için promisable bazlı stok değeri.
 * Mobil kart + masaüstü tablo bunu kullanır → urgency/coverage/stok rozeti
 * UI ile backend tutarlı olur.
 *
 * Audit 6. tur Fix 2: over-quoted (promisable<0) durumunda stok 0'a clamp,
 * urgency en fazla 100. Backend `Math.max(0, promisable)` ile aynı semantik.
 */
export function pickStock(p: Pick<Product, "promisable" | "available_now">): number {
    return Math.max(0, p.promisable ?? p.available_now);
}

export function computeRowStock(p: Product): {
    stock: number;
    urgency: number;
    daysLeft: number | null;
} {
    const stock = pickStock(p);
    const urgency = p.minStockLevel > 0
        ? Math.min(100, Math.round((1 - stock / p.minStockLevel) * 100))
        : 100;
    const daysLeft = computeCoverageDays(stock, p.dailyUsage);
    return { stock, urgency, daysLeft };
}

/** Formula label for UI display */
function FormulaLabel({ p, formula, leadTimeDemand }: {
    p: Product;
    formula: "lead_time" | "fallback";
    leadTimeDemand: number | null;
}) {
    if (formula === "lead_time" && leadTimeDemand !== null && p.dailyUsage && p.leadTimeDays) {
        return (
            <div style={{
                fontSize: "10px",
                color: "var(--accent-text)",
                marginTop: "2px",
                fontFamily: "monospace",
            }}>
                LT: {p.dailyUsage}×{p.leadTimeDays}+{p.minStockLevel}
            </div>
        );
    }
    return (
        <div style={{
            fontSize: "10px",
            color: "var(--text-tertiary)",
            marginTop: "2px",
            fontFamily: "monospace",
        }}>
            2×min
        </div>
    );
}

/** Action buttons + status badge for a recommendation */
function RecActionCell({
    productId,
    recEntry,
    suggestQty,
    unit,
    onAccept,
    onReject,
    onEdit,
    onUndo,
    onOpenPoModal,
    isDemo,
}: {
    productId: string;
    recEntry: (RecEntry & { editedQty?: number }) | undefined;
    suggestQty: number;
    unit: string;
    onAccept: (productId: string) => void;
    onReject: (productId: string, feedbackNote?: string) => void;
    onEdit: (productId: string, qty: number, unit: string) => void;
    onUndo: (productId: string) => void;
    onOpenPoModal?: (productId: string) => void;
    isDemo?: boolean;
}) {
    const [editMode, setEditMode] = useState(false);
    const [editQty, setEditQty] = useState(suggestQty);
    const [rejectMode, setRejectMode] = useState(false);
    const [rejectNote, setRejectNote] = useState("");

    const status = recEntry?.status ?? "no_rec";

    const decidedTime = recEntry?.decidedAt
        ? new Date(recEntry.decidedAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })
        : null;

    const undoButton = !isDemo ? (
        <button
            onClick={() => onUndo(productId)}
            style={{
                display: "block", marginTop: "4px", fontSize: "10px",
                color: "var(--text-tertiary)", background: "none", border: "none",
                cursor: "pointer", textDecoration: "underline", padding: 0,
            }}
        >
            Kararı geri al
        </button>
    ) : null;

    const drift = recEntry?.currentDrift ?? null;
    const driftBadge = drift ? <StaleDriftBadge drift={drift} unit={unit} /> : null;

    const linkedPOs = recEntry?.linkedPOs ?? [];
    const linkedPosEl = linkedPOs.length > 0 ? (
        <div style={{ marginTop: "4px" }}>
            {linkedPOs.map(po => (
                <a
                    key={po.id}
                    href={`/dashboard/purchase/orders/${po.id}`}
                    style={{ display: "block", fontSize: "11px", color: "var(--accent-text)", textDecoration: "underline", marginTop: "2px" }}
                >
                    PO #{po.po_number} ({PO_STATUS_LABELS[po.status] ?? po.status})
                </a>
            ))}
        </div>
    ) : null;

    const hasActivePO = linkedPOs.some(po => po.status !== "cancelled");
    const openPoButton = onOpenPoModal ? (
        <button
            onClick={() => onOpenPoModal(productId)}
            disabled={isDemo || hasActivePO}
            title={
                isDemo ? "Demo modunda devre dışı — değişiklik yapmak için giriş yapın."
                : hasActivePO ? "Zaten aktif siparişe bağlı — yeniden sipariş için mevcut siparişi iptal edin."
                : "Bu öneriden satın alma siparişi oluştur"
            }
            style={{
                display: "block",
                marginTop: "4px",
                fontSize: "10px",
                color: "var(--accent-text)",
                background: "none",
                border: "none",
                cursor: (isDemo || hasActivePO) ? "not-allowed" : "pointer",
                textDecoration: "underline",
                padding: 0,
                opacity: (isDemo || hasActivePO) ? 0.5 : 1,
            }}
            aria-label="Satın alma siparişi oluştur"
        >
            📋 Sipariş Aç
        </button>
    ) : null;

    if (status === "accepted") {
        return (
            <div>
                <span style={{
                    fontSize: "11px", fontWeight: 600, padding: "3px 8px", borderRadius: "4px",
                    background: "var(--success-bg)", color: "var(--success-text)",
                    border: "0.5px solid var(--success-border)",
                }}>
                    ✓ Kabul Edildi{decidedTime && <span style={{ fontWeight: 400, opacity: 0.7, marginLeft: "4px" }}>{decidedTime}</span>}
                </span>
                {driftBadge}
                {linkedPosEl}
                {openPoButton}
                {undoButton}
            </div>
        );
    }

    if (status === "edited") {
        const editedQty = recEntry?.editedQty ?? null;
        return (
            <div>
                <span style={{
                    fontSize: "11px", fontWeight: 600, padding: "3px 8px", borderRadius: "4px",
                    background: "var(--accent-bg)", color: "var(--accent-text)",
                    border: "0.5px solid var(--accent-border)",
                }}>
                    ✎ Düzenlendi{editedQty != null ? `: ${editedQty} ${unit}` : ""}{decidedTime && <span style={{ fontWeight: 400, opacity: 0.7, marginLeft: "4px" }}>{decidedTime}</span>}
                </span>
                {driftBadge}
                {linkedPosEl}
                {openPoButton}
                {undoButton}
            </div>
        );
    }

    if (status === "rejected") {
        return (
            <div>
                <span style={{
                    fontSize: "11px", fontWeight: 600, padding: "3px 8px", borderRadius: "4px",
                    color: "var(--danger-text)",
                }}>
                    ✕ Reddedildi{decidedTime && <span style={{ fontWeight: 400, opacity: 0.7, marginLeft: "4px" }}>{decidedTime}</span>}
                </span>
                {driftBadge}
                {linkedPosEl}
                {undoButton}
            </div>
        );
    }

    if (editMode) {
        return (
            <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                <input
                    type="number"
                    value={editQty}
                    min={1}
                    onChange={e => setEditQty(Number(e.target.value))}
                    style={{
                        width: "72px",
                        padding: "3px 6px",
                        fontSize: "12px",
                        border: "1px solid var(--border-secondary)",
                        borderRadius: "4px",
                        background: "var(--bg-primary)",
                        color: "var(--text-primary)",
                    }}
                />
                <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>{unit}</span>
                <Button
                    size="xs"
                    onClick={() => { onEdit(productId, editQty, unit); setEditMode(false); }}
                >
                    Kaydet
                </Button>
                <Button
                    variant="secondary"
                    size="xs"
                    onClick={() => setEditMode(false)}
                >
                    İptal
                </Button>
            </div>
        );
    }

    if (rejectMode) {
        return (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <input
                    type="text"
                    value={rejectNote}
                    placeholder="Ret sebebi (isteğe bağlı, max 200)"
                    onChange={e => setRejectNote(e.target.value)}
                    maxLength={200}
                    autoFocus
                    style={{
                        padding: "3px 8px",
                        fontSize: "12px",
                        border: "1px solid var(--border-secondary)",
                        borderRadius: "4px",
                        background: "var(--bg-primary)",
                        color: "var(--text-primary)",
                        width: "180px",
                        boxSizing: "border-box",
                    }}
                />
                <div style={{ display: "flex", gap: "6px" }}>
                    <Button
                        variant="danger"
                        size="xs"
                        leftIcon={<CircleOff size={13} />}
                        onClick={() => { onReject(productId, rejectNote || undefined); setRejectMode(false); setRejectNote(""); }}
                    >
                        Reddet
                    </Button>
                    <Button
                        variant="secondary"
                        size="xs"
                        onClick={() => { setRejectMode(false); setRejectNote(""); }}
                    >
                        İptal
                    </Button>
                </div>
            </div>
        );
    }

    // suggested or no_rec
    if (!recEntry) {
        return (
            <span style={{
                fontSize: "10px", fontWeight: 600, padding: "2px 8px", borderRadius: "4px",
                background: "var(--warning-bg)", color: "var(--warning-text)",
                border: "0.5px solid var(--warning-border)",
            }}>
                Beklemede
            </span>
        );
    }

    return (
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            <Button
                variant="success"
                size="xs"
                leftIcon={<Check size={13} />}
                onClick={() => onAccept(productId)}
                disabled={isDemo}
                title={isDemo ? "Demo modunda devre dışı — değişiklik yapmak için giriş yapın." : undefined}
            >
                Kabul Et
            </Button>
            <Button
                variant="secondary"
                size="xs"
                leftIcon={<Pencil size={13} />}
                onClick={() => { setEditQty(suggestQty); setEditMode(true); }}
                disabled={isDemo}
                title={isDemo ? "Demo modunda devre dışı — değişiklik yapmak için giriş yapın." : undefined}
            >
                Düzenle
            </Button>
            <Button
                variant="dangerSoft"
                size="xs"
                leftIcon={<CircleOff size={13} />}
                onClick={() => { setRejectNote(""); setRejectMode(true); }}
                disabled={isDemo}
                title={isDemo ? "Demo modunda devre dışı — değişiklik yapmak için giriş yapın." : undefined}
            >
                Reddet
            </Button>
            {onOpenPoModal && (
                <Button
                    variant="secondary"
                    size="xs"
                    leftIcon={<ClipboardList size={13} />}
                    onClick={() => onOpenPoModal(productId)}
                    disabled={isDemo}
                    title={isDemo ? "Demo modunda devre dışı — değişiklik yapmak için giriş yapın." : "Bu öneriden satın alma siparişi oluştur"}
                    aria-label="Satın alma siparişi oluştur"
                >
                    Sipariş Aç
                </Button>
            )}
        </div>
    );
}

export default function PurchaseSuggestedPage() {
    const { reorderSuggestions, products, refetchAll } = useData();
    const [filter, setFilter] = useState<FilterType>("all");
    const [decisionFilter, setDecisionFilter] = useState<DecisionFilter>("all");
    const [search, setSearch] = useState("");
    const isMobile = useIsMobile();
    const { toast } = useToast();
    const isDemo = useIsDemo();
    const refetchTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const [aiData, setAiData] = useState<{
        ai_available: boolean;
        ai_call_failed?: boolean;
        items: AiEnrichmentItem[];
        recommendations?: Array<{
            productId: string;
            recommendationId: string | null;
            status: string;
            decidedAt?: string | null;
            editedMetadata?: Record<string, unknown> | null;
            currentDrift?: { suggestQty: number; urgencyLevel: UrgencyLevel } | null;
            frozenSuggestQty?: number | null;
            linkedPOs?: LinkedPO[];
        }>;
        generatedAt?: string;
    } | null>(null);
    const [aiLoading, setAiLoading] = useState(false);
    const [aiError, setAiError] = useState(false);
    // 2026-05-26: Route-level AI rate limit guard 429 dönerse spesifik banner için.
    // null = limit aşılmadı; { retryAfter } = aşıldı, X saniye sonra dene.
    const [aiRateLimited, setAiRateLimited] = useState<{ retryAfter: number } | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);
    const [aiDrawerProductId, setAiDrawerProductId] = useState<string | null>(null);

    // recMap: productId → { id, status, editedQty? }
    const [recMap, setRecMap] = useState<Map<string, RecEntry & { editedQty?: number }>>(new Map());

    // G3 (bulgular 4. tur): "Açık Sipariş" sütunu için onaylı + sevk edilmemiş
    // sipariş sayısı. Mount'ta bir kez çekilir; sayfa içinde sipariş yaratımı yok.
    const [openOrderCounts, setOpenOrderCounts] = useState<Record<string, number>>({});

    useEffect(() => {
        const ctrl = new AbortController();
        fetch("/api/orders/open-count-by-product", { signal: ctrl.signal })
            .then(r => r.ok ? r.json() : {})
            .then(data => setOpenOrderCounts(data ?? {}))
            .catch(() => { /* best-effort: hata → 0 default */ });
        return () => ctrl.abort();
    }, []);

    const [vendors, setVendors] = useState<VendorOption[]>([]);
    useEffect(() => {
        fetch("/api/vendors?isActive=true")
            .then(r => r.ok ? r.json() : [])
            .then((data: Array<Record<string, unknown>>) => setVendors(
                Array.isArray(data) ? data.map(v => ({
                    id: v.id as string,
                    name: v.name as string,
                    currency: (v.currency as string) ?? "TRY",
                    lead_time_days: v.lead_time_days as number | null | undefined,
                })) : []
            ))
            .catch(() => {});
    }, []);

    const [poModalState, setPoModalState] = useState<{
        open: boolean;
        mode: PoModalMode;
        items: ModalItem[];
        lockedVendorId?: string;
    }>({ open: false, mode: "single", items: [] });

    const [_bulkQueue, setBulkQueue] = useState<Array<{
        mode: PoModalMode;
        items: ModalItem[];
        lockedVendorId?: string;
    }>>([]);

    const loadAiData = useCallback(async (signal?: AbortSignal): Promise<boolean> => {
        // Sprint C G7: demo modda AI POST yapma — middleware 403 dönüyor ve sessiz
        // yutuluyor. Önceden AI banner'ı gösterip user'ı yanıltıyordu; şimdi
        // hiç çağırmıyoruz, mavi info banner ile durum bildiriliyor.
        if (shouldSkipAiFetch(isDemo)) {
            setAiData(null);
            setAiError(false);
            setAiRateLimited(null);
            return true;
        }
        setAiLoading(true);
        setAiError(false);
        setAiRateLimited(null);
        let softTimedOut = false;
        const requestController = new AbortController();
        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        const abortFromParent = () => requestController.abort();
        if (signal?.aborted) {
            requestController.abort();
        } else {
            signal?.addEventListener("abort", abortFromParent, { once: true });
        }

        const fetchTask = (async (): Promise<boolean> => {
            try {
                const res = await fetch("/api/ai/purchase-copilot", {
                    method: "POST",
                    signal: requestController.signal,
                });
                // 2026-05-26: Route-level AI rate limit guard 429 dönerse generic
                // "AI çağrısı başarısız" yerine spesifik "AI istek limiti aşıldı"
                // mesajı göster (retryAfter ile). Aksi halde kullanıcı tek tıkta
                // 10'u aşınca "Aşağıda standart hesaplamalara dayalı..." gibi
                // yanıltıcı bir mesaj görüyordu.
                if (res.status === 429) {
                    const body = await res.json().catch(() => ({ retryAfter: 60 }));
                    setAiRateLimited({ retryAfter: typeof body?.retryAfter === "number" ? body.retryAfter : 60 });
                    return false;
                }
                const data = res.ok ? await res.json() : null;
                if (data) {
                    setAiData(data);
                    setAiError(false);
                    if (data.recommendations) {
                        const newMap = new Map<string, RecEntry & { editedQty?: number }>();
                        for (const r of data.recommendations) {
                            if (r.recommendationId) {
                                const editedQty = r.status === "edited"
                                    ? (r.editedMetadata?.suggestQty as number | undefined)
                                    : undefined;
                                newMap.set(r.productId, {
                                    id: r.recommendationId,
                                    status: r.status,
                                    decidedAt: r.decidedAt ?? null,
                                    currentDrift: r.currentDrift ?? null,
                                    frozenSuggestQty: r.frozenSuggestQty ?? null,
                                    linkedPOs: r.linkedPOs ?? [],
                                    ...(editedQty != null && { editedQty }),
                                });
                            }
                        }
                        setRecMap(newMap);
                    }
                    return true;
                } else {
                    setAiError(true);
                    return false;
                }
            } catch (e) {
                if (!(e instanceof Error && e.name === "AbortError")) {
                    setAiError(true);
                }
                return false;
            } finally {
                if (timeoutId) clearTimeout(timeoutId);
                signal?.removeEventListener("abort", abortFromParent);
                if (!softTimedOut) setAiLoading(false);
            }
        })();

        const softTimeoutTask = new Promise<false>((resolve) => {
            timeoutId = setTimeout(() => {
                softTimedOut = true;
                setAiError(true);
                setAiLoading(false);
                resolve(false);
            }, AI_ENRICH_SOFT_TIMEOUT_MS);
        });

        return await Promise.race([fetchTask, softTimeoutTask]);
    }, [isDemo]);

    // Audit 4-5-7. tur: imza set tabanlı (length yerine).
    // Aynı sayıda ama farklı ürün setleri veya stok/quote değişimi →
    // AI/recMap otomatik yenilensin.
    // Imza alanları: productId + available_now + min + dailyUsage + reserved + quoted
    // (Audit 5. tur Fix 3: quoted eklendi).
    // Audit 7. tur Fix 1: imza reorderSuggestions değil, displayProducts üzerinden
    // hesaplanır → out-of-scope decided ürünlerin stok/quote değişimi de yakalanır
    // (drift güncellenir, auto-reload tetiklenir).
    // Not: displayProducts useMemo'su daha aşağıda tanımlı; bu state-derived
    // memoization React tarafında bağlam bağımlılığı sorun değil — ileride
    // hoisted edilebilir.
    const signatureSource = useMemo(() => {
        const seen = new Set(reorderSuggestions.map(p => p.id));
        const outOfScope = products.filter(p => {
            if (seen.has(p.id)) return false;
            const status = recMap.get(p.id)?.status;
            return status === "accepted" || status === "edited" || status === "rejected";
        });
        return [...reorderSuggestions, ...outOfScope];
    }, [reorderSuggestions, products, recMap]);

    const reorderSignature = useMemo(() => {
        if (signatureSource.length === 0) return "";
        return signatureSource
            .map(p => `${p.id}:${p.available_now}:${p.minStockLevel}:${p.dailyUsage ?? "_"}:${p.reserved}:${p.quoted}`)
            .sort()
            .join("|");
    }, [signatureSource]);

    // Audit 9. tur Fix 1: ilk yüklemede recMap boş + reorderSuggestions boş
    // senaryosu → signatureSource boş → effect skip. Sonuç: out-of-scope decided
    // ürünlerin drift bilgisi manuel "Yenile"ye veya CRON'a kadar UI'da yok
    // (chicken-and-egg: route çağrılmadan recMap dolmaz). Çözüm: dependency'ye
    // products.length ekle — products yüklendiğinde signature boş olsa bile
    // route bir kez çağrılır, recMap dolunca signatureSource genişler ve effect
    // tekrar tetiklenir.
    useEffect(() => {
        if (products.length === 0) return; // products henüz yüklenmedi → bekle
        const controller = new AbortController();
        loadAiData(controller.signal);
        return () => controller.abort();
    }, [reorderSignature, products.length, loadAiData]);

    useEffect(() => () => clearTimeout(refetchTimerRef.current), []);

    const handleRefresh = async () => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        if (refreshing || aiLoading) return;
        setRefreshing(true);
        try {
            await refetchAll();
            const aiOk = await loadAiData();
            setLastRefreshed(new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }));
            if (aiOk) {
                toast({ type: "success", message: "Öneriler güncellendi" });
            } else {
                toast({ type: "error", message: "AI önerileri yenilenemedi — sayfa verisi güncel" });
            }
        } catch {
            toast({ type: "error", message: "Yenileme başarısız" });
        } finally {
            setRefreshing(false);
        }
    };

    const aiMap = useMemo(() => {
        if (!aiData?.items) return new Map<string, AiEnrichmentItem>();
        return new Map(aiData.items.map(i => [i.productId, i]));
    }, [aiData]);

    const handleAccept = async (productId: string) => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        const rec = recMap.get(productId);
        if (!rec) return;
        const prev = { ...rec };
        setRecMap(m => new Map(m).set(productId, { ...rec, status: "accepted", decidedAt: new Date().toISOString() }));
        try {
            const res = await fetch(`/api/recommendations/${rec.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "accepted" }),
            });
            if (res.ok) {
                const { recommendation } = await res.json();
                setRecMap(m => new Map(m).set(productId, { ...rec, status: recommendation.status, decidedAt: recommendation.decidedAt }));
                toast({ type: "success", message: "Sipariş önerisi kabul edildi" });
                // Sprint C G6: özet kartlar (Toplam Kritik, Toplam Tutar, kabul edilen)
                // recMap üzerinden hesaplanıyor; sayaç guarantilenmesi için debounce ile
                // arkaplandan refetch — kullanıcı satır state'ini hemen görür.
                scheduleRefetchAfterMutation(refetchTimerRef, () => loadAiData());
            } else {
                setRecMap(m => new Map(m).set(productId, prev));
                toast({ type: "error", message: "Kaydedilemedi — tekrar deneyin" });
            }
        } catch {
            setRecMap(m => new Map(m).set(productId, prev));
            toast({ type: "error", message: "Kaydedilemedi — tekrar deneyin" });
        }
    };

    const handleReject = async (productId: string, feedbackNote?: string) => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        const rec = recMap.get(productId);
        if (!rec) return;
        const prev = { ...rec };
        setRecMap(m => new Map(m).set(productId, { ...rec, status: "rejected", decidedAt: new Date().toISOString() }));
        try {
            const res = await fetch(`/api/recommendations/${rec.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    status: "rejected",
                    ...(feedbackNote ? { feedbackNote } : {}),
                }),
            });
            if (res.ok) {
                const { recommendation } = await res.json();
                setRecMap(m => new Map(m).set(productId, { ...rec, status: recommendation.status, decidedAt: recommendation.decidedAt }));
                toast({ type: "info", message: "Öneri reddedildi" });
                scheduleRefetchAfterMutation(refetchTimerRef, () => loadAiData());
            } else {
                setRecMap(m => new Map(m).set(productId, prev));
                toast({ type: "error", message: "Kaydedilemedi — tekrar deneyin" });
            }
        } catch {
            setRecMap(m => new Map(m).set(productId, prev));
            toast({ type: "error", message: "Kaydedilemedi — tekrar deneyin" });
        }
    };

    const handleEdit = async (productId: string, qty: number, unit: string) => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        if (!qty || qty <= 0 || !Number.isFinite(qty)) {
            toast({ type: "error", message: "Miktar 0'dan büyük olmalıdır." });
            return;
        }
        const rec = recMap.get(productId);
        if (!rec) return;
        const prev = { ...rec };
        setRecMap(m => new Map(m).set(productId, { ...rec, status: "edited", editedQty: qty, decidedAt: new Date().toISOString() }));
        try {
            const res = await fetch(`/api/recommendations/${rec.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "edited", editedMetadata: { suggestQty: qty } }),
            });
            if (res.ok) {
                const { recommendation } = await res.json();
                setRecMap(m => new Map(m).set(productId, { ...rec, status: recommendation.status, editedQty: qty, decidedAt: recommendation.decidedAt }));
                toast({ type: "success", message: `Miktar güncellendi: ${qty} ${unit}` });
                scheduleRefetchAfterMutation(refetchTimerRef, () => loadAiData());
            } else {
                setRecMap(m => new Map(m).set(productId, prev));
                toast({ type: "error", message: "Kaydedilemedi — tekrar deneyin" });
            }
        } catch {
            setRecMap(m => new Map(m).set(productId, prev));
            toast({ type: "error", message: "Kaydedilemedi — tekrar deneyin" });
        }
    };

    const handleUndo = async (productId: string) => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        const rec = recMap.get(productId);
        if (!rec) return;
        const prev = { ...rec };
        setRecMap(m => new Map(m).set(productId, { ...rec, status: "suggested", decidedAt: undefined }));
        try {
            const res = await fetch(`/api/recommendations/${rec.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "suggested" }),
            });
            if (res.ok) {
                toast({ type: "success", message: "Karar geri alındı." });
                scheduleRefetchAfterMutation(refetchTimerRef, () => loadAiData());
            } else {
                setRecMap(m => new Map(m).set(productId, prev));
                toast({ type: "error", message: "Karar geri alınamadı — tekrar deneyin." });
            }
        } catch {
            setRecMap(m => new Map(m).set(productId, prev));
            toast({ type: "error", message: "Karar geri alınamadı — tekrar deneyin." });
        }
    };

    // Audit 6. tur Fix 1: out-of-scope decided ürünler — needsPurchase=false
    // ama recMap'te kararı olan (accepted/edited/rejected). Bunlar
    // reorderSuggestions'da yok → drift rozetiyle görünmek için ayrıca eklenir.
    // Audit 7. tur: signatureSource ile aynı set; imza hesaplaması ve listeleme
    // tek kavramdan türer (DRY).
    const displayProducts = signatureSource;

    // Audit 8. tur Fix 3: tab/sayım displayProducts üzerinden — out-of-scope
    // decided ürünler de sekme sayılarına ve "Tümü" toplamına yansır.
    const manufacturedItems = useMemo(() => displayProducts.filter(p => p.productType === "manufactured"), [displayProducts]);
    const commercialItems = useMemo(() => displayProducts.filter(p => p.productType === "commercial"), [displayProducts]);

    // Audit 9. tur Fix 3: özet kart "Toplam Kritik" alt kırılımı için yalnızca
    // satın alma ihtiyacı olan (in-scope) ürünleri kullan — kart başlığı
    // "Toplam Kritik" reorderSuggestions.length göstermesiyle hizalı.
    // Tab count'ları displayProducts'ta kalır (görünür ürün sayısı).
    const inScopeManufacturedCount = useMemo(
        () => reorderSuggestions.filter(p => p.productType === "manufactured").length,
        [reorderSuggestions],
    );
    const inScopeCommercialCount = useMemo(
        () => reorderSuggestions.filter(p => p.productType === "commercial").length,
        [reorderSuggestions],
    );

    const sorted = useMemo(() => {
        const purchaseSearched = search.trim().toLowerCase();
        const base = (filter === "all" ? displayProducts : displayProducts.filter(p => p.productType === filter))
            .filter(p =>
                !purchaseSearched ||
                p.name.toLowerCase().includes(purchaseSearched) ||
                p.sku.toLowerCase().includes(purchaseSearched)
            );

        return [...base].sort((a, b) => {
            // Primary: orderDeadline ascending (null = no deadline data → last)
            const dlA = a.orderDeadline ?? null;
            const dlB = b.orderDeadline ?? null;
            if (dlA !== null && dlB !== null) return dlA < dlB ? -1 : dlA > dlB ? 1 : 0;
            if (dlA !== null) return -1;
            if (dlB !== null) return 1;
            // Fallback: coverage days ascending (null last)
            // Audit 6. tur Fix 3: promisable bazlı (UI satır hesaplarıyla aynı)
            const stockA = pickStock(a);
            const stockB = pickStock(b);
            const daysA = computeCoverageDays(stockA, a.dailyUsage);
            const daysB = computeCoverageDays(stockB, b.dailyUsage);
            if (daysA !== null && daysB !== null) return daysA - daysB;
            if (daysA !== null) return -1;
            if (daysB !== null) return 1;
            const urgA = a.minStockLevel > 0 ? 1 - stockA / a.minStockLevel : 1;
            const urgB = b.minStockLevel > 0 ? 1 - stockB / b.minStockLevel : 1;
            return urgB - urgA;
        }).filter(p => {
            if (decisionFilter === "all") return true;
            const st = recMap.get(p.id)?.status;
            if (decisionFilter === "accepted") return st === "accepted";
            if (decisionFilter === "rejected") return st === "rejected";
            return !st || (st !== "accepted" && st !== "rejected");
        });
    }, [displayProducts, search, filter, decisionFilter, recMap]);

    // Sprint C G4 + G8: costPrice ve price NULL ise satır toplama dahil edilmez.
    // Multi-currency: her currency ayrı toplanır; tek currency mevcut görünüm korunur.
    const { currencyEntries, isSingleCurrency, primaryCurrency, primaryTotal, primaryAccepted, missingPriceCount } = useMemo(
        () => computeOrderTotals(
            reorderSuggestions.map(p => {
                const rec = recMap.get(p.id);
                // Audit 11. tur Fix 2: accepted/rejected toplamı frozen miktarla;
                // edited editedQty; suggested güncel hesapla — selectDisplaySuggestQty
                // tek karar noktası. Stok değiştiğinde accepted toplamı sabit kalır.
                return {
                    id: p.id,
                    costPrice: p.costPrice || null,
                    price: p.price || null,
                    currency: p.currency,
                    suggestQty: selectDisplaySuggestQty(rec, computeSuggestion(p).suggestQty),
                    decidedStatus: rec?.status,
                    decidedQty: rec?.editedQty,
                };
            })
        ),
        [reorderSuggestions, recMap]
    );

    // Audit 6. tur Fix 3: en acil ürün de promisable bazlı seçilir
    const mostUrgent = [...reorderSuggestions]
        .filter(p => p.dailyUsage)
        .sort((a, b) => (pickStock(a) / (a.dailyUsage ?? 1)) - (pickStock(b) / (b.dailyUsage ?? 1)))[0];

    const mostUrgentDays = mostUrgent
        ? computeCoverageDays(pickStock(mostUrgent), mostUrgent.dailyUsage)
        : null;

    const aiDrawerProduct = aiDrawerProductId
        ? (sorted.find(p => p.id === aiDrawerProductId) ?? reorderSuggestions.find(p => p.id === aiDrawerProductId))
        : undefined;
    const aiDrawerEnrichment = aiDrawerProductId ? aiMap.get(aiDrawerProductId) : undefined;
    const aiDrawerRecEntry = aiDrawerProductId ? recMap.get(aiDrawerProductId) : undefined;
    const aiDrawerSuggestion = aiDrawerProduct ? computeSuggestion(aiDrawerProduct) : null;
    // Audit 11. tur Fix 2: drawer'daki "Önerilen miktar" da decided rec varsa frozen
    const aiDrawerSuggestQty = aiDrawerSuggestion
        ? selectDisplaySuggestQty(aiDrawerRecEntry, aiDrawerSuggestion.suggestQty)
        : 1;
    // Audit 6. tur Fix 3: AI drawer coverage da promisable bazlı
    const aiDrawerCoverageDays = aiDrawerProduct
        ? computeCoverageDays(pickStock(aiDrawerProduct), aiDrawerProduct.dailyUsage)
        : null;

    // Audit 8. tur Fix 3: tab count'ları displayProducts (in-scope + out-of-scope) üzerinden
    const tabs: { key: FilterType; label: string; count: number }[] = [
        { key: "all", label: "Tümü", count: displayProducts.length },
        { key: "manufactured", label: "İmalat", count: manufacturedItems.length },
        { key: "commercial", label: "Ticari", count: commercialItems.length },
    ];

    // Summary stats for decisions
    // Audit 8. tur Fix 3: acceptedCount/rejectedCount displayProducts kapsamında
    // (recMap'te map dışında ürünler olabilir; sadece görünen ürünleri say)
    const displayIds = useMemo(() => new Set(displayProducts.map(p => p.id)), [displayProducts]);
    const acceptedCount = [...recMap.entries()].filter(([id, r]) => displayIds.has(id) && r.status === "accepted").length;
    const rejectedCount = [...recMap.entries()].filter(([id, r]) => displayIds.has(id) && r.status === "rejected").length;
    // pendingCount: displayProducts içinde recMap'te status=suggested veya status yok olanlar.
    // Bu hesap reorderSuggestions.length - accepted - rejected formülüne göre asla negatif değil.
    const pendingCount = displayProducts.filter(p => {
        const st = recMap.get(p.id)?.status;
        return !st || st === "suggested";
    }).length;

    // PO'lanmış rec'ler (aktif PO'su olan) bulk akışından dışlanır — duplicate PO önleme
    const acceptedAndEditedCount = [...recMap.entries()].filter(
        ([id, r]) =>
            displayIds.has(id) &&
            (r.status === "accepted" || r.status === "edited") &&
            !(r.linkedPOs ?? []).some(po => po.status !== "cancelled")
    ).length;

    const handleOpenPoModal = useCallback((productId: string) => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        const p = products.find(prod => prod.id === productId);
        const rec = recMap.get(productId);
        if (!p || !rec) return;
        const suggestQty = selectDisplaySuggestQty(rec, computeSuggestion(p).suggestQty);
        setPoModalState({
            open: true,
            mode: "single",
            items: [{
                productId,
                recommendationId: rec.id,
                productName: p.name,
                sku: p.sku,
                unit: p.unit,
                suggestQty,
                unitPrice: p.costPrice ?? p.price ?? 0,
                leadTimeDays: p.leadTimeDays ?? null,
                preferredVendorId: p.preferredVendorId ?? null,
            }],
        });
    }, [products, recMap, isDemo, toast]);

    const advanceBulkQueue = useCallback(() => {
        setBulkQueue(q => {
            if (q.length === 0) return q;
            const [next, ...rest] = q;
            setPoModalState({ open: true, mode: next.mode, items: next.items, lockedVendorId: next.lockedVendorId });
            return rest;
        });
    }, []);

    const handleBulkPo = useCallback(() => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        const acceptedAndEdited = [...recMap.entries()].filter(
            ([id, r]) =>
                displayIds.has(id) &&
                (r.status === "accepted" || r.status === "edited") &&
                !(r.linkedPOs ?? []).some(po => po.status !== "cancelled")
        );
        if (acceptedAndEdited.length === 0) return;

        const vendorGroups = new Map<string | null, ModalItem[]>();
        for (const [productId, rec] of acceptedAndEdited) {
            const p = products.find(prod => prod.id === productId);
            if (!p) continue;
            const suggestQty = selectDisplaySuggestQty(rec, computeSuggestion(p).suggestQty);
            const item: ModalItem = {
                productId,
                recommendationId: rec.id,
                productName: p.name,
                sku: p.sku,
                unit: p.unit,
                suggestQty,
                unitPrice: p.costPrice ?? p.price ?? 0,
                leadTimeDays: p.leadTimeDays ?? null,
                preferredVendorId: p.preferredVendorId ?? null,
            };
            const vendorKey = p.preferredVendorId ?? null;
            const group = vendorGroups.get(vendorKey) ?? [];
            group.push(item);
            vendorGroups.set(vendorKey, group);
        }

        const queue: Array<{ mode: PoModalMode; items: ModalItem[]; lockedVendorId?: string }> = [];
        for (const [vendorId, items] of vendorGroups.entries()) {
            if (vendorId !== null) queue.push({ mode: "bulk-vendor", items, lockedVendorId: vendorId });
        }
        const orphans = vendorGroups.get(null);
        if (orphans && orphans.length > 0) queue.push({ mode: "bulk-orphan", items: orphans });

        if (queue.length === 0) return;
        const [first, ...rest] = queue;
        setPoModalState({ open: true, mode: first.mode, items: first.items, lockedVendorId: first.lockedVendorId });
        setBulkQueue(rest);
    }, [isDemo, toast, recMap, displayIds, products]);

    return (
        <div style={{ padding: "24px 32px" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                <h1 style={{ fontSize: "20px", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
                    Satın Alma Önerileri
                </h1>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                    {lastRefreshed && (
                        <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>
                            Son güncelleme: {lastRefreshed}
                        </span>
                    )}
                    <button
                        onClick={handleRefresh}
                        disabled={isDemo || refreshing || aiLoading}
                        title={isDemo ? DEMO_DISABLED_TOOLTIP : "Verileri yenile"}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            padding: "6px 12px",
                            fontSize: "12px",
                            fontWeight: 500,
                            color: (isDemo || refreshing || aiLoading) ? "var(--text-tertiary)" : "var(--text-secondary)",
                            background: "var(--bg-secondary)",
                            border: "1px solid var(--border-secondary)",
                            borderRadius: "6px",
                            cursor: (isDemo || refreshing || aiLoading) ? "not-allowed" : "pointer",
                            opacity: isDemo ? 0.6 : 1,
                            flexShrink: 0,
                        }}
                    >
                        <span style={{
                            display: "inline-block",
                            animation: (refreshing || aiLoading) ? "spin 0.8s linear infinite" : "none",
                        }}>↻</span>
                        {refreshing ? "Yenileniyor..." : "Yenile"}
                    </button>
                </div>
            </div>
            <p style={{ fontSize: "13px", color: "var(--text-tertiary)", marginTop: "4px" }}>
                Minimum stok seviyesinin altına düşen ürünler · Öncelik sırasına göre
            </p>
            <div style={{ marginTop: "4px", fontSize: "11px" }}>
                {isDemo ? (
                    <span style={{ color: "var(--text-tertiary)" }}>Demo modu — AI önerileri devre dışı</span>
                ) : aiError || aiData?.ai_call_failed ? (
                    <span style={{ color: "var(--warning-text)" }}>AI kullanılamıyor — deterministik mod</span>
                ) : aiLoading ? (
                    <span style={{ color: "var(--text-tertiary)", fontStyle: "italic" }}>AI analizi yükleniyor...</span>
                ) : aiData?.ai_available ? (
                    <span style={{ color: "var(--success-text)" }}>AI zenginleştirme aktif</span>
                ) : (
                    <span style={{ color: "var(--text-tertiary)" }}>Deterministik mod</span>
                )}
            </div>

            {/* Sprint C G7: Demo modu mavi info banner */}
            {isDemo && (
                <div
                    style={{
                        marginTop: "16px",
                        padding: "10px 14px",
                        background: "var(--accent-bg)",
                        border: "0.5px solid var(--accent-border)",
                        borderRadius: "8px",
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        fontSize: "12px",
                        color: "var(--accent-text)",
                    }}
                >
                    <span style={{ fontSize: "14px" }}>ℹ</span>
                    <span>
                        Demo modunda AI önerileri devre dışı. Aşağıda standart hesaplamalara dayalı öneriler gösteriliyor.
                    </span>
                </div>
            )}

            {/* 2026-05-26: Route-level AI rate limit guard 429 — spesifik mesaj.
                aiError genel "AI başarısız" banner'ından önce render edilir; rate-limit
                aktifken iki banner birden gösterilmesin diye aiRateLimited != null kontrol. */}
            {!isDemo && aiRateLimited && (
                <AiUnavailableBanner
                    message={`AI istek limiti aşıldı. Lütfen yaklaşık ${aiRateLimited.retryAfter} saniye bekleyip tekrar deneyin. Bu sırada deterministik hesaplamalar gösteriliyor.`}
                    onRetry={() => loadAiData()}
                    retryDisabled={aiLoading}
                    style={{ marginTop: "16px", borderRadius: "8px" }}
                />
            )}

            {/* Sprint C G2: AI çağrısı başarısız sarı banner + Yeniden dene */}
            {!isDemo && !aiRateLimited && (aiError || aiData?.ai_call_failed) && (
                <AiUnavailableBanner
                    message="AI önerisi şu an oluşturulamadı. Aşağıda standart hesaplamalara dayalı öneriler gösteriliyor."
                    onRetry={() => loadAiData()}
                    retryDisabled={aiLoading}
                    style={{ marginTop: "16px", borderRadius: "8px" }}
                />
            )}

            {/* Summary cards */}
            {reorderSuggestions.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: "12px", marginTop: "20px" }}>
                    <div style={{
                        background: "var(--bg-secondary)",
                        border: "1px solid var(--danger-border)",
                        borderRadius: "8px",
                        padding: "14px 16px",
                    }}>
                        <div style={{ fontSize: "11px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                            Toplam Kritik
                        </div>
                        <div style={{ fontSize: "28px", fontWeight: 700, color: "var(--danger-text)", marginTop: "4px", lineHeight: 1 }}>
                            {reorderSuggestions.length}
                        </div>
                        <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "4px" }}>
                            {inScopeManufacturedCount} imalat · {inScopeCommercialCount} ticari
                        </div>
                    </div>

                    <div style={{
                        background: "var(--bg-secondary)",
                        border: "1px solid var(--warning-border)",
                        borderRadius: "8px",
                        padding: "14px 16px",
                    }}>
                        <div style={{ fontSize: "11px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                            En Acil
                        </div>
                        {mostUrgent ? (
                            <>
                                <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginTop: "4px" }}>
                                    {mostUrgent.name}
                                </div>
                                <div style={{ marginTop: "4px" }}>
                                    <span style={{
                                        fontSize: "12px",
                                        fontWeight: 700,
                                        background: daysBg(mostUrgentDays),
                                        color: daysColor(mostUrgentDays),
                                        padding: "2px 8px",
                                        borderRadius: "4px",
                                    }}>
                                        {mostUrgentDays !== null ? `${mostUrgentDays} gün kaldı` : "—"}
                                    </span>
                                </div>
                            </>
                        ) : (
                            <div style={{ fontSize: "13px", color: "var(--text-secondary)", marginTop: "4px" }}>—</div>
                        )}
                    </div>

                    <div style={{
                        background: "var(--bg-secondary)",
                        border: "1px solid var(--border-secondary)",
                        borderRadius: "8px",
                        padding: "14px 16px",
                    }}>
                        <div
                            style={{ fontSize: "11px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}
                            title="Önerilen satın alma sipariş tutarlarının para birimi başına toplamı"
                        >
                            Önerilen Satın Alma Tutarı
                        </div>
                        <div style={{ fontSize: "28px", fontWeight: 700, color: "var(--accent-text)", marginTop: "4px", lineHeight: 1 }}>
                            {formatCurrency(primaryTotal, primaryCurrency)}
                            <span style={{ fontSize: "12px", fontWeight: 500, color: "var(--text-tertiary)", marginLeft: "6px" }}>
                                {primaryCurrency}
                            </span>
                        </div>
                        {!isSingleCurrency && (
                            <div style={{ display: "flex", flexDirection: "column", gap: "2px", marginTop: "6px" }}>
                                {currencyEntries.slice(1).map(([cur, val]) => (
                                    <div key={cur} style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)" }}>
                                        {formatCurrency(val.total, cur)}
                                        <span style={{ fontSize: "11px", fontWeight: 400, color: "var(--text-tertiary)", marginLeft: "6px" }}>
                                            {cur}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                        <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "6px", display: "flex", flexDirection: "column", gap: "2px" }}>
                            <span>{reorderSuggestions.length} ürün · {formatCurrency(primaryAccepted, primaryCurrency)} kabul edildi</span>
                            {!isSingleCurrency && currencyEntries.slice(1).filter(([, v]) => v.accepted > 0).map(([cur, val]) => (
                                <span key={cur}>{formatCurrency(val.accepted, cur)} kabul edildi</span>
                            ))}
                        </div>
                        {missingPriceCount > 0 && (
                            <div
                                style={{ fontSize: "11px", color: "var(--warning-text)", marginTop: "4px" }}
                                title="Maliyet veya satış fiyatı tanımlı olmayan ürünler"
                            >
                                {missingPriceCount} üründe fiyat eksik — toplam tutar bu ürünleri içermez.
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Decision summary — clickable filters */}
            {recMap.size > 0 && (
                <div style={{ marginTop: "12px", fontSize: "12px", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                    {([
                        { key: "accepted" as DecisionFilter, count: acceptedCount, color: "var(--success-text)", label: "kabul" },
                        { key: "rejected" as DecisionFilter, count: rejectedCount, color: "var(--danger-text)", label: "red" },
                        { key: "pending" as DecisionFilter, count: pendingCount, color: "var(--text-tertiary)", label: "beklemede" },
                    ] as const).map((item, i) => (
                        <span key={item.key} style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                            {i > 0 && <span style={{ color: "var(--border-secondary)" }}>·</span>}
                            <button
                                onClick={() => setDecisionFilter(decisionFilter === item.key ? "all" : item.key)}
                                style={{
                                    background: "transparent",
                                    border: "none",
                                    cursor: "pointer",
                                    padding: "0",
                                    color: item.color,
                                    fontWeight: decisionFilter === item.key ? 700 : 600,
                                    fontSize: "12px",
                                    textDecoration: decisionFilter === item.key ? "underline" : "none",
                                }}
                            >
                                {item.count} {item.label}
                            </button>
                        </span>
                    ))}
                    {decisionFilter !== "all" && (
                        <button
                            onClick={() => setDecisionFilter("all")}
                            style={{
                                background: "transparent", border: "none", cursor: "pointer",
                                fontSize: "11px", color: "var(--text-tertiary)", padding: "0 2px",
                            }}
                        >
                            × tümünü göster
                        </button>
                    )}
                </div>
            )}

            {/* Faz 6: Bulk CTA — kabul/düzenlenen öneri varsa tek tıkla siparişe çevir */}
            {acceptedAndEditedCount > 0 && (
                <div style={{
                    marginTop: "16px",
                    padding: "10px 16px",
                    background: "var(--accent-bg)",
                    border: "0.5px solid var(--accent-border)",
                    borderRadius: "8px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "12px",
                    flexWrap: "wrap",
                }}>
                    <span style={{ fontSize: "13px", color: "var(--accent-text)" }}>
                        {acceptedAndEditedCount} kabul/düzenlenen öneri siparişe dönüştürülmeyi bekliyor.
                    </span>
                    <button
                        onClick={handleBulkPo}
                        disabled={isDemo}
                        title={isDemo ? DEMO_DISABLED_TOOLTIP : "Kabul/düzenlenen tüm önerileri siparişe çevir"}
                        aria-label={`${acceptedAndEditedCount} öneriyi siparişe çevir`}
                        style={{
                            padding: "6px 14px",
                            fontSize: "12px",
                            fontWeight: 600,
                            background: isDemo ? "var(--bg-secondary)" : "var(--accent)",
                            color: isDemo ? "var(--text-tertiary)" : "#fff",
                            border: "none",
                            borderRadius: "6px",
                            cursor: isDemo ? "not-allowed" : "pointer",
                            opacity: isDemo ? 0.5 : 1,
                            flexShrink: 0,
                        }}
                    >
                        📋 Siparişe Çevir ({acceptedAndEditedCount})
                    </button>
                </div>
            )}

            {/* Filter tabs + Arama */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "20px", flexWrap: "wrap" }}>
                <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Ürün adı veya SKU..."
                    aria-label="Ürün adı veya SKU'ya göre ara"
                    style={{
                        fontSize: "12px",
                        padding: "6px 12px",
                        border: "0.5px solid var(--border-secondary)",
                        borderRadius: "6px",
                        background: "var(--bg-primary)",
                        color: "var(--text-primary)",
                        width: "200px",
                    }}
                />
                <div style={{ display: "flex", gap: "8px" }}>
                {tabs.map(tab => {
                    const active = filter === tab.key;
                    return (
                        <button
                            key={tab.key}
                            onClick={() => setFilter(tab.key)}
                            style={{
                                padding: "6px 14px",
                                fontSize: "13px",
                                fontWeight: 500,
                                border: "1px solid",
                                borderColor: active ? "var(--accent-border)" : "var(--border-secondary)",
                                borderRadius: "6px",
                                background: active ? "var(--accent-bg)" : "transparent",
                                color: active ? "var(--accent-text)" : "var(--text-secondary)",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                            }}
                        >
                            {tab.label}
                            <span style={{
                                fontSize: "11px",
                                background: active ? "var(--accent)" : "var(--bg-tertiary)",
                                color: active ? "#fff" : "var(--text-tertiary)",
                                padding: "1px 6px",
                                borderRadius: "8px",
                            }}>
                                {tab.count}
                            </span>
                        </button>
                    );
                })}
                </div>
            </div>

            {/* Segment banner */}
            {filter !== "all" && (
                <SegmentBanner
                    filter={filter}
                    count={filter === "manufactured" ? manufacturedItems.length : commercialItems.length}
                />
            )}

            {/* Table or empty state */}
            {sorted.length === 0 ? (
                <div style={{
                    marginTop: "48px",
                    textAlign: "center",
                    color: "var(--success-text)",
                    fontSize: "14px",
                }}>
                    <div style={{ fontSize: "32px", marginBottom: "8px" }}>&#10003;</div>
                    Tüm stoklar minimum seviyenin üstünde.
                </div>
            ) : isMobile ? (
                /* Mobile card layout */
                <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
                    {sorted.map(p => {
                        // Audit 5. tur Fix 2: stok = promisable, backend uyumlu
                        const { stock, urgency, daysLeft } = computeRowStock(p);
                        const computed = computeSuggestion(p);
                        const recEntry = recMap.get(p.id);
                        // Audit 11. tur Fix 2: accepted/rejected → frozen, edited → editedQty
                        const suggestQty = selectDisplaySuggestQty(recEntry, computed.suggestQty);
                        const { formula, leadTimeDemand } = computed;
                        const isRejected = recEntry?.status === "rejected";
                        return (
                            <div key={p.id} style={{
                                border: "1px solid var(--border-secondary)",
                                borderRadius: "8px",
                                padding: "14px 16px",
                                background: urgency >= 80 ? "var(--danger-bg-subtle)" : "var(--bg-secondary)",
                                opacity: isRejected ? 0.6 : 1,
                            }}>
                                {/* Type + Name row */}
                                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "8px" }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <span style={{
                                            display: "inline-block",
                                            padding: "1px 7px",
                                            borderRadius: "4px",
                                            fontSize: "10px",
                                            fontWeight: 600,
                                            background: "var(--accent-bg)",
                                            color: "var(--accent-text)",
                                            marginBottom: "4px",
                                        }}>
                                            {p.productType === "manufactured" ? "İmalat" : "Ticari"}
                                        </span>
                                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                            <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.3 }}>
                                                {p.name}
                                            </div>
                                            {aiMap.get(p.id) && !aiLoading && (
                                                <span style={{
                                                    fontSize: "9px", fontWeight: 700,
                                                    color: "var(--accent-text)",
                                                    background: "var(--accent-bg)",
                                                    border: "0.5px solid var(--accent-border)",
                                                    padding: "1px 5px", borderRadius: "3px",
                                                }}>✦ AI</span>
                                            )}
                                        </div>
                                        <div style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "monospace", marginTop: "2px" }}>
                                            {p.sku}
                                        </div>
                                        <WhyBadge daysLeft={daysLeft} urgency={urgency} leadTimeDays={p.leadTimeDays} />
                                        <AiSignalButton
                                            enrichment={aiMap.get(p.id)}
                                            loading={aiLoading}
                                            onClick={() => setAiDrawerProductId(p.id)}
                                        />
                                    </div>
                                </div>

                                {/* Stock details */}
                                <div style={{ display: "flex", gap: "16px", marginTop: "10px", flexWrap: "wrap" }}>
                                    <div style={{ fontSize: "12px", color: "var(--text-secondary)" }} title="Satılabilir stok = Mevcut − teklif verilen">
                                        <span style={{ color: "var(--text-tertiary)" }}>Mevcut:</span>{" "}
                                        <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{stock.toLocaleString("tr-TR")}</span>
                                    </div>
                                    <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                                        <span style={{ color: "var(--text-tertiary)" }}>Min:</span>{" "}
                                        <span style={{ fontWeight: 600 }}>{p.minStockLevel.toLocaleString("tr-TR")}</span>
                                    </div>
                                    <div style={{ fontSize: "12px" }} title="Bu üründe açık (onaylı + sevk edilmemiş) sipariş sayısı">
                                        <span style={{ color: "var(--text-tertiary)" }}>Açık Sipariş:</span>{" "}
                                        <span style={{
                                            fontWeight: 500,
                                            color: (openOrderCounts[p.id] ?? 0) > 0 ? "var(--accent-text)" : "var(--text-tertiary)",
                                        }}>
                                            {openOrderCounts[p.id] ?? 0}
                                        </span>
                                    </div>
                                    {p.leadTimeDays != null && (
                                        <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                                            <span style={{ color: "var(--text-tertiary)" }}>Tedarik:</span>{" "}
                                            <span style={{ fontWeight: 600 }}>{p.leadTimeDays} gün</span>
                                        </div>
                                    )}
                                </div>

                                {/* Recommended qty */}
                                <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "6px" }}>
                                    <span style={{ color: "var(--text-tertiary)" }}>Önerilen:</span>{" "}
                                    <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                                        {suggestQty.toLocaleString("tr-TR")} {p.unit}
                                    </span>
                                    <FormulaLabel p={p} formula={formula} leadTimeDemand={leadTimeDemand} />
                                </div>

                                {/* Action — inline RecActionCell (G5 mobile) */}
                                <div style={{ marginTop: "12px" }}>
                                    <RecActionCell
                                        productId={p.id}
                                        recEntry={recEntry}
                                        suggestQty={suggestQty}
                                        unit={p.unit}
                                        onAccept={handleAccept}
                                        onReject={handleReject}
                                        onEdit={handleEdit}
                                        onUndo={handleUndo}
                                        onOpenPoModal={handleOpenPoModal}
                                        isDemo={isDemo}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                /* Desktop table */
                <div style={{
                    marginTop: "16px",
                    border: "1px solid var(--border-secondary)",
                    borderRadius: "8px",
                    overflow: "hidden",
                }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                        <thead>
                            <tr style={{ background: "var(--bg-secondary)" }}>
                                {/* Sprint C G3: "Açık" → "Stok Açığı" + tooltip; mevcut deficit
                                    (min - available_now) anlamı netleştirildi (açık sipariş ile
                                    karıştırılmasın). */}
                                {[
                                    { label: "Tür" },
                                    { label: "Ürün Adı" },
                                    { label: "SKU" },
                                    { label: "Depo" },
                                    { label: "Stok" },
                                    { label: "Açık Sipariş", tooltip: "Bu üründe açık (onaylı + sevk edilmemiş) sipariş sayısı" },
                                    { label: "Önerilen · Tükenme" },
                                    { label: "Karar" },
                                ].map(({ label, tooltip }) => (
                                    <th
                                        key={label}
                                        title={tooltip}
                                        style={{
                                            padding: "10px 12px",
                                            textAlign: "left",
                                            fontWeight: 500,
                                            color: "var(--text-tertiary)",
                                            fontSize: "11px",
                                            textTransform: "uppercase",
                                            letterSpacing: "0.04em",
                                            borderBottom: "1px solid var(--border-secondary)",
                                            whiteSpace: "nowrap",
                                            cursor: tooltip ? "help" : undefined,
                                        }}
                                    >
                                        {label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {sorted.map((p, idx) => {
                                // Audit 5. tur Fix 2: tüm satır hesapları promisable üzerinden
                                const { stock, urgency, daysLeft } = computeRowStock(p);
                                const stockPct = p.minStockLevel > 0
                                    ? Math.min(100, Math.round((stock / p.minStockLevel) * 100))
                                    : 100;
                                const computed = computeSuggestion(p);
                                const recEntry = recMap.get(p.id);
                                // Audit 11. tur Fix 2: accepted/rejected → frozen, edited → editedQty
                                const suggestQty = selectDisplaySuggestQty(recEntry, computed.suggestQty);
                                const { formula, leadTimeDemand } = computed;
                                const isRejected = recEntry?.status === "rejected";
                                return (
                                    <tr key={p.id} style={{
                                        borderBottom: idx < sorted.length - 1 ? "1px solid var(--border-tertiary)" : "none",
                                        background: urgency >= 80 ? "var(--danger-bg-subtle)" : "transparent",
                                        opacity: isRejected ? 0.6 : 1,
                                    }}>
                                        {/* Tür */}
                                        <td style={{ padding: "10px 12px" }}>
                                            <span style={{
                                                display: "inline-block",
                                                padding: "2px 8px",
                                                borderRadius: "4px",
                                                fontSize: "11px",
                                                fontWeight: 600,
                                                background: "var(--accent-bg)",
                                                color: "var(--accent-text)",
                                            }}>
                                                {p.productType === "manufactured" ? "İmalat" : "Ticari"}
                                            </span>
                                        </td>
                                        {/* Ürün Adı + Why */}
                                        <td style={{ padding: "10px 12px", maxWidth: "200px" }}>
                                            <div style={{ color: "var(--text-primary)", fontWeight: 500 }}>{p.name}</div>
                                            <WhyBadge daysLeft={daysLeft} urgency={urgency} leadTimeDays={p.leadTimeDays} />
                                            <AiSignalButton
                                                enrichment={aiMap.get(p.id)}
                                                loading={aiLoading}
                                                onClick={() => setAiDrawerProductId(p.id)}
                                            />
                                        </td>
                                        {/* SKU */}
                                        <td style={{ padding: "10px 12px", fontFamily: "monospace", color: "var(--text-secondary)", fontSize: "12px" }}>
                                            {p.sku}
                                        </td>
                                        {/* Depo */}
                                        <td style={{ padding: "10px 12px", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                                            {p.warehouse}
                                        </td>
                                        {/* Stok (satılabilir = mevcut − teklif verilen) */}
                                        <td style={{ padding: "10px 12px" }} title="Satılabilir stok = Mevcut − teklif verilen miktar">
                                            <div style={{ fontSize: "13px", color: "var(--text-primary)", fontWeight: 500 }}>
                                                {stock.toLocaleString("tr-TR")}
                                            </div>
                                            <div style={{
                                                width: "72px",
                                                height: "4px",
                                                background: "var(--bg-tertiary)",
                                                borderRadius: "2px",
                                                marginTop: "4px",
                                                overflow: "hidden",
                                            }}>
                                                <div style={{
                                                    width: `${stockPct}%`,
                                                    height: "100%",
                                                    background: "var(--warning)",
                                                    borderRadius: "2px",
                                                }} />
                                            </div>
                                            <div style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "2px" }}>
                                                min {p.minStockLevel.toLocaleString("tr-TR")}
                                            </div>
                                        </td>
                                        {/* Açık Sipariş */}
                                        <td style={{
                                            padding: "10px 12px",
                                            fontWeight: 500,
                                            fontSize: "14px",
                                            color: (openOrderCounts[p.id] ?? 0) > 0 ? "var(--accent-text)" : "var(--text-tertiary)",
                                        }}>
                                            {openOrderCounts[p.id] ?? 0}
                                        </td>
                                        {/* Önerilen + Tükenme */}
                                        <td style={{ padding: "10px 12px" }}>
                                            <div style={{ fontSize: "13px", color: "var(--text-primary)", fontWeight: 500 }}>
                                                {suggestQty.toLocaleString("tr-TR")} {p.unit}
                                            </div>
                                            <FormulaLabel p={p} formula={formula} leadTimeDemand={leadTimeDemand} />
                                            {daysLeft !== null ? (
                                                <span style={{
                                                    display: "inline-block",
                                                    marginTop: "4px",
                                                    fontSize: "11px",
                                                    fontWeight: 700,
                                                    background: daysBg(daysLeft),
                                                    color: daysColor(daysLeft),
                                                    padding: "1px 7px",
                                                    borderRadius: "4px",
                                                }}>
                                                    {daysLeft} gün
                                                </span>
                                            ) : (
                                                <span style={{
                                                    display: "inline-block",
                                                    marginTop: "4px",
                                                    fontSize: "10px",
                                                    color: "var(--text-tertiary)",
                                                    fontStyle: "italic",
                                                }}>
                                                    Kullanım verisi yok
                                                </span>
                                            )}
                                            {p.stockoutDate && (
                                                <div style={{ marginTop: "3px", fontSize: "10px", color: "var(--text-tertiary)" }}>
                                                    Tükeniyor: {new Date(p.stockoutDate).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}
                                                </div>
                                            )}
                                            {p.orderDeadline && (() => {
                                                const dlDays = dateDaysFromToday(p.orderDeadline);
                                                const dlLabel = new Date(p.orderDeadline).toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
                                                return (
                                                    <div style={{ marginTop: "2px", fontSize: "10px", fontWeight: 600, color: daysColor(dlDays) }}>
                                                        {dlDays < 0
                                                            ? `Sipariş: Geçti (${dlLabel})`
                                                            : `Sipariş: ${dlLabel}'e kadar`
                                                        }
                                                    </div>
                                                );
                                            })()}
                                        </td>
                                        {/* Karar — inline chip-buton seti (G5) */}
                                        <td style={{ padding: "10px 12px" }}>
                                            <RecActionCell
                                                productId={p.id}
                                                recEntry={recEntry}
                                                suggestQty={suggestQty}
                                                unit={p.unit}
                                                onAccept={handleAccept}
                                                onReject={handleReject}
                                                onEdit={handleEdit}
                                                onUndo={handleUndo}
                                                onOpenPoModal={handleOpenPoModal}
                                                isDemo={isDemo}
                                            />
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* AI Detail Drawer — AI analizi + karar aksiyonları */}
            <AIDetailDrawer
                open={aiDrawerProductId !== null}
                onClose={() => setAiDrawerProductId(null)}
                title="Satın Alma Analizi"
            >
                {aiDrawerProduct ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                        {/* Ürün başlığı */}
                        <div>
                            <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
                                {aiDrawerProduct.name}
                            </div>
                            <div style={{ fontSize: "12px", color: "var(--text-tertiary)", fontFamily: "monospace", marginTop: "2px" }}>
                                {aiDrawerProduct.sku}
                            </div>
                        </div>

                        {/* Stok Durumu */}
                        <div style={{ background: "var(--bg-secondary)", border: "0.5px solid var(--border-secondary)", borderRadius: "8px", padding: "12px 14px" }}>
                            <div style={{ fontSize: "10px", fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "10px" }}>
                                Stok Durumu
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "10px" }}>
                                {(() => {
                                    // Audit 6. tur Fix 3: drawer Stok Durumu da promisable bazlı
                                    const drawerStock = pickStock(aiDrawerProduct);
                                    const deficit = Math.max(0, aiDrawerProduct.minStockLevel - drawerStock);
                                    return [
                                        { label: "Mevcut", value: `${drawerStock.toLocaleString("tr-TR")} ${aiDrawerProduct.unit}`, color: "var(--danger-text)" },
                                        { label: "Minimum", value: `${aiDrawerProduct.minStockLevel.toLocaleString("tr-TR")} ${aiDrawerProduct.unit}`, color: "var(--text-secondary)" },
                                        { label: "Açık", value: deficit > 0 ? `-${deficit.toLocaleString("tr-TR")} ${aiDrawerProduct.unit}` : `0 ${aiDrawerProduct.unit}`, color: deficit > 0 ? "var(--danger-text)" : "var(--text-secondary)" },
                                    ];
                                })().map(item => (
                                    <div key={item.label}>
                                        <div style={{ fontSize: "10px", color: "var(--text-tertiary)", marginBottom: "2px" }}>{item.label}</div>
                                        <div style={{ fontSize: "12px", fontWeight: 600, color: item.color }}>{item.value}</div>
                                    </div>
                                ))}
                            </div>
                            <div style={{ height: "4px", background: "var(--bg-tertiary)", borderRadius: "2px", overflow: "hidden", marginBottom: "6px" }}>
                                <div style={{
                                    width: `${aiDrawerProduct.minStockLevel > 0 ? Math.min(100, Math.round((pickStock(aiDrawerProduct) / aiDrawerProduct.minStockLevel) * 100)) : 0}%`,
                                    height: "100%",
                                    background: "var(--danger)",
                                    borderRadius: "2px",
                                }} />
                            </div>
                            {aiDrawerCoverageDays !== null && (
                                <span style={{
                                    display: "inline-block",
                                    fontSize: "11px", fontWeight: 700,
                                    background: daysBg(aiDrawerCoverageDays),
                                    color: daysColor(aiDrawerCoverageDays),
                                    padding: "2px 8px", borderRadius: "4px",
                                }}>
                                    ~{aiDrawerCoverageDays} gün kaldı
                                </span>
                            )}
                        </div>

                        {/* Sipariş Planı */}
                        {aiDrawerSuggestion && (
                            <div style={{ background: "var(--bg-secondary)", border: "0.5px solid var(--border-secondary)", borderRadius: "8px", padding: "12px 14px" }}>
                                <div style={{ fontSize: "10px", fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "10px" }}>
                                    Sipariş Planı
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                                        <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>Önerilen miktar</span>
                                        <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)" }}>
                                            {aiDrawerSuggestQty.toLocaleString("tr-TR")} {aiDrawerProduct.unit}
                                        </span>
                                    </div>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                                        <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>Formül</span>
                                        <span style={{ fontSize: "11px", fontFamily: "monospace", color: "var(--accent-text)" }}>
                                            {aiDrawerSuggestion.formula === "lead_time" && aiDrawerSuggestion.leadTimeDemand !== null && aiDrawerProduct.leadTimeDays && aiDrawerProduct.dailyUsage
                                                ? `${aiDrawerProduct.leadTimeDays}g × ${aiDrawerProduct.dailyUsage} + ${aiDrawerProduct.minStockLevel} emniyet`
                                                : "2 × min (tedarik süresi bilinmiyor)"}
                                        </span>
                                    </div>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                                        <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>Minimum sipariş</span>
                                        <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                                            {aiDrawerSuggestion.moq.toLocaleString("tr-TR")} {aiDrawerProduct.unit}
                                        </span>
                                    </div>
                                    {aiDrawerProduct.preferredVendor && (
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                                            <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>Tedarikçi</span>
                                            <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-primary)" }}>{aiDrawerProduct.preferredVendor}</span>
                                        </div>
                                    )}
                                    {aiDrawerProduct.leadTimeDays != null && (
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                                            <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>Tedarik süresi</span>
                                            <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--warning-text)" }}>{aiDrawerProduct.leadTimeDays} gün</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* AI Değerlendirmesi */}
                        {aiDrawerEnrichment ? (
                            <div>
                                <div style={{ fontSize: "10px", fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "8px", display: "flex", alignItems: "center", gap: "6px" }}>
                                    <span style={{ background: "var(--accent-bg)", color: "var(--accent-text)", padding: "1px 5px", borderRadius: "3px", fontSize: "9px" }}>✦ AI</span>
                                    Değerlendirme
                                </div>
                                {(() => {
                                    const urgency = aiDrawerEnrichment.aiUrgencyLevel ?? "moderate";
                                    const urgencyLabel = urgency === "critical" ? "Kritik" : urgency === "high" ? "Yüksek" : "Orta";
                                    const urgencyBg = urgency === "critical" ? "var(--danger-bg)" : urgency === "high" ? "var(--warning-bg)" : "var(--accent-bg)";
                                    const urgencyText = urgency === "critical" ? "var(--danger-text)" : urgency === "high" ? "var(--warning-text)" : "var(--accent-text)";
                                    return (
                                        <>
                                            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
                                                <span style={{ fontSize: "12px", fontWeight: 600, padding: "3px 10px", borderRadius: "4px", background: urgencyBg, color: urgencyText }}>
                                                    {urgencyLabel} Aciliyet
                                                </span>
                                            </div>
                                            {aiDrawerEnrichment.aiWhyNow && (
                                                <div style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: "8px" }}>
                                                    {aiDrawerEnrichment.aiWhyNow}
                                                </div>
                                            )}
                                            {aiDrawerEnrichment.aiQuantityRationale && (
                                                <div style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.6, padding: "10px 12px", background: "var(--bg-secondary)", borderRadius: "6px", border: "0.5px solid var(--border-tertiary)" }}>
                                                    <span style={{ fontSize: "10px", color: "var(--text-tertiary)", display: "block", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.04em" }}>Miktar Gerekçesi</span>
                                                    {aiDrawerEnrichment.aiQuantityRationale}
                                                </div>
                                            )}
                                        </>
                                    );
                                })()}
                            </div>
                        ) : (
                            <div style={{ fontSize: "12px", color: "var(--text-tertiary)", padding: "10px 0" }}>
                                Şu an aktif AI değerlendirmesi yok — deterministik mod
                            </div>
                        )}

                        {aiData?.generatedAt && (
                            <div style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>
                                Analiz: {new Date(aiData.generatedAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
                            </div>
                        )}

                        {/* Karar bölümü */}
                        {aiDrawerRecEntry && (
                            <div style={{ borderTop: "0.5px solid var(--border-tertiary)", paddingTop: "16px" }}>
                                <div style={{ fontSize: "10px", fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "10px" }}>
                                    Karar
                                </div>
                                <RecActionCell
                                    productId={aiDrawerProduct.id}
                                    recEntry={aiDrawerRecEntry}
                                    suggestQty={aiDrawerSuggestQty}
                                    unit={aiDrawerProduct.unit}
                                    onAccept={handleAccept}
                                    onReject={handleReject}
                                    onEdit={handleEdit}
                                    onUndo={handleUndo}
                                    onOpenPoModal={handleOpenPoModal}
                                    isDemo={isDemo}
                                />
                            </div>
                        )}
                    </div>
                ) : (
                    <div style={{ fontSize: "13px", color: "var(--text-tertiary)", textAlign: "center", paddingTop: "32px" }}>
                        Şu an aktif AI önerisi yok
                    </div>
                )}
            </AIDetailDrawer>

            {/* Faz 6: PO oluşturma modalı — tek satır + bulk akışı */}
            {poModalState.open && (
                <PurchaseOrderModal
                    open
                    onClose={() => setPoModalState(s => ({ ...s, open: false }))}
                    mode={poModalState.mode}
                    initialItems={poModalState.items}
                    vendors={vendors}
                    lockedVendorId={poModalState.lockedVendorId}
                    onSuccess={(poId, poNumber) => {
                        toast({
                            type: "success",
                            message: `Sipariş oluşturuldu: ${poNumber}`,
                            action: { label: "Siparişe git", href: `/dashboard/purchase/orders/${poId}` },
                        });
                        setPoModalState(s => ({ ...s, open: false }));
                        void loadAiData();
                        advanceBulkQueue();
                    }}
                />
            )}
        </div>
    );
}
