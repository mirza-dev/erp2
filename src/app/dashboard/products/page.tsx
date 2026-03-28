"use client";

import { useState, useEffect } from "react";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { getStatusBadge } from "@/lib/stock-utils";
import { useData } from "@/lib/data-context";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

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
    aiExplanation: string | null;
    aiRecommendation: string | null;
    aiConfidence: number | null;
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
    outline: "none",
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
    const [search, setSearch] = useState("");
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [activeCategory, setActiveCategory] = useState("Tümü");
    const [createOpen, setCreateOpen] = useState(false);
    const [createForm, setCreateForm] = useState<{
        name: string; sku: string; category: string; unit: string;
        price: number; currency: string; on_hand: number; minStockLevel: number;
        productType: "finished" | "raw_material"; warehouse: string;
    }>({
        name: "", sku: "", category: "Küresel Vanalar", unit: "adet",
        price: 0, currency: "USD", on_hand: 0, minStockLevel: 0,
        productType: "finished", warehouse: "Sevkiyat Deposu",
    });
    const [createSubmitting, setCreateSubmitting] = useState(false);
    const [windowWidth, setWindowWidth] = useState<number>(
        typeof window !== "undefined" ? window.innerWidth : 1200
    );
    const [riskData, setRiskData] = useState<Map<string, RiskItem>>(new Map());
    const [riskLoading, setRiskLoading] = useState(false);
    const [riskCounts, setRiskCounts] = useState<{ at_risk: number; excluded_no_usage?: number } | null>(null);
    const [aiAvailable, setAiAvailable] = useState<boolean | null>(null);

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
            } catch { /* graceful: risk data missing = no badges */ }
            finally { if (!cancelled) setRiskLoading(false); }
        }
        fetchRisk();
        return () => { cancelled = true; };
    }, []);

    const isMobile = windowWidth < 768;

    const filtered = mockProducts.filter((p) => {
        const matchSearch =
            p.name.toLowerCase().includes(search.toLowerCase()) ||
            p.sku.toLowerCase().includes(search.toLowerCase());
        const matchCategory = activeCategory === "Tümü" || p.category === activeCategory;
        return matchSearch && matchCategory;
    });

    const criticalCount = mockProducts.filter(p => p.available_now <= p.minStockLevel).length;

    const categoryCounts: Record<string, number> = { "Tümü": mockProducts.length };
    categories.slice(1).forEach(cat => {
        categoryCounts[cat] = mockProducts.filter(p => p.category === cat).length;
    });

    const handleDelete = async (id: string) => {
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
        if (!createForm.name.trim() || !createForm.sku.trim()) return;
        setCreateSubmitting(true);
        try {
            await addProduct(createForm);
            setCreateOpen(false);
            setCreateForm({
                name: "", sku: "", category: "Küresel Vanalar", unit: "adet",
                price: 0, currency: "USD", on_hand: 0, minStockLevel: 0,
                productType: "finished" as const, warehouse: "Sevkiyat Deposu",
            });
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
                            outline: "none",
                        }}
                    />
                    <Button variant="primary" onClick={() => setCreateOpen(true)}>+ Yeni Ürün</Button>
                </div>
            </div>

            {/* Category filter */}
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {categories.map((cat) => (
                    <button
                        key={cat}
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
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", minWidth: "640px" }}>
                    <thead>
                        <tr style={{ background: "var(--bg-secondary)" }}>
                            <th style={thStyle}>SKU</th>
                            <th style={thStyle}>Ürün Adı</th>
                            <th style={thStyle}>Kategori</th>
                            <th style={{ ...thStyle, textAlign: "right" }}>Fiyat</th>
                            <th style={{ ...thStyle, textAlign: "right" }}>Stok</th>
                            <th style={{ ...thStyle, textAlign: "right" }}>Rezerve</th>
                            <th style={{ ...thStyle, textAlign: "right" }}>Satılabilir</th>
                            <th style={{ ...thStyle, textAlign: "center" }}>Durum</th>
                            <th style={{ ...thStyle, width: "120px" }}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map((product) => {
                            const risk = riskData.get(product.id);
                            const status = getStatusBadge(product.available_now, product.minStockLevel, !!risk);
                            return (
                                <tr
                                    key={product.id}
                                    style={{ cursor: "pointer" }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.querySelectorAll("td").forEach(td => (td.style.background = "var(--bg-secondary)"));
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.querySelectorAll("td").forEach(td => (td.style.background = "transparent"));
                                    }}
                                >
                                    <td style={{ ...tdStyle, color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
                                        {product.sku}
                                    </td>
                                    <td style={{ ...tdStyle, fontWeight: 500, maxWidth: "220px", overflow: "hidden", textOverflow: "ellipsis" }}>
                                        {product.name}
                                    </td>
                                    <td style={{ ...tdStyle, color: "var(--text-secondary)" }}>
                                        {product.category}
                                    </td>
                                    <td style={{ ...tdStyle, textAlign: "right", fontWeight: 500 }}>
                                        {formatCurrency(product.price, product.currency)}
                                    </td>
                                    <td style={{ ...tdStyle, textAlign: "right", fontWeight: 500 }}>
                                        {formatNumber(product.on_hand)}
                                    </td>
                                    <td style={{ ...tdStyle, textAlign: "right", color: "var(--warning-text)" }}>
                                        {formatNumber(product.reserved)}
                                    </td>
                                    <td
                                        style={{
                                            ...tdStyle,
                                            textAlign: "right",
                                            fontWeight: 500,
                                            color: product.available_now <= product.minStockLevel ? "var(--danger-text)" : "var(--success-text)",
                                        }}
                                    >
                                        {formatNumber(product.available_now)}
                                    </td>
                                    <td style={{ ...tdStyle, textAlign: "center" }}>
                                        <span className={`badge ${status.cls}`}>{status.label}</span>
                                        {risk && (
                                            <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "2px", whiteSpace: "normal", maxWidth: "160px", margin: "2px auto 0" }}>
                                                {risk.aiExplanation ? (
                                                    <>
                                                        <span style={{ fontSize: "9px", fontWeight: 600, color: "var(--accent-text)", letterSpacing: "0.04em" }}>AI </span>
                                                        {risk.aiExplanation}
                                                    </>
                                                ) : (
                                                    risk.deterministicReason
                                                )}
                                            </div>
                                        )}
                                    </td>
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
                                                onClick={() => setConfirmDeleteId(product.id)}
                                                style={{
                                                    fontSize: "11px",
                                                    padding: "2px 8px",
                                                    border: "0.5px solid var(--border-secondary)",
                                                    borderRadius: "4px",
                                                    background: "transparent",
                                                    color: "var(--text-tertiary)",
                                                    cursor: "pointer",
                                                }}
                                                onMouseEnter={e => {
                                                    e.currentTarget.style.borderColor = "var(--danger-border)";
                                                    e.currentTarget.style.color = "var(--danger-text)";
                                                }}
                                                onMouseLeave={e => {
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
                        <div style={{ fontSize: "28px", marginBottom: "8px" }}>📦</div>
                        <div style={{ fontWeight: 500, color: "var(--text-secondary)", marginBottom: "4px" }}>
                            Ürün bulunamadı
                        </div>
                        <div style={{ fontSize: "12px" }}>
                            {search ? `"${search}" ile eşleşen ürün yok` : `"${activeCategory}" kategorisinde ürün yok`}
                        </div>
                    </div>
                )}
            </div>

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
                                disabled={!createForm.name.trim() || !createForm.sku.trim() || createSubmitting}
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
