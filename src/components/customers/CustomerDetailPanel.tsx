"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Pencil, Plus, Save, X } from "lucide-react";
import Button from "@/components/ui/Button";
import Drawer from "@/components/ui/Drawer";
import { maskCurrency, formatDate } from "@/lib/utils";
import type { Customer } from "@/lib/mock-data";
import { primaryRevenue } from "@/lib/customer-stats";
import { useOrders, useCustomers } from "@/lib/data-context";
import { usePermissions } from "@/lib/auth/use-permissions";
import { useToast } from "@/components/ui/Toast";
import { useIsDemo, DEMO_DISABLED_TOOLTIP, DEMO_BLOCK_TOAST } from "@/lib/demo-utils";
import { fieldStyle } from "@/components/ui/Input";
import SectionHeader from "@/components/ui/SectionHeader";
import Stat from "@/components/ui/Stat";

interface CustomerDetailPanelProps {
    customer: Customer | null;
    onClose: () => void;
    onCustomerUpdated?: (customer: Customer) => void;
}

// Ortak form alanı stili — token tek kaynaktan (`--input-bg`/`--input-border`/
// `--line-width`). Eskiden burada 0.5px + `--border-secondary` + `--bg-tertiary`
// vardı; koyu temada fark görünmüyordu ama AYDINLIK temada her form ekranı
// farklı duruyordu (2026-08-24 tespiti).
const inputStyle: React.CSSProperties = fieldStyle("md");

const labelStyle: React.CSSProperties = {
    fontSize: "11px",
    color: "var(--text-tertiary)",
    display: "block",
    marginBottom: "3px",
};

const STATUS_LABEL: Record<string, string> = {
    draft:            "Taslak",
    pending_approval: "Bekleyen",
    approved:         "Onaylı",
    cancelled:        "İptal",
};

const STATUS_COLOR: Record<string, string> = {
    draft:            "var(--text-tertiary)",
    pending_approval: "var(--warning-text)",
    approved:         "var(--accent-text)",
    cancelled:        "var(--danger-text)",
};

