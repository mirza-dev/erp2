"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { mapProduct } from "@/lib/api-mappers";
import type { Product } from "@/lib/mock-data";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useIsDemo, DEMO_DISABLED_TOOLTIP, DEMO_BLOCK_TOAST } from "@/lib/demo-utils";
import { usePagination } from "@/hooks/usePagination";
import Pagination from "@/components/ui/Pagination";
import { useSelection } from "@/hooks/useSelection";
import { DynamicFieldEdit } from "@/components/products/DynamicFieldEdit";
import type { ProductTypeRow, ProductTypeFieldRow } from "@/lib/database.types";


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
    const router = useRouter();
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
        productType: "manufactured" | "commercial"; warehouse: string;
        materialQuality: string; originCountry: string; productionSite: string;
        useCases: string; industries: string; standards: string;
        certifications: string; productNotes: string;
        productTypeId: string; attributes: Record<string, unknown>;
    }>({
        name: "", sku: "", category: "", unit: "adet",
        price: 0, currency: "USD", on_hand: 0, minStockLevel: 0,
        productType: "manufactured", warehouse: "Sevkiyat Deposu",
        materialQuality: "", originCountry: "", productionSite: "",
        useCases: "", industries: "", standards: "", certifications: "", productNotes: "",
        productTypeId: "", attributes: {},
    });
    const [createProductTypes, setCreateProductTypes] = useState<ProductTypeRow[]>([]);
    const [createTypeFields, setCreateTypeFields] = useState<ProductTypeFieldRow[]>([]);
    const [createTypeFieldsLoading, setCreateTypeFieldsLoading] = useState(false);
    const [createSubmitting, setCreateSubmitting] = useState(false);
    const [windowWidth, setWindowWidth] = useState<number>(
        typeof window !== "undefined" ? window.innerWidth : 1200
    );
    const [riskData, setRiskData] = useState<Map<string, RiskItem>>(new Map());
    const [riskLoading, setRiskLoading] = useState(false);
    const [riskCounts, setRiskCounts] = useState<{ at_risk: number; excluded_no_usage?: number } | null>(null);
    const [aiAvailable, setAiAvailable] = useState<boolean | null>(null);
    const [recMap, setRecMap] = useState<Map<string, RiskRecEntry>>(new Map());
    const [alertFilter, setAlertFilter] = useState<"tumu" | "riskli" | "uyarili" | "oneri">("tumu");
    const [productsWithAlerts, setProductsWithAlerts] = useState<Set<string>>(new Set());
    const [filterManufactured, setFilterManufactured] = useState(false);
    const [filterCommercial, setFilterCommercial] = useState(false);
    const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
    const [bulkDeleting, setBulkDeleting] = useState(false);

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

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch("/api/product-types");
                if (!cancelled && res.ok) {
                    const data = await res.json();
                    if (Array.isArray(data)) setCreateProductTypes(data);
                }
            } catch { /* graceful */ }
        })();
        return () => { cancelled = true; };
    }, []);

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

    const { pagedItems, currentPage, setCurrentPage, totalPages, totalItems, pageSize } =
        usePagination(filtered, {
            resetKey: `${search}|${alertFilter}|${selectedCategories.join(",")}|${filterManufactured ? "M" : ""}|${filterCommercial ? "C" : ""}`,
        });

    const { selectedIds, toggleOne, toggleAll, clearAll, isPageAllSelected, isPageIndeterminate } =
        useSelection(`${search}|${alertFilter}|${selectedCategories.join(",")}|${filterManufactured ? "M" : ""}|${filterCommercial ? "C" : ""}`);
    const pageIds = pagedItems.map(p => p.id);

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

    const handleBulkDelete = async () => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        setBulkDeleting(true);
        const ids = Array.from(selectedIds);
        const results = await Promise.allSettled(
            ids.map(id => fetch(`/api/products/${id}`, { method: "DELETE" })),
        );
        const failed = results.filter(r => r.status === "rejected" || (r.status === "fulfilled" && !r.value.ok)).length;
        const succeeded = ids.length - failed;
        if (succeeded > 0) toast({ type: "success", message: `${succeeded} ürün silindi.` });
        if (failed > 0) toast({ type: "error", message: `${failed} ürün silinemedi.` });
        clearAll();
        setBulkDeleteConfirm(false);
        setBulkDeleting(false);
        await refetch();
    };

    const handleCreateTypeChange = async (newTypeId: string) => {
        setCreateForm(f => ({ ...f, productTypeId: newTypeId, attributes: {} }));
        setCreateTypeFields([]);
        if (!newTypeId) return;
        setCreateTypeFieldsLoading(true);
        try {
            const res = await fetch(`/api/product-types/${newTypeId}?withFields=1`);
            if (res.ok) {
                const data = await res.json();
                setCreateTypeFields(Array.isArray(data.fields) ? data.fields : []);
            }
        } catch { /* graceful */ } finally {
            setCreateTypeFieldsLoading(false);
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
                product_type_id: createForm.productTypeId || undefined,
                attributes: Object.keys(createForm.attributes).length > 0 ? createForm.attributes : undefined,
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
                productTypeId: "", attributes: {},
            });
            setCreateTypeFields([]);
            toast({ type: "success", message: `${createForm.name} ürün olarak eklendi` });
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Ürün eklenemedi. Lütfen tekrar deneyin.";
            toast({ type: "error", message: msg });
        } finally {
            setCreateSubmitting(false);
        }
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
                    <Link
                        href="/dashboard/products/aging"
                        style={{
                            fontSize: "12px", fontWeight: 500, padding: "6px 12px",
                            border: "0.5px solid var(--border-secondary)", borderRadius: "6px",
                            background: "transparent", color: "var(--text-secondary)",
                            textDecoration: "none", whiteSpace: "nowrap",
                        }}
                    >Eskime Raporu →</Link>
                    <Button variant="primary" onClick={() => { setCreateForm({ name: "", sku: "", category: "", unit: "adet", price: 0, currency: "USD", on_hand: 0, minStockLevel: 0, productType: "manufactured", warehouse: "Sevkiyat Deposu", materialQuality: "", originCountry: "", productionSite: "", useCases: "", industries: "", standards: "", certifications: "", productNotes: "", productTypeId: "", attributes: {} }); setCreateTypeFields([]); setCreateOpen(true); }} disabled={isDemo} title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}>+ Yeni Ürün</Button>
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

            {/* Bulk action bar */}
            {selectedIds.size > 0 && (
                <div style={{
                    display: "flex", alignItems: "center", gap: "10px",
                    padding: "10px 14px",
                    background: "var(--accent-bg)",
                    border: "0.5px solid var(--accent-border)",
                    borderRadius: "6px",
                    fontSize: "13px",
                }}>
                    <span style={{ color: "var(--accent-text)", fontWeight: 500 }}>
                        {selectedIds.size} ürün seçildi
                    </span>
                    <button
                        onClick={() => setBulkDeleteConfirm(true)}
                        disabled={bulkDeleting}
                        style={{
                            fontSize: "12px", padding: "4px 12px",
                            border: "0.5px solid var(--danger-border)",
                            borderRadius: "5px", background: "var(--danger-bg)",
                            color: "var(--danger-text)", cursor: bulkDeleting ? "not-allowed" : "pointer",
                            opacity: bulkDeleting ? 0.6 : 1,
                        }}
                    >
                        {bulkDeleting ? "Siliniyor…" : "Sil"}
                    </button>
                    <button
                        onClick={clearAll}
                        style={{
                            fontSize: "12px", padding: "4px 10px", border: "none",
                            background: "transparent", color: "var(--accent-text)", cursor: "pointer",
                        }}
                    >
                        Seçimi Temizle
                    </button>
                </div>
            )}

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
                            <th style={{ ...thStyle, width: "36px", padding: "10px 8px 10px 14px" }}>
                                <input
                                    type="checkbox"
                                    checked={isPageAllSelected(pageIds)}
                                    ref={el => { if (el) el.indeterminate = isPageIndeterminate(pageIds); }}
                                    onChange={() => toggleAll(pageIds)}
                                    onClick={e => e.stopPropagation()}
                                    style={{ width: "14px", height: "14px", accentColor: "var(--accent)", cursor: "pointer" }}
                                    aria-label="Sayfadaki tüm ürünleri seç"
                                />
                            </th>
                            <th style={thStyle}>SKU</th>
                            <th style={thStyle}>Ürün Adı</th>
                            <th style={{ ...thStyle, textAlign: "right" }}>Stok</th>
                            <th style={{ ...thStyle, textAlign: "right" }}>Satılabilir</th>
                            {!isMobile && <th style={{ ...thStyle, textAlign: "right" }}>Fiyat</th>}
                            {!isMobile && <th style={{ ...thStyle, textAlign: "right" }}>Min stok</th>}
                            <th style={{ ...thStyle, width: isMobile ? "36px" : "100px" }}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {pagedItems.map((product) => {
                            const isCritical = product.promisable <= product.minStockLevel;
                            return (
                                <tr
                                    key={product.id}
                                    tabIndex={0}
                                    role="button"
                                    aria-label={`${product.name} detayını gör`}
                                    style={{ cursor: "pointer" }}
                                    onClick={() => router.push(`/dashboard/products/${product.id}`)}
                                    onKeyDown={e => {
                                        if (e.key === "Enter" || e.key === " ") {
                                            e.preventDefault();
                                            router.push(`/dashboard/products/${product.id}`);
                                        }
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.querySelectorAll("td").forEach(td => (td.style.background = "var(--bg-secondary)"));
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.querySelectorAll("td").forEach(td => (td.style.background = "transparent"));
                                    }}
                                >
                                    <td
                                        style={{ ...tdStyle, width: "36px", padding: "10px 8px 10px 14px" }}
                                        onClick={e => e.stopPropagation()}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.has(product.id)}
                                            onChange={() => toggleOne(product.id)}
                                            onClick={e => e.stopPropagation()}
                                            style={{ width: "14px", height: "14px", accentColor: "var(--accent)", cursor: "pointer" }}
                                            aria-label={`${product.name} seç`}
                                        />
                                    </td>
                                    <td style={{ ...tdStyle, color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontSize: "12px" }}>
                                        {product.sku}
                                    </td>
                                    <td style={{ ...tdStyle, fontWeight: 500, maxWidth: "260px", overflow: "hidden", textOverflow: "ellipsis" }}>
                                        {product.name}
                                    </td>
                                    <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600, color: isCritical ? "var(--danger-text)" : "var(--text-primary)" }}>
                                        {formatNumber(product.on_hand)}
                                    </td>
                                    <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600, color: product.promisable <= 0 ? "var(--danger-text)" : product.promisable <= product.minStockLevel ? "var(--warning-text)" : "var(--text-primary)" }}>
                                        {formatNumber(product.promisable)}
                                    </td>
                                    {!isMobile && (
                                        <td style={{ ...tdStyle, textAlign: "right", color: "var(--text-secondary)" }}>
                                            {product.price != null ? formatCurrency(product.price, product.currency) : "—"}
                                        </td>
                                    )}
                                    {!isMobile && (
                                        <td style={{ ...tdStyle, textAlign: "right", color: "var(--text-secondary)" }}>
                                            {formatNumber(product.minStockLevel)}
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

                {filtered.length > 0 && (
                    <Pagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        totalItems={totalItems}
                        pageSize={pageSize}
                        onPageChange={setCurrentPage}
                        itemLabel="ürün"
                    />
                )}

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


            {/* Bulk delete confirm modal */}
            {bulkDeleteConfirm && (
                <>
                    <div
                        onClick={() => !bulkDeleting && setBulkDeleteConfirm(false)}
                        style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.5)" }}
                    />
                    <div style={{
                        position: "fixed", top: "50%", left: "50%",
                        transform: "translate(-50%, -50%)", zIndex: 101,
                        background: "var(--bg-primary)", border: "0.5px solid var(--border-primary)",
                        borderRadius: "8px", padding: "24px", width: "380px", maxWidth: "90vw",
                    }}>
                        <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "8px" }}>
                            {selectedIds.size} ürünü sil
                        </div>
                        <div style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "20px" }}>
                            Seçili ürünleri silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.
                        </div>
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                            <button
                                onClick={() => setBulkDeleteConfirm(false)}
                                disabled={bulkDeleting}
                                style={{
                                    fontSize: "13px", padding: "6px 16px",
                                    border: "0.5px solid var(--border-secondary)", borderRadius: "6px",
                                    background: "transparent", color: "var(--text-secondary)", cursor: "pointer",
                                }}
                            >
                                İptal
                            </button>
                            <button
                                onClick={handleBulkDelete}
                                disabled={bulkDeleting}
                                style={{
                                    fontSize: "13px", padding: "6px 16px",
                                    border: "0.5px solid var(--danger-border)", borderRadius: "6px",
                                    background: "var(--danger-bg)", color: "var(--danger-text)",
                                    cursor: bulkDeleting ? "not-allowed" : "pointer", opacity: bulkDeleting ? 0.6 : 1,
                                }}
                            >
                                {bulkDeleting ? "Siliniyor…" : "Sil"}
                            </button>
                        </div>
                    </div>
                </>
            )}

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
                                            const pt = e.target.value as "manufactured" | "commercial";
                                            setCreateForm(f => ({ ...f, productType: pt }));
                                        }}
                                    >
                                        <option value="manufactured">İmalat</option>
                                        <option value="commercial">Ticari</option>
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

                            {/* Tip Şablonu + Dinamik Teknik Alanlar */}
                            <div style={{
                                borderTop: "0.5px solid var(--border-tertiary)",
                                paddingTop: "12px",
                                display: "flex",
                                flexDirection: "column",
                                gap: "10px",
                            }}>
                                <div style={{ fontSize: "10px", fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                    Tip Şablonu <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(isteğe bağlı)</span>
                                </div>
                                <FormField label="Tip Şablonu">
                                    <select
                                        style={modalInputStyle}
                                        value={createForm.productTypeId}
                                        onChange={e => handleCreateTypeChange(e.target.value)}
                                        aria-label="Tip şablonu"
                                    >
                                        <option value="">— seçiniz —</option>
                                        {createProductTypes.map(t => (
                                            <option key={t.id} value={t.id}>{t.name}</option>
                                        ))}
                                    </select>
                                </FormField>
                                {createTypeFieldsLoading && (
                                    <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>Alanlar yükleniyor…</div>
                                )}
                                {createTypeFields.map(f => (
                                    <DynamicFieldEdit
                                        key={f.id}
                                        field={f}
                                        value={createForm.attributes[f.field_key]}
                                        onChange={v => setCreateForm(prev => {
                                            const next = { ...prev.attributes };
                                            if (v === "" || v === null || v === undefined) delete next[f.field_key];
                                            else next[f.field_key] = v;
                                            return { ...prev, attributes: next };
                                        })}
                                    />
                                ))}
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
