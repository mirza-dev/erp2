"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Customer } from "@/lib/mock-data";
import { useData } from "@/lib/data-context";

interface CustomerDetailPanelProps {
    customer: Customer | null;
    onClose: () => void;
}

const inputStyle: React.CSSProperties = {
    fontSize: "13px",
    padding: "6px 10px",
    border: "0.5px solid var(--border-secondary)",
    borderRadius: "6px",
    background: "var(--bg-tertiary)",
    color: "var(--text-primary)",
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
};

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
}: CustomerDetailPanelProps) {
    const router = useRouter();
    const { orders, updateCustomer } = useData();
    const [editMode, setEditMode] = useState(false);
    const [editSaved, setEditSaved] = useState(false);
    const [editSaving, setEditSaving] = useState(false);
    const [editError, setEditError] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<Customer | null>(null);

    if (!customer) return null;

    // Dynamic stats from actual orders
    const customerOrders = orders.filter(o => o.customerName === customer.name);
    const totalOrders = customerOrders.length;
    const totalRevenue = customerOrders.reduce((sum, o) => sum + o.grandTotal, 0);
    const recentOrders = [...customerOrders]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 5);

    const openEdit = () => {
        setEditForm({ ...customer });
        setEditMode(true);
        setEditSaved(false);
        setEditError(null);
    };

    const handleSave = async () => {
        if (!editForm) return;
        setEditSaving(true);
        setEditError(null);
        try {
            await updateCustomer(customer.id, editForm);
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
        <>
            {/* Backdrop */}
            <div
                onClick={onClose}
                style={{
                    position: "fixed",
                    inset: 0,
                    zIndex: 50,
                    background: "rgba(0,0,0,0.5)",
                }}
            />

            {/* Panel */}
            <div
                className="animate-slide-in-right"
                style={{
                    position: "fixed",
                    right: 0,
                    top: 0,
                    zIndex: 50,
                    height: "100vh",
                    width: "100%",
                    maxWidth: "380px",
                    background: "var(--bg-primary)",
                    borderLeft: "0.5px solid var(--border-tertiary)",
                    overflowY: "auto",
                    display: "flex",
                    flexDirection: "column",
                }}
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
                            <div style={{ fontSize: "14px", fontWeight: 500, color: "var(--text-primary)" }}>
                                {customer.name}
                            </div>
                            <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                                {customer.country} · {customer.currency}
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            fontSize: "12px",
                            padding: "4px 10px",
                            border: "0.5px solid var(--border-secondary)",
                            borderRadius: "6px",
                            background: "transparent",
                            color: "var(--text-secondary)",
                            cursor: "pointer",
                        }}
                    >
                        Kapat
                    </button>
                </div>

                {editMode && editForm ? (
                    /* ── Edit Mode ── */
                    <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: "10px", flex: 1 }}>
                        <div style={{ fontSize: "11px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "2px" }}>
                            Müşteri Düzenle
                        </div>

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
                            <button
                                onClick={handleSave}
                                disabled={editSaving || editSaved}
                                style={{
                                    flex: 1,
                                    fontSize: "12px",
                                    padding: "7px 12px",
                                    border: "0.5px solid var(--accent-border)",
                                    borderRadius: "6px",
                                    background: "var(--accent-bg)",
                                    color: "var(--accent-text)",
                                    cursor: editSaving || editSaved ? "default" : "pointer",
                                    opacity: editSaving ? 0.6 : 1,
                                }}
                            >
                                {editSaved ? "✓ Kaydedildi" : editSaving ? "Kaydediliyor..." : "Kaydet"}
                            </button>
                            <button
                                onClick={() => setEditMode(false)}
                                disabled={editSaving}
                                style={{
                                    flex: 1,
                                    fontSize: "12px",
                                    padding: "7px 12px",
                                    border: "0.5px solid var(--border-secondary)",
                                    borderRadius: "6px",
                                    background: "transparent",
                                    color: "var(--text-secondary)",
                                    cursor: editSaving ? "default" : "pointer",
                                    opacity: editSaving ? 0.4 : 1,
                                }}
                            >
                                İptal
                            </button>
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
                            <div style={{ background: "var(--bg-secondary)", borderRadius: "6px", padding: "10px 12px" }}>
                                <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginBottom: "2px" }}>Toplam Sipariş</div>
                                <div style={{ fontSize: "18px", fontWeight: 500, color: "var(--text-primary)" }}>{totalOrders}</div>
                            </div>
                            <div style={{ background: "var(--bg-secondary)", borderRadius: "6px", padding: "10px 12px" }}>
                                <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginBottom: "2px" }}>Toplam Ciro</div>
                                <div style={{ fontSize: "16px", fontWeight: 500, color: "var(--success-text)" }}>
                                    {totalRevenue > 0 ? formatCurrency(totalRevenue, customer.currency) : "—"}
                                </div>
                            </div>
                        </div>

                        {/* Contact details */}
                        <div style={{ padding: "14px 16px", borderBottom: "0.5px solid var(--border-tertiary)" }}>
                            <div style={{ fontSize: "11px", color: "var(--text-tertiary)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "10px" }}>
                                İletişim
                            </div>
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
                                <div style={{ fontSize: "11px", color: "var(--text-tertiary)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                                    Son Siparişler
                                </div>
                                {totalOrders > 0 && (
                                    <Link
                                        href={`/dashboard/orders?customer=${encodeURIComponent(customer.name)}`}
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
                                                    {formatCurrency(order.grandTotal, order.currency)}
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
                                <div style={{ fontSize: "11px", color: "var(--text-tertiary)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "6px" }}>
                                    Notlar
                                </div>
                                <div style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.5, background: "var(--bg-secondary)", padding: "8px 10px", borderRadius: "6px" }}>
                                    {customer.notes}
                                </div>
                            </div>
                        )}

                        {/* Actions */}
                        <div style={{ padding: "14px 16px", display: "flex", gap: "8px" }}>
                            <button
                                onClick={() => {
                                    onClose();
                                    router.push(`/dashboard/orders/new?customerId=${customer.id}&customerName=${encodeURIComponent(customer.name)}`);
                                }}
                                style={{
                                    flex: 1,
                                    fontSize: "12px",
                                    padding: "7px 12px",
                                    border: "0.5px solid var(--accent-border)",
                                    borderRadius: "6px",
                                    background: "var(--accent-bg)",
                                    color: "var(--accent-text)",
                                    cursor: "pointer",
                                }}
                            >
                                Yeni Sipariş
                            </button>
                            <button
                                onClick={openEdit}
                                style={{
                                    flex: 1,
                                    fontSize: "12px",
                                    padding: "7px 12px",
                                    border: "0.5px solid var(--border-secondary)",
                                    borderRadius: "6px",
                                    background: "transparent",
                                    color: "var(--text-secondary)",
                                    cursor: "pointer",
                                }}
                            >
                                Düzenle
                            </button>
                        </div>
                    </>
                )}
            </div>
        </>
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
