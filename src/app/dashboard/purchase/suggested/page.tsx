"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useData } from "@/lib/data-context";
import { computeCoverageDays, computeTargetStock, daysColor, daysBg, dateDaysFromToday } from "@/lib/stock-utils";
import type { Product } from "@/lib/mock-data";
import AIDetailDrawer from "@/components/ai/AIDetailDrawer";
import { useToast } from "@/components/ui/Toast";
import { useIsDemo, DEMO_BLOCK_TOAST } from "@/lib/demo-utils";
import { formatCurrency } from "@/lib/utils";

interface AiEnrichmentItem {
    productId: string;
    aiWhyNow: string | null;
    aiQuantityRationale: string | null;
    aiUrgencyLevel: "critical" | "high" | "moderate" | null;
    aiConfidence: number | null;
}

interface RecEntry {
    id: string;
    status: string;
    decidedAt?: string | null;
}

/** Compact AI signal button — click to open drawer */
function AiSignalButton({ enrichment, loading, onClick }: {
    enrichment: AiEnrichmentItem | undefined;
    loading: boolean;
    onClick: () => void;
}) {
    if (loading) {
        return (
            <div style={{ marginTop: "4px", fontSize: "10px", color: "var(--text-tertiary)", fontStyle: "italic" }}>
                AI...
            </div>
        );
    }
    if (!enrichment) return null;

    const urgency = enrichment.aiUrgencyLevel ?? "moderate";
    const urgencyLabel = urgency === "critical" ? "Kritik" : urgency === "high" ? "Yüksek" : "Orta";
    const urgencyBg = urgency === "critical" ? "var(--danger-bg)" : urgency === "high" ? "var(--warning-bg)" : "var(--accent-bg)";
    const urgencyText = urgency === "critical" ? "var(--danger-text)" : urgency === "high" ? "var(--warning-text)" : "var(--accent-text)";
    const urgencyBorder = urgency === "critical" ? "var(--danger-border)" : urgency === "high" ? "var(--warning-border)" : "var(--accent-border)";
    return (
        <button
            onClick={onClick}
            aria-label="AI analizi detaylarını gör"
            style={{
                marginTop: "4px",
                background: urgencyBg,
                color: urgencyText,
                border: `0.5px solid ${urgencyBorder}`,
                borderRadius: "4px",
                padding: "2px 7px",
                fontSize: "10px",
                fontWeight: 600,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
            }}
        >
            <span>✦ AI</span>
            <span>{urgencyLabel}</span>
            <span style={{ opacity: 0.6 }}>→</span>
        </button>
    );
}

type FilterType = "all" | "raw_material" | "manufactured" | "commercial";

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
        <div style={{ display: "flex", flexDirection: "column", gap: "3px", marginTop: "4px" }}>
            {lines.map((l, i) => (
                <span key={i} style={{
                    display: "inline-block",
                    fontSize: "10px",
                    fontWeight: 500,
                    background: l.bg,
                    color: l.color,
                    padding: "1px 6px",
                    borderRadius: "3px",
                    width: "fit-content",
                }}>
                    {l.text}
                </span>
            ))}
        </div>
    );
}

function SegmentBanner({ filter, rawCount, finishedCount, rawItems }: {
    filter: FilterType;
    rawCount: number;
    finishedCount: number;
    rawItems: { reorderQty?: number; price?: number }[];
}) {
    if (filter === "all") return null;

    if (filter === "raw_material") {
        const totalOrderValue = rawItems.reduce((sum, p) => {
            const qty = p.reorderQty ?? 0;
            const price = p.price ?? 0;
            return sum + qty * price;
        }, 0);
        return (
            <div style={{
                marginTop: "12px",
                padding: "12px 16px",
                background: "var(--warning-bg)",
                border: "1px solid var(--warning-border)",
                borderRadius: "8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
                flexWrap: "wrap",
            }}>
                <div>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--warning-text)" }}>
                        Tedarikçi ile sipariş verilmesi gereken {rawCount} hammadde
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--text-tertiary)", marginTop: "2px" }}>
                        Minimum stok seviyesinin altında — tedarik süreci başlatılmalı
                    </div>
                </div>
                {totalOrderValue > 0 && (
                    <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--warning-text)", whiteSpace: "nowrap" }}>
                        Toplam sipariş: {totalOrderValue.toLocaleString("tr-TR", { minimumFractionDigits: 0 })} ₺
                    </div>
                )}
            </div>
        );
    }

    return (
        <div style={{
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
        }}>
            <div>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--accent-text)" }}>
                    Üretim emri bekleyen {finishedCount} ürün
                </div>
                <div style={{ fontSize: "12px", color: "var(--text-tertiary)", marginTop: "2px" }}>
                    Üretim kapasitesine göre önceliklendirin — kritik olanlar önce planlanmalı
                </div>
            </div>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--accent-text)", whiteSpace: "nowrap" }}>
                {finishedCount} üretim planı bekliyor
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

