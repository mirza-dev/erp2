"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { mapProduct } from "@/lib/api-mappers";
import type { Product } from "@/lib/mock-data";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import AIDetailDrawer from "@/components/ai/AIDetailDrawer";
import { useIsDemo, DEMO_DISABLED_TOOLTIP, DEMO_BLOCK_TOAST } from "@/lib/demo-utils";
import { dateDaysFromToday } from "@/lib/stock-utils";


interface RiskItem {
    productId: string;
    riskLevel: string;
    coverageDays: number | null;
    leadTimeDays: number | null;
    dailyUsage: number | null;
    deterministicReason: string;
    displayReason?: string;
    aiExplanation: string | null;
    aiRecommendation: string | null;
    aiConfidence: number | null;
}

interface RiskRecEntry {
    id: string;
    status: string;
    decidedAt?: string | null;
}

interface AlertItem {
    id: string;
    title: string;
    description: string | null;
    type: string;
    severity: "critical" | "warning" | "info";
}

interface QuotedItem {
    orderId: string;
    orderNumber: string;
    customerId: string;
    customerName: string;
    quantity: number;
    unitPrice: number;
    currency: string;
    commercialStatus: "draft" | "pending_approval";
    orderCreatedAt: string;
    createdByEmail: string | null;
    quoteValidUntil: string | null;
}

