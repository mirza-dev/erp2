"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { mapProduct } from "@/lib/api-mappers";
import type { Product } from "@/lib/mock-data";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useIsDemo, DEMO_DISABLED_TOOLTIP, DEMO_BLOCK_TOAST } from "@/lib/demo-utils";

type TabKey = "genel" | "teknik" | "stok" | "tedarik" | "ticari" | "ekler" | "partiler";

interface AlertItem {
    id: string;
    title: string;
    description: string | null;
    type: string;
    severity: "critical" | "warning" | "info";
}

interface CommitmentRow {
    id: string;
    quantity: number;
    expected_date: string;
    supplier_name: string | null;
    status: string;
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
    quoteValidUntil: string | null;
}

interface EditForm {
    name: string;
    category: string;
    subCategory: string;
    productFamily: string;
    productType: "manufactured" | "commercial";
    sectorCompatibility: string;
    industries: string;
    useCases: string;
    materialQuality: string;
    originCountry: string;
    productionSite: string;
    standards: string;
    certifications: string;
    unit: string;
    warehouse: string;
    preferredVendor: string;
    leadTimeDays: string;
    weightKg: string;
    price: string;
    currency: string;
    costPrice: string;
    productNotes: string;
    minStockLevel: string;
    dailyUsage: string;
    reorderQty: string;
}

function buildEditForm(p: Product): EditForm {
    return {
        name: p.name,
        category: p.category ?? "",
        subCategory: p.subCategory ?? "",
        productFamily: p.productFamily ?? "",
        productType: p.productType,
        sectorCompatibility: p.sectorCompatibility ?? "",
        industries: p.industries ?? "",
        useCases: p.useCases ?? "",
        materialQuality: p.materialQuality ?? "",
        originCountry: p.originCountry ?? "",
        productionSite: p.productionSite ?? "",
        standards: p.standards ?? "",
        certifications: p.certifications ?? "",
        unit: p.unit,
        warehouse: p.warehouse ?? "",
        preferredVendor: p.preferredVendor ?? "",
        leadTimeDays: p.leadTimeDays?.toString() ?? "",
        weightKg: p.weightKg?.toString() ?? "",
        price: p.price?.toString() ?? "",
        currency: p.currency ?? "USD",
        costPrice: p.costPrice?.toString() ?? "",
        productNotes: p.productNotes ?? "",
        minStockLevel: p.minStockLevel?.toString() ?? "0",
        dailyUsage: p.dailyUsage?.toString() ?? "",
        reorderQty: p.reorderQty?.toString() ?? "",
    };
}

const inputStyle: React.CSSProperties = {
    fontSize: "13px",
    padding: "6px 10px",
    border: "0.5px solid var(--border-secondary)",
    borderRadius: "5px",
    background: "var(--bg-tertiary)",
    color: "var(--text-primary)",
    width: "100%",
};

const fieldRowStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "140px 1fr",
    alignItems: "center",
    gap: "10px",
    padding: "8px 0",
    borderBottom: "0.5px solid var(--border-tertiary)",
};

const labelStyle: React.CSSProperties = {
    fontSize: "11px",
    color: "var(--text-tertiary)",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
};

const sectionTitleStyle: React.CSSProperties = {
    fontSize: "11px",
    fontWeight: 700,
    color: "var(--text-tertiary)",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    marginBottom: "10px",
    paddingBottom: "6px",
    borderBottom: "0.5px solid var(--border-tertiary)",
};

const cardStyle: React.CSSProperties = {
    background: "var(--bg-secondary)",
    border: "0.5px solid var(--border-tertiary)",
    borderRadius: "6px",
    padding: "12px 14px",
};

function FieldView({ label, value }: { label: string; value: string | number | null | undefined }) {
    const display = value === null || value === undefined || value === "" ? "—" : String(value);
    return (
        <div style={fieldRowStyle}>
            <span style={labelStyle}>{label}</span>
            <span style={{ fontSize: "13px", color: "var(--text-primary)" }}>{display}</span>
        </div>
    );
}

function FieldEdit({
    label,
    children,
}: {
    label: string;
    children: React.ReactNode;
}) {
    return (
        <div style={fieldRowStyle}>
            <span style={labelStyle}>{label}</span>
            <div>{children}</div>
        </div>
    );
}

