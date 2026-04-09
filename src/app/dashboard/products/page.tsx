"use client";

import { useState, useEffect } from "react";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { useData } from "@/lib/data-context";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import AIDetailDrawer from "@/components/ai/AIDetailDrawer";
import { useIsDemo, DEMO_DISABLED_TOOLTIP, DEMO_BLOCK_TOAST } from "@/lib/demo-utils";

const categories = [
    "Tümü",
    "Küresel Vanalar",
    "Sürgülü Vanalar",
    "Kelebek Vanalar",
    "Çek Valfler",
    "Contalar",
    "Filtreler",
    "Flanş Aksesuarları",
];

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

function coverageDaysColor(days: number | null): string {
    if (days === null) return "var(--text-tertiary)";
    if (days < 7) return "var(--danger-text)";
    if (days < 14) return "var(--warning-text)";
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
    const { products: mockProducts, addProduct, deleteProduct, loadError } = useData();
    const { toast } = useToast();
    const isDemo = useIsDemo();
    const [search, setSearch] = useState("");
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [activeCategory, setActiveCategory] = useState("Tümü");
    const [createOpen, setCreateOpen] = useState(false);
    const [createForm, setCreateForm] = useState<{
        name: string; sku: string; category: string; unit: string;
        price: number; currency: string; on_hand: number; minStockLevel: number;
        productType: "finished" | "raw_material"; warehouse: string;
        materialQuality: string; originCountry: string; productionSite: string;
        useCases: string; industries: string; standards: string;
        certifications: string; productNotes: string;
    }>({
        name: "", sku: "", category: "Küresel Vanalar", unit: "adet",
        price: 0, currency: "USD", on_hand: 0, minStockLevel: 0,
        productType: "finished", warehouse: "Sevkiyat Deposu",
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

    useEffect(() => {
        function handleResize() { setWindowWidth(window.innerWidth); }
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
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

    // Scan stock alerts on mount, then fetch all open product alerts for signal filtering
    useEffect(() => {
        let cancelled = false;
        async function scanThenFetch() {
            try { await fetch("/api/alerts/scan", { method: "POST" }); } catch { /* non-fatal */ }
            if (cancelled) return;
            try {
                const res = await fetch("/api/alerts?entity_type=product&status=open");
                const data: Array<{ entity_id?: string | null }> = res.ok ? await res.json() : [];
                if (cancelled) return;
                const ids = new Set<string>();
                for (const a of data) { if (a.entity_id) ids.add(a.entity_id); }
                setProductsWithAlerts(ids);
            } catch { /* graceful */ }
        }
        scanThenFetch();
        return () => { cancelled = true; };
    }, []);

    const isMobile = windowWidth < 768;

    const filtered = mockProducts.filter((p) => {
        const matchSearch =
            p.name.toLowerCase().includes(search.toLowerCase()) ||
            p.sku.toLowerCase().includes(search.toLowerCase());
        const matchCategory = activeCategory === "Tümü" || p.category === activeCategory;
        const pRisk = riskData.get(p.id);
        const pRec = recMap.get(p.id);
        const matchSignal =
            alertFilter === "riskli" ? !!pRisk :
            alertFilter === "uyarili" ? productsWithAlerts.has(p.id) :
            alertFilter === "oneri" ? pRec?.status === "suggested" :
            true;
        return matchSearch && matchCategory && matchSignal;
    });

    const criticalCount = mockProducts.filter(p => p.promisable <= p.minStockLevel).length;

    const categoryCounts: Record<string, number> = { "Tümü": mockProducts.length };
    categories.slice(1).forEach(cat => {
        categoryCounts[cat] = mockProducts.filter(p => p.category === cat).length;
    });

    const riskliCount = mockProducts.filter(p => riskData.has(p.id)).length;
    const uyariliCount = productsWithAlerts.size;
    const oneriCount = mockProducts.filter(p => recMap.get(p.id)?.status === "suggested").length;

    const handleDelete = async (id: string) => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        setDeletingId(id);
        try {
            await deleteProduct(id);
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
            await addProduct(createForm);
            setCreateOpen(false);
            setCreateForm({
                name: "", sku: "", category: "Küresel Vanalar", unit: "adet",
                price: 0, currency: "USD", on_hand: 0, minStockLevel: 0,
                productType: "finished" as const, warehouse: "Sevkiyat Deposu",
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
                    <Button variant="primary" onClick={() => setCreateOpen(true)} disabled={isDemo} title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}>+ Yeni Ürün</Button>
                </div>
            </div>

            {/* Category filter */}
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {categories.map((cat) => (
                    <button
                        key={cat}
                        aria-pressed={activeCategory === cat}
                        onClick={() => setActiveCategory(cat)}
                        style={{
                            fontSize: "12px",
                            padding: "5px 12px",
                            border: `0.5px solid ${activeCategory === cat ? "var(--accent-border)" : "var(--border-secondary)"}`,
                            borderRadius: "6px",
                            background: activeCategory === cat ? "var(--accent-bg)" : "transparent",
                            color: activeCategory === cat ? "var(--accent-text)" : "var(--text-secondary)",
                            cursor: "pointer",
                            fontWeight: activeCategory === cat ? 600 : 400,
                            display: "flex",
                            alignItems: "center",
                            gap: "5px",
                        }}
                        onMouseEnter={e => {
                            if (activeCategory !== cat) {
                                e.currentTarget.style.background = "var(--bg-tertiary)";
                                e.currentTarget.style.color = "var(--text-primary)";
                            }
                        }}
                        onMouseLeave={e => {
                            if (activeCategory !== cat) {
                                e.currentTarget.style.background = "transparent";
                                e.currentTarget.style.color = "var(--text-secondary)";
                            }
                        }}
                    >
                        {cat}
                        <span style={{
                            fontSize: "10px",
                            padding: "1px 5px",
                            borderRadius: "10px",
                            background: activeCategory === cat ? "var(--accent)" : "var(--bg-tertiary)",
                            color: activeCategory === cat ? "#fff" : "var(--text-tertiary)",
                            fontWeight: 600,
                            minWidth: "16px",
                            textAlign: "center",
                        }}>
                            {categoryCounts[cat] ?? 0}
                        </span>
                    </button>
                ))}
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
                                        const daysLeft = Math.floor((new Date(dl).getTime() - Date.now()) / 86_400_000);
                                        const color = daysLeft < 0 ? "var(--danger-text)"
                                            : daysLeft < 7  ? "var(--danger-text)"
                                            : daysLeft < 14 ? "var(--warning-text)"
                                            : "var(--text-secondary)";
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
                                : `"${activeCategory}" kategorisinde ürün yok`}
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
                                    {sectionLabel("Ürün Kimliği")}

                                    {/* Name + type badge */}
                                    <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", marginBottom: "4px" }}>
                                        <div style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.3 }}>
                                            {product.name}
                                        </div>
                                        <span style={{
                                            fontSize: "10px", fontWeight: 600, padding: "2px 7px",
                                            borderRadius: "4px", flexShrink: 0, marginTop: "2px",
                                            background: product.productType === "finished" ? "var(--accent-bg)" : "var(--bg-tertiary)",
                                            color: product.productType === "finished" ? "var(--accent-text)" : "var(--text-secondary)",
                                            border: `0.5px solid ${product.productType === "finished" ? "var(--accent-border)" : "var(--border-secondary)"}`,
                                        }}>
                                            {product.productType === "finished" ? "Mamul" : "Hammadde"}
                                        </span>
                                    </div>

                                    {/* SKU */}
                                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-tertiary)", marginBottom: "12px" }}>
                                        {product.sku}
                                    </div>

                                    {/* Identity fields */}
                                    <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                                        <IdField label="Kategori" value={[product.category, product.subCategory].filter(Boolean).join(" / ")} />
                                        <IdField label="Ürün Ailesi" value={product.productFamily} />
                                        <IdField label="Sektör" value={product.sectorCompatibility} />
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

                                    {/* Prices */}
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

                                    {/* Notes */}
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
                                                        }
                                                    } catch { /* graceful */ }
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
                                                                const res = await fetch(`/api/purchase-commitments/${c.id}`, {
                                                                    method: "PATCH",
                                                                    headers: { "Content-Type": "application/json" },
                                                                    body: JSON.stringify({ action: "cancel" }),
                                                                });
                                                                if (res.ok) {
                                                                    window.location.reload();
                                                                }
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
                                    <select
                                        style={modalInputStyle}
                                        value={createForm.category}
                                        onChange={e => setCreateForm(f => ({ ...f, category: e.target.value }))}
                                    >
                                        {categories.slice(1).map(c => <option key={c}>{c}</option>)}
                                    </select>
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
                                        onChange={e => setCreateForm(f => ({ ...f, productType: e.target.value as "finished" | "raw_material" }))}
                                    >
                                        <option value="finished">Mamul</option>
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