/** Compute suggestion for a single product row */
function computeSuggestion(p: Product) {
    const { target, formula, leadTimeDemand } = computeTargetStock(
        p.minStockLevel, p.dailyUsage ?? null, p.leadTimeDays ?? null
    );
    const moq = Math.max(1, p.reorderQty ?? p.minStockLevel);
    const needed = Math.max(0, target - p.available_now);
    const suggestQty = needed === 0 ? moq : Math.max(moq, Math.ceil(needed / moq) * moq);
    return { suggestQty, target, formula, leadTimeDemand, moq };
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
    isDemo,
}: {
    productId: string;
    recEntry: (RecEntry & { editedQty?: number }) | undefined;
    suggestQty: number;
    unit: string;
    onAccept: (productId: string) => void;
    onReject: (productId: string, feedbackNote?: string) => void;
    onEdit: (productId: string, qty: number, unit: string) => void;
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

    if (status === "accepted") {
        return (
            <span style={{
                fontSize: "11px", fontWeight: 600, padding: "3px 8px", borderRadius: "4px",
                background: "var(--success-bg)", color: "var(--success-text)",
                border: "0.5px solid var(--success-border)",
            }}>
                ✓ Kabul Edildi{decidedTime && <span style={{ fontWeight: 400, opacity: 0.7, marginLeft: "4px" }}>{decidedTime}</span>}
            </span>
        );
    }

    if (status === "edited") {
        const editedQty = recEntry?.editedQty ?? null;
        return (
            <span style={{
                fontSize: "11px", fontWeight: 600, padding: "3px 8px", borderRadius: "4px",
                background: "var(--accent-bg)", color: "var(--accent-text)",
                border: "0.5px solid var(--accent-border)",
            }}>
                ✎ Düzenlendi{editedQty != null ? `: ${editedQty} ${unit}` : ""}{decidedTime && <span style={{ fontWeight: 400, opacity: 0.7, marginLeft: "4px" }}>{decidedTime}</span>}
            </span>
        );
    }

    if (status === "rejected") {
        return (
            <span style={{
                fontSize: "11px", fontWeight: 600, padding: "3px 8px", borderRadius: "4px",
                color: "var(--danger-text)",
            }}>
                ✕ Reddedildi{decidedTime && <span style={{ fontWeight: 400, opacity: 0.7, marginLeft: "4px" }}>{decidedTime}</span>}
            </span>
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
                <button
                    onClick={() => { onEdit(productId, editQty, unit); setEditMode(false); }}
                    style={{
                        fontSize: "11px", fontWeight: 600, padding: "3px 8px", borderRadius: "4px",
                        background: "var(--accent-bg)", color: "var(--accent-text)",
                        border: "0.5px solid var(--accent-border)", cursor: "pointer",
                    }}
                >
                    Kaydet
                </button>
                <button
                    onClick={() => setEditMode(false)}
                    style={{
                        fontSize: "11px", padding: "3px 8px", borderRadius: "4px",
                        background: "transparent", color: "var(--text-tertiary)",
                        border: "0.5px solid var(--border-secondary)", cursor: "pointer",
                    }}
                >
                    İptal
                </button>
            </div>
        );
    }

    if (rejectMode) {
        return (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <input
                    type="text"
                    value={rejectNote}
                    placeholder="Ret sebebi (isteğe bağlı)"
                    onChange={e => setRejectNote(e.target.value)}
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
                    <button
                        onClick={() => { onReject(productId, rejectNote || undefined); setRejectMode(false); setRejectNote(""); }}
                        style={{
                            fontSize: "11px", fontWeight: 600, padding: "3px 8px", borderRadius: "4px",
                            background: "transparent", color: "var(--danger-text)",
                            border: "0.5px solid var(--danger)", cursor: "pointer",
                        }}
                    >
                        Reddet
                    </button>
                    <button
                        onClick={() => { setRejectMode(false); setRejectNote(""); }}
                        style={{
                            fontSize: "11px", padding: "3px 8px", borderRadius: "4px",
                            background: "transparent", color: "var(--text-tertiary)",
                            border: "0.5px solid var(--border-secondary)", cursor: "pointer",
                        }}
                    >
                        İptal
                    </button>
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
            <button
                onClick={() => onAccept(productId)}
                disabled={isDemo}
                title={isDemo ? "Demo modunda devre dışı — değişiklik yapmak için giriş yapın." : undefined}
                style={{
                    fontSize: "11px", fontWeight: 600, padding: "3px 8px", borderRadius: "4px",
                    background: "var(--success-bg)", color: "var(--success-text)",
                    border: "0.5px solid var(--success-border)", cursor: isDemo ? "not-allowed" : "pointer",
                    opacity: isDemo ? 0.5 : 1,
                }}
            >
                Kabul Et
            </button>
            <button
                onClick={() => { setEditQty(suggestQty); setEditMode(true); }}
                disabled={isDemo}
                title={isDemo ? "Demo modunda devre dışı — değişiklik yapmak için giriş yapın." : undefined}
                style={{
                    fontSize: "11px", fontWeight: 600, padding: "3px 8px", borderRadius: "4px",
                    background: "var(--accent-bg)", color: "var(--accent-text)",
                    border: "0.5px solid var(--accent-border)", cursor: isDemo ? "not-allowed" : "pointer",
                    opacity: isDemo ? 0.5 : 1,
                }}
            >
                Düzenle
            </button>
            <button
                onClick={() => { setRejectNote(""); setRejectMode(true); }}
                disabled={isDemo}
                title={isDemo ? "Demo modunda devre dışı — değişiklik yapmak için giriş yapın." : undefined}
                style={{
                    fontSize: "11px", padding: "3px 8px", borderRadius: "4px",
                    background: "transparent", color: "var(--text-tertiary)",
                    border: "0.5px solid var(--border-secondary)", cursor: isDemo ? "not-allowed" : "pointer",
                    opacity: isDemo ? 0.5 : 1,
                }}
            >
                Reddet
            </button>
        </div>
    );
}

export default function PurchaseSuggestedPage() {
    const { reorderSuggestions, refetchAll } = useData();
    const [filter, setFilter] = useState<FilterType>("all");
    const [decisionFilter, setDecisionFilter] = useState<DecisionFilter>("all");
    const [search, setSearch] = useState("");
    const isMobile = useIsMobile();
    const { toast } = useToast();
    const isDemo = useIsDemo();
    const [aiData, setAiData] = useState<{
        ai_available: boolean;
        items: AiEnrichmentItem[];
        recommendations?: Array<{ productId: string; recommendationId: string | null; status: string; decidedAt?: string | null }>;
        generatedAt?: string;
    } | null>(null);
    const [aiLoading, setAiLoading] = useState(false);
    const [aiError, setAiError] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [aiDrawerProductId, setAiDrawerProductId] = useState<string | null>(null);

    // recMap: productId → { id, status, editedQty? }
    const [recMap, setRecMap] = useState<Map<string, RecEntry & { editedQty?: number }>>(new Map());

    const loadAiData = useCallback(async (signal?: AbortSignal) => {
        setAiLoading(true);
        setAiError(false);
        try {
            const res = await fetch("/api/ai/purchase-copilot", {
                method: "POST",
                signal,
            });
            const data = res.ok ? await res.json() : null;
            if (data) {
                setAiData(data);
                if (data.recommendations) {
                    const newMap = new Map<string, RecEntry & { editedQty?: number }>();
                    for (const r of data.recommendations) {
                        if (r.recommendationId) {
                            const editedQty = r.status === "edited"
                                ? (r.editedMetadata?.suggestQty as number | undefined)
                                : undefined;
                            newMap.set(r.productId, { id: r.recommendationId, status: r.status, decidedAt: r.decidedAt ?? null, ...(editedQty != null && { editedQty }) });
                        }
                    }
                    setRecMap(newMap);
                }
            }
        } catch (e) {
            if (!(e instanceof Error && e.name === "AbortError")) {
                setAiError(true);
            }
        } finally {
            setAiLoading(false);
        }
    }, []);

    useEffect(() => {
        if (reorderSuggestions.length === 0) return;
        const controller = new AbortController();
        loadAiData(controller.signal);
        return () => controller.abort();
    }, [reorderSuggestions.length, loadAiData]);

    const handleRefresh = async () => {
        if (refreshing || aiLoading) return;
        setRefreshing(true);
        try {
            await refetchAll();
            await loadAiData();
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
            } else {
                setRecMap(m => new Map(m).set(productId, prev));
                toast({ type: "error", message: "Kaydedilemedi — tekrar deneyin" });
            }
        } catch {
            setRecMap(m => new Map(m).set(productId, prev));
            toast({ type: "error", message: "Kaydedilemedi — tekrar deneyin" });
        }
    };

    const rawItems = useMemo(() => reorderSuggestions.filter(p => p.productType === "raw_material"), [reorderSuggestions]);
    const manufacturedItems = useMemo(() => reorderSuggestions.filter(p => p.productType === "manufactured"), [reorderSuggestions]);
    const commercialItems = useMemo(() => reorderSuggestions.filter(p => p.productType === "commercial"), [reorderSuggestions]);

    const sorted = useMemo(() => {
        const purchaseSearched = search.trim().toLowerCase();
        const base = (filter === "all" ? reorderSuggestions : reorderSuggestions.filter(p => p.productType === filter))
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
            const daysA = computeCoverageDays(a.available_now, a.dailyUsage);
            const daysB = computeCoverageDays(b.available_now, b.dailyUsage);
            if (daysA !== null && daysB !== null) return daysA - daysB;
            if (daysA !== null) return -1;
            if (daysB !== null) return 1;
            const urgA = a.minStockLevel > 0 ? 1 - a.available_now / a.minStockLevel : 1;
            const urgB = b.minStockLevel > 0 ? 1 - b.available_now / b.minStockLevel : 1;
            return urgB - urgA;
        }).filter(p => {
            if (decisionFilter === "all") return true;
            const st = recMap.get(p.id)?.status;
            if (decisionFilter === "accepted") return st === "accepted";
            if (decisionFilter === "rejected") return st === "rejected";
            return !st || (st !== "accepted" && st !== "rejected");
        });
    }, [reorderSuggestions, search, filter, decisionFilter, recMap]);

    const { totalOrderCost, acceptedOrderCost } = reorderSuggestions.reduce(
        (acc, p) => {
            const rec = recMap.get(p.id);
            const isEdited = rec?.status === "edited";
            const qty = isEdited && rec?.editedQty != null ? rec.editedQty : computeSuggestion(p).suggestQty;
            const lineCost = qty * (p.costPrice ?? p.price ?? 0);
            return {
                totalOrderCost: acc.totalOrderCost + lineCost,
                acceptedOrderCost: rec?.status === "accepted"
                    ? acc.acceptedOrderCost + lineCost
                    : acc.acceptedOrderCost,
            };
        },
        { totalOrderCost: 0, acceptedOrderCost: 0 }
    );

    const mostUrgent = [...reorderSuggestions]
        .filter(p => p.dailyUsage)
        .sort((a, b) => (a.available_now / (a.dailyUsage ?? 1)) - (b.available_now / (b.dailyUsage ?? 1)))[0];

    const mostUrgentDays = mostUrgent
        ? computeCoverageDays(mostUrgent.available_now, mostUrgent.dailyUsage)
        : null;

    const aiDrawerProduct = aiDrawerProductId
        ? (sorted.find(p => p.id === aiDrawerProductId) ?? reorderSuggestions.find(p => p.id === aiDrawerProductId))
        : undefined;
    const aiDrawerEnrichment = aiDrawerProductId ? aiMap.get(aiDrawerProductId) : undefined;
    const aiDrawerRecEntry = aiDrawerProductId ? recMap.get(aiDrawerProductId) : undefined;
    const aiDrawerSuggestion = aiDrawerProduct ? computeSuggestion(aiDrawerProduct) : null;
    const aiDrawerSuggestQty = aiDrawerSuggestion?.suggestQty ?? 1;
    const aiDrawerCoverageDays = aiDrawerProduct
        ? computeCoverageDays(aiDrawerProduct.available_now, aiDrawerProduct.dailyUsage)
        : null;

    const tabs: { key: FilterType; label: string; count: number }[] = [
        { key: "all", label: "Tümü", count: reorderSuggestions.length },
        { key: "raw_material", label: "Hammadde", count: rawItems.length },
        { key: "manufactured", label: "İmalat", count: manufacturedItems.length },
        { key: "commercial", label: "Ticari", count: commercialItems.length },
    ];

    // Summary stats for decisions
    const acceptedCount = [...recMap.values()].filter(r => r.status === "accepted").length;
    const rejectedCount = [...recMap.values()].filter(r => r.status === "rejected").length;
    const pendingCount = reorderSuggestions.length - acceptedCount - rejectedCount;

    return (
        <div style={{ padding: "24px 32px" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                <h1 style={{ fontSize: "20px", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
                    Satın Alma Önerileri
                </h1>
                <button
                    onClick={handleRefresh}
                    disabled={refreshing || aiLoading}
                    title="Verileri yenile"
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "6px 12px",
                        fontSize: "12px",
                        fontWeight: 500,
                        color: (refreshing || aiLoading) ? "var(--text-tertiary)" : "var(--text-secondary)",
                        background: "var(--bg-secondary)",
                        border: "1px solid var(--border-secondary)",
                        borderRadius: "6px",
                        cursor: (refreshing || aiLoading) ? "not-allowed" : "pointer",
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
            <p style={{ fontSize: "13px", color: "var(--text-tertiary)", marginTop: "4px" }}>
                Minimum stok seviyesinin altına düşen ürünler · Öncelik sırasına göre
            </p>
            <div style={{ marginTop: "4px", fontSize: "11px" }}>
                {aiError ? (
                    <span style={{ color: "var(--warning-text)" }}>AI kullanılamıyor — deterministik mod</span>
                ) : aiLoading ? (
                    <span style={{ color: "var(--text-tertiary)", fontStyle: "italic" }}>AI analizi yükleniyor...</span>
                ) : aiData?.ai_available ? (
                    <span style={{ color: "var(--success-text)" }}>AI zenginleştirme aktif</span>
                ) : (
                    <span style={{ color: "var(--text-tertiary)" }}>Deterministik mod</span>
                )}
            </div>

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
                            {rawItems.length} hammadde · {manufacturedItems.length} imalat · {commercialItems.length} ticari
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
                        <div style={{ fontSize: "11px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                            Toplam Sipariş Tutarı
                        </div>
                        <div style={{ fontSize: "28px", fontWeight: 700, color: "var(--accent-text)", marginTop: "4px", lineHeight: 1 }}>
                            {formatCurrency(totalOrderCost, "TRY")}
                        </div>
                        <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "4px" }}>
                            {reorderSuggestions.length} ürün · {formatCurrency(acceptedOrderCost, "TRY")} kabul edildi
                        </div>
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

            {/* Filter tabs + Arama */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "20px", flexWrap: "wrap" }}>
                <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Ürün adı veya SKU..."
                    style={{
                        fontSize: "12px",
                        padding: "6px 12px",
                        border: "0.5px solid var(--border-secondary)",
                        borderRadius: "6px",
                        background: "var(--bg-primary)",
                        color: "var(--text-primary)",
                        width: "200px",
                        outline: "none",
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
            <SegmentBanner
                filter={filter}
                rawCount={rawItems.length}
                finishedCount={manufacturedItems.length + commercialItems.length}
                rawItems={rawItems}
            />

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
                        const urgency = p.minStockLevel > 0 ? Math.round((1 - p.available_now / p.minStockLevel) * 100) : 100;
                        const deficit = p.minStockLevel - p.available_now;
                        const daysLeft = computeCoverageDays(p.available_now, p.dailyUsage);
                        const isRaw = p.productType === "raw_material";
                        const { suggestQty, formula, leadTimeDemand } = computeSuggestion(p);
                        const recEntry = recMap.get(p.id);
                        const isRejected = recEntry?.status === "rejected";
                        return (
                            <div key={p.id} style={{
                                border: "1px solid var(--border-secondary)",
                                borderRadius: "8px",
                                padding: "14px 16px",
                                background: urgency >= 80 ? "rgba(248,81,73,0.04)" : "var(--bg-secondary)",
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
                                            background: isRaw ? "var(--danger-bg)" : "var(--accent-bg)",
                                            color: isRaw ? "var(--danger-text)" : "var(--accent-text)",
                                            marginBottom: "4px",
                                        }}>
                                            {p.productType === "manufactured" ? "İmalat" : p.productType === "commercial" ? "Ticari" : "Hammadde"}
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
                                    <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                                        <span style={{ color: "var(--text-tertiary)" }}>Mevcut:</span>{" "}
                                        <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{p.available_now.toLocaleString("tr-TR")}</span>
                                    </div>
                                    <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                                        <span style={{ color: "var(--text-tertiary)" }}>Min:</span>{" "}
                                        <span style={{ fontWeight: 600 }}>{p.minStockLevel.toLocaleString("tr-TR")}</span>
                                    </div>
                                    <div style={{ fontSize: "12px" }}>
                                        <span style={{ color: "var(--text-tertiary)" }}>Açık:</span>{" "}
                                        {deficit > 0
                                            ? <span style={{ fontWeight: 700, color: "var(--danger-text)" }}>-{deficit.toLocaleString("tr-TR")}</span>
                                            : <span style={{ color: "var(--text-tertiary)" }}>—</span>
                                        }
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

                                {/* Action — open drawer to decide */}
                                <div style={{ marginTop: "12px" }}>
                                    {(() => {
                                        const rec = recMap.get(p.id);
                                        const st = rec?.status ?? "no_rec";
                                        if (st === "accepted") return <span style={{ fontSize: "11px", fontWeight: 600, padding: "3px 8px", borderRadius: "4px", background: "var(--success-bg)", color: "var(--success-text)", border: "0.5px solid var(--success-border)" }}>✓ Kabul Edildi</span>;
                                        if (st === "rejected") return <span style={{ fontSize: "11px", fontWeight: 600, padding: "3px 8px", borderRadius: "4px", color: "var(--danger-text)" }}>✕ Reddedildi</span>;
                                        if (st === "edited") return <span style={{ fontSize: "11px", fontWeight: 600, padding: "3px 8px", borderRadius: "4px", background: "var(--accent-bg)", color: "var(--accent-text)", border: "0.5px solid var(--accent-border)" }}>✎ Düzenlendi{rec?.editedQty != null ? `: ${rec.editedQty} ${p.unit}` : ""}</span>;
                                        if (!rec) return null;
                                        return (
                                            <button
                                                onClick={() => setAiDrawerProductId(p.id)}
                                                style={{
                                                    fontSize: "11px", fontWeight: 600, padding: "3px 10px", borderRadius: "4px",
                                                    background: "var(--warning-bg)", color: "var(--warning-text)",
                                                    border: "0.5px solid var(--warning-border)", cursor: "pointer",
                                                }}
                                            >
                                                Karar ver →
                                            </button>
                                        );
                                    })()}
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
                                {["Tür", "Ürün Adı", "SKU", "Depo", "Stok", "Açık", "Önerilen · Tükenme", "Karar"].map(h => (
                                    <th key={h} style={{
                                        padding: "10px 12px",
                                        textAlign: "left",
                                        fontWeight: 500,
                                        color: "var(--text-tertiary)",
                                        fontSize: "11px",
                                        textTransform: "uppercase",
                                        letterSpacing: "0.04em",
                                        borderBottom: "1px solid var(--border-secondary)",
                                        whiteSpace: "nowrap",
                                    }}>
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {sorted.map((p, idx) => {
                                const urgency = p.minStockLevel > 0 ? Math.round((1 - p.available_now / p.minStockLevel) * 100) : 100;
                                const stockPct = Math.min(100, Math.round((p.available_now / p.minStockLevel) * 100));
                                const deficit = p.minStockLevel - p.available_now;
                                const daysLeft = computeCoverageDays(p.available_now, p.dailyUsage);
                                const isRaw = p.productType === "raw_material";
                                const { suggestQty, formula, leadTimeDemand } = computeSuggestion(p);
                                const recEntry = recMap.get(p.id);
                                const isRejected = recEntry?.status === "rejected";
                                return (
                                    <tr key={p.id} style={{
                                        borderBottom: idx < sorted.length - 1 ? "1px solid var(--border-tertiary)" : "none",
                                        background: urgency >= 80 ? "rgba(248,81,73,0.04)" : "transparent",
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
                                                background: isRaw ? "var(--danger-bg)" : "var(--accent-bg)",
                                                color: isRaw ? "var(--danger-text)" : "var(--accent-text)",
                                            }}>
                                                {p.productType === "manufactured" ? "İmalat" : p.productType === "commercial" ? "Ticari" : "Hammadde"}
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
                                        {/* Stok */}
                                        <td style={{ padding: "10px 12px" }}>
                                            <div style={{ fontSize: "13px", color: "var(--text-primary)", fontWeight: 500 }}>
                                                {p.available_now.toLocaleString("tr-TR")}
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
                                                    background: isRaw ? "var(--danger)" : "var(--warning)",
                                                    borderRadius: "2px",
                                                }} />
                                            </div>
                                            <div style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "2px" }}>
                                                min {p.minStockLevel.toLocaleString("tr-TR")}
                                            </div>
                                        </td>
                                        {/* Açık */}
                                        <td style={{ padding: "10px 12px", fontWeight: 700, fontSize: "14px" }}>
                                            {deficit > 0
                                                ? <span style={{ color: "var(--danger-text)" }}>-{deficit.toLocaleString("tr-TR")}</span>
                                                : <span style={{ color: "var(--text-tertiary)" }}>—</span>
                                            }
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
                                        {/* Karar — status only; actions in AI drawer */}
                                        <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                                            {(() => {
                                                const st = recEntry?.status ?? "no_rec";
                                                if (st === "accepted") return <span style={{ fontSize: "11px", fontWeight: 600, padding: "3px 8px", borderRadius: "4px", background: "var(--success-bg)", color: "var(--success-text)", border: "0.5px solid var(--success-border)" }}>✓ Kabul</span>;
                                                if (st === "rejected") return <span style={{ fontSize: "11px", fontWeight: 600, padding: "3px 8px", borderRadius: "4px", color: "var(--danger-text)" }}>✕ Red</span>;
                                                if (st === "edited") return <span style={{ fontSize: "11px", fontWeight: 600, padding: "3px 8px", borderRadius: "4px", background: "var(--accent-bg)", color: "var(--accent-text)", border: "0.5px solid var(--accent-border)" }}>✎ Düzenlendi</span>;
                                                if (!recEntry) return <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>—</span>;
                                                return (
                                                    <button
                                                        onClick={() => setAiDrawerProductId(p.id)}
                                                        style={{
                                                            fontSize: "11px", fontWeight: 600, padding: "3px 10px", borderRadius: "4px",
                                                            background: "var(--warning-bg)", color: "var(--warning-text)",
                                                            border: "0.5px solid var(--warning-border)", cursor: "pointer",
                                                        }}
                                                    >
                                                        Karar ver →
                                                    </button>
                                                );
                                            })()}
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
                                {[
                                    { label: "Mevcut", value: `${aiDrawerProduct.available_now.toLocaleString("tr-TR")} ${aiDrawerProduct.unit}`, color: "var(--danger-text)" },
                                    { label: "Minimum", value: `${aiDrawerProduct.minStockLevel.toLocaleString("tr-TR")} ${aiDrawerProduct.unit}`, color: "var(--text-secondary)" },
                                    { label: "Açık", value: `-${(aiDrawerProduct.minStockLevel - aiDrawerProduct.available_now).toLocaleString("tr-TR")} ${aiDrawerProduct.unit}`, color: "var(--danger-text)" },
                                ].map(item => (
                                    <div key={item.label}>
                                        <div style={{ fontSize: "10px", color: "var(--text-tertiary)", marginBottom: "2px" }}>{item.label}</div>
                                        <div style={{ fontSize: "12px", fontWeight: 600, color: item.color }}>{item.value}</div>
                                    </div>
                                ))}
                            </div>
                            <div style={{ height: "4px", background: "var(--bg-tertiary)", borderRadius: "2px", overflow: "hidden", marginBottom: "6px" }}>
                                <div style={{
                                    width: `${aiDrawerProduct.minStockLevel > 0 ? Math.min(100, Math.round((aiDrawerProduct.available_now / aiDrawerProduct.minStockLevel) * 100)) : 0}%`,
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
                                            {aiDrawerSuggestion.suggestQty.toLocaleString("tr-TR")} {aiDrawerProduct.unit}
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
        </div>
    );
}