function formatRelativeTime(iso: string): string {
    const diffMs = Date.now() - new Date(iso).getTime();
    const diffMin = Math.floor(diffMs / 60_000);
    if (diffMin < 60) return `${diffMin} dakika önce`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH} saat önce`;
    const diffD = Math.floor(diffH / 24);
    return `${diffD} gün önce`;
}

function coverageDaysColor(days: number | null): string {
    if (days === null) return "var(--text-tertiary)";
    if (days <= 7) return "var(--danger-text)";
    if (days <= 14) return "var(--warning-text)";
    return "var(--success-text)";
}

function IdField({ label, value }: { label: string; value: string | undefined | null }) {
    if (!value) return null;
    return (
        <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
            <span style={{ fontSize: "11px", color: "var(--text-tertiary)", minWidth: "90px", flexShrink: 0 }}>
                {label}
            </span>
            <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                {value}
            </span>
        </div>
    );
}

function getAlertContext(type: string): {
    neden: string | null;
    etki: string | null;
    ctaHref: string | null;
    ctaLabel: string | null;
} {
    switch (type) {
        case "stock_critical":
            return {
                neden: "Mevcut stok minimum eşiğin altına düştü.",
                etki: "Yeni siparişler karşılanamaz.",
                ctaHref: "/dashboard/purchase/suggested",
                ctaLabel: "Satın alma önerilerini incele →",
            };
        case "stock_risk":
            return {
                neden: "Kapsam süresi kritik seviyenin altında.",
                etki: "Yakın vadede stok tükenme riski var.",
                ctaHref: "/dashboard/purchase/suggested",
                ctaLabel: "Satın alma önerilerini incele →",
            };
        case "purchase_recommended":
            return {
                neden: "Stok yeniden sipariş noktasına ulaştı.",
                etki: "Temin süresi göz önüne alındığında stok açığı riski var.",
                ctaHref: "/dashboard/purchase/suggested",
                ctaLabel: "Satın alma önerisini görüntüle →",
            };
        case "order_shortage":
            return {
                neden: "Onaylı siparişler için yeterli stok rezerve edilemiyor.",
                etki: "Sipariş teslimatı gecikebilir.",
                ctaHref: "/dashboard/orders",
                ctaLabel: "Siparişleri görüntüle →",
            };
        case "order_deadline":
            return {
                neden: "Sipariş son tarihi yaklaşıyor veya geçmiş.",
                etki: "Tedarik süresi göz önüne alındığında stok tükenecek.",
                ctaHref: "/dashboard/purchase/suggested",
                ctaLabel: "Satın alma önerilerini incele →",
            };
        default:
            return { neden: null, etki: null, ctaHref: null, ctaLabel: null };
    }
}

const thStyle: React.CSSProperties = {
    textAlign: "left",
    padding: "10px 14px",
    fontSize: "12px",
    fontWeight: 500,
    color: "var(--text-secondary)",
    borderBottom: "0.5px solid var(--border-tertiary)",
    whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
    padding: "10px 14px",
    fontSize: "13px",
    borderBottom: "0.5px solid var(--border-tertiary)",
    color: "var(--text-primary)",
    lineHeight: 1.4,
    whiteSpace: "nowrap",
};

const modalInputStyle: React.CSSProperties = {
    fontSize: "13px",
    padding: "6px 10px",
    border: "0.5px solid var(--border-secondary)",
    borderRadius: "6px",
    background: "var(--bg-tertiary)",
    color: "var(--text-primary)",
    width: "100%",
};

const drawerInputStyle: React.CSSProperties = {
    fontSize: "12px",
    padding: "4px 8px",
    border: "0.5px solid var(--border-secondary)",
    borderRadius: "5px",
    background: "var(--bg-tertiary)",
    color: "var(--text-primary)",
    width: "100%",
};

function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
    return (
        <div>
            <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                {label}{required && <span style={{ color: "var(--danger-text)", marginLeft: "2px" }}>*</span>}
            </div>
            {children}
        </div>
    );
}

export default function ProductsPage() {
    const { toast } = useToast();
    const isDemo = useIsDemo();
    const [mockProducts, setMockProducts] = useState<Product[]>([]);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [search, setSearch] = useState("");
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
    const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
    const categoryDropdownRef = useRef<HTMLDivElement>(null);
    const [createOpen, setCreateOpen] = useState(false);
    const [createForm, setCreateForm] = useState<{
        name: string; sku: string; category: string; unit: string;
        price: number; currency: string; on_hand: number; minStockLevel: number;
        productType: "raw_material" | "manufactured" | "commercial"; warehouse: string;
        materialQuality: string; originCountry: string; productionSite: string;
        useCases: string; industries: string; standards: string;
        certifications: string; productNotes: string;
    }>({
        name: "", sku: "", category: "", unit: "adet",
        price: 0, currency: "USD", on_hand: 0, minStockLevel: 0,
        productType: "manufactured", warehouse: "Sevkiyat Deposu",
        materialQuality: "", originCountry: "", productionSite: "",
        useCases: "", industries: "", standards: "", certifications: "", productNotes: "",
    });
    const [createSubmitting, setCreateSubmitting] = useState(false);
    const [windowWidth, setWindowWidth] = useState<number>(
        typeof window !== "undefined" ? window.innerWidth : 1200
    );
    const [riskData, setRiskData] = useState<Map<string, RiskItem>>(new Map());
    const [riskLoading, setRiskLoading] = useState(false);
    const [riskCounts, setRiskCounts] = useState<{ at_risk: number; excluded_no_usage?: number } | null>(null);
    const [aiAvailable, setAiAvailable] = useState<boolean | null>(null);
    const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
    const [drawerEditMode, setDrawerEditMode] = useState(false);
    const [drawerSaving, setDrawerSaving] = useState(false);
    const [drawerEditForm, setDrawerEditForm] = useState<{
        name: string; category: string; subCategory: string;
        productFamily: string; productType: "raw_material" | "manufactured" | "commercial";
        sectorCompatibility: string; industries: string; useCases: string;
        materialQuality: string; originCountry: string; productionSite: string;
        standards: string; certifications: string;
        unit: string; warehouse: string; preferredVendor: string;
        leadTimeDays: string; weightKg: string;
        price: string; currency: string; costPrice: string;
        productNotes: string;
    } | null>(null);
    const [recMap, setRecMap] = useState<Map<string, RiskRecEntry>>(new Map());
    const [rejectMode, setRejectMode] = useState(false);
    const [rejectNote, setRejectNote] = useState("");
    const [drawerAlerts, setDrawerAlerts] = useState<AlertItem[]>([]);
    const [drawerAlertsLoading, setDrawerAlertsLoading] = useState(false);
    const [alertFilter, setAlertFilter] = useState<"tumu" | "riskli" | "uyarili" | "oneri">("tumu");
    const [productsWithAlerts, setProductsWithAlerts] = useState<Set<string>>(new Set());
    const [commitments, setCommitments] = useState<{ id: string; quantity: number; expected_date: string; supplier_name: string | null; status: string }[]>([]);
    const [showCommitmentForm, setShowCommitmentForm] = useState(false);
    const [commitmentForm, setCommitmentForm] = useState({ quantity: "", expected_date: "", supplier_name: "" });
    const [commitmentSubmitting, setCommitmentSubmitting] = useState(false);
    const [receivingId, setReceivingId] = useState<string | null>(null);
    const [quotes, setQuotes] = useState<QuotedItem[]>([]);
    const [quotesTotal, setQuotesTotal] = useState(0);
    const [quotesLoading, setQuotesLoading] = useState(false);
    const [extendingId, setExtendingId] = useState<string | null>(null);
    const [extendShowCustom, setExtendShowCustom] = useState(false);
    const [extendCustomDate, setExtendCustomDate] = useState("");
    const [extendLoading, setExtendLoading] = useState(false);
    const [filterManufactured, setFilterManufactured] = useState(false);
    const [filterCommercial, setFilterCommercial] = useState(false);

    const refetch = useCallback(async () => {
        const res = await fetch("/api/products");
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data)) setMockProducts(data.map(mapProduct));
        } else {
            setLoadError("Ürünler yüklenemedi.");
        }
    }, []);

    useEffect(() => { refetch(); }, [refetch]);

    const handleRefresh = async () => {
        if (refreshing) return;
        setRefreshing(true);
        try {
            await refetch();
            // Run alert scan on manual refresh (not on mount — too expensive)
            try { await fetch("/api/alerts/scan", { method: "POST" }); } catch { /* non-fatal */ }
            try {
                const res = await fetch("/api/alerts?entity_type=product&status=open");
                const data: Array<{ entity_id?: string | null }> = res.ok ? await res.json() : [];
                const ids = new Set<string>();
                for (const a of data) { if (a.entity_id) ids.add(a.entity_id); }
                setProductsWithAlerts(ids);
            } catch { /* graceful */ }
        } finally { setRefreshing(false); }
    };

    useEffect(() => {
        function handleResize() { setWindowWidth(window.innerWidth); }
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(e.target as Node)) {
                setCategoryDropdownOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, []);

    useEffect(() => {
        let cancelled = false;
        async function fetchRisk() {
            setRiskLoading(true);
            try {
                const res = await fetch("/api/ai/stock-risk", { method: "POST" });
                if (!res.ok) return;
                const data = await res.json();
                if (cancelled) return;
                const map = new Map<string, RiskItem>();
                for (const item of data.items ?? []) map.set(item.productId, item);
                setRiskData(map);
                setRiskCounts({
                    at_risk: data.counts?.at_risk ?? 0,
                    excluded_no_usage: data.counts?.excluded_no_usage ?? 0,
                });
                setAiAvailable(data.ai_available ?? null);
                const recMapData = new Map<string, RiskRecEntry>();
                for (const rec of data.recommendations ?? []) {
                    if (rec.recommendationId) {
                        recMapData.set(rec.productId, { id: rec.recommendationId, status: rec.status, decidedAt: rec.decidedAt ?? null });
                    }
                }
                setRecMap(recMapData);
            } catch { /* graceful: risk data missing = no badges */ }
            finally { if (!cancelled) setRiskLoading(false); }
        }
        fetchRisk();
        return () => { cancelled = true; };
    }, []);

    // Reset edit mode when drawer product changes
    useEffect(() => {
        setDrawerEditMode(false);
        setDrawerEditForm(null);
    }, [selectedProductId]);

    // Fetch pending commitments for the selected product whenever drawer opens
    useEffect(() => {
        if (!selectedProductId) {
            setCommitments([]);
            setShowCommitmentForm(false);
            setCommitmentForm({ quantity: "", expected_date: "", supplier_name: "" });
            return;
        }
        let cancelled = false;
        fetch(`/api/purchase-commitments?product_id=${selectedProductId}&status=pending`)
            .then(r => r.ok ? r.json() : [])
            .then(data => { if (!cancelled) setCommitments(Array.isArray(data) ? data : []); })
            .catch(() => { if (!cancelled) setCommitments([]); });
        return () => { cancelled = true; };
    }, [selectedProductId]);

    // Fetch quoted breakdown for the selected product whenever drawer opens
    useEffect(() => {
        if (!selectedProductId) { setQuotes([]); setQuotesTotal(0); return; }
        let cancelled = false;
        setQuotesLoading(true);
        fetch(`/api/products/${selectedProductId}/quotes`)
            .then(r => r.ok ? r.json() : { items: [], totalQuoted: 0 })
            .then(data => {
                if (cancelled) return;
                setQuotes(data.items ?? []);
                setQuotesTotal(data.totalQuoted ?? 0);
            })
            .catch(() => { if (!cancelled) { setQuotes([]); setQuotesTotal(0); } })
            .finally(() => { if (!cancelled) setQuotesLoading(false); });
        return () => { cancelled = true; };
    }, [selectedProductId]);

    async function refetchQuotes() {
        if (!selectedProductId) return;
        const data = await fetch(`/api/products/${selectedProductId}/quotes`)
            .then(r => r.ok ? r.json() : { items: [], totalQuoted: 0 })
            .catch(() => ({ items: [], totalQuoted: 0 }));
        setQuotes(data.items ?? []);
        setQuotesTotal(data.totalQuoted ?? 0);
    }

    async function extendQuote(orderId: string, newDate: string) {
        setExtendLoading(true);
        try {
            const res = await fetch(`/api/orders/${orderId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ quote_valid_until: newDate }),
            });
            if (!res.ok) return;
            setExtendingId(null);
            setExtendShowCustom(false);
            setExtendCustomDate("");
            await refetchQuotes();
        } finally {
            setExtendLoading(false);
        }
    }

    // Fetch active alerts for the selected product whenever drawer opens
    useEffect(() => {
        if (!selectedProductId) { setDrawerAlerts([]); return; }
        let cancelled = false;
        setDrawerAlertsLoading(true);
        fetch(`/api/alerts?entity_type=product&entity_id=${selectedProductId}&status=open`)
            .then(r => r.ok ? r.json() : [])
            .then(data => { if (!cancelled) setDrawerAlerts(Array.isArray(data) ? data : []); })
            .catch(() => { if (!cancelled) setDrawerAlerts([]); })
            .finally(() => { if (!cancelled) setDrawerAlertsLoading(false); });
        return () => { cancelled = true; };
    }, [selectedProductId]);

    // Fetch open product alerts for signal filtering (no scan on mount — scan runs on "Yenile")
    useEffect(() => {
        let cancelled = false;
        async function fetchAlerts() {
            try {
                const res = await fetch("/api/alerts?entity_type=product&status=open");
                const data: Array<{ entity_id?: string | null }> = res.ok ? await res.json() : [];
                if (cancelled) return;
                const ids = new Set<string>();
                for (const a of data) { if (a.entity_id) ids.add(a.entity_id); }
                setProductsWithAlerts(ids);
            } catch { /* graceful */ }
        }
        fetchAlerts();
        return () => { cancelled = true; };
    }, []);

    const isMobile = windowWidth < 768;

    const filtered = useMemo(() => mockProducts.filter((p) => {
        const matchSearch =
            p.name.toLowerCase().includes(search.toLowerCase()) ||
            p.sku.toLowerCase().includes(search.toLowerCase());
        const matchCategory = selectedCategories.length === 0 || selectedCategories.includes(p.category);
        const pRisk = riskData.get(p.id);
        const pRec = recMap.get(p.id);
        const matchSignal =
            alertFilter === "riskli" ? !!pRisk :
            alertFilter === "uyarili" ? productsWithAlerts.has(p.id) :
            alertFilter === "oneri" ? pRec?.status === "suggested" :
            true;
        const matchUsage =
            (!filterManufactured && !filterCommercial) ||
            (filterManufactured && !filterCommercial && p.productType === "manufactured") ||
            (!filterManufactured && filterCommercial && p.productType === "commercial") ||
            (filterManufactured && filterCommercial && (p.productType === "manufactured" || p.productType === "commercial"));
        return matchSearch && matchCategory && matchSignal && matchUsage;
    }), [mockProducts, search, selectedCategories, riskData, recMap, alertFilter, productsWithAlerts, filterManufactured, filterCommercial]);

    const criticalCount = mockProducts.filter(p => p.promisable <= p.minStockLevel).length;

    const categories = useMemo(
        () => ["Tümü", ...Array.from(new Set(mockProducts.map(p => p.category).filter(Boolean))).sort()],
        [mockProducts]
    );

    const categoryCounts: Record<string, number> = { "Tümü": mockProducts.length };
    categories.slice(1).forEach(cat => {
        categoryCounts[cat] = mockProducts.filter(p => p.category === cat).length;
    });

    const categoryButtonLabel: string =
        selectedCategories.length === 0
            ? "Kategori"
            : selectedCategories.length === 1
            ? selectedCategories[0]
            : `Kategori (${selectedCategories.length})`;
    const categoryIsActive = selectedCategories.length > 0;

    const riskliCount = mockProducts.filter(p => riskData.has(p.id)).length;
    const uyariliCount = productsWithAlerts.size;
    const oneriCount = mockProducts.filter(p => recMap.get(p.id)?.status === "suggested").length;

    const handleDelete = async (id: string) => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        setDeletingId(id);
        try {
            const res = await fetch(`/api/products/${id}`, { method: "DELETE" });
            if (!res.ok) {
                const errBody = await res.json().catch(() => null);
                throw new Error(errBody?.error ?? "Ürün silinemedi.");
            }
            await refetch();
            toast({ type: "success", message: "Ürün silindi" });
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Ürün silinemedi.";
            toast({ type: "error", message: msg });
        } finally {
            setDeletingId(null);
            setConfirmDeleteId(null);
        }
    };

    const handleCreate = async () => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        if (!createForm.name.trim() || !createForm.sku.trim()) return;
        setCreateSubmitting(true);
        try {
            const body = {
                name: createForm.name, sku: createForm.sku, category: createForm.category,
                unit: createForm.unit, price: createForm.price, currency: createForm.currency,
                on_hand: createForm.on_hand, min_stock_level: createForm.minStockLevel,
                product_type: createForm.productType, warehouse: createForm.warehouse,
                material_quality: createForm.materialQuality || undefined,
                origin_country: createForm.originCountry || undefined,
                production_site: createForm.productionSite || undefined,
                use_cases: createForm.useCases || undefined,
                industries: createForm.industries || undefined,
                standards: createForm.standards || undefined,
                certifications: createForm.certifications || undefined,
                product_notes: createForm.productNotes || undefined,
            };
            const res = await fetch("/api/products", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            if (!res.ok) throw new Error(await res.text());
            await refetch();
            setCreateOpen(false);
            setCreateForm({
                name: "", sku: "", category: "", unit: "adet",
                price: 0, currency: "USD", on_hand: 0, minStockLevel: 0,
                productType: "manufactured" as const, warehouse: "Sevkiyat Deposu",
                materialQuality: "", originCountry: "", productionSite: "",
                useCases: "", industries: "", standards: "", certifications: "", productNotes: "",
            });
            toast({ type: "success", message: `${createForm.name} ürün olarak eklendi` });
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Ürün eklenemedi. Lütfen tekrar deneyin.";
            toast({ type: "error", message: msg });
        } finally {
            setCreateSubmitting(false);
        }
    };

    const handleAccept = async (productId: string) => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        const rec = recMap.get(productId);
        if (!rec || rec.status !== "suggested") return;
        try {
            const res = await fetch(`/api/recommendations/${rec.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "accepted" }),
            });
            if (!res.ok) return;
            const data = await res.json();
            setRecMap(prev => new Map(prev).set(productId, {
                id: rec.id,
                status: data.recommendation.status,
                decidedAt: data.recommendation.decidedAt ?? null,
            }));
        } catch { /* graceful */ }
    };

    const handleReject = async (productId: string, feedbackNote?: string) => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        const rec = recMap.get(productId);
        if (!rec || rec.status !== "suggested") return;
        try {
            const res = await fetch(`/api/recommendations/${rec.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "rejected", feedbackNote }),
            });
            if (!res.ok) return;
            const data = await res.json();
            setRecMap(prev => new Map(prev).set(productId, {
                id: rec.id,
                status: data.recommendation.status,
                decidedAt: data.recommendation.decidedAt ?? null,
            }));
        } catch { /* graceful */ }
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* Load error banner */}
            {loadError && (
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
                    ⚠ {loadError}
                </div>
            )}
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
                <div>
                    <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
                        Stok & Ürünler
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "3px" }}>
                        {mockProducts.length} ürün · {categories.length - 1} kategori
                        {criticalCount > 0 && (
                            <span style={{ color: "var(--danger-text)", fontWeight: 600 }}> · {criticalCount} kritik</span>
                        )}
                        {(riskCounts?.at_risk ?? 0) > 0 && (
                            <span style={{ color: "var(--accent-text)" }}> · {riskCounts!.at_risk} riskli{aiAvailable ? " (AI)" : ""}</span>
                        )}
                        {!riskLoading && riskCounts !== null && riskCounts.at_risk === 0 && aiAvailable && (
                            <span style={{ color: "var(--success-text)" }}> · AI: risk yok</span>
                        )}
                        {!riskLoading && riskCounts !== null && (riskCounts.excluded_no_usage ?? 0) > 0 && (
                            <span style={{ color: "var(--text-tertiary)" }}> · {riskCounts.excluded_no_usage} ürün veri eksik</span>
                        )}
                        {riskLoading && (
                            <span style={{ color: "var(--text-tertiary)", fontStyle: "italic" }}> · Risk analizi…</span>
                        )}
                        {!riskLoading && aiAvailable === false && (
                            <span style={{ color: "var(--text-tertiary)", fontStyle: "italic" }}> · Deterministik mod</span>
                        )}
                    </div>
                </div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <button
                        onClick={handleRefresh}
                        disabled={refreshing}
                        style={{
                            fontSize: "12px",
                            padding: "6px 12px",
                            border: "0.5px solid var(--border-secondary)",
                            borderRadius: "6px",
                            background: "transparent",
                            color: "var(--text-secondary)",
                            cursor: refreshing ? "not-allowed" : "pointer",
                            opacity: refreshing ? 0.5 : 1,
                            display: "flex",
                            alignItems: "center",
                            gap: "5px",
                        }}
                    >
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ transform: refreshing ? "rotate(180deg)" : "none", transition: "transform 0.4s" }}>
                            <path d="M10 6A4 4 0 1 1 6 2a4 4 0 0 1 3.5 2M10 2v2.5H7.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        {refreshing ? "Yenileniyor…" : "Yenile"}
                    </button>
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
                            width: isMobile ? "140px" : "200px",
                        }}
                    />
                    <a
                        href="/dashboard/products/aging"
                        style={{
                            fontSize: "12px", fontWeight: 500, padding: "6px 12px",
                            border: "0.5px solid var(--border-secondary)", borderRadius: "6px",
                            background: "transparent", color: "var(--text-secondary)",
                            textDecoration: "none", whiteSpace: "nowrap",
                        }}
                    >Eskime Raporu →</a>
                    <Button variant="primary" onClick={() => { setCreateForm({ name: "", sku: "", category: "", unit: "adet", price: 0, currency: "USD", on_hand: 0, minStockLevel: 0, productType: "manufactured", warehouse: "Sevkiyat Deposu", materialQuality: "", originCountry: "", productionSite: "", useCases: "", industries: "", standards: "", certifications: "", productNotes: "" }); setCreateOpen(true); }} disabled={isDemo} title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}>+ Yeni Ürün</Button>
                </div>
            </div>

            {/* Category filter dropdown */}
            <div ref={categoryDropdownRef} style={{ position: "relative", display: "inline-block" }}>
                {categoryDropdownOpen && (
                    <div
                        onClick={() => setCategoryDropdownOpen(false)}
                        style={{ position: "fixed", inset: 0, zIndex: 49, background: "transparent" }}
                    />
                )}
                <button
                    onClick={() => setCategoryDropdownOpen(prev => !prev)}
                    style={{
                        fontSize: "12px",
                        padding: "5px 12px",
                        border: `0.5px solid ${categoryIsActive ? "var(--accent-border)" : "var(--border-secondary)"}`,
                        borderRadius: "6px",
                        background: categoryIsActive ? "var(--accent-bg)" : "transparent",
                        color: categoryIsActive ? "var(--accent-text)" : "var(--text-secondary)",
                        cursor: "pointer",
                        fontWeight: categoryIsActive ? 600 : 400,
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                    }}
                    onMouseEnter={e => {
                        if (!categoryIsActive) {
                            e.currentTarget.style.background = "var(--bg-tertiary)";
                            e.currentTarget.style.color = "var(--text-primary)";
                        }
                    }}
                    onMouseLeave={e => {
                        if (!categoryIsActive) {
                            e.currentTarget.style.background = "transparent";
                            e.currentTarget.style.color = "var(--text-secondary)";
                        }
                    }}
                >
                    {categoryButtonLabel}
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M2 3.5L5 6.5l3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                    </svg>
                </button>

                {categoryDropdownOpen && (
                    <div style={{
                        position: "absolute",
                        top: "calc(100% + 4px)",
                        left: 0,
                        minWidth: "220px",
                        background: "var(--bg-primary)",
                        border: "0.5px solid var(--border-primary)",
                        borderRadius: "6px",
                        boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
                        zIndex: 50,
                        overflow: "hidden",
                    }}>
                        <div
                            onClick={() => {
                                setSelectedCategories([]);
                                setCategoryDropdownOpen(false);
                            }}
                            style={{
                                padding: "8px 12px",
                                fontSize: "12px",
                                cursor: "pointer",
                                color: selectedCategories.length === 0 ? "var(--accent-text)" : "var(--text-secondary)",
                                fontWeight: selectedCategories.length === 0 ? 600 : 400,
                                borderBottom: "0.5px solid var(--border-tertiary)",
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = "var(--bg-secondary)"; }}
                            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                        >
                            <span>Tümü</span>
                            <span style={{
                                fontSize: "10px", padding: "1px 5px", borderRadius: "10px",
                                background: selectedCategories.length === 0 ? "var(--accent)" : "var(--bg-tertiary)",
                                color: selectedCategories.length === 0 ? "#fff" : "var(--text-tertiary)",
                                fontWeight: 600, minWidth: "16px", textAlign: "center",
                            }}>
                                {categoryCounts["Tümü"] ?? 0}
                            </span>
                        </div>
                        {categories.slice(1).map(cat => {
                            const checked = selectedCategories.includes(cat);
                            return (
                                <div
                                    key={cat}
                                    onClick={() => setSelectedCategories(prev =>
                                        checked ? prev.filter(c => c !== cat) : [...prev, cat]
                                    )}
                                    style={{
                                        padding: "8px 12px",
                                        fontSize: "12px",
                                        cursor: "pointer",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        gap: "8px",
                                        color: checked ? "var(--accent-text)" : "var(--text-primary)",
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.background = "var(--bg-secondary)"; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                                >
                                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                        <div style={{
                                            width: "14px", height: "14px", borderRadius: "3px",
                                            border: `0.5px solid ${checked ? "var(--accent-border)" : "var(--border-secondary)"}`,
                                            background: checked ? "var(--accent-bg)" : "transparent",
                                            display: "flex", alignItems: "center", justifyContent: "center",
                                            flexShrink: 0,
                                        }}>
                                            {checked && (
                                                <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                                                    <path d="M1.5 4.5l2 2 4-4" stroke="var(--accent-text)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                                                </svg>
                                            )}
                                        </div>
                                        {cat}
                                    </div>
                                    <span style={{
                                        fontSize: "10px", padding: "1px 5px", borderRadius: "10px",
                                        background: checked ? "var(--accent)" : "var(--bg-tertiary)",
                                        color: checked ? "#fff" : "var(--text-tertiary)",
                                        fontWeight: 600, minWidth: "16px", textAlign: "center",
                                    }}>
                                        {categoryCounts[cat] ?? 0}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Usage filter */}
            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                {(["manufactured", "commercial"] as const).map((type) => {
                    const active = type === "manufactured" ? filterManufactured : filterCommercial;
                    const label  = type === "manufactured" ? "İmalat" : "Ticari";
                    const toggle = type === "manufactured"
                        ? () => setFilterManufactured(p => !p)
                        : () => setFilterCommercial(p => !p);
                    return (
                        <button
                            key={type}
                            onClick={toggle}
                            style={{
                                display: "flex", alignItems: "center", gap: "6px",
                                fontSize: "12px", padding: "5px 10px",
                                border: `0.5px solid ${active ? "var(--accent-border)" : "var(--border-secondary)"}`,
                                borderRadius: "6px",
                                background: active ? "var(--accent-bg)" : "transparent",
                                color: active ? "var(--accent-text)" : "var(--text-secondary)",
                                cursor: "pointer", fontWeight: active ? 600 : 400,
                            }}
                        >
                            <div style={{
                                width: "13px", height: "13px", borderRadius: "3px",
                                border: `0.5px solid ${active ? "var(--accent-border)" : "var(--border-secondary)"}`,
                                background: active ? "var(--accent-bg)" : "transparent",
                                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                            }}>
                                {active && (
                                    <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                                        <path d="M1.5 4.5l2 2 4-4" stroke="var(--accent-text)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                                    </svg>
                                )}
                            </div>
                            {label}
                        </button>
                    );
                })}
            </div>

            {/* Signal filter */}
            <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ fontSize: "10px", color: "var(--text-tertiary)", marginRight: "2px", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    Sinyal:
                </span>
                {([
                    { key: "tumu", label: "Tümü", count: mockProducts.length, color: null },
                    { key: "riskli", label: "Riskli", count: riskLoading ? null : riskliCount, color: "var(--warning-text)" },
                    { key: "uyarili", label: "Uyarı var", count: uyariliCount, color: "var(--warning-text)" },
                    { key: "oneri", label: "Öneri bekliyor", count: oneriCount, color: "var(--accent-text)" },
                ] as const).map(f => {
                    const active = alertFilter === f.key;
                    return (
                        <button
                            key={f.key}
                            aria-pressed={active}
                            onClick={() => setAlertFilter(f.key)}
                            style={{
                                fontSize: "11px",
                                padding: "3px 10px",
                                border: `0.5px solid ${active ? "var(--border-primary)" : "var(--border-tertiary)"}`,
                                borderRadius: "5px",
                                background: active ? "var(--bg-secondary)" : "transparent",
                                color: active ? "var(--text-primary)" : "var(--text-tertiary)",
                                cursor: "pointer",
                                fontWeight: active ? 600 : 400,
                                display: "flex",
                                alignItems: "center",
                                gap: "4px",
                            }}
                            onMouseEnter={e => {
                                if (!active) e.currentTarget.style.color = "var(--text-secondary)";
                            }}
                            onMouseLeave={e => {
                                if (!active) e.currentTarget.style.color = "var(--text-tertiary)";
                            }}
                        >
                            {f.label}
                            {f.count !== null && (
                                <span style={{
                                    fontSize: "10px",
                                    fontWeight: 700,
                                    color: active ? (f.color ?? "var(--text-secondary)") : (f.color ?? "var(--text-tertiary)"),
                                }}>
                                    {f.count}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Table */}
            <div
                style={{
                    background: "var(--bg-primary)",
                    border: "0.5px solid var(--border-tertiary)",
                    borderRadius: "6px",
                    overflow: "hidden",
                    overflowX: "auto",
                }}
            >
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", minWidth: isMobile ? "360px" : "640px" }}>
                    <thead>
                        <tr style={{ background: "var(--bg-secondary)" }}>
                            <th style={thStyle}>SKU</th>
                            <th style={thStyle}>Ürün Adı</th>
                            {!isMobile && <th style={thStyle}>Kategori</th>}
                            <th style={{ ...thStyle, textAlign: "right" }}>Stok</th>
                            {!isMobile && <th style={{ ...thStyle, textAlign: "right" }}>Kapsam</th>}
                            {!isMobile && <th style={{ ...thStyle, textAlign: "right" }}>Son Tarih</th>}
                            {!isMobile && <th style={{ ...thStyle, textAlign: "center" }}>Sinyal</th>}
                            <th style={{ ...thStyle, width: isMobile ? "36px" : "100px" }}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map((product) => {
                            const risk = riskData.get(product.id);
                            const isCritical = product.promisable <= product.minStockLevel;
                            const hasAlert = productsWithAlerts.has(product.id);
                            const pendingRec = recMap.get(product.id)?.status === "suggested";
                            return (
                                <tr
                                    key={product.id}
                                    tabIndex={0}
                                    role="button"
                                    aria-label={`${product.name} detayını gör`}
                                    style={{ cursor: "pointer" }}
                                    onClick={() => setSelectedProductId(product.id)}
                                    onKeyDown={e => {
                                        if (e.key === "Enter" || e.key === " ") {
                                            e.preventDefault();
                                            setSelectedProductId(product.id);
                                        }
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.querySelectorAll("td").forEach(td => (td.style.background = "var(--bg-secondary)"));
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.querySelectorAll("td").forEach(td => (td.style.background = "transparent"));
                                    }}
                                >
                                    <td style={{ ...tdStyle, color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontSize: "12px" }}>
                                        {product.sku}
                                    </td>
                                    <td style={{ ...tdStyle, fontWeight: 500, maxWidth: "220px", overflow: "hidden", textOverflow: "ellipsis" }}>
                                        {product.name}
                                    </td>
                                    {!isMobile && (
                                        <td style={{ ...tdStyle, color: "var(--text-secondary)" }}>
                                            {product.category}
                                        </td>
                                    )}
                                    <td style={{ ...tdStyle, textAlign: "right" }}>
                                        <div style={{
                                            display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "6px",
                                        }}>
                                            {isMobile && isCritical && (
                                                <span style={{
                                                    fontSize: "8px", fontWeight: 700, padding: "1px 4px", borderRadius: "3px",
                                                    background: "var(--danger-bg)", color: "var(--danger-text)",
                                                    border: "0.5px solid var(--danger-border)",
                                                    textTransform: "uppercase", letterSpacing: "0.04em", flexShrink: 0,
                                                }}>!</span>
                                            )}
                                            <span style={{
                                                fontSize: isMobile ? "13px" : "14px", fontWeight: 700, lineHeight: 1.2,
                                                color: isCritical ? "var(--danger-text)" : "var(--success-text)",
                                            }}>
                                                {formatNumber(product.on_hand)} elde
                                            </span>
                                        </div>
                                        <div style={{ fontSize: "11px", color: "var(--text-tertiary)", fontWeight: 400, marginTop: "1px" }}>
                                            {(product.reserved > 0 || product.quoted > 0) ? (
                                                <span style={{ color: product.promisable <= 0 ? "var(--danger-text)" : "var(--warning-text)" }}>
                                                    {formatNumber(product.promisable)} verilebilir
                                                    {product.reserved > 0 && <>{" · "}{formatNumber(product.reserved)} rez.</>}
                                                    {product.quoted > 0 && <>{" · "}{formatNumber(product.quoted)} teklifte</>}
                                                </span>
                                            ) : (
                                                <span>{formatNumber(product.promisable)} verilebilir</span>
                                            )}
                                            {product.incoming > 0 && (
                                                <span style={{ color: "var(--success)" }}>{" · "}+{formatNumber(product.incoming)} bekleniyor</span>
                                            )}
                                            {" · "}min {formatNumber(product.minStockLevel)}
                                        </div>
                                    </td>
                                    {!isMobile && (
                                        <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600, color: coverageDaysColor(risk?.coverageDays ?? null) }}>
                                            {risk?.coverageDays != null ? `${risk.coverageDays}g` : <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>—</span>}
                                        </td>
                                    )}
                                    {!isMobile && (() => {
                                        const dl = product.orderDeadline ?? null;
                                        if (!dl) return (
                                            <td style={{ ...tdStyle, textAlign: "right", color: "var(--text-tertiary)" }}>—</td>
                                        );
                                        const daysLeft = dateDaysFromToday(dl);
                                        const color = daysLeft <= 0 ? "var(--danger-text)"
                                            : daysLeft <= 7  ? "var(--danger-text)"
                                            : daysLeft <= 14 ? "var(--warning-text)"
                                            : "var(--success-text)";
                                        const label = daysLeft < 0
                                            ? "Geçti"
                                            : new Date(dl).toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
                                        return (
                                            <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600, color, whiteSpace: "nowrap" }}>
                                                {label}
                                            </td>
                                        );
                                    })()}
                                    {!isMobile && (
                                        <td style={{ ...tdStyle, textAlign: "center" }}>
                                            {product.forecasted < 0 ? (
                                                <span style={{
                                                    fontSize: "9px", fontWeight: 700, padding: "2px 6px", borderRadius: "3px",
                                                    background: "var(--danger-bg)", color: "var(--danger-text)",
                                                    border: "0.5px solid var(--danger-border)",
                                                    textTransform: "uppercase", letterSpacing: "0.04em",
                                                }}>ÖNGÖRÜLEN KRİTİK</span>
                                            ) : product.promisable <= 0 ? (
                                                <span style={{
                                                    fontSize: "9px", fontWeight: 700, padding: "2px 6px", borderRadius: "3px",
                                                    background: "var(--danger-bg)", color: "var(--danger-text)",
                                                    border: "0.5px solid var(--danger-border)",
                                                    textTransform: "uppercase", letterSpacing: "0.04em",
                                                }}>TEKLİF DOLU</span>
                                            ) : isCritical ? (
                                                <span style={{
                                                    fontSize: "9px", fontWeight: 700, padding: "2px 6px", borderRadius: "3px",
                                                    background: "var(--danger-bg)", color: "var(--danger-text)",
                                                    border: "0.5px solid var(--danger-border)",
                                                    textTransform: "uppercase", letterSpacing: "0.04em",
                                                }}>KRİTİK</span>
                                            ) : risk ? (
                                                <span style={{
                                                    fontSize: "9px", fontWeight: 700, padding: "2px 6px", borderRadius: "3px",
                                                    background: "var(--warning-bg)", color: "var(--warning-text)",
                                                    border: "0.5px solid var(--warning-border)",
                                                    textTransform: "uppercase", letterSpacing: "0.04em",
                                                }}>Risk</span>
                                            ) : hasAlert ? (
                                                <span style={{
                                                    fontSize: "9px", fontWeight: 700, padding: "2px 6px", borderRadius: "3px",
                                                    background: "var(--warning-bg)", color: "var(--warning-text)",
                                                    border: "0.5px solid var(--warning-border)",
                                                    textTransform: "uppercase", letterSpacing: "0.04em",
                                                }}>Uyarı</span>
                                            ) : pendingRec ? (
                                                <span style={{
                                                    fontSize: "9px", fontWeight: 700, padding: "2px 6px", borderRadius: "3px",
                                                    background: "var(--accent-bg)", color: "var(--accent-text)",
                                                    border: "0.5px solid var(--accent-border)",
                                                    textTransform: "uppercase", letterSpacing: "0.04em",
                                                }}>Öneri</span>
                                            ) : (
                                                <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>—</span>
                                            )}
                                        </td>
                                    )}
                                    <td
                                        style={{ ...tdStyle, textAlign: "right", paddingRight: "12px" }}
                                        onClick={e => e.stopPropagation()}
                                    >
                                        {confirmDeleteId === product.id ? (
                                            <span style={{ display: "flex", alignItems: "center", gap: "6px", justifyContent: "flex-end" }}>
                                                <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>Emin misin?</span>
                                                <button
                                                    disabled={deletingId === product.id}
                                                    onClick={() => handleDelete(product.id)}
                                                    style={{
                                                        fontSize: "11px",
                                                        padding: "2px 8px",
                                                        border: "0.5px solid var(--danger-border)",
                                                        borderRadius: "4px",
                                                        background: "var(--danger-bg)",
                                                        color: "var(--danger-text)",
                                                        cursor: "pointer",
                                                    }}
                                                >
                                                    {deletingId === product.id ? "…" : "Evet"}
                                                </button>
                                                <button
                                                    onClick={() => setConfirmDeleteId(null)}
                                                    style={{
                                                        fontSize: "11px",
                                                        padding: "2px 8px",
                                                        border: "0.5px solid var(--border-secondary)",
                                                        borderRadius: "4px",
                                                        background: "transparent",
                                                        color: "var(--text-secondary)",
                                                        cursor: "pointer",
                                                    }}
                                                >
                                                    Hayır
                                                </button>
                                            </span>
                                        ) : (
                                            <button
                                                onClick={() => !isDemo && setConfirmDeleteId(product.id)}
                                                disabled={isDemo}
                                                title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}
                                                style={{
                                                    fontSize: "11px",
                                                    padding: "2px 8px",
                                                    border: "0.5px solid var(--border-secondary)",
                                                    borderRadius: "4px",
                                                    background: "transparent",
                                                    color: "var(--text-tertiary)",
                                                    cursor: isDemo ? "not-allowed" : "pointer",
                                                    opacity: isDemo ? 0.5 : 1,
                                                }}
                                                onMouseEnter={e => {
                                                    if (isDemo) return;
                                                    e.currentTarget.style.borderColor = "var(--danger-border)";
                                                    e.currentTarget.style.color = "var(--danger-text)";
                                                }}
                                                onMouseLeave={e => {
                                                    if (isDemo) return;
                                                    e.currentTarget.style.borderColor = "var(--border-secondary)";
                                                    e.currentTarget.style.color = "var(--text-tertiary)";
                                                }}
                                            >
                                                Sil
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>

                {filtered.length === 0 && (
                    <div style={{
                        padding: "40px 16px",
                        textAlign: "center",
                        color: "var(--text-tertiary)",
                        fontSize: "13px",
                    }}>
                        <div style={{ fontWeight: 500, color: "var(--text-secondary)", marginBottom: "4px" }}>
                            Ürün bulunamadı
                        </div>
                        <div style={{ fontSize: "12px", marginBottom: (search || alertFilter !== "tumu") ? "12px" : "0" }}>
                            {search
                                ? `"${search}" aramasıyla eşleşen ürün yok`
                                : alertFilter === "riskli" ? "Şu an riskli ürün yok"
                                : alertFilter === "uyarili" ? "Aktif uyarısı olan ürün yok"
                                : alertFilter === "oneri" ? "Bekleyen önerisi olan ürün yok"
                                : selectedCategories.length > 0 ? `Seçili kategorilerde ürün yok` : "Ürün bulunamadı"}
                        </div>
                        {(search || alertFilter !== "tumu") && (
                            <button
                                onClick={() => { setSearch(""); setAlertFilter("tumu"); }}
                                style={{
                                    fontSize: "12px",
                                    padding: "4px 12px",
                                    border: "0.5px solid var(--border-secondary)",
                                    borderRadius: "5px",
                                    background: "transparent",
                                    color: "var(--text-secondary)",
                                    cursor: "pointer",
                                }}
                            >
                                Filtreleri temizle
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Product Drawer */}
            {(() => {
                const product = selectedProductId ? mockProducts.find(p => p.id === selectedProductId) : undefined;
                const risk = selectedProductId ? riskData.get(selectedProductId) : undefined;
                const drawerRec = selectedProductId ? recMap.get(selectedProductId) : undefined;

                const alertSeverityColor = (sev: string) =>
                    sev === "critical" ? "var(--danger-text)" : sev === "warning" ? "var(--warning-text)" : "var(--accent-text)";
                const alertSeverityBg = (sev: string) =>
                    sev === "critical" ? "var(--danger-bg)" : sev === "warning" ? "var(--warning-bg)" : "var(--accent-bg)";
                const alertSeverityBorder = (sev: string) =>
                    sev === "critical" ? "var(--danger-border)" : sev === "warning" ? "var(--warning-border)" : "var(--accent-border)";
                const alertSeverityLabel = (sev: string) =>
                    sev === "critical" ? "KRİTİK" : sev === "warning" ? "UYARI" : "BİLGİ";

                const sectionLabel = (text: string) => (
                    <div style={{
                        fontSize: "10px", fontWeight: 700, color: "var(--text-tertiary)",
                        textTransform: "uppercase", letterSpacing: "0.06em",
                        marginBottom: "10px",
                        paddingBottom: "6px",
                        borderBottom: "0.5px solid var(--border-tertiary)",
                    }}>
                        {text}
                    </div>
                );

                const handleDrawerEdit = () => {
                    if (!product) return;
                    setDrawerEditForm({
                        name: product.name,
                        category: product.category ?? "",
                        subCategory: product.subCategory ?? "",
                        productFamily: product.productFamily ?? "",
                        productType: product.productType,
                        sectorCompatibility: product.sectorCompatibility ?? "",
                        industries: product.industries ?? "",
                        useCases: product.useCases ?? "",
                        materialQuality: product.materialQuality ?? "",
                        originCountry: product.originCountry ?? "",
                        productionSite: product.productionSite ?? "",
                        standards: product.standards ?? "",
                        certifications: product.certifications ?? "",
                        unit: product.unit,
                        warehouse: product.warehouse ?? "",
                        preferredVendor: product.preferredVendor ?? "",
                        leadTimeDays: product.leadTimeDays?.toString() ?? "",
                        weightKg: product.weightKg?.toString() ?? "",
                        price: product.price?.toString() ?? "",
                        currency: product.currency ?? "USD",
                        costPrice: product.costPrice?.toString() ?? "",
                        productNotes: product.productNotes ?? "",
                    });
                    setDrawerEditMode(true);
                };

                const handleDrawerSave = async () => {
                    if (!drawerEditForm || !product) return;
                    setDrawerSaving(true);
                    try {
                        const res = await fetch(`/api/products/${product.id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                name: drawerEditForm.name || undefined,
                                category: drawerEditForm.category || undefined,
                                sub_category: drawerEditForm.subCategory || undefined,
                                product_family: drawerEditForm.productFamily || undefined,
                                product_type: drawerEditForm.productType,
                                sector_compatibility: drawerEditForm.sectorCompatibility || undefined,
                                industries: drawerEditForm.industries || undefined,
                                use_cases: drawerEditForm.useCases || undefined,
                                material_quality: drawerEditForm.materialQuality || undefined,
                                origin_country: drawerEditForm.originCountry || undefined,
                                production_site: drawerEditForm.productionSite || undefined,
                                standards: drawerEditForm.standards || undefined,
                                certifications: drawerEditForm.certifications || undefined,
                                unit: drawerEditForm.unit || undefined,
                                warehouse: drawerEditForm.warehouse || undefined,
                                preferred_vendor: drawerEditForm.preferredVendor || undefined,
                                lead_time_days: drawerEditForm.leadTimeDays ? Number(drawerEditForm.leadTimeDays) : undefined,
                                weight_kg: drawerEditForm.weightKg ? Number(drawerEditForm.weightKg) : undefined,
                                price: drawerEditForm.price ? Number(drawerEditForm.price) : undefined,
                                currency: drawerEditForm.currency || undefined,
                                cost_price: drawerEditForm.costPrice ? Number(drawerEditForm.costPrice) : undefined,
                                product_notes: drawerEditForm.productNotes || undefined,
                            }),
                        });
                        if (!res.ok) throw new Error("PATCH başarısız");
                        await refetch();
                        setDrawerEditMode(false);
                        setDrawerEditForm(null);
                        toast({ type: "success", message: "Ürün bilgileri güncellendi." });
                    } catch {
                        toast({ type: "error", message: "Güncelleme başarısız." });
                    } finally {
                        setDrawerSaving(false);
                    }
                };


                return (
                    <AIDetailDrawer
                        open={selectedProductId !== null}
                        onClose={() => {
                            setSelectedProductId(null);
                            setRejectMode(false);
                            setRejectNote("");
                        }}
                        title={product?.name ?? "Ürün Detayı"}
                        showAiBadge={false}
                    >
                        {product ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

                                {/* ── Block 1: Ürün Kimliği ─────────────────────── */}
                                <div>
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px", paddingBottom: "6px", borderBottom: "0.5px solid var(--border-tertiary)" }}>
                                        <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                                            Ürün Kimliği
                                        </div>
                                        {!drawerEditMode && !isDemo && (
                                            <button onClick={handleDrawerEdit} style={{ fontSize: "11px", padding: "3px 8px", border: "0.5px solid var(--border-secondary)", borderRadius: "4px", background: "transparent", color: "var(--text-secondary)", cursor: "pointer" }}>
                                                Düzenle
                                            </button>
                                        )}
                                    </div>

                                    {/* Name + type badge */}
                                    {drawerEditMode && drawerEditForm ? (
                                        <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "4px" }}>
                                            <input
                                                value={drawerEditForm.name}
                                                onChange={e => setDrawerEditForm(f => f && ({ ...f, name: e.target.value }))}
                                                style={{ ...drawerInputStyle, fontSize: "14px", fontWeight: 600 }}
                                                placeholder="Ürün adı"
                                            />
                                            <select
                                                value={drawerEditForm.productType}
                                                onChange={e => setDrawerEditForm(f => f && ({ ...f, productType: e.target.value as "raw_material" | "manufactured" | "commercial" }))}
                                                style={drawerInputStyle}
                                            >
                                                <option value="manufactured">İmalat</option>
                                                <option value="commercial">Ticari</option>
                                                <option value="raw_material">Hammadde</option>
                                            </select>
                                        </div>
                                    ) : (
                                        <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", marginBottom: "4px" }}>
                                            <div style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.3 }}>
                                                {product.name}
                                            </div>
                                            <span style={{
                                                fontSize: "10px", fontWeight: 600, padding: "2px 7px",
                                                borderRadius: "4px", flexShrink: 0, marginTop: "2px",
                                                background: product.productType === "manufactured" ? "var(--accent-bg)" : product.productType === "commercial" ? "var(--success-bg)" : "var(--bg-tertiary)",
                                                color: product.productType === "manufactured" ? "var(--accent-text)" : product.productType === "commercial" ? "var(--success-text)" : "var(--text-secondary)",
                                                border: `0.5px solid ${product.productType === "manufactured" ? "var(--accent-border)" : product.productType === "commercial" ? "var(--success-border)" : "var(--border-secondary)"}`,
                                            }}>
                                                {product.productType === "manufactured" ? "İmalat" : product.productType === "commercial" ? "Ticari" : "Hammadde"}
                                            </span>
                                        </div>
                                    )}

                                    {/* SKU */}
                                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-tertiary)", marginBottom: "12px" }}>
                                        {product.sku}
                                    </div>

                                    {/* Identity fields */}
                                    {drawerEditMode && drawerEditForm ? (
                                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                                            {/* Kategori */}
                                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                <span style={{ fontSize: "11px", color: "var(--text-tertiary)", minWidth: "100px", flexShrink: 0 }}>Kategori</span>
                                                <div style={{ flex: 1 }}>
                                                    <input type="text" list="edit-categories-list" value={drawerEditForm.category} onChange={e => setDrawerEditForm(f => f && ({ ...f, category: e.target.value }))} style={drawerInputStyle} placeholder="Kategori..." />
                                                    <datalist id="edit-categories-list">{categories.slice(1).map(c => <option key={c} value={c} />)}</datalist>
                                                </div>
                                            </div>
                                            {/* Alt Kategori */}
                                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                <span style={{ fontSize: "11px", color: "var(--text-tertiary)", minWidth: "100px", flexShrink: 0 }}>Alt Kategori</span>
                                                <input value={drawerEditForm.subCategory} onChange={e => setDrawerEditForm(f => f && ({ ...f, subCategory: e.target.value }))} style={{ ...drawerInputStyle, flex: 1 }} placeholder="Alt kategori..." />
                                            </div>
                                            {/* Ürün Ailesi */}
                                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                <span style={{ fontSize: "11px", color: "var(--text-tertiary)", minWidth: "100px", flexShrink: 0 }}>Ürün Ailesi</span>
                                                <input value={drawerEditForm.productFamily} onChange={e => setDrawerEditForm(f => f && ({ ...f, productFamily: e.target.value }))} style={{ ...drawerInputStyle, flex: 1 }} placeholder="Ürün ailesi..." />
                                            </div>
                                            {/* Sektör Uygunluğu */}
                                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                <span style={{ fontSize: "11px", color: "var(--text-tertiary)", minWidth: "100px", flexShrink: 0 }}>Sektör Uygunluğu</span>
                                                <input value={drawerEditForm.sectorCompatibility} onChange={e => setDrawerEditForm(f => f && ({ ...f, sectorCompatibility: e.target.value }))} style={{ ...drawerInputStyle, flex: 1 }} placeholder="Oil & Gas, Petrokimya..." />
                                            </div>
                                            {/* Sektörler */}
                                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                <span style={{ fontSize: "11px", color: "var(--text-tertiary)", minWidth: "100px", flexShrink: 0 }}>Sektörler</span>
                                                <input value={drawerEditForm.industries} onChange={e => setDrawerEditForm(f => f && ({ ...f, industries: e.target.value }))} style={{ ...drawerInputStyle, flex: 1 }} placeholder="Sektörler..." />
                                            </div>
                                            {/* Kullanım */}
                                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                <span style={{ fontSize: "11px", color: "var(--text-tertiary)", minWidth: "100px", flexShrink: 0 }}>Kullanım</span>
                                                <input value={drawerEditForm.useCases} onChange={e => setDrawerEditForm(f => f && ({ ...f, useCases: e.target.value }))} style={{ ...drawerInputStyle, flex: 1 }} placeholder="Kullanım alanları..." />
                                            </div>
                                            {/* Malzeme */}
                                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                <span style={{ fontSize: "11px", color: "var(--text-tertiary)", minWidth: "100px", flexShrink: 0 }}>Malzeme</span>
                                                <input value={drawerEditForm.materialQuality} onChange={e => setDrawerEditForm(f => f && ({ ...f, materialQuality: e.target.value }))} style={{ ...drawerInputStyle, flex: 1 }} placeholder="316L Paslanmaz Çelik..." />
                                            </div>
                                            {/* Menşei */}
                                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                <span style={{ fontSize: "11px", color: "var(--text-tertiary)", minWidth: "100px", flexShrink: 0 }}>Menşei</span>
                                                <input value={drawerEditForm.originCountry} onChange={e => setDrawerEditForm(f => f && ({ ...f, originCountry: e.target.value }))} style={{ ...drawerInputStyle, flex: 1 }} placeholder="Türkiye..." />
                                            </div>
                                            {/* Üretim Tesisi */}
                                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                <span style={{ fontSize: "11px", color: "var(--text-tertiary)", minWidth: "100px", flexShrink: 0 }}>Üretim Tesisi</span>
                                                <input value={drawerEditForm.productionSite} onChange={e => setDrawerEditForm(f => f && ({ ...f, productionSite: e.target.value }))} style={{ ...drawerInputStyle, flex: 1 }} placeholder="Tesis adı..." />
                                            </div>
                                            {/* Standartlar */}
                                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                <span style={{ fontSize: "11px", color: "var(--text-tertiary)", minWidth: "100px", flexShrink: 0 }}>Standartlar</span>
                                                <input value={drawerEditForm.standards} onChange={e => setDrawerEditForm(f => f && ({ ...f, standards: e.target.value }))} style={{ ...drawerInputStyle, flex: 1 }} placeholder="EN, ISO..." />
                                            </div>
                                            {/* Sertifikalar */}
                                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                <span style={{ fontSize: "11px", color: "var(--text-tertiary)", minWidth: "100px", flexShrink: 0 }}>Sertifikalar</span>
                                                <input value={drawerEditForm.certifications} onChange={e => setDrawerEditForm(f => f && ({ ...f, certifications: e.target.value }))} style={{ ...drawerInputStyle, flex: 1 }} placeholder="CE, API..." />
                                            </div>
                                            {/* Birim */}
                                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                <span style={{ fontSize: "11px", color: "var(--text-tertiary)", minWidth: "100px", flexShrink: 0 }}>Birim</span>
                                                <select value={drawerEditForm.unit} onChange={e => setDrawerEditForm(f => f && ({ ...f, unit: e.target.value }))} style={{ ...drawerInputStyle, flex: 1 }}>
                                                    {["adet", "kg", "m", "litre", "takım"].map(u => <option key={u}>{u}</option>)}
                                                </select>
                                            </div>
                                            {/* Depo */}
                                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                <span style={{ fontSize: "11px", color: "var(--text-tertiary)", minWidth: "100px", flexShrink: 0 }}>Depo</span>
                                                <input value={drawerEditForm.warehouse} onChange={e => setDrawerEditForm(f => f && ({ ...f, warehouse: e.target.value }))} style={{ ...drawerInputStyle, flex: 1 }} placeholder="Depo adı..." />
                                            </div>
                                            {/* Tedarikçi */}
                                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                <span style={{ fontSize: "11px", color: "var(--text-tertiary)", minWidth: "100px", flexShrink: 0 }}>Tedarikçi</span>
                                                <input value={drawerEditForm.preferredVendor} onChange={e => setDrawerEditForm(f => f && ({ ...f, preferredVendor: e.target.value }))} style={{ ...drawerInputStyle, flex: 1 }} placeholder="Tedarikçi adı..." />
                                            </div>
                                            {/* Tedarik Süresi */}
                                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                <span style={{ fontSize: "11px", color: "var(--text-tertiary)", minWidth: "100px", flexShrink: 0 }}>Tedarik (gün)</span>
                                                <input type="number" value={drawerEditForm.leadTimeDays} onChange={e => setDrawerEditForm(f => f && ({ ...f, leadTimeDays: e.target.value }))} style={{ ...drawerInputStyle, flex: 1 }} placeholder="0" />
                                            </div>
                                            {/* Ağırlık */}
                                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                <span style={{ fontSize: "11px", color: "var(--text-tertiary)", minWidth: "100px", flexShrink: 0 }}>Ağırlık (kg)</span>
                                                <input type="number" value={drawerEditForm.weightKg} onChange={e => setDrawerEditForm(f => f && ({ ...f, weightKg: e.target.value }))} style={{ ...drawerInputStyle, flex: 1 }} placeholder="0" />
                                            </div>
                                            {/* Fiyatlar */}
                                            <div style={{ display: "flex", gap: "6px", marginTop: "4px" }}>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginBottom: "3px" }}>Satış Fiyatı</div>
                                                    <input type="number" value={drawerEditForm.price} onChange={e => setDrawerEditForm(f => f && ({ ...f, price: e.target.value }))} style={drawerInputStyle} placeholder="0" />
                                                </div>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginBottom: "3px" }}>Maliyet</div>
                                                    <input type="number" value={drawerEditForm.costPrice} onChange={e => setDrawerEditForm(f => f && ({ ...f, costPrice: e.target.value }))} style={drawerInputStyle} placeholder="0" />
                                                </div>
                                                <div style={{ width: "70px" }}>
                                                    <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginBottom: "3px" }}>Para Birimi</div>
                                                    <select value={drawerEditForm.currency} onChange={e => setDrawerEditForm(f => f && ({ ...f, currency: e.target.value }))} style={drawerInputStyle}>
                                                        <option>USD</option><option>TRY</option><option>EUR</option>
                                                    </select>
                                                </div>
                                            </div>
                                            {/* Notlar */}
                                            <div>
                                                <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginBottom: "3px" }}>Notlar</div>
                                                <textarea
                                                    value={drawerEditForm.productNotes}
                                                    onChange={e => setDrawerEditForm(f => f && ({ ...f, productNotes: e.target.value }))}
                                                    style={{ ...drawerInputStyle, minHeight: "60px", resize: "vertical" }}
                                                    placeholder="Ürün notları..."
                                                />
                                            </div>
                                            {/* İptal / Kaydet */}
                                            <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
                                                <button
                                                    onClick={() => { setDrawerEditMode(false); setDrawerEditForm(null); }}
                                                    style={{ flex: 1, fontSize: "12px", padding: "6px", border: "0.5px solid var(--border-secondary)", borderRadius: "5px", background: "transparent", color: "var(--text-secondary)", cursor: "pointer" }}
                                                >
                                                    İptal
                                                </button>
                                                <button
                                                    onClick={handleDrawerSave}
                                                    disabled={drawerSaving}
                                                    style={{ flex: 2, fontSize: "12px", padding: "6px", border: "0.5px solid var(--accent-border)", borderRadius: "5px", background: "var(--accent-bg)", color: "var(--accent-text)", cursor: drawerSaving ? "not-allowed" : "pointer", opacity: drawerSaving ? 0.6 : 1 }}
                                                >
                                                    {drawerSaving ? "Kaydediliyor…" : "Kaydet"}
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                                                <IdField label="Kategori" value={[product.category, product.subCategory].filter(Boolean).join(" / ")} />
                                                <IdField label="Ürün Ailesi" value={product.productFamily} />
                                                <IdField label="Sektör Uygunluğu" value={product.sectorCompatibility} />
                                                <IdField label="Sektörler" value={product.industries} />
                                                <IdField label="Kullanım" value={product.useCases} />
                                                <IdField label="Malzeme" value={product.materialQuality} />
                                                <IdField label="Menşei" value={product.originCountry} />
                                                <IdField label="Üretim Tesisi" value={product.productionSite} />
                                                <IdField label="Standartlar" value={product.standards} />
                                                <IdField label="Sertifikalar" value={product.certifications} />
                                                <IdField label="Birim / Depo" value={[product.unit, product.warehouse].filter(Boolean).join(" · ")} />
                                                <IdField
                                                    label="Tedarikçi"
                                                    value={[product.preferredVendor, product.leadTimeDays ? `${product.leadTimeDays} gün tedarik` : null].filter(Boolean).join(" · ")}
                                                />
                                                {product.weightKg && <IdField label="Ağırlık" value={`${product.weightKg} kg`} />}
                                            </div>

                                            {(product.price > 0 || product.costPrice) && (
                                                <div style={{ display: "flex", gap: "16px", marginTop: "10px" }}>
                                                    {product.price > 0 && (
                                                        <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                                                            <span style={{ color: "var(--text-tertiary)", marginRight: "4px" }}>Satış</span>
                                                            <span style={{ fontWeight: 600 }}>{formatCurrency(product.price, product.currency)}</span>
                                                        </div>
                                                    )}
                                                    {product.costPrice && (
                                                        <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                                                            <span style={{ color: "var(--text-tertiary)", marginRight: "4px" }}>Maliyet</span>
                                                            <span style={{ fontWeight: 600 }}>{formatCurrency(product.costPrice, product.currency)}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {product.productNotes && (
                                                <div style={{
                                                    marginTop: "10px", padding: "8px 10px",
                                                    background: "var(--bg-secondary)", borderRadius: "5px",
                                                    border: "0.5px solid var(--border-tertiary)",
                                                    fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.5,
                                                }}>
                                                    {product.productNotes}
                                                </div>
                                            )}
                                        </>
                                    )}

                                </div>

                                {/* ── Block 2: Operasyonel Durum ───────────────── */}
                                <div>
                                    {sectionLabel("Operasyonel Durum")}

                                    {/* 8-cell metric grid */}
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "6px", marginBottom: "12px" }}>
                                        {[
                                            { label: "Stokta", value: formatNumber(product.on_hand), color: "var(--text-primary)" },
                                            { label: "Rezerve", value: formatNumber(product.reserved), color: product.reserved > 0 ? "var(--warning-text)" : "var(--text-tertiary)" },
                                            { label: "Teklifte", value: formatNumber(product.quoted), color: product.quoted > 0 ? "var(--warning-text)" : "var(--text-tertiary)" },
                                            { label: "Satılabilir", value: formatNumber(product.available_now), color: "var(--text-secondary)" },
                                            { label: "Verilebilir", value: formatNumber(product.promisable), color: product.promisable <= 0 ? "var(--danger-text)" : product.promisable <= product.minStockLevel ? "var(--warning-text)" : "var(--success-text)" },
                                            { label: "Beklenen", value: formatNumber(product.incoming), color: product.incoming > 0 ? "var(--success-text)" : "var(--text-tertiary)" },
                                            { label: "Öngörülen", value: formatNumber(product.forecasted), color: product.forecasted < 0 ? "var(--danger-text)" : product.forecasted <= product.minStockLevel ? "var(--warning-text)" : "var(--success-text)" },
                                            { label: "Minimum", value: formatNumber(product.minStockLevel), color: "var(--text-tertiary)" },
                                        ].map(cell => (
                                            <div key={cell.label} style={{
                                                padding: "8px 6px", background: "var(--bg-secondary)",
                                                borderRadius: "6px", border: "0.5px solid var(--border-tertiary)",
                                                textAlign: "center",
                                            }}>
                                                <div style={{ fontSize: "16px", fontWeight: 700, color: cell.color, lineHeight: 1.2 }}>
                                                    {cell.value}
                                                </div>
                                                <div style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "2px" }}>
                                                    {cell.label}
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Coverage days */}
                                    {risk?.coverageDays != null && (
                                        <div style={{ display: "flex", alignItems: "baseline", gap: "6px", marginBottom: "8px" }}>
                                            <span style={{ fontSize: "24px", fontWeight: 700, color: coverageDaysColor(risk.coverageDays), lineHeight: 1 }}>
                                                {risk.coverageDays}
                                            </span>
                                            <span style={{ fontSize: "13px", color: "var(--text-tertiary)" }}>gün kapsam</span>
                                            {risk.leadTimeDays != null && (
                                                <span style={{ fontSize: "11px", color: "var(--text-tertiary)", marginLeft: "auto" }}>
                                                    Tedarik: {risk.leadTimeDays} gün
                                                </span>
                                            )}
                                        </div>
                                    )}

                                    {/* Daily usage */}
                                    {(product.dailyUsage || risk?.dailyUsage) && (
                                        <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "8px" }}>
                                            <span style={{ color: "var(--text-tertiary)" }}>Günlük kullanım: </span>
                                            <span style={{ fontWeight: 500 }}>{product.dailyUsage ?? risk?.dailyUsage} {product.unit}/gün</span>
                                        </div>
                                    )}

                                    {/* Risk reason block */}
                                    {risk && (
                                        <div style={{
                                            padding: "8px 10px", borderRadius: "5px",
                                            border: `0.5px solid ${risk.riskLevel === "coverage_risk" ? "var(--danger-border)" : "var(--warning-border)"}`,
                                            background: risk.riskLevel === "coverage_risk" ? "var(--danger-bg)" : "var(--warning-bg)",
                                            fontSize: "12px",
                                            color: risk.riskLevel === "coverage_risk" ? "var(--danger-text)" : "var(--warning-text)",
                                            lineHeight: 1.5,
                                        }}>
                                            {risk.displayReason || risk.deterministicReason}
                                        </div>
                                    )}

                                    {/* No usage data */}
                                    {!risk && !product.dailyUsage && (
                                        <div style={{ fontSize: "12px", color: "var(--text-tertiary)", fontStyle: "italic" }}>
                                            Günlük kullanım verisi yok — risk analizi hesaplanamıyor.
                                        </div>
                                    )}

                                    {/* Sipariş Son Tarihi */}
                                    {(product.stockoutDate || product.orderDeadline) && (() => {
                                        const dl = product.orderDeadline ?? null;
                                        const daysLeft = dl ? dateDaysFromToday(dl) : null;
                                        const borderColor = daysLeft === null ? "var(--border-tertiary)"
                                            : daysLeft < 0  ? "var(--danger-border)"
                                            : daysLeft <= 7  ? "var(--danger-border)"
                                            : daysLeft <= 14 ? "var(--warning-border)"
                                            : "var(--success-border)";
                                        const bgColor = daysLeft === null ? "var(--bg-secondary)"
                                            : daysLeft < 0  ? "var(--danger-bg)"
                                            : daysLeft <= 7  ? "var(--danger-bg)"
                                            : daysLeft <= 14 ? "var(--warning-bg)"
                                            : "var(--success-bg)";
                                        const textColor = daysLeft === null ? "var(--text-secondary)"
                                            : daysLeft < 0  ? "var(--danger-text)"
                                            : daysLeft <= 7  ? "var(--danger-text)"
                                            : daysLeft <= 14 ? "var(--warning-text)"
                                            : "var(--success-text)";
                                        return (
                                            <div style={{ marginTop: "8px", padding: "8px 10px", borderRadius: "5px", border: `0.5px solid ${borderColor}`, background: bgColor }}>
                                                <div style={{ fontSize: "10px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px" }}>
                                                    Sipariş Son Tarihi
                                                </div>
                                                {product.stockoutDate && (
                                                    <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "3px" }}>
                                                        <span style={{ color: "var(--text-tertiary)" }}>Stok tükeniyor: </span>
                                                        <span style={{ fontWeight: 500 }}>
                                                            {new Date(product.stockoutDate).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" })}
                                                        </span>
                                                    </div>
                                                )}
                                                {dl ? (
                                                    <div style={{ fontSize: "13px", fontWeight: 700, color: textColor }}>
                                                        {daysLeft! < 0
                                                            ? `Son tarih ${Math.abs(daysLeft!)} gün önce geçti`
                                                            : `En geç ${new Date(dl).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" })} — ${daysLeft} gün kaldı`}
                                                    </div>
                                                ) : (
                                                    <div style={{ fontSize: "11px", color: "var(--text-tertiary)", fontStyle: "italic" }}>
                                                        Tedarik süresi tanımlı değil — sipariş tarihi hesaplanamıyor.
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })()}
                                </div>

                                {/* ── Block 2b: Bekleyen Teslimatlar ───────────── */}
                                <div>
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                                        <div style={{ fontSize: "11px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                                            Bekleyen Teslimatlar
                                        </div>
                                        <button
                                            onClick={() => setShowCommitmentForm(v => !v)}
                                            style={{
                                                fontSize: "11px", fontWeight: 600, color: "var(--accent-text)",
                                                background: "var(--accent-bg)", border: "0.5px solid var(--accent-border)",
                                                borderRadius: "4px", padding: "2px 8px", cursor: "pointer",
                                            }}
                                        >
                                            {showCommitmentForm ? "İptal" : "+ Ekle"}
                                        </button>
                                    </div>

                                    {/* Inline commit form */}
                                    {showCommitmentForm && (
                                        <div style={{
                                            padding: "10px", marginBottom: "8px",
                                            background: "var(--bg-secondary)", borderRadius: "6px",
                                            border: "0.5px solid var(--border-secondary)",
                                        }}>
                                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "8px" }}>
                                                <div>
                                                    <div style={{ fontSize: "10px", color: "var(--text-tertiary)", marginBottom: "3px" }}>Miktar *</div>
                                                    <input
                                                        type="number" min="1"
                                                        value={commitmentForm.quantity}
                                                        onChange={e => setCommitmentForm(f => ({ ...f, quantity: e.target.value }))}
                                                        placeholder="0"
                                                        style={{
                                                            width: "100%", padding: "5px 8px", fontSize: "13px",
                                                            background: "var(--bg-primary)", color: "var(--text-primary)",
                                                            border: "0.5px solid var(--border-primary)", borderRadius: "4px",
                                                            boxSizing: "border-box",
                                                        }}
                                                    />
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: "10px", color: "var(--text-tertiary)", marginBottom: "3px" }}>Beklenen Tarih *</div>
                                                    <input
                                                        type="date"
                                                        value={commitmentForm.expected_date}
                                                        onChange={e => setCommitmentForm(f => ({ ...f, expected_date: e.target.value }))}
                                                        style={{
                                                            width: "100%", padding: "5px 8px", fontSize: "13px",
                                                            background: "var(--bg-primary)", color: "var(--text-primary)",
                                                            border: "0.5px solid var(--border-primary)", borderRadius: "4px",
                                                            boxSizing: "border-box",
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                            <div style={{ marginBottom: "8px" }}>
                                                <div style={{ fontSize: "10px", color: "var(--text-tertiary)", marginBottom: "3px" }}>Tedarikçi (opsiyonel)</div>
                                                <input
                                                    type="text"
                                                    value={commitmentForm.supplier_name}
                                                    onChange={e => setCommitmentForm(f => ({ ...f, supplier_name: e.target.value }))}
                                                    placeholder="Tedarikçi adı"
                                                    style={{
                                                        width: "100%", padding: "5px 8px", fontSize: "13px",
                                                        background: "var(--bg-primary)", color: "var(--text-primary)",
                                                        border: "0.5px solid var(--border-primary)", borderRadius: "4px",
                                                        boxSizing: "border-box",
                                                    }}
                                                />
                                            </div>
                                            <button
                                                disabled={commitmentSubmitting || !commitmentForm.quantity || !commitmentForm.expected_date}
                                                onClick={async () => {
                                                    if (!selectedProductId || isDemo) return;
                                                    setCommitmentSubmitting(true);
                                                    try {
                                                        const res = await fetch("/api/purchase-commitments", {
                                                            method: "POST",
                                                            headers: { "Content-Type": "application/json" },
                                                            body: JSON.stringify({
                                                                product_id: selectedProductId,
                                                                quantity: parseInt(commitmentForm.quantity),
                                                                expected_date: commitmentForm.expected_date,
                                                                supplier_name: commitmentForm.supplier_name || undefined,
                                                            }),
                                                        });
                                                        if (res.ok) {
                                                            window.location.reload();
                                                        } else {
                                                            const err = await res.json().catch(() => ({}));
                                                            toast({ type: "error", message: (err as { error?: string }).error ?? "Teslimat kaydedilemedi." });
                                                        }
                                                    } catch { toast({ type: "error", message: "Bağlantı hatası." }); }
                                                    finally { setCommitmentSubmitting(false); }
                                                }}
                                                style={{
                                                    fontSize: "12px", fontWeight: 600, padding: "5px 12px",
                                                    background: "var(--accent-bg)", color: "var(--accent-text)",
                                                    border: "0.5px solid var(--accent-border)", borderRadius: "4px",
                                                    cursor: commitmentSubmitting ? "not-allowed" : "pointer",
                                                    opacity: commitmentSubmitting ? 0.6 : 1,
                                                }}
                                            >
                                                {commitmentSubmitting ? "Kaydediliyor..." : "Kaydet"}
                                            </button>
                                        </div>
                                    )}

                                    {/* Commitment list */}
                                    {commitments.length === 0 ? (
                                        <div style={{ fontSize: "12px", color: "var(--text-tertiary)", fontStyle: "italic", padding: "6px 0" }}>
                                            Bekleyen teslimat yok
                                        </div>
                                    ) : (
                                        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                                            {commitments.map(c => (
                                                <div key={c.id} style={{
                                                    display: "flex", alignItems: "center", justifyContent: "space-between",
                                                    padding: "6px 8px", background: "var(--bg-secondary)",
                                                    borderRadius: "5px", border: "0.5px solid var(--border-tertiary)",
                                                    fontSize: "12px",
                                                }}>
                                                    <span style={{ color: "var(--text-secondary)" }}>
                                                        <span style={{ fontWeight: 600, color: "var(--success-text)" }}>{formatNumber(c.quantity)} {product.unit}</span>
                                                        {" · "}
                                                        {new Date(c.expected_date).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}
                                                        {c.supplier_name && <span style={{ color: "var(--text-tertiary)" }}>{" · "}{c.supplier_name}</span>}
                                                    </span>
                                                    <div style={{ display: "flex", gap: "4px" }}>
                                                        <button
                                                            disabled={isDemo || receivingId === c.id}
                                                            onClick={async () => {
                                                                if (isDemo || receivingId) return;
                                                                setReceivingId(c.id);
                                                                try {
                                                                    const res = await fetch(`/api/purchase-commitments/${c.id}`, {
                                                                        method: "PATCH",
                                                                        headers: { "Content-Type": "application/json" },
                                                                        body: JSON.stringify({ action: "receive" }),
                                                                    });
                                                                    if (res.ok) {
                                                                        window.location.reload();
                                                                    } else {
                                                                        const err = await res.json().catch(() => ({}));
                                                                        toast({ type: "error", message: (err as { error?: string }).error ?? "Teslimat alınamadı." });
                                                                    }
                                                                } finally { setReceivingId(null); }
                                                            }}
                                                            style={{
                                                                fontSize: "10px", fontWeight: 600, padding: "2px 6px",
                                                                background: "var(--success-bg)", color: "var(--success-text)",
                                                                border: "0.5px solid var(--success-border)", borderRadius: "3px",
                                                                cursor: (isDemo || receivingId === c.id) ? "not-allowed" : "pointer",
                                                                opacity: (isDemo || receivingId === c.id) ? 0.6 : 1,
                                                            }}
                                                        >{receivingId === c.id ? "..." : "Alındı"}</button>
                                                        <button
                                                            disabled={isDemo}
                                                            onClick={async () => {
                                                                if (isDemo) return;
                                                                try {
                                                                    const res = await fetch(`/api/purchase-commitments/${c.id}`, {
                                                                        method: "PATCH",
                                                                        headers: { "Content-Type": "application/json" },
                                                                        body: JSON.stringify({ action: "cancel" }),
                                                                    });
                                                                    if (res.ok) {
                                                                        window.location.reload();
                                                                    } else {
                                                                        const err = await res.json().catch(() => ({}));
                                                                        toast({ type: "error", message: (err as { error?: string }).error ?? "İptal edilemedi." });
                                                                    }
                                                                } catch { toast({ type: "error", message: "Bağlantı hatası." }); }
                                                            }}
                                                            style={{
                                                                fontSize: "10px", fontWeight: 600, padding: "2px 6px",
                                                                background: "var(--bg-tertiary)", color: "var(--text-tertiary)",
                                                                border: "0.5px solid var(--border-tertiary)", borderRadius: "3px",
                                                                cursor: isDemo ? "not-allowed" : "pointer",
                                                                opacity: isDemo ? 0.6 : 1,
                                                            }}
                                                        >İptal</button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* ── Block 2c: Aktif Teklifler ────────────────── */}
                                <div>
                                    <div style={{ fontSize: "11px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "8px" }}>
                                        Aktif Teklifler
                                    </div>

                                    {quotesLoading ? (
                                        <div style={{ fontSize: "12px", color: "var(--text-tertiary)", fontStyle: "italic", padding: "6px 0" }}>
                                            Yükleniyor...
                                        </div>
                                    ) : quotes.length === 0 ? (
                                        <div style={{ fontSize: "12px", color: "var(--text-tertiary)", fontStyle: "italic", padding: "6px 0" }}>
                                            Aktif teklif yok
                                        </div>
                                    ) : (
                                        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                                            {quotes.map((q, idx) => {
                                                const todayStr = new Date().toISOString().slice(0, 10);
                                                const isExpired = !!q.quoteValidUntil && q.quoteValidUntil < todayStr;
                                                const isOld = !isExpired && q.commercialStatus === "draft" &&
                                                    Date.now() - new Date(q.orderCreatedAt).getTime() > 7 * 86_400_000;
                                                const daysRemaining = q.quoteValidUntil
                                                    ? dateDaysFromToday(q.quoteValidUntil)
                                                    : null;
                                                return (
                                                    <a
                                                        key={`${q.orderId}-${idx}`}
                                                        href={`/dashboard/orders/${q.orderId}`}
                                                        style={{ textDecoration: "none" }}
                                                    >
                                                        <div style={{
                                                            padding: "7px 8px",
                                                            background: "var(--bg-secondary)",
                                                            borderRadius: "5px",
                                                            border: isExpired
                                                                ? "0.5px solid var(--danger-border)"
                                                                : isOld
                                                                    ? "0.5px solid var(--warning-border)"
                                                                    : "0.5px solid var(--border-tertiary)",
                                                        }}>
                                                            {/* Top row */}
                                                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "3px" }}>
                                                                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                                    <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)" }}>
                                                                        {q.orderNumber}
                                                                    </span>
                                                                    <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                                                                        · {q.customerName}
                                                                    </span>
                                                                </div>
                                                                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                                                    {isExpired && (
                                                                        <span style={{
                                                                            fontSize: "9px", fontWeight: 700, padding: "1px 4px",
                                                                            background: "var(--danger-bg)", color: "var(--danger-text)",
                                                                            border: "0.5px solid var(--danger-border)", borderRadius: "3px",
                                                                        }}>
                                                                            Süresi Doldu
                                                                        </span>
                                                                    )}
                                                                    {isOld && (
                                                                        <span style={{
                                                                            fontSize: "9px", fontWeight: 700, padding: "1px 4px",
                                                                            background: "var(--warning-bg)", color: "var(--warning-text)",
                                                                            border: "0.5px solid var(--warning-border)", borderRadius: "3px",
                                                                        }}>
                                                                            ⚠ Eski
                                                                        </span>
                                                                    )}
                                                                    <span style={{
                                                                        fontSize: "9px", fontWeight: 700, padding: "1px 4px", borderRadius: "3px",
                                                                        background: q.commercialStatus === "pending_approval"
                                                                            ? "var(--warning-bg)" : "var(--bg-tertiary)",
                                                                        color: q.commercialStatus === "pending_approval"
                                                                            ? "var(--warning-text)" : "var(--text-tertiary)",
                                                                        border: q.commercialStatus === "pending_approval"
                                                                            ? "0.5px solid var(--warning-border)" : "0.5px solid var(--border-tertiary)",
                                                                    }}>
                                                                        {q.commercialStatus === "pending_approval" ? "Onay Bekliyor" : "Taslak"}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                            {/* Bottom row */}
                                                            <div style={{ fontSize: "11px", color: "var(--text-tertiary)", display: "flex", gap: "4px", flexWrap: "wrap" }}>
                                                                <span style={{ fontWeight: 600, color: "var(--text-secondary)" }}>
                                                                    {formatNumber(q.quantity)} {product?.unit}
                                                                </span>
                                                                <span>×</span>
                                                                <span>{formatCurrency(q.unitPrice, q.currency)}</span>
                                                                <span>·</span>
                                                                <span>{formatRelativeTime(q.orderCreatedAt)}</span>
                                                                <span>·</span>
                                                                <span style={{ color: q.createdByEmail ? "var(--accent-text)" : "var(--text-tertiary)" }}>
                                                                    {q.createdByEmail ?? "—"}
                                                                </span>
                                                                {daysRemaining !== null && (
                                                                    <>
                                                                        <span>·</span>
                                                                        <span style={{
                                                                            color: isExpired
                                                                                ? "var(--danger-text)"
                                                                                : daysRemaining <= 3
                                                                                    ? "var(--warning-text)"
                                                                                    : "var(--text-tertiary)",
                                                                        }}>
                                                                            {isExpired
                                                                                ? `${Math.abs(daysRemaining)} gün geçti`
                                                                                : `${daysRemaining} gün kaldı`}
                                                                        </span>
                                                                    </>
                                                                )}
                                                            </div>
                                                            {/* Extend UI — shown for expired or ≤3 days remaining */}
                                                            {(isExpired || (daysRemaining !== null && daysRemaining <= 3)) && (
                                                                <div
                                                                    style={{ marginTop: "6px" }}
                                                                    onClick={(e) => e.preventDefault()}
                                                                >
                                                                    {extendingId !== q.orderId ? (
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.preventDefault();
                                                                                setExtendingId(q.orderId);
                                                                                setExtendShowCustom(false);
                                                                                setExtendCustomDate("");
                                                                            }}
                                                                            style={{
                                                                                fontSize: "11px", padding: "2px 8px",
                                                                                background: "transparent",
                                                                                border: "0.5px solid var(--border-secondary)",
                                                                                borderRadius: "4px", cursor: "pointer",
                                                                                color: "var(--text-secondary)",
                                                                            }}
                                                                        >
                                                                            Uzat →
                                                                        </button>
                                                                    ) : !extendShowCustom ? (
                                                                        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", alignItems: "center" }}>
                                                                            {[7, 14, 30].map(days => (
                                                                                <button
                                                                                    key={days}
                                                                                    disabled={extendLoading}
                                                                                    onClick={(e) => {
                                                                                        e.preventDefault();
                                                                                        const d = new Date(Date.now() + days * 86_400_000);
                                                                                        extendQuote(q.orderId, d.toISOString().slice(0, 10));
                                                                                    }}
                                                                                    style={{
                                                                                        fontSize: "11px", padding: "2px 8px",
                                                                                        background: "var(--accent-bg)",
                                                                                        border: "0.5px solid var(--accent-border)",
                                                                                        borderRadius: "4px", cursor: "pointer",
                                                                                        color: "var(--accent-text)",
                                                                                        opacity: extendLoading ? 0.5 : 1,
                                                                                    }}
                                                                                >
                                                                                    +{days} gün
                                                                                </button>
                                                                            ))}
                                                                            <button
                                                                                onClick={(e) => { e.preventDefault(); setExtendShowCustom(true); }}
                                                                                style={{
                                                                                    fontSize: "11px", padding: "2px 8px",
                                                                                    background: "transparent",
                                                                                    border: "0.5px solid var(--border-secondary)",
                                                                                    borderRadius: "4px", cursor: "pointer",
                                                                                    color: "var(--text-tertiary)",
                                                                                }}
                                                                            >
                                                                                Özel...
                                                                            </button>
                                                                            <button
                                                                                onClick={(e) => { e.preventDefault(); setExtendingId(null); }}
                                                                                style={{
                                                                                    fontSize: "11px", padding: "2px 4px",
                                                                                    background: "transparent", border: "none",
                                                                                    cursor: "pointer", color: "var(--text-tertiary)",
                                                                                }}
                                                                            >
                                                                                ✕
                                                                            </button>
                                                                        </div>
                                                                    ) : (
                                                                        <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                                                                            <input
                                                                                type="date"
                                                                                value={extendCustomDate}
                                                                                onChange={e => setExtendCustomDate(e.target.value)}
                                                                                min={new Date().toISOString().slice(0, 10)}
                                                                                style={{
                                                                                    fontSize: "11px", padding: "2px 6px",
                                                                                    border: "0.5px solid var(--border-secondary)",
                                                                                    borderRadius: "4px",
                                                                                    background: "var(--bg-primary)",
                                                                                    color: "var(--text-primary)",
                                                                                    outline: "none",
                                                                                }}
                                                                            />
                                                                            <button
                                                                                disabled={!extendCustomDate || extendLoading}
                                                                                onClick={(e) => { e.preventDefault(); extendQuote(q.orderId, extendCustomDate); }}
                                                                                style={{
                                                                                    fontSize: "11px", padding: "2px 8px",
                                                                                    background: "var(--accent-bg)",
                                                                                    border: "0.5px solid var(--accent-border)",
                                                                                    borderRadius: "4px",
                                                                                    cursor: extendCustomDate && !extendLoading ? "pointer" : "not-allowed",
                                                                                    color: "var(--accent-text)",
                                                                                    opacity: !extendCustomDate || extendLoading ? 0.5 : 1,
                                                                                }}
                                                                            >
                                                                                Kaydet
                                                                            </button>
                                                                            <button
                                                                                onClick={(e) => { e.preventDefault(); setExtendShowCustom(false); }}
                                                                                style={{
                                                                                    fontSize: "11px", padding: "2px 4px",
                                                                                    background: "transparent", border: "none",
                                                                                    cursor: "pointer", color: "var(--text-tertiary)",
                                                                                }}
                                                                            >
                                                                                ✕
                                                                            </button>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </a>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {quotes.length > 0 && (
                                        <div style={{
                                            marginTop: "6px", fontSize: "11px", color: "var(--text-tertiary)",
                                            display: "flex", gap: "8px",
                                        }}>
                                            <span>Toplam: <strong style={{ color: "var(--text-secondary)" }}>{formatNumber(quotesTotal)} {product?.unit} teklif</strong></span>
                                            {product && (
                                                <>
                                                    <span>·</span>
                                                    <span>Promisable: <strong style={{ color: product.promisable <= 0 ? "var(--danger-text)" : "var(--success-text)" }}>{formatNumber(product.promisable)} {product.unit}</strong></span>
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* ── Block 3: İlişkiler / Etki ────────────────── */}
                                <div>
                                    {sectionLabel("Uyarılar & Öneriler")}

                                    {/* AI risk analysis + recommendation + decision — single flow */}
                                    {(risk?.aiExplanation || risk?.aiRecommendation || drawerRec) && (
                                        <div style={{ marginBottom: "16px" }}>
                                            <div style={{
                                                display: "flex", alignItems: "center", gap: "6px",
                                                marginBottom: "8px",
                                            }}>
                                                <span style={{
                                                    background: "var(--accent-bg)", color: "var(--accent-text)",
                                                    padding: "1px 5px", borderRadius: "3px",
                                                    fontSize: "9px", fontWeight: 700, letterSpacing: "0.04em",
                                                }}>✦ AI</span>
                                            </div>
                                            {risk?.aiExplanation && (
                                                <div style={{
                                                    fontSize: "12px", color: "var(--text-secondary)",
                                                    lineHeight: 1.6, marginBottom: "10px",
                                                }}>
                                                    {risk.aiExplanation}
                                                </div>
                                            )}
                                            {risk?.aiRecommendation && (
                                                <div style={{
                                                    padding: "10px 12px", borderRadius: "5px",
                                                    background: "var(--accent-bg)",
                                                    border: "0.5px solid var(--accent-border)",
                                                    marginBottom: drawerRec ? "10px" : "0",
                                                }}>
                                                    <div style={{
                                                        fontSize: "10px", fontWeight: 700,
                                                        color: "var(--accent-text)",
                                                        textTransform: "uppercase", letterSpacing: "0.05em",
                                                        marginBottom: "4px",
                                                    }}>
                                                        Önerilen Adım
                                                    </div>
                                                    <div style={{
                                                        fontSize: "12px", color: "var(--accent-text)", lineHeight: 1.5,
                                                    }}>
                                                        {risk.aiRecommendation}
                                                    </div>
                                                </div>
                                            )}
                                            {drawerRec && (
                                                drawerRec.status === "suggested" ? (
                                                    rejectMode ? (
                                                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                                                            <input
                                                                type="text"
                                                                placeholder="Red nedeni (isteğe bağlı)"
                                                                value={rejectNote}
                                                                onChange={e => setRejectNote(e.target.value)}
                                                                style={{
                                                                    fontSize: "12px", padding: "6px 10px",
                                                                    border: "0.5px solid var(--border-secondary)",
                                                                    borderRadius: "6px",
                                                                    background: "var(--bg-tertiary)",
                                                                    color: "var(--text-primary)",
                                                                    width: "100%",
                                                                }}
                                                            />
                                                            <div style={{ display: "flex", gap: "6px" }}>
                                                                <Button variant="danger" disabled={isDemo} title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined} onClick={() => {
                                                                    handleReject(selectedProductId!, rejectNote || undefined);
                                                                    setRejectMode(false);
                                                                    setRejectNote("");
                                                                }}>Reddet</Button>
                                                                <Button variant="secondary" onClick={() => {
                                                                    setRejectMode(false);
                                                                    setRejectNote("");
                                                                }}>İptal</Button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div style={{ display: "flex", gap: "6px" }}>
                                                            <Button variant="primary" disabled={isDemo} title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined} onClick={() => handleAccept(selectedProductId!)}>Kabul Et</Button>
                                                            <Button variant="secondary" disabled={isDemo} title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined} onClick={() => setRejectMode(true)}>Reddet</Button>
                                                        </div>
                                                    )
                                                ) : (
                                                    <div style={{ fontSize: "12px" }}>
                                                        <span style={{
                                                            color: drawerRec.status === "accepted" ? "var(--success-text)" : "var(--danger-text)",
                                                            fontWeight: 500,
                                                        }}>
                                                            {drawerRec.status === "accepted" ? "Kabul edildi" : "Reddedildi"}
                                                        </span>
                                                        {drawerRec.decidedAt && (
                                                            <span style={{ color: "var(--text-tertiary)", marginLeft: "6px" }}>
                                                                · {new Date(drawerRec.decidedAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
                                                            </span>
                                                        )}
                                                    </div>
                                                )
                                            )}
                                        </div>
                                    )}

                                    {/* Active alerts */}
                                    <div>
                                        <div style={{
                                            fontSize: "10px", fontWeight: 600, color: "var(--text-tertiary)",
                                            textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "8px",
                                        }}>
                                            Aktif Uyarılar
                                        </div>
                                        {drawerAlertsLoading ? (
                                            <div style={{ fontSize: "12px", color: "var(--text-tertiary)", fontStyle: "italic" }}>
                                                Yükleniyor…
                                            </div>
                                        ) : drawerAlerts.length > 0 ? (
                                            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                                {drawerAlerts.map(alert => {
                                                    const ctx = getAlertContext(alert.type);
                                                    return (
                                                        <div key={alert.id} style={{
                                                            padding: "10px 12px", background: "var(--bg-secondary)",
                                                            borderRadius: "5px",
                                                            border: `0.5px solid ${alertSeverityBorder(alert.severity)}`,
                                                        }}>
                                                            <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", marginBottom: "6px" }}>
                                                                <span style={{
                                                                    fontSize: "9px", fontWeight: 700, padding: "2px 5px",
                                                                    borderRadius: "3px", flexShrink: 0, marginTop: "2px",
                                                                    background: alertSeverityBg(alert.severity),
                                                                    color: alertSeverityColor(alert.severity),
                                                                    border: `0.5px solid ${alertSeverityBorder(alert.severity)}`,
                                                                    textTransform: "uppercase", letterSpacing: "0.04em",
                                                                }}>
                                                                    {alertSeverityLabel(alert.severity)}
                                                                </span>
                                                                <div style={{
                                                                    fontSize: "12px", color: "var(--text-primary)",
                                                                    fontWeight: 600, lineHeight: 1.3,
                                                                }}>
                                                                    {alert.title}
                                                                </div>
                                                            </div>
                                                            {(ctx.neden || ctx.etki) ? (
                                                                <div style={{
                                                                    display: "flex", flexDirection: "column", gap: "3px",
                                                                    marginBottom: ctx.ctaHref ? "8px" : "0",
                                                                }}>
                                                                    {ctx.neden && (
                                                                        <div style={{ fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.4 }}>
                                                                            <span style={{ fontWeight: 600 }}>Neden:</span> {ctx.neden}
                                                                        </div>
                                                                    )}
                                                                    {ctx.etki && (
                                                                        <div style={{ fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.4 }}>
                                                                            <span style={{ fontWeight: 600 }}>Etki:</span> {ctx.etki}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            ) : alert.description ? (
                                                                <div style={{
                                                                    fontSize: "11px", color: "var(--text-secondary)",
                                                                    lineHeight: 1.4, marginBottom: ctx.ctaHref ? "6px" : "0",
                                                                }}>
                                                                    {alert.description}
                                                                </div>
                                                            ) : null}
                                                            {ctx.ctaHref && (
                                                                <a href={ctx.ctaHref} style={{
                                                                    fontSize: "11px", fontWeight: 600,
                                                                    color: alertSeverityColor(alert.severity),
                                                                    textDecoration: "none", display: "block",
                                                                    marginTop: "4px",
                                                                }}>
                                                                    {ctx.ctaLabel}
                                                                </a>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                                <a href="/dashboard/alerts" style={{
                                                    fontSize: "11px", color: "var(--accent-text)",
                                                    textDecoration: "none", fontWeight: 500, marginTop: "2px",
                                                }}>
                                                    Tüm uyarılar →
                                                </a>
                                            </div>
                                        ) : (
                                            <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>
                                                Bu ürün için açık uyarı yok.
                                            </div>
                                        )}
                                    </div>
                                </div>

                            </div>
                        ) : null}
                    </AIDetailDrawer>
                );
            })()}

            {/* Create Product Modal */}
            {createOpen && (
                <>
                    {/* Backdrop */}
                    <div
                        onClick={() => !createSubmitting && setCreateOpen(false)}
                        style={{
                            position: "fixed", inset: 0, zIndex: 100,
                            background: "rgba(0,0,0,0.55)",
                        }}
                    />
                    {/* Modal */}
                    <div style={{
                        position: "fixed", top: "50%", left: "50%",
                        transform: "translate(-50%, -50%)",
                        zIndex: 101,
                        background: "var(--bg-primary)",
                        border: "0.5px solid var(--border-primary)",
                        borderRadius: "8px",
                        width: isMobile ? "calc(100vw - 32px)" : "480px",
                        maxHeight: "90vh",
                        overflowY: "auto",
                        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
                    }}>
                        {/* Modal header */}
                        <div style={{
                            padding: "14px 16px",
                            borderBottom: "0.5px solid var(--border-tertiary)",
                            display: "flex", justifyContent: "space-between", alignItems: "center",
                        }}>
                            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
                                Yeni Ürün
                            </div>
                            <button
                                onClick={() => !createSubmitting && setCreateOpen(false)}
                                style={{
                                    background: "transparent", border: "none",
                                    color: "var(--text-tertiary)", cursor: "pointer",
                                    fontSize: "16px", padding: "2px 6px", borderRadius: "4px",
                                }}
                                onMouseEnter={e => e.currentTarget.style.color = "var(--text-primary)"}
                                onMouseLeave={e => e.currentTarget.style.color = "var(--text-tertiary)"}
                            >
                                ×
                            </button>
                        </div>

                        {/* Modal body */}
                        <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
                            {/* Ürün Adı */}
                            <FormField label="Ürün Adı" required>
                                <input
                                    style={modalInputStyle}
                                    value={createForm.name}
                                    onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))}
                                    placeholder="3 Parçalı Küresel Vana DN25"
                                    autoFocus
                                />
                            </FormField>

                            {/* SKU + Kategori */}
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                                <FormField label="SKU" required>
                                    <input
                                        style={modalInputStyle}
                                        value={createForm.sku}
                                        onChange={e => setCreateForm(f => ({ ...f, sku: e.target.value }))}
                                        placeholder="KV-3P-DN25"
                                    />
                                </FormField>
                                <FormField label="Kategori">
                                    <input
                                        type="text"
                                        list="product-categories-list"
                                        style={modalInputStyle}
                                        value={createForm.category}
                                        onChange={e => setCreateForm(f => ({ ...f, category: e.target.value }))}
                                        placeholder="Kategori seç veya yaz..."
                                    />
                                    <datalist id="product-categories-list">
                                        {categories.slice(1).map(c => <option key={c} value={c} />)}
                                    </datalist>
                                </FormField>
                            </div>

                            {/* Fiyat + Para Birimi + Birim */}
                            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: "10px" }}>
                                <FormField label="Birim Fiyat">
                                    <input
                                        style={modalInputStyle}
                                        type="number"
                                        min={0}
                                        step={0.01}
                                        value={createForm.price}
                                        onChange={e => setCreateForm(f => ({ ...f, price: parseFloat(e.target.value) || 0 }))}
                                    />
                                </FormField>
                                <FormField label="Para Birimi">
                                    <select
                                        style={modalInputStyle}
                                        value={createForm.currency}
                                        onChange={e => setCreateForm(f => ({ ...f, currency: e.target.value }))}
                                    >
                                        {["USD", "TRY", "EUR"].map(c => <option key={c}>{c}</option>)}
                                    </select>
                                </FormField>
                                <FormField label="Birim">
                                    <select
                                        style={modalInputStyle}
                                        value={createForm.unit}
                                        onChange={e => setCreateForm(f => ({ ...f, unit: e.target.value }))}
                                    >
                                        {["adet", "kg", "m", "litre", "takım"].map(u => <option key={u}>{u}</option>)}
                                    </select>
                                </FormField>
                            </div>

                            {/* Başlangıç Stoğu + Min. Stok */}
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                                <FormField label="Başlangıç Stoğu">
                                    <input
                                        style={modalInputStyle}
                                        type="number"
                                        min={0}
                                        value={createForm.on_hand}
                                        onChange={e => setCreateForm(f => ({ ...f, on_hand: parseInt(e.target.value) || 0 }))}
                                    />
                                </FormField>
                                <FormField label="Min. Stok Seviyesi">
                                    <input
                                        style={modalInputStyle}
                                        type="number"
                                        min={0}
                                        value={createForm.minStockLevel}
                                        onChange={e => setCreateForm(f => ({ ...f, minStockLevel: parseInt(e.target.value) || 0 }))}
                                    />
                                </FormField>
                            </div>

                            {/* Ürün Tipi + Depo */}
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                                <FormField label="Ürün Tipi">
                                    <select
                                        style={modalInputStyle}
                                        value={createForm.productType}
                                        onChange={e => {
                                            const pt = e.target.value as "raw_material" | "manufactured" | "commercial";
                                            setCreateForm(f => ({ ...f, productType: pt }));
                                        }}
                                    >
                                        <option value="manufactured">İmalat</option>
                                        <option value="commercial">Ticari</option>
                                        <option value="raw_material">Hammadde</option>
                                    </select>
                                </FormField>
                                <FormField label="Depo">
                                    <input
                                        style={modalInputStyle}
                                        value={createForm.warehouse}
                                        onChange={e => setCreateForm(f => ({ ...f, warehouse: e.target.value }))}
                                    />
                                </FormField>
                            </div>

                            {/* Kimlik Bilgileri — opsiyonel */}
                            <div style={{
                                borderTop: "0.5px solid var(--border-tertiary)",
                                paddingTop: "12px",
                                display: "flex",
                                flexDirection: "column",
                                gap: "10px",
                            }}>
                                <div style={{ fontSize: "10px", fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                    Kimlik Bilgileri <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(isteğe bağlı)</span>
                                </div>

                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                                    <FormField label="Malzeme Kalitesi">
                                        <input
                                            style={modalInputStyle}
                                            value={createForm.materialQuality}
                                            onChange={e => setCreateForm(f => ({ ...f, materialQuality: e.target.value }))}
                                            placeholder="CF8M, WCB, 316SS..."
                                        />
                                    </FormField>
                                    <FormField label="Menşei Ülke">
                                        <input
                                            style={modalInputStyle}
                                            value={createForm.originCountry}
                                            onChange={e => setCreateForm(f => ({ ...f, originCountry: e.target.value }))}
                                            placeholder="Türkiye, İtalya..."
                                        />
                                    </FormField>
                                </div>

                                <FormField label="Üretim Tesisi">
                                    <input
                                        style={modalInputStyle}
                                        value={createForm.productionSite}
                                        onChange={e => setCreateForm(f => ({ ...f, productionSite: e.target.value }))}
                                        placeholder="Tesis adı veya şehir"
                                    />
                                </FormField>

                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                                    <FormField label="Sektörler">
                                        <input
                                            style={modalInputStyle}
                                            value={createForm.industries}
                                            onChange={e => setCreateForm(f => ({ ...f, industries: e.target.value }))}
                                            placeholder="Petrokimya, Denizcilik..."
                                        />
                                    </FormField>
                                    <FormField label="Kullanım Alanları">
                                        <input
                                            style={modalInputStyle}
                                            value={createForm.useCases}
                                            onChange={e => setCreateForm(f => ({ ...f, useCases: e.target.value }))}
                                            placeholder="Akış kontrolü, izolasyon..."
                                        />
                                    </FormField>
                                </div>

                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                                    <FormField label="Standartlar">
                                        <input
                                            style={modalInputStyle}
                                            value={createForm.standards}
                                            onChange={e => setCreateForm(f => ({ ...f, standards: e.target.value }))}
                                            placeholder="DIN, ANSI, EN..."
                                        />
                                    </FormField>
                                    <FormField label="Sertifikalar">
                                        <input
                                            style={modalInputStyle}
                                            value={createForm.certifications}
                                            onChange={e => setCreateForm(f => ({ ...f, certifications: e.target.value }))}
                                            placeholder="ISO 9001, CE, ATEX..."
                                        />
                                    </FormField>
                                </div>

                                <FormField label="Ürün Notları">
                                    <textarea
                                        style={{ ...modalInputStyle, minHeight: "60px", resize: "vertical" }}
                                        value={createForm.productNotes}
                                        onChange={e => setCreateForm(f => ({ ...f, productNotes: e.target.value }))}
                                        placeholder="Özel kullanım notları, uyarılar..."
                                    />
                                </FormField>
                            </div>
                        </div>

                        {/* Modal footer */}
                        <div style={{
                            padding: "12px 16px",
                            borderTop: "0.5px solid var(--border-tertiary)",
                            display: "flex", justifyContent: "flex-end", gap: "8px",
                        }}>
                            <Button variant="secondary" onClick={() => setCreateOpen(false)} disabled={createSubmitting}>
                                İptal
                            </Button>
                            <Button
                                variant="primary"
                                loading={createSubmitting}
                                onClick={handleCreate}
                                disabled={isDemo || !createForm.name.trim() || !createForm.sku.trim() || createSubmitting}
                                title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}
                            >
                                {createSubmitting ? "Kaydediliyor…" : "Ürün Oluştur"}
                            </Button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