export default function CustomerDetailPanel({
    customer,
    onClose,
    onCustomerUpdated,
}: CustomerDetailPanelProps) {
    const router = useRouter();
    const { orders } = useOrders();
    const { updateCustomer } = useCustomers();
    const { toast } = useToast();
    const isDemo = useIsDemo();
    const { canViewSalesPrices, canViewFinancialSummary, has } = usePermissions();
    const [editMode, setEditMode] = useState(false);
    const [editSaved, setEditSaved] = useState(false);
    const [editSaving, setEditSaving] = useState(false);
    const [editError, setEditError] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<Customer | null>(null);

    if (!customer) return null;

    // "Son Siparişler" listesi için — sayaçlar İÇİN DEĞİL (aşağıya bak).
    const customerOrders = orders.filter(o =>
        o.customerId ? o.customerId === customer.id : o.customerName === customer.name
    );
    const recentOrders = customerOrders
        .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 5);

    // Sayaçlar sunucuda hesaplanıp cari kaydıyla gelir (`@/lib/customer-stats`).
    // Panel eskiden bunları context'teki siparişlerden kendisi topluyordu; o
    // hesap İKİ YÖNDEN yanlıştı: taslak/iptal siparişleri de sayıyor ve FARKLI
    // para birimlerini üst üste ekliyordu. Artık liste sayfasıyla birebir aynı
    // kural (yalnız `approved`, PB'ler ayrı) — iki ekran çelişmez.
    const totalOrders = customer.totalOrders;
    const revenue = primaryRevenue(customer.revenueByCurrency, customer.currency);

    const openEdit = () => {
        setEditForm({ ...customer });
        setEditMode(true);
        setEditSaved(false);
        setEditError(null);
    };

    const handleSave = async () => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        if (!editForm) return;
        if (!editForm.name.trim()) {
            setEditError("Firma adı boş olamaz.");
            return;
        }
        setEditSaving(true);
        setEditError(null);
        try {
            const updated = await updateCustomer(customer.id, editForm);
            if (updated) onCustomerUpdated?.(updated);
            setEditSaved(true);
            setTimeout(() => {
                setEditMode(false);
                setEditSaved(false);
            }, 1500);
        } catch (err) {
            setEditError(err instanceof Error ? err.message : "Kaydedilemedi.");
        } finally {
            setEditSaving(false);
        }
    };

    const setField = (key: keyof Customer) => (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
    ) => {
        setEditForm(f => f ? { ...f, [key]: e.target.value } : f);
    };

    return (
        /* 2026-09-05: çerçeve `ui/Drawer`'a taşındı. Eskiden burada Escape,
           odak tuzağı ve odak dönüşü YOKTU (panel `role="dialog"` ilan ediyordu
           ama klavyeyle kapatılamıyordu); z=50 olduğu için kabuğun kendi mobil
           menüsünün (z=99/100) ALTINDA kalıyordu; `height:100vh` iOS Safari'de
           görüntü alanından taşıyordu; kenarlığı `0.5px` sabitiyle çiziliyordu
           (`--line-width` yerine). Beşi de çerçeveden geliyor artık. */
        <Drawer
            onClose={onClose}
            labelledBy="customer-detail-title"
            width="min(380px, 100vw)"
            padded={false}
            surfaceStyle={{ overflowY: "auto" }}
        >
                {/* Header */}
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "14px 16px",
                        borderBottom: "0.5px solid var(--border-tertiary)",
                        flexShrink: 0,
                    }}
                >
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <div
                            style={{
                                width: "32px",
                                height: "32px",
                                borderRadius: "50%",
                                background: "var(--accent-bg)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: "14px",
                                fontWeight: 600,
                                color: "var(--accent-text)",
                            }}
                        >
                            {customer.name.charAt(0)}
                        </div>
                        <div>
                            <div id="customer-detail-title" style={{ fontSize: "14px", fontWeight: 500, color: "var(--text-primary)" }}>
                                {customer.name}
                            </div>
                            <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                                {customer.country} · {customer.currency}
                            </div>
                        </div>
                    </div>
                    <Button
                        variant="secondary"
                        size="xs"
                        leftIcon={<X size={13} />}
                        onClick={onClose}
                    >
                        Kapat
                    </Button>
                </div>

                {editMode && editForm ? (
                    /* ── Edit Mode ── */
                    <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: "10px", flex: 1 }}>
                        <SectionHeader style={{ marginBottom: "2px" }}>
                            Müşteri Düzenle
                        </SectionHeader>

                        <div>
                            <label style={labelStyle}>Firma Adı</label>
                            <input style={inputStyle} value={editForm.name} onChange={setField("name")} />
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                            <div>
                                <label style={labelStyle}>Ülke</label>
                                <input style={inputStyle} value={editForm.country} onChange={setField("country")} />
                            </div>
                            <div>
                                <label style={labelStyle}>Para Birimi</label>
                                <select style={{ ...inputStyle }} value={editForm.currency} onChange={setField("currency")}>
                                    <option>USD</option>
                                    <option>EUR</option>
                                    <option>TRY</option>
                                </select>
                            </div>
                        </div>
                        <div>
                            <label style={labelStyle}>E-posta</label>
                            <input style={inputStyle} value={editForm.email} onChange={setField("email")} />
                        </div>
                        <div>
                            <label style={labelStyle}>Telefon</label>
                            <input style={inputStyle} value={editForm.phone} onChange={setField("phone")} />
                        </div>
                        <div>
                            <label style={labelStyle}>Adres</label>
                            <input style={inputStyle} value={editForm.address} onChange={setField("address")} />
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                            <div>
                                <label style={labelStyle}>Vergi Dairesi</label>
                                <input style={inputStyle} value={editForm.taxOffice} onChange={setField("taxOffice")} />
                            </div>
                            <div>
                                <label style={labelStyle}>Vergi No</label>
                                <input style={inputStyle} value={editForm.taxNumber} onChange={setField("taxNumber")} />
                            </div>
                        </div>
                        <div>
                            <label style={labelStyle}>Notlar</label>
                            <textarea
                                style={{ ...inputStyle, resize: "vertical", minHeight: "72px" }}
                                value={editForm.notes}
                                onChange={setField("notes")}
                            />
                        </div>

                        {editError && (
                            <div style={{ fontSize: "12px", color: "var(--danger-text)", padding: "6px 10px", background: "var(--danger-bg)", borderRadius: "6px", border: "0.5px solid var(--danger-border)" }}>
                                {editError}
                            </div>
                        )}

                        <div style={{ display: "flex", gap: "8px", marginTop: "4px", alignItems: "center" }}>
                            <Button
                                variant="secondary"
                                onClick={() => setEditMode(false)}
                                disabled={editSaving}
                                style={{ flex: 1, minWidth: 0 }}
                            >
                                İptal
                            </Button>
                            <Button
                                variant={editSaved ? "success" : "primary"}
                                leftIcon={<Save size={14} />}
                                onClick={handleSave}
                                disabled={isDemo || editSaving || editSaved}
                                loading={editSaving}
                                title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}
                                style={{ flex: 1, minWidth: 0 }}
                            >
                                {editSaved ? "Kaydedildi" : editSaving ? "Kaydediliyor..." : "Kaydet"}
                            </Button>
                        </div>
                    </div>
                ) : (
                    /* ── View Mode ── */
                    <>
                        {/* Stats */}
                        <div
                            style={{
                                display: "grid",
                                gridTemplateColumns: "1fr 1fr",
                                gap: "8px",
                                padding: "14px 16px",
                                borderBottom: "0.5px solid var(--border-tertiary)",
                            }}
                        >
                            <Stat label="Toplam Sipariş" value={totalOrders} />
                            <Stat
                                label="Toplam Ciro"
                                tone="success"
                                value={canViewFinancialSummary && (revenue.amount > 0 || revenue.others.length > 0)
                                    ? maskCurrency(revenue.amount, revenue.currency, true)
                                    : null}
                                sub={canViewFinancialSummary && revenue.others.length > 0
                                    ? revenue.others.map(o => maskCurrency(o.amount, o.currency, true)).join(" · ")
                                    : undefined}
                            />
                        </div>

                        {/* Contact details */}
                        <div style={{ padding: "14px 16px", borderBottom: "0.5px solid var(--border-tertiary)" }}>
                            <SectionHeader>
                                İletişim
                            </SectionHeader>
                            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                <DetailRow label="E-posta" value={customer.email || "—"} />
                                <DetailRow label="Telefon" value={customer.phone || "—"} />
                                <DetailRow label="Adres" value={customer.address || "—"} />
                                <DetailRow label="Vergi Dairesi" value={customer.taxOffice || customer.taxNumber ? `${customer.taxOffice} — ${customer.taxNumber}` : "—"} />
                                {customer.lastOrderDate && (
                                    <DetailRow label="Son Sipariş" value={formatDate(customer.lastOrderDate)} />
                                )}
                            </div>
                        </div>

                        {/* Recent Orders */}
                        <div style={{ padding: "14px 16px", borderBottom: "0.5px solid var(--border-tertiary)" }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                                <SectionHeader style={{ marginBottom: 0 }}>
                                    Son Siparişler
                                </SectionHeader>
                                {totalOrders > 0 && (
                                    <Link
                                        href={`/dashboard/orders?customerId=${customer.id}`}
                                        onClick={onClose}
                                        style={{ fontSize: "11px", color: "var(--accent-text)", textDecoration: "none" }}
                                    >
                                        Tümünü gör →
                                    </Link>
                                )}
                            </div>
                            {recentOrders.length === 0 ? (
                                <div style={{ fontSize: "12px", color: "var(--text-tertiary)", padding: "8px 0" }}>
                                    Henüz sipariş yok
                                </div>
                            ) : (
                                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                                    {recentOrders.map(order => (
                                        <Link
                                            key={order.id}
                                            href={`/dashboard/orders/${order.id}`}
                                            onClick={onClose}
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "space-between",
                                                padding: "7px 10px",
                                                background: "var(--bg-secondary)",
                                                borderRadius: "6px",
                                                textDecoration: "none",
                                            }}
                                        >
                                            <div>
                                                <div style={{ fontSize: "12px", fontWeight: 500, color: "var(--text-primary)" }}>
                                                    {order.orderNumber}
                                                </div>
                                                <div style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>
                                                    {formatDate(order.createdAt)}
                                                </div>
                                            </div>
                                            <div style={{ textAlign: "right" }}>
                                                <div style={{ fontSize: "12px", fontWeight: 500, color: "var(--success-text)" }}>
                                                    {maskCurrency(order.grandTotal, order.currency, canViewSalesPrices)}
                                                </div>
                                                <div style={{ fontSize: "11px", color: STATUS_COLOR[order.commercial_status] ?? "var(--text-secondary)" }}>
                                                    {STATUS_LABEL[order.commercial_status] ?? order.commercial_status}
                                                </div>
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Notes */}
                        {customer.notes && (
                            <div style={{ padding: "14px 16px", borderBottom: "0.5px solid var(--border-tertiary)" }}>
                                <SectionHeader style={{ marginBottom: "6px" }}>
                                    Notlar
                                </SectionHeader>
                                <div style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.5, background: "var(--bg-secondary)", padding: "8px 10px", borderRadius: "6px" }}>
                                    {customer.notes}
                                </div>
                            </div>
                        )}

                        {/* Actions — RBAC F7: CTA'lar yetkiye göre gizlenir (API guard'ı
                            zaten korur; bu UX tutarlılığı). İkisi de yoksa satır render edilmez. */}
                        {(has("manage_sales_orders") || has("manage_customers")) && (
                        <div style={{ padding: "14px 16px", display: "flex", gap: "8px" }}>
                            {has("manage_sales_orders") && (
                            <Button
                                leftIcon={<Plus size={14} />}
                                onClick={() => {
                                    onClose();
                                    router.push(`/dashboard/orders/new?customerId=${customer.id}&customerName=${encodeURIComponent(customer.name)}`);
                                }}
                                style={{ flex: 1, minWidth: 0 }}
                            >
                                Yeni Sipariş
                            </Button>
                            )}
                            {has("manage_customers") && (
                            <Button
                                variant="secondary"
                                leftIcon={<Pencil size={14} />}
                                onClick={() => !isDemo && openEdit()}
                                disabled={isDemo}
                                title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}
                                style={{ flex: 1, minWidth: 0 }}
                            >
                                Düzenle
                            </Button>
                            )}
                        </div>
                        )}
                    </>
                )}
        </Drawer>
    );
}

function DetailRow({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginBottom: "1px" }}>{label}</div>
            <div style={{ fontSize: "13px", color: "var(--text-primary)" }}>{value}</div>
        </div>
    );
}