export default function ProductDetailPage() {
    const params = useParams();
    const router = useRouter();
    const { toast } = useToast();
    const isDemo = useIsDemo();

    const productId = typeof params.id === "string" ? params.id : Array.isArray(params.id) ? params.id[0] : "";

    const [product, setProduct] = useState<Product | null>(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);

    const [activeTab, setActiveTab] = useState<TabKey>("genel");
    const [editMode, setEditMode] = useState(false);
    const [editForm, setEditForm] = useState<EditForm | null>(null);
    const [saving, setSaving] = useState(false);
    const [confirmDeactivate, setConfirmDeactivate] = useState(false);
    const [deactivating, setDeactivating] = useState(false);

    // Contextual sections
    const [alerts, setAlerts] = useState<AlertItem[]>([]);
    const [commitments, setCommitments] = useState<CommitmentRow[]>([]);
    const [quotes, setQuotes] = useState<QuotedItem[]>([]);

    const fetchProduct = useCallback(async () => {
        if (!productId) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/products/${productId}`);
            if (res.status === 404) {
                setNotFound(true);
                setProduct(null);
                return;
            }
            if (!res.ok) {
                setNotFound(true);
                setProduct(null);
                return;
            }
            const data = await res.json();
            setProduct(mapProduct(data));
            setNotFound(false);
        } catch {
            setNotFound(true);
            setProduct(null);
        } finally {
            setLoading(false);
        }
    }, [productId]);

    useEffect(() => {
        fetchProduct();
    }, [fetchProduct]);

    // Fetch contextual sections (alerts/commitments/quotes) once product is loaded
    useEffect(() => {
        if (!product) return;
        const controller = new AbortController();
        (async () => {
            try {
                const [aRes, cRes, qRes] = await Promise.all([
                    fetch(`/api/alerts?entity_type=product&entity_id=${product.id}&status=open`, { signal: controller.signal }).catch(() => null),
                    fetch(`/api/purchase-commitments?product_id=${product.id}&status=pending`, { signal: controller.signal }).catch(() => null),
                    fetch(`/api/products/${product.id}/quotes`, { signal: controller.signal }).catch(() => null),
                ]);
                if (aRes && aRes.ok) {
                    const aJson = await aRes.json();
                    const list = Array.isArray(aJson) ? aJson : (aJson.items ?? []);
                    setAlerts(list.filter((a: { resolved_at?: string | null }) => !a.resolved_at).map((a: {
                        id: string;
                        title: string;
                        description: string | null;
                        type: string;
                        severity: "critical" | "warning" | "info";
                    }) => ({
                        id: a.id,
                        title: a.title,
                        description: a.description,
                        type: a.type,
                        severity: a.severity,
                    })));
                }
                if (cRes && cRes.ok) {
                    const cJson = await cRes.json();
                    const list = Array.isArray(cJson) ? cJson : (cJson.items ?? []);
                    setCommitments(list);
                }
                if (qRes && qRes.ok) {
                    const qJson = await qRes.json();
                    setQuotes(Array.isArray(qJson.items) ? qJson.items : []);
                }
            } catch {
                /* swallow — non-critical contextual sections */
            }
        })();
        return () => controller.abort();
    }, [product]);

    const handleEditClick = () => {
        if (!product) return;
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        setEditForm(buildEditForm(product));
        setEditMode(true);
    };

    const handleCancelEdit = () => {
        setEditMode(false);
        setEditForm(null);
    };

    const handleSave = async () => {
        if (!editForm || !product) return;
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        setSaving(true);
        try {
            const body: Record<string, unknown> = {
                name: editForm.name || undefined,
                category: editForm.category || null,
                sub_category: editForm.subCategory || null,
                product_family: editForm.productFamily || null,
                product_type: editForm.productType,
                sector_compatibility: editForm.sectorCompatibility || null,
                industries: editForm.industries || null,
                use_cases: editForm.useCases || null,
                material_quality: editForm.materialQuality || null,
                origin_country: editForm.originCountry || null,
                production_site: editForm.productionSite || null,
                standards: editForm.standards || null,
                certifications: editForm.certifications || null,
                unit: editForm.unit || undefined,
                warehouse: editForm.warehouse || null,
                preferred_vendor: editForm.preferredVendor || null,
                lead_time_days: editForm.leadTimeDays ? Number(editForm.leadTimeDays) : null,
                weight_kg: editForm.weightKg ? Number(editForm.weightKg) : null,
                price: editForm.price ? Number(editForm.price) : null,
                currency: editForm.currency || undefined,
                cost_price: editForm.costPrice ? Number(editForm.costPrice) : null,
                product_notes: editForm.productNotes || null,
                min_stock_level: editForm.minStockLevel !== "" ? Number(editForm.minStockLevel) : 0,
                daily_usage: editForm.dailyUsage ? Number(editForm.dailyUsage) : null,
                reorder_qty: editForm.reorderQty ? Number(editForm.reorderQty) : null,
            };
            const res = await fetch(`/api/products/${product.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            if (!res.ok) throw new Error("PATCH başarısız");
            await fetchProduct();
            setEditMode(false);
            setEditForm(null);
            toast({ type: "success", message: "Ürün bilgileri güncellendi." });
        } catch {
            toast({ type: "error", message: "Güncelleme başarısız." });
        } finally {
            setSaving(false);
        }
    };

    const handleDeactivate = async () => {
        if (!product) return;
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        setDeactivating(true);
        try {
            const res = await fetch(`/api/products/${product.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ is_active: false }),
            });
            if (!res.ok) throw new Error("PATCH başarısız");
            toast({ type: "success", message: "Ürün devre dışı bırakıldı." });
            router.push("/dashboard/products");
        } catch {
            toast({ type: "error", message: "İşlem başarısız." });
        } finally {
            setDeactivating(false);
            setConfirmDeactivate(false);
        }
    };

    if (loading) {
        return (
            <div style={{ padding: "40px", textAlign: "center", color: "var(--text-secondary)", fontSize: "13px" }}>
                Ürün yükleniyor...
            </div>
        );
    }

    if (notFound || !product) {
        return (
            <div style={{ padding: "40px", textAlign: "center", color: "var(--text-secondary)", fontSize: "13px" }}>
                Ürün bulunamadı.{" "}
                <Link href="/dashboard/products" style={{ color: "var(--accent-text)" }}>
                    Geri dön
                </Link>
            </div>
        );
    }

    const form = editForm;

    const tabs: { key: TabKey; label: string; locked: boolean; lockedNote?: string }[] = [
        { key: "genel", label: "Genel", locked: false },
        { key: "teknik", label: "Teknik", locked: true, lockedNote: "Faz 2c'de gelecek" },
        { key: "stok", label: "Stok", locked: false },
        { key: "tedarik", label: "Tedarik", locked: false },
        { key: "ticari", label: "Ticari", locked: false },
        { key: "ekler", label: "Ekler", locked: true, lockedNote: "Faz 2d'de gelecek" },
        { key: "partiler", label: "Partiler", locked: true, lockedNote: "Faz 2e'de gelecek" },
    ];

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* Back breadcrumb */}
            <div>
                <Link href="/dashboard/products" style={{ fontSize: "12px", color: "var(--text-tertiary)", textDecoration: "none" }}>
                    ← Ürünler
                </Link>
            </div>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: "16px", flexWrap: "wrap" }}>
                {/* Image placeholder */}
                <div
                    aria-label="Ana görsel (Faz 2d'de eklenecek)"
                    style={{
                        width: "80px",
                        height: "80px",
                        flexShrink: 0,
                        background: "var(--bg-tertiary)",
                        border: "0.5px dashed var(--border-secondary)",
                        borderRadius: "6px",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "var(--text-tertiary)",
                        fontSize: "9px",
                        fontWeight: 600,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                    }}
                >
                    <span style={{ fontSize: "16px" }}>🔒</span>
                    <span style={{ marginTop: "3px" }}>Faz 2d</span>
                </div>

                {/* Title + meta */}
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "6px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                        <h1 style={{ margin: 0, fontSize: "18px", fontWeight: 600, color: "var(--text-primary)" }}>
                            {product.name}
                        </h1>
                        <span
                            style={{
                                fontSize: "10px",
                                fontWeight: 600,
                                padding: "2px 7px",
                                borderRadius: "4px",
                                background: product.productType === "manufactured" ? "var(--accent-bg)" : "var(--success-bg)",
                                color: product.productType === "manufactured" ? "var(--accent-text)" : "var(--success-text)",
                                border: `0.5px solid ${product.productType === "manufactured" ? "var(--accent-border)" : "var(--success-border)"}`,
                            }}
                        >
                            {product.productType === "manufactured" ? "İmalat" : "Ticari"}
                        </span>
                        <span
                            style={{
                                fontSize: "10px",
                                fontWeight: 600,
                                padding: "2px 7px",
                                borderRadius: "4px",
                                background: product.isActive ? "var(--success-bg)" : "var(--bg-tertiary)",
                                color: product.isActive ? "var(--success-text)" : "var(--text-tertiary)",
                                border: `0.5px solid ${product.isActive ? "var(--success-border)" : "var(--border-secondary)"}`,
                            }}
                        >
                            {product.isActive ? "Aktif" : "Pasif"}
                        </span>
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-tertiary)" }}>
                        {product.sku}
                    </div>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
                    {!editMode ? (
                        <>
                            <Button
                                variant="secondary"
                                onClick={handleEditClick}
                                disabled={isDemo}
                                title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}
                            >
                                Düzenle
                            </Button>
                            {product.isActive && (
                                <Button
                                    variant="danger"
                                    onClick={() => setConfirmDeactivate(true)}
                                    disabled={isDemo}
                                    title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}
                                >
                                    Devre Dışı Bırak
                                </Button>
                            )}
                        </>
                    ) : (
                        <>
                            <Button variant="secondary" onClick={handleCancelEdit} disabled={saving}>
                                İptal
                            </Button>
                            <Button variant="primary" onClick={handleSave} loading={saving} disabled={saving}>
                                Kaydet
                            </Button>
                        </>
                    )}
                </div>
            </div>

            {/* Active alerts banner — visible in any tab */}
            {alerts.length > 0 && (
                <div
                    role="region"
                    aria-label="Aktif Uyarılar"
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "6px",
                        padding: "10px 12px",
                        background: "var(--warning-bg)",
                        border: "0.5px solid var(--warning-border)",
                        borderRadius: "6px",
                    }}
                >
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--warning-text)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                        Aktif Uyarılar ({alerts.length})
                    </div>
                    {alerts.slice(0, 3).map(a => (
                        <div key={a.id} style={{ fontSize: "12px", color: "var(--text-primary)" }}>
                            <strong>{a.title}</strong>{a.description ? ` — ${a.description}` : null}
                        </div>
                    ))}
                </div>
            )}

            {/* Tab nav */}
            <div role="tablist" aria-label="Ürün sekmeleri" style={{ display: "flex", gap: "0", borderBottom: "0.5px solid var(--border-tertiary)", overflowX: "auto" }}>
                {tabs.map(t => {
                    const isActive = activeTab === t.key;
                    return (
                        <button
                            key={t.key}
                            role="tab"
                            aria-selected={isActive}
                            aria-controls={`tab-panel-${t.key}`}
                            id={`tab-${t.key}`}
                            onClick={() => setActiveTab(t.key)}
                            title={t.locked ? t.lockedNote : undefined}
                            style={{
                                padding: "10px 14px",
                                background: "transparent",
                                border: "none",
                                borderBottom: isActive ? "2px solid var(--accent)" : "2px solid transparent",
                                color: isActive ? "var(--text-primary)" : "var(--text-tertiary)",
                                fontSize: "13px",
                                fontWeight: isActive ? 600 : 500,
                                cursor: "pointer",
                                whiteSpace: "nowrap",
                                display: "flex",
                                alignItems: "center",
                                gap: "5px",
                            }}
                        >
                            {t.label}
                            {t.locked && <span style={{ fontSize: "10px", opacity: 0.6 }}>🔒</span>}
                        </button>
                    );
                })}
            </div>

            {/* Tab content */}
            <div
                role="tabpanel"
                id={`tab-panel-${activeTab}`}
                aria-labelledby={`tab-${activeTab}`}
                style={{ minHeight: "200px" }}
            >
                {activeTab === "genel" && (
                    <div style={cardStyle}>
                        <div style={sectionTitleStyle}>Genel Bilgiler</div>
                        <FieldView label="SKU" value={product.sku} />
                        {editMode && form ? (
                            <>
                                <FieldEdit label="Ürün Adı">
                                    <input value={form.name} onChange={e => setEditForm(f => f && ({ ...f, name: e.target.value }))} style={inputStyle} aria-label="Ürün adı" />
                                </FieldEdit>
                                <FieldEdit label="Ürün Tipi">
                                    <select value={form.productType} onChange={e => setEditForm(f => f && ({ ...f, productType: e.target.value as "manufactured" | "commercial" }))} style={inputStyle} aria-label="Ürün tipi">
                                        <option value="manufactured">İmalat</option>
                                        <option value="commercial">Ticari</option>
                                    </select>
                                </FieldEdit>
                                <FieldEdit label="Kategori">
                                    <input value={form.category} onChange={e => setEditForm(f => f && ({ ...f, category: e.target.value }))} style={inputStyle} aria-label="Kategori" />
                                </FieldEdit>
                                <FieldEdit label="Alt Kategori">
                                    <input value={form.subCategory} onChange={e => setEditForm(f => f && ({ ...f, subCategory: e.target.value }))} style={inputStyle} aria-label="Alt kategori" />
                                </FieldEdit>
                                <FieldEdit label="Ürün Ailesi">
                                    <input value={form.productFamily} onChange={e => setEditForm(f => f && ({ ...f, productFamily: e.target.value }))} style={inputStyle} aria-label="Ürün ailesi" />
                                </FieldEdit>
                                <FieldEdit label="Sektör Uygunluğu">
                                    <input value={form.sectorCompatibility} onChange={e => setEditForm(f => f && ({ ...f, sectorCompatibility: e.target.value }))} style={inputStyle} aria-label="Sektör uygunluğu" />
                                </FieldEdit>
                                <FieldEdit label="Sektörler">
                                    <input value={form.industries} onChange={e => setEditForm(f => f && ({ ...f, industries: e.target.value }))} style={inputStyle} aria-label="Sektörler" />
                                </FieldEdit>
                                <FieldEdit label="Kullanım">
                                    <input value={form.useCases} onChange={e => setEditForm(f => f && ({ ...f, useCases: e.target.value }))} style={inputStyle} aria-label="Kullanım alanları" />
                                </FieldEdit>
                                <FieldEdit label="Malzeme">
                                    <input value={form.materialQuality} onChange={e => setEditForm(f => f && ({ ...f, materialQuality: e.target.value }))} style={inputStyle} aria-label="Malzeme" />
                                </FieldEdit>
                                <FieldEdit label="Menşei">
                                    <input value={form.originCountry} onChange={e => setEditForm(f => f && ({ ...f, originCountry: e.target.value }))} style={inputStyle} aria-label="Menşei" />
                                </FieldEdit>
                                <FieldEdit label="Üretim Tesisi">
                                    <input value={form.productionSite} onChange={e => setEditForm(f => f && ({ ...f, productionSite: e.target.value }))} style={inputStyle} aria-label="Üretim tesisi" />
                                </FieldEdit>
                                <FieldEdit label="Standartlar">
                                    <input value={form.standards} onChange={e => setEditForm(f => f && ({ ...f, standards: e.target.value }))} style={inputStyle} aria-label="Standartlar" />
                                </FieldEdit>
                                <FieldEdit label="Sertifikalar">
                                    <input value={form.certifications} onChange={e => setEditForm(f => f && ({ ...f, certifications: e.target.value }))} style={inputStyle} aria-label="Sertifikalar" />
                                </FieldEdit>
                                <FieldEdit label="Birim">
                                    <input value={form.unit} onChange={e => setEditForm(f => f && ({ ...f, unit: e.target.value }))} style={inputStyle} aria-label="Birim" />
                                </FieldEdit>
                                <FieldEdit label="Ağırlık (kg)">
                                    <input type="number" value={form.weightKg} onChange={e => setEditForm(f => f && ({ ...f, weightKg: e.target.value }))} style={inputStyle} aria-label="Ağırlık kg" />
                                </FieldEdit>
                            </>
                        ) : (
                            <>
                                <FieldView label="Ürün Adı" value={product.name} />
                                <FieldView label="Ürün Tipi" value={product.productType === "manufactured" ? "İmalat" : "Ticari"} />
                                <FieldView label="Kategori" value={product.category} />
                                <FieldView label="Alt Kategori" value={product.subCategory} />
                                <FieldView label="Ürün Ailesi" value={product.productFamily} />
                                <FieldView label="Sektör Uygunluğu" value={product.sectorCompatibility} />
                                <FieldView label="Sektörler" value={product.industries} />
                                <FieldView label="Kullanım" value={product.useCases} />
                                <FieldView label="Malzeme" value={product.materialQuality} />
                                <FieldView label="Menşei" value={product.originCountry} />
                                <FieldView label="Üretim Tesisi" value={product.productionSite} />
                                <FieldView label="Standartlar" value={product.standards} />
                                <FieldView label="Sertifikalar" value={product.certifications} />
                                <FieldView label="Birim" value={product.unit} />
                                <FieldView label="Ağırlık (kg)" value={product.weightKg ?? null} />
                            </>
                        )}
                    </div>
                )}

                {activeTab === "teknik" && (
                    <div style={cardStyle}>
                        <div style={sectionTitleStyle}>Teknik Özellikler</div>
                        <div style={{ padding: "24px 0", textAlign: "center", color: "var(--text-tertiary)", fontSize: "13px" }}>
                            🔒 Bu sekme Faz 2c&apos;de gelecek — dinamik tip alanları (vana, conta, flans, vb.) burada gösterilecek.
                        </div>
                    </div>
                )}

                {activeTab === "stok" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                        {/* Operational cards */}
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "10px" }}>
                            <div style={cardStyle}>
                                <div style={labelStyle}>Stokta</div>
                                <div style={{ fontSize: "20px", fontWeight: 700, color: "var(--text-primary)", marginTop: "4px" }}>
                                    {formatNumber(product.on_hand)}
                                </div>
                            </div>
                            <div style={cardStyle}>
                                <div style={labelStyle}>Satılabilir</div>
                                <div style={{ fontSize: "20px", fontWeight: 700, color: product.promisable <= product.minStockLevel ? "var(--danger-text)" : "var(--success-text)", marginTop: "4px" }}>
                                    {formatNumber(product.promisable)}
                                </div>
                            </div>
                            <div style={cardStyle}>
                                <div style={labelStyle}>Rezerve</div>
                                <div style={{ fontSize: "20px", fontWeight: 700, color: "var(--text-primary)", marginTop: "4px" }}>
                                    {formatNumber(product.reserved)}
                                </div>
                            </div>
                            <div style={cardStyle}>
                                <div style={labelStyle}>Min Stok</div>
                                <div style={{ fontSize: "20px", fontWeight: 700, color: "var(--text-primary)", marginTop: "4px" }}>
                                    {formatNumber(product.minStockLevel)}
                                </div>
                            </div>
                            <div style={cardStyle}>
                                <div style={labelStyle}>Teklifte</div>
                                <div style={{ fontSize: "20px", fontWeight: 700, color: "var(--text-primary)", marginTop: "4px" }}>
                                    {formatNumber(product.quoted)}
                                </div>
                            </div>
                            <div style={cardStyle}>
                                <div style={labelStyle}>Bekleniyor</div>
                                <div style={{ fontSize: "20px", fontWeight: 700, color: "var(--success-text)", marginTop: "4px" }}>
                                    {formatNumber(product.incoming)}
                                </div>
                            </div>
                        </div>

                        {/* Stock edit fields */}
                        <div style={cardStyle}>
                            <div style={sectionTitleStyle}>Stok Yönetimi</div>
                            {editMode && form ? (
                                <>
                                    <FieldEdit label="Min Stok Seviyesi">
                                        <input type="number" value={form.minStockLevel} onChange={e => setEditForm(f => f && ({ ...f, minStockLevel: e.target.value }))} style={inputStyle} aria-label="Min stok seviyesi" />
                                    </FieldEdit>
                                    <FieldEdit label="Günlük Tüketim">
                                        <input type="number" value={form.dailyUsage} onChange={e => setEditForm(f => f && ({ ...f, dailyUsage: e.target.value }))} style={inputStyle} aria-label="Günlük tüketim" />
                                    </FieldEdit>
                                    <FieldEdit label="Yeniden Sip. Adedi">
                                        <input type="number" value={form.reorderQty} onChange={e => setEditForm(f => f && ({ ...f, reorderQty: e.target.value }))} style={inputStyle} aria-label="Yeniden sipariş adedi" />
                                    </FieldEdit>
                                    <FieldEdit label="Depo">
                                        <input value={form.warehouse} onChange={e => setEditForm(f => f && ({ ...f, warehouse: e.target.value }))} style={inputStyle} aria-label="Depo" />
                                    </FieldEdit>
                                </>
                            ) : (
                                <>
                                    <FieldView label="Min Stok Seviyesi" value={product.minStockLevel} />
                                    <FieldView label="Günlük Tüketim" value={product.dailyUsage ?? null} />
                                    <FieldView label="Yeniden Sip. Adedi" value={product.reorderQty ?? null} />
                                    <FieldView label="Depo" value={product.warehouse} />
                                </>
                            )}
                        </div>

                        {/* Pending commitments */}
                        <div style={cardStyle}>
                            <div style={sectionTitleStyle}>Bekleyen Teslimatlar ({commitments.length})</div>
                            {commitments.length === 0 ? (
                                <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>Bekleyen teslimat yok.</div>
                            ) : (
                                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                                    <thead>
                                        <tr>
                                            <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--text-tertiary)", fontWeight: 500, borderBottom: "0.5px solid var(--border-tertiary)" }}>Miktar</th>
                                            <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--text-tertiary)", fontWeight: 500, borderBottom: "0.5px solid var(--border-tertiary)" }}>Beklenen</th>
                                            <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--text-tertiary)", fontWeight: 500, borderBottom: "0.5px solid var(--border-tertiary)" }}>Tedarikçi</th>
                                            <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--text-tertiary)", fontWeight: 500, borderBottom: "0.5px solid var(--border-tertiary)" }}>Durum</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {commitments.map(c => (
                                            <tr key={c.id}>
                                                <td style={{ padding: "6px 8px", borderBottom: "0.5px solid var(--border-tertiary)" }}>{formatNumber(c.quantity)}</td>
                                                <td style={{ padding: "6px 8px", borderBottom: "0.5px solid var(--border-tertiary)" }}>{c.expected_date}</td>
                                                <td style={{ padding: "6px 8px", borderBottom: "0.5px solid var(--border-tertiary)" }}>{c.supplier_name ?? "—"}</td>
                                                <td style={{ padding: "6px 8px", borderBottom: "0.5px solid var(--border-tertiary)", color: "var(--text-secondary)" }}>{c.status}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === "tedarik" && (
                    <div style={cardStyle}>
                        <div style={sectionTitleStyle}>Tedarik Bilgileri</div>
                        {editMode && form ? (
                            <>
                                <FieldEdit label="Tercihli Tedarikçi">
                                    <input value={form.preferredVendor} onChange={e => setEditForm(f => f && ({ ...f, preferredVendor: e.target.value }))} style={inputStyle} aria-label="Tercihli tedarikçi" />
                                </FieldEdit>
                                <FieldEdit label="Tedarik Süresi (gün)">
                                    <input type="number" value={form.leadTimeDays} onChange={e => setEditForm(f => f && ({ ...f, leadTimeDays: e.target.value }))} style={inputStyle} aria-label="Tedarik süresi" />
                                </FieldEdit>
                                <FieldEdit label="Maliyet Fiyatı">
                                    <input type="number" value={form.costPrice} onChange={e => setEditForm(f => f && ({ ...f, costPrice: e.target.value }))} style={inputStyle} aria-label="Maliyet fiyatı" />
                                </FieldEdit>
                                <FieldEdit label="Para Birimi">
                                    <select value={form.currency} onChange={e => setEditForm(f => f && ({ ...f, currency: e.target.value }))} style={inputStyle} aria-label="Para birimi">
                                        <option value="USD">USD</option>
                                        <option value="EUR">EUR</option>
                                        <option value="TRY">TRY</option>
                                    </select>
                                </FieldEdit>
                            </>
                        ) : (
                            <>
                                <FieldView label="Tercihli Tedarikçi" value={product.preferredVendor} />
                                <FieldView label="Tedarik Süresi (gün)" value={product.leadTimeDays ?? null} />
                                <FieldView label="Maliyet Fiyatı" value={product.costPrice != null ? formatCurrency(product.costPrice, product.currency) : null} />
                                <FieldView label="Para Birimi" value={product.currency} />
                            </>
                        )}
                    </div>
                )}

                {activeTab === "ticari" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                        <div style={cardStyle}>
                            <div style={sectionTitleStyle}>Ticari Bilgiler</div>
                            {editMode && form ? (
                                <>
                                    <FieldEdit label="Satış Fiyatı">
                                        <input type="number" value={form.price} onChange={e => setEditForm(f => f && ({ ...f, price: e.target.value }))} style={inputStyle} aria-label="Satış fiyatı" />
                                    </FieldEdit>
                                    <FieldEdit label="Para Birimi">
                                        <select value={form.currency} onChange={e => setEditForm(f => f && ({ ...f, currency: e.target.value }))} style={inputStyle} aria-label="Para birimi (ticari)">
                                            <option value="USD">USD</option>
                                            <option value="EUR">EUR</option>
                                            <option value="TRY">TRY</option>
                                        </select>
                                    </FieldEdit>
                                    <FieldEdit label="Ürün Notları">
                                        <textarea value={form.productNotes} onChange={e => setEditForm(f => f && ({ ...f, productNotes: e.target.value }))} style={{ ...inputStyle, minHeight: "80px", fontFamily: "inherit" }} aria-label="Ürün notları" />
                                    </FieldEdit>
                                </>
                            ) : (
                                <>
                                    <FieldView label="Satış Fiyatı" value={product.price != null ? formatCurrency(product.price, product.currency) : null} />
                                    <FieldView label="Para Birimi" value={product.currency} />
                                    <FieldView label="Ürün Notları" value={product.productNotes} />
                                </>
                            )}
                        </div>

                        {/* Active quotes */}
                        <div style={cardStyle}>
                            <div style={sectionTitleStyle}>Aktif Teklifler ({quotes.length})</div>
                            {quotes.length === 0 ? (
                                <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>Bu ürün için aktif teklif yok.</div>
                            ) : (
                                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                                    <thead>
                                        <tr>
                                            <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--text-tertiary)", fontWeight: 500, borderBottom: "0.5px solid var(--border-tertiary)" }}>Sipariş</th>
                                            <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--text-tertiary)", fontWeight: 500, borderBottom: "0.5px solid var(--border-tertiary)" }}>Müşteri</th>
                                            <th style={{ textAlign: "right", padding: "6px 8px", color: "var(--text-tertiary)", fontWeight: 500, borderBottom: "0.5px solid var(--border-tertiary)" }}>Miktar</th>
                                            <th style={{ textAlign: "right", padding: "6px 8px", color: "var(--text-tertiary)", fontWeight: 500, borderBottom: "0.5px solid var(--border-tertiary)" }}>Tutar</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {quotes.map(q => (
                                            <tr key={q.orderId}>
                                                <td style={{ padding: "6px 8px", borderBottom: "0.5px solid var(--border-tertiary)" }}>
                                                    <Link href={`/dashboard/orders/${q.orderId}`} style={{ color: "var(--accent-text)" }}>
                                                        {q.orderNumber}
                                                    </Link>
                                                </td>
                                                <td style={{ padding: "6px 8px", borderBottom: "0.5px solid var(--border-tertiary)" }}>{q.customerName}</td>
                                                <td style={{ padding: "6px 8px", borderBottom: "0.5px solid var(--border-tertiary)", textAlign: "right" }}>{formatNumber(q.quantity)}</td>
                                                <td style={{ padding: "6px 8px", borderBottom: "0.5px solid var(--border-tertiary)", textAlign: "right" }}>
                                                    {formatCurrency(q.quantity * q.unitPrice, q.currency)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === "ekler" && (
                    <div style={cardStyle}>
                        <div style={sectionTitleStyle}>Ekler</div>
                        <div style={{ padding: "24px 0", textAlign: "center", color: "var(--text-tertiary)", fontSize: "13px" }}>
                            🔒 Bu sekme Faz 2d&apos;de gelecek — görsel/datasheet/sertifika/manuel upload + galeri burada olacak.
                        </div>
                    </div>
                )}

                {activeTab === "partiler" && (
                    <div style={cardStyle}>
                        <div style={sectionTitleStyle}>Partiler</div>
                        <div style={{ padding: "24px 0", textAlign: "center", color: "var(--text-tertiary)", fontSize: "13px" }}>
                            🔒 Bu sekme Faz 2e&apos;de gelecek — heat_no/tarih/miktar CRUD + sertifika linki burada olacak.
                        </div>
                    </div>
                )}
            </div>

            {/* Deactivate confirm modal */}
            {confirmDeactivate && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label="Ürünü devre dışı bırak"
                    style={{
                        position: "fixed",
                        inset: 0,
                        zIndex: 300,
                        background: "rgba(0,0,0,0.45)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "20px",
                    }}
                    onClick={() => !deactivating && setConfirmDeactivate(false)}
                >
                    <div
                        onClick={e => e.stopPropagation()}
                        style={{
                            background: "var(--bg-primary)",
                            border: "0.5px solid var(--border-secondary)",
                            borderRadius: "8px",
                            padding: "20px",
                            maxWidth: "400px",
                            width: "100%",
                        }}
                    >
                        <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "8px" }}>
                            Ürünü devre dışı bırak?
                        </div>
                        <div style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "16px" }}>
                            <strong>{product.name}</strong> ürünü pasif duruma alınacak. Aktif uyarıları ve satın alma önerileri kapatılacak.
                        </div>
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                            <Button variant="secondary" onClick={() => setConfirmDeactivate(false)} disabled={deactivating}>
                                Vazgeç
                            </Button>
                            <Button variant="danger" onClick={handleDeactivate} loading={deactivating} disabled={deactivating}>
                                Devre Dışı Bırak
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
