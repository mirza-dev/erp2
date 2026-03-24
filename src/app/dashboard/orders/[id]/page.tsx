"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useData, type ConflictItem, type CommercialStatus, type FulfillmentStatus } from "@/lib/data-context";
import { mapOrderDetail } from "@/lib/api-mappers";
import type { OrderDetail } from "@/lib/mock-data";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

const commercialStatusConfig: Record<CommercialStatus, { label: string; cls: string }> = {
    draft:            { label: "Taslak",      cls: "badge-neutral" },
    pending_approval: { label: "Bekliyor",    cls: "badge-warning" },
    approved:         { label: "Onaylı",      cls: "badge-accent"  },
    cancelled:        { label: "İptal",       cls: "badge-danger"  },
};

const fulfillmentStatusConfig: Record<FulfillmentStatus, { label: string; cls: string }> = {
    unallocated:         { label: "Rezervesiz",    cls: "badge-neutral"  },
    partially_allocated: { label: "Kısmi Rezerve", cls: "badge-warning"  },
    allocated:           { label: "Rezerveli",     cls: "badge-warning"  },
    partially_shipped:   { label: "Kısmi Sevk",    cls: "badge-accent"   },
    shipped:             { label: "Sevk Edildi",   cls: "badge-success"  },
};

const thStyle: React.CSSProperties = {
    textAlign: "left",
    padding: "8px 14px",
    fontSize: "11px",
    fontWeight: 500,
    color: "var(--text-tertiary)",
    borderBottom: "0.5px solid var(--border-tertiary)",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
    padding: "10px 14px",
    fontSize: "13px",
    borderBottom: "0.5px solid var(--border-tertiary)",
    color: "var(--text-primary)",
    lineHeight: 1.4,
};

export default function OrderDetailPage() {
    const params = useParams();
    const { updateOrderStatus } = useData();
    const { toast } = useToast();
    const [order, setOrder] = useState<OrderDetail | null>(null);
    const [, setOrderLoading] = useState(true);
    const [rescoring, setRescoring] = useState(false);

    const refetchOrder = async () => {
        try {
            const res = await fetch(`/api/orders/${params.id}`);
            if (res.ok) {
                const data = await res.json();
                setOrder(mapOrderDetail(data));
            }
        } catch (err) {
            console.error("Failed to fetch order:", err);
        }
    };

    // Fetch order from API on mount
    useEffect(() => {
        const fetchOrder = async () => {
            try {
                const res = await fetch(`/api/orders/${params.id}`);
                if (res.ok) {
                    const data = await res.json();
                    setOrder(mapOrderDetail(data));
                }
            } catch (err) {
                console.error("Failed to fetch order:", err);
            } finally {
                setOrderLoading(false);
            }
        };
        if (params.id) fetchOrder();
    }, [params.id]);

    const handleRescore = async () => {
        if (rescoring || !params.id) return;
        setRescoring(true);
        try {
            const res = await fetch(`/api/ai/score`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ order_id: params.id }),
            });
            if (res.ok) {
                toast({ type: "success", message: "AI skorlama tamamlandı" });
                await refetchOrder();
            } else {
                toast({ type: "error", message: "Skorlama başarısız" });
            }
        } catch {
            toast({ type: "error", message: "Skorlama başarısız" });
        } finally {
            setRescoring(false);
        }
    };

    const [commercialStatus, setCommercialStatus] = useState<CommercialStatus>(order?.commercial_status ?? "draft");
    const [fulfillmentStatus, setFulfillmentStatus] = useState<FulfillmentStatus>(order?.fulfillment_status ?? "unallocated");
    const [conflictOpen, setConflictOpen] = useState(false);
    const [conflicts, setConflicts] = useState<ConflictItem[]>([]);
    const [loading, setLoading] = useState<string | null>(null);
    const [justTransitionedCommercial, setJustTransitionedCommercial] = useState<CommercialStatus | null>(null);
    const [justTransitionedFulfillment, setJustTransitionedFulfillment] = useState<FulfillmentStatus | null>(null);

    // Confirmation dialog state
    const [confirmDialog, setConfirmDialog] = useState<{
        action: CommercialStatus | "shipped";
        title: string;
        message: string;
        confirmLabel: string;
        variant: "primary" | "danger";
    } | null>(null);

    type ParasutStatus = "idle" | "sending" | "sent" | "error";
    const [parasutStatus, setParasutStatus] = useState<ParasutStatus>("idle");
    const [parasutInvoiceId, setParasutInvoiceId] = useState<string | null>(null);
    const [parasutError, setParasutError] = useState<string | null>(null);

    // Update parasut state when order loads
    useEffect(() => {
        if (order) {
            if (order.parasutInvoiceId) {
                setParasutStatus("sent");
                setParasutInvoiceId(order.parasutInvoiceId);
            }
            if (order.parasutError) {
                setParasutStatus("error");
                setParasutError(order.parasutError);
            }
        }
    }, [order]);

    // Sync commercial/fulfillment status when order loads
    useEffect(() => {
        if (order) {
            setCommercialStatus(order.commercial_status);
            setFulfillmentStatus(order.fulfillment_status);
        }
    }, [order]);

    if (!order) {
        return (
            <div style={{ padding: "40px", textAlign: "center", color: "var(--text-secondary)", fontSize: "13px" }}>
                Sipariş bulunamadı.{" "}
                <Link href="/dashboard/orders" style={{ color: "var(--accent-text)" }}>
                    Geri dön
                </Link>
            </div>
        );
    }

    const handleTransition = async (next: CommercialStatus | "shipped") => {
        setLoading(next);
        try {
            if (next === "shipped") {
                setParasutStatus("sending");
                const result = await updateOrderStatus(order.id, "shipped");
                if (!result.ok) {
                    toast({ type: "error", message: result.error || "Sevk işlemi başarısız." });
                    return;
                }
                setFulfillmentStatus("shipped");
                setJustTransitionedFulfillment("shipped");
                setTimeout(() => setJustTransitionedFulfillment(null), 1500);
                toast({ type: "success", message: "Sipariş sevk edildi" });
                // Backend handles Paraşüt sync — fetch updated order to get parasut status
                try {
                    const res = await fetch(`/api/orders/${order.id}`);
                    if (res.ok) {
                        const data = await res.json();
                        if (data.parasut_invoice_id) {
                            setParasutStatus("sent");
                            setParasutInvoiceId(data.parasut_invoice_id);
                            toast({ type: "info", message: "Fatura Paraşüt'e gönderildi" });
                        } else if (data.parasut_error) {
                            setParasutStatus("error");
                            setParasutError(data.parasut_error);
                            toast({ type: "error", message: "Paraşüt sync başarısız" });
                        }
                    }
                } catch (err) {
                    console.error("Failed to fetch updated order:", err);
                }
                return;
            }

            if (next === "approved") {
                const result = await updateOrderStatus(order.id, "approved");
                if (!result.ok) {
                    if (result.conflicts) {
                        setConflicts(result.conflicts);
                        setConflictOpen(true);
                        toast({ type: "error", message: "Stok yetersiz — sipariş onaylanamadı" });
                    } else {
                        toast({ type: "error", message: result.error || "Onaylama başarısız." });
                    }
                    return;
                }
                setCommercialStatus("approved");
                setFulfillmentStatus("allocated");
                setJustTransitionedCommercial("approved");
                setTimeout(() => setJustTransitionedCommercial(null), 1500);
                toast({ type: "success", message: "Sipariş onaylandı ve stok rezerve edildi" });
                return;
            }

            // pending_approval, cancelled
            const result = await updateOrderStatus(order.id, next);
            if (!result.ok) {
                toast({ type: "error", message: result.error || "İşlem başarısız oldu." });
                return;
            }
            if (next === "cancelled") {
                setCommercialStatus("cancelled");
                setFulfillmentStatus("unallocated");
                setJustTransitionedCommercial("cancelled");
                setTimeout(() => setJustTransitionedCommercial(null), 1500);
                toast({ type: "warning", message: "Sipariş iptal edildi" });
            } else if (next === "pending_approval") {
                setCommercialStatus("pending_approval");
                setJustTransitionedCommercial("pending_approval");
                setTimeout(() => setJustTransitionedCommercial(null), 1500);
                toast({ type: "success", message: "Sipariş onaya gönderildi" });
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Beklenmeyen bir hata oluştu.";
            toast({ type: "error", message: msg });
        } finally {
            setLoading(null);
        }
    };

    const requestTransition = (next: CommercialStatus | "shipped") => {
        if (next === "cancelled") {
            setConfirmDialog({
                action: "cancelled",
                title: "Siparişi İptal Et",
                message: `${order.orderNumber} numaralı siparişi iptal etmek istediğinize emin misiniz?${fulfillmentStatus === "allocated" ? " Rezerve edilmiş stoklar serbest bırakılır." : ""}`,
                confirmLabel: "Evet, İptal Et",
                variant: "danger",
            });
        } else if (next === "approved") {
            setConfirmDialog({
                action: "approved",
                title: "Siparişi Onayla",
                message: `${order.orderNumber} numaralı siparişi onaylamak istediğinize emin misiniz? Stok kontrolleri yapılacak ve rezervasyon oluşturulacak.`,
                confirmLabel: "Onayla",
                variant: "primary",
            });
        } else {
            handleTransition(next);
        }
    };

    const commercialCfg = commercialStatusConfig[commercialStatus];
    const fulfillmentCfg = fulfillmentStatusConfig[fulfillmentStatus];

    // Commercial timeline steps
    const commercialSteps: CommercialStatus[] = ["draft", "pending_approval", "approved"];
    const currentCommercialIdx = commercialStatus === "cancelled"
        ? commercialSteps.indexOf("pending_approval")
        : commercialSteps.indexOf(commercialStatus);

    return (
        <>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {/* Header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <Link href="/dashboard/orders">
                            <button
                                style={{
                                    fontSize: "12px",
                                    padding: "5px 10px",
                                    border: "0.5px solid var(--border-secondary)",
                                    borderRadius: "6px",
                                    background: "transparent",
                                    color: "var(--text-secondary)",
                                    cursor: "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "5px",
                                }}
                            >
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                    <path d="M8 2L4 6l4 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                                Siparişler
                            </button>
                        </Link>
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                            <path d="M3 2l3 3-3 3" stroke="var(--text-tertiary)" strokeWidth="1" strokeLinecap="round" />
                        </svg>
                        <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
                            {order.orderNumber}
                        </div>
                        {/* Primary badge: commercial status */}
                        <span className={`badge ${commercialCfg.cls}`} style={{ fontSize: "12px", padding: "3px 10px", fontWeight: 700 }}>
                            {commercialCfg.label}
                        </span>
                        {/* Secondary chip: fulfillment status (only when meaningful) */}
                        {fulfillmentStatus !== "unallocated" && (
                            <span className={`badge ${fulfillmentCfg.cls}`} style={{ fontSize: "10px", padding: "2px 7px" }}>
                                {fulfillmentCfg.label}
                            </span>
                        )}
                        {/* AI confidence + risk badge */}
                        {order.aiConfidence != null && order.aiConfidence > 0 && (() => {
                            const risk = order.aiRiskLevel ?? "medium";
                            const riskColors = {
                                low:    { bg: "var(--success-bg)", text: "var(--success-text)", border: "var(--success-border)", label: "Düşük Risk" },
                                medium: { bg: "var(--warning-bg)", text: "var(--warning-text)", border: "var(--warning-border)", label: "Orta Risk" },
                                high:   { bg: "var(--danger-bg)",  text: "var(--danger-text)",  border: "var(--danger-border)",  label: "Yüksek Risk" },
                            };
                            const rc = riskColors[risk];
                            return (
                                <span
                                    title={order.aiReason ?? ""}
                                    style={{
                                        fontSize: "11px", fontWeight: 500, padding: "2px 8px", borderRadius: "4px",
                                        background: rc.bg, color: rc.text, border: `0.5px solid ${rc.border}`,
                                        cursor: order.aiReason ? "help" : "default",
                                    }}
                                >
                                    {rc.label} · %{Math.round(order.aiConfidence * 100)}
                                </span>
                            );
                        })()}
                        {order.aiConfidence != null && order.aiConfidence > 0 && (
                            <button
                                onClick={handleRescore}
                                disabled={rescoring}
                                style={{
                                    fontSize: "10px", padding: "2px 7px", borderRadius: "4px",
                                    border: "0.5px solid var(--border-secondary)",
                                    background: "transparent", color: "var(--text-tertiary)",
                                    cursor: rescoring ? "not-allowed" : "pointer",
                                    opacity: rescoring ? 0.5 : 1,
                                }}
                            >
                                {rescoring ? "..." : "↻ Skorla"}
                            </button>
                        )}
                    </div>

                    {/* Action buttons by status */}
                    <div style={{ display: "flex", gap: "8px" }}>
                        {commercialStatus === "draft" && (
                            <>
                                <Button variant="danger" onClick={() => requestTransition("cancelled")} disabled={loading !== null} loading={loading === "cancelled"}>
                                    İptal Et
                                </Button>
                                <Button variant="primary" onClick={() => handleTransition("pending_approval")} disabled={loading !== null} loading={loading === "pending_approval"}>
                                    {loading === "pending_approval" ? "Gönderiliyor..." : "Onaya Gönder"}
                                </Button>
                            </>
                        )}
                        {commercialStatus === "pending_approval" && (
                            <>
                                <Button variant="danger" onClick={() => requestTransition("cancelled")} disabled={loading !== null} loading={loading === "cancelled"}>
                                    İptal Et
                                </Button>
                                <Button variant="primary" onClick={() => requestTransition("approved")} disabled={loading !== null} loading={loading === "approved"}>
                                    {loading === "approved" ? "Kontrol ediliyor..." : "Onayla"}
                                </Button>
                            </>
                        )}
                        {commercialStatus === "approved" && fulfillmentStatus === "allocated" && (
                            <>
                                <Button variant="danger" onClick={() => requestTransition("cancelled")} disabled={loading !== null} loading={loading === "cancelled"}>
                                    İptal Et
                                </Button>
                                <Button variant="primary" onClick={() => handleTransition("shipped")} disabled={loading !== null} loading={loading === "shipped"}>
                                    {loading === "shipped" ? "Paraşüt'e gönderiliyor..." : "Sevket"}
                                </Button>
                            </>
                        )}
                        {(fulfillmentStatus === "shipped" || commercialStatus === "cancelled") && (
                            <div style={{ fontSize: "12px", color: "var(--text-tertiary)", padding: "6px 0" }}>
                                {fulfillmentStatus === "shipped" ? "Teslim edildi — kapalı" : "İptal edildi — kapalı"}
                            </div>
                        )}
                    </div>
                </div>

                {/* Main grid */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: "12px", alignItems: "start" }}>

                    {/* Left */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>

                        {/* Customer + order info */}
                        <div
                            style={{
                                background: "var(--bg-primary)",
                                border: "0.5px solid var(--border-tertiary)",
                                borderRadius: "6px",
                                padding: "14px 16px",
                                display: "grid",
                                gridTemplateColumns: "1fr 1fr",
                                gap: "16px",
                            }}
                        >
                            <div>
                                <div style={{ fontSize: "11px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "8px" }}>Müşteri</div>
                                <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "3px" }}>{order.customerName}</div>
                                <div style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                                    <div>{order.customerEmail}</div>
                                    <div>{order.customerTaxOffice} · {order.customerTaxNumber}</div>
                                    <div style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>{order.customerCountry} · {order.currency}</div>
                                </div>
                            </div>
                            <div>
                                <div style={{ fontSize: "11px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "8px" }}>Sipariş Bilgisi</div>
                                <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                                    <InfoRow label="Sipariş No" value={order.orderNumber} />
                                    <InfoRow label="Oluşturulma" value={formatDate(order.createdAt)} />
                                    <InfoRow label="Kalem Sayısı" value={`${order.itemCount} ürün`} />
                                    {order.notes && <InfoRow label="Not" value={order.notes} />}
                                </div>
                            </div>
                        </div>

                        {/* Line items table */}
                        <div
                            style={{
                                background: "var(--bg-primary)",
                                border: "0.5px solid var(--border-tertiary)",
                                borderRadius: "6px",
                                overflow: "hidden",
                            }}
                        >
                            <div
                                style={{
                                    padding: "10px 16px",
                                    borderBottom: "0.5px solid var(--border-tertiary)",
                                    fontSize: "12px",
                                    fontWeight: 600,
                                    color: "var(--text-primary)",
                                }}
                            >
                                Sipariş Kalemleri
                            </div>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                                <thead>
                                    <tr style={{ background: "var(--bg-secondary)" }}>
                                        <th style={thStyle}>SKU</th>
                                        <th style={thStyle}>Ürün Adı</th>
                                        <th style={{ ...thStyle, textAlign: "right" }}>Adet</th>
                                        <th style={{ ...thStyle, textAlign: "right" }}>Birim Fiyat</th>
                                        <th style={{ ...thStyle, textAlign: "right" }}>İsk. %</th>
                                        <th style={{ ...thStyle, textAlign: "right" }}>Toplam</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {order.lines.map(line => (
                                        <tr
                                            key={line.id}
                                            onMouseEnter={e => e.currentTarget.querySelectorAll("td").forEach(td => (td.style.background = "var(--bg-secondary)"))}
                                            onMouseLeave={e => e.currentTarget.querySelectorAll("td").forEach(td => (td.style.background = "transparent"))}
                                        >
                                            <td style={{ ...tdStyle, fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-secondary)" }}>
                                                {line.productSku}
                                            </td>
                                            <td style={{ ...tdStyle, fontWeight: 500 }}>
                                                {line.productName}
                                            </td>
                                            <td style={{ ...tdStyle, textAlign: "right" }}>
                                                {line.quantity} {line.unit}
                                            </td>
                                            <td style={{ ...tdStyle, textAlign: "right" }}>
                                                {formatCurrency(line.unitPrice, order.currency)}
                                            </td>
                                            <td style={{ ...tdStyle, textAlign: "right", color: line.discountPct > 0 ? "var(--warning-text)" : "var(--text-tertiary)" }}>
                                                {line.discountPct > 0 ? `%${line.discountPct}` : "—"}
                                            </td>
                                            <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600 }}>
                                                {formatCurrency(line.lineTotal, order.currency)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Right — Summary */}
                    <div style={{ position: "sticky", top: "68px" }}>
                        <div
                            style={{
                                background: "var(--bg-primary)",
                                border: "0.5px solid var(--border-tertiary)",
                                borderRadius: "6px",
                                padding: "14px 16px",
                            }}
                        >
                            <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "14px" }}>
                                Finansal Özet
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                {[
                                    { label: "Ara Toplam", value: formatCurrency(order.subtotal, order.currency) },
                                    { label: "KDV (%20)", value: formatCurrency(order.vatTotal, order.currency) },
                                ].map(row => (
                                    <div key={row.label} style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
                                        <span style={{ color: "var(--text-secondary)" }}>{row.label}</span>
                                        <span style={{ color: "var(--text-primary)" }}>{row.value}</span>
                                    </div>
                                ))}
                                <div
                                    style={{
                                        borderTop: "0.5px solid var(--border-tertiary)",
                                        paddingTop: "10px",
                                        marginTop: "4px",
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "baseline",
                                    }}
                                >
                                    <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>Genel Toplam</span>
                                    <span style={{ fontSize: "20px", fontWeight: 700, color: "var(--text-primary)" }}>
                                        {formatCurrency(order.grandTotal, order.currency)}
                                    </span>
                                </div>
                            </div>

                            {/* Commercial timeline */}
                            <div style={{ marginTop: "16px", paddingTop: "14px", borderTop: "0.5px solid var(--border-tertiary)" }}>
                                <div style={{ fontSize: "11px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "8px" }}>
                                    Ticari Süreç
                                </div>
                                {commercialSteps.map((s, i) => {
                                    const stepIdx = commercialSteps.indexOf(s);
                                    const isDone = stepIdx <= currentCommercialIdx && commercialStatus !== "cancelled";
                                    const isCurrent = s === commercialStatus;
                                    const isJust = justTransitionedCommercial === s;
                                    return (
                                        <div key={s} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: i < commercialSteps.length - 1 ? "6px" : 0 }}>
                                            <div
                                                style={{
                                                    width: isJust ? "8px" : "6px",
                                                    height: isJust ? "8px" : "6px",
                                                    borderRadius: "50%",
                                                    flexShrink: 0,
                                                    background: isCurrent
                                                        ? "var(--accent)"
                                                        : isDone
                                                        ? "var(--success)"
                                                        : "var(--border-primary)",
                                                    boxShadow: isJust ? "0 0 8px var(--accent)" : "none",
                                                }}
                                            />
                                            <span
                                                style={{
                                                    fontSize: "12px",
                                                    color: isCurrent
                                                        ? "var(--accent-text)"
                                                        : isDone
                                                        ? "var(--success-text)"
                                                        : "var(--text-tertiary)",
                                                    fontWeight: isCurrent ? 600 : 400,
                                                    background: isJust ? "var(--accent-bg)" : "transparent",
                                                    padding: isJust ? "1px 6px" : "0",
                                                    borderRadius: "3px",
                                                }}
                                            >
                                                {commercialStatusConfig[s].label}
                                            </span>
                                        </div>
                                    );
                                })}
                                {commercialStatus === "cancelled" && (
                                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "6px" }}>
                                        <div
                                            style={{
                                                width: justTransitionedCommercial === "cancelled" ? "8px" : "6px",
                                                height: justTransitionedCommercial === "cancelled" ? "8px" : "6px",
                                                borderRadius: "50%",
                                                flexShrink: 0,
                                                background: "var(--danger)",
                                                boxShadow: justTransitionedCommercial === "cancelled" ? "0 0 8px var(--danger)" : "none",
                                            }}
                                        />
                                        <span
                                            style={{
                                                fontSize: "12px",
                                                color: "var(--danger-text)",
                                                fontWeight: 600,
                                                background: justTransitionedCommercial === "cancelled" ? "var(--danger-bg)" : "transparent",
                                                padding: justTransitionedCommercial === "cancelled" ? "1px 6px" : "0",
                                                borderRadius: "3px",
                                            }}
                                        >
                                            İptal Edildi
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Fulfillment timeline */}
                            <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "0.5px solid var(--border-tertiary)" }}>
                                <div style={{ fontSize: "11px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "8px" }}>
                                    Lojistik
                                </div>
                                {(["unallocated", "allocated", "shipped"] as FulfillmentStatus[]).map((s, i) => {
                                    const steps = ["unallocated", "allocated", "shipped"];
                                    const currentIdx = steps.indexOf(fulfillmentStatus);
                                    const stepIdx = steps.indexOf(s);
                                    const isDone = stepIdx <= currentIdx;
                                    const isCurrent = s === fulfillmentStatus;
                                    const isJust = justTransitionedFulfillment === s;
                                    return (
                                        <div key={s} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: i < 2 ? "6px" : 0 }}>
                                            <div
                                                style={{
                                                    width: isJust ? "8px" : "6px",
                                                    height: isJust ? "8px" : "6px",
                                                    borderRadius: "50%",
                                                    flexShrink: 0,
                                                    background: isCurrent && s === "shipped"
                                                        ? "var(--success)"
                                                        : isCurrent
                                                        ? "var(--accent)"
                                                        : isDone
                                                        ? "var(--success)"
                                                        : "var(--border-primary)",
                                                    boxShadow: isJust ? "0 0 8px var(--accent)" : "none",
                                                }}
                                            />
                                            <span
                                                style={{
                                                    fontSize: "12px",
                                                    color: isCurrent && s === "shipped"
                                                        ? "var(--success-text)"
                                                        : isCurrent
                                                        ? "var(--accent-text)"
                                                        : isDone
                                                        ? "var(--success-text)"
                                                        : "var(--text-tertiary)",
                                                    fontWeight: isCurrent ? 600 : 400,
                                                    background: isJust ? "var(--accent-bg)" : "transparent",
                                                    padding: isJust ? "1px 6px" : "0",
                                                    borderRadius: "3px",
                                                }}
                                            >
                                                {fulfillmentStatusConfig[s].label}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Paraşüt Muhasebe Sync */}
                            {fulfillmentStatus === "shipped" && (
                                <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "0.5px solid var(--border-tertiary)" }}>
                                    <div style={{ fontSize: "11px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "8px" }}>
                                        Muhasebe Sync
                                    </div>
                                    <ParasutBadge
                                        status={parasutStatus}
                                        invoiceId={parasutInvoiceId}
                                        error={parasutError}
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Conflict Dialog */}
            {conflictOpen && (
                <>
                    <div
                        onClick={() => setConflictOpen(false)}
                        style={{
                            position: "fixed",
                            inset: 0,
                            zIndex: 100,
                            background: "rgba(0,0,0,0.6)",
                        }}
                    />
                    <div
                        style={{
                            position: "fixed",
                            top: "50%",
                            left: "50%",
                            transform: "translate(-50%, -50%)",
                            zIndex: 101,
                            background: "var(--bg-primary)",
                            border: "0.5px solid var(--danger-border)",
                            borderRadius: "8px",
                            padding: "20px 24px",
                            width: "380px",
                            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
                        }}
                    >
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                            <div
                                style={{
                                    width: "22px",
                                    height: "22px",
                                    borderRadius: "4px",
                                    background: "var(--danger-bg)",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    flexShrink: 0,
                                }}
                            >
                                <svg width="10" height="10" viewBox="0 0 10 10">
                                    <path d="M5 1L9 9H1z" fill="var(--danger-text)" />
                                </svg>
                            </div>
                            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--danger-text)" }}>
                                Stok Yetersiz
                            </div>
                        </div>
                        <div style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: "14px" }}>
                            Aşağıdaki ürünlerde satılabilir stok yetersiz. Sipariş onaylanamıyor.
                        </div>
                        <div
                            style={{
                                background: "var(--bg-secondary)",
                                borderRadius: "4px",
                                padding: "8px 12px",
                                marginBottom: "16px",
                                fontSize: "12px",
                            }}
                        >
                            <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-tertiary)", marginBottom: "6px", fontWeight: 500 }}>
                                <span>Ürün</span>
                                <span>Talep / Satılabilir</span>
                            </div>
                            {conflicts.map((c, i) => (
                                <div key={i} style={{ display: "flex", justifyContent: "space-between", color: "var(--text-primary)", marginTop: i > 0 ? "4px" : 0 }}>
                                    <span>{c.productName}</span>
                                    <span style={{ color: "var(--danger-text)" }}>{c.requested} / {c.available} adet</span>
                                </div>
                            ))}
                        </div>
                        <div style={{ display: "flex", gap: "8px" }}>
                            <Button variant="secondary" onClick={() => setConflictOpen(false)} style={{ flex: 1 }}>
                                Kapat
                            </Button>
                        </div>
                    </div>
                </>
            )}

            {/* Confirmation Dialog */}
            {confirmDialog && (
                <>
                    <div
                        onClick={() => setConfirmDialog(null)}
                        style={{
                            position: "fixed",
                            inset: 0,
                            zIndex: 100,
                            background: "rgba(0,0,0,0.6)",
                        }}
                    />
                    <div
                        style={{
                            position: "fixed",
                            top: "50%",
                            left: "50%",
                            transform: "translate(-50%, -50%)",
                            zIndex: 101,
                            background: "var(--bg-primary)",
                            border: `0.5px solid ${confirmDialog.variant === "danger" ? "var(--danger-border)" : "var(--accent-border)"}`,
                            borderRadius: "8px",
                            padding: "20px 24px",
                            width: "380px",
                            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
                        }}
                    >
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                            <div
                                style={{
                                    width: "22px",
                                    height: "22px",
                                    borderRadius: "4px",
                                    background: confirmDialog.variant === "danger" ? "var(--danger-bg)" : "var(--warning-bg)",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    flexShrink: 0,
                                }}
                            >
                                <svg width="10" height="10" viewBox="0 0 10 10">
                                    <path d="M5 1L9 9H1z" fill={confirmDialog.variant === "danger" ? "var(--danger-text)" : "var(--warning-text)"} />
                                </svg>
                            </div>
                            <div style={{
                                fontSize: "13px",
                                fontWeight: 600,
                                color: confirmDialog.variant === "danger" ? "var(--danger-text)" : "var(--text-primary)",
                            }}>
                                {confirmDialog.title}
                            </div>
                        </div>

                        <div style={{
                            fontSize: "13px",
                            color: "var(--text-secondary)",
                            lineHeight: 1.6,
                            marginBottom: "16px",
                        }}>
                            {confirmDialog.message}
                        </div>

                        <div style={{ display: "flex", gap: "8px" }}>
                            <Button variant="secondary" onClick={() => setConfirmDialog(null)} style={{ flex: 1 }}>
                                Vazgeç
                            </Button>
                            <Button
                                variant={confirmDialog.variant}
                                onClick={() => {
                                    const action = confirmDialog.action;
                                    setConfirmDialog(null);
                                    handleTransition(action);
                                }}
                                style={{ flex: 1 }}
                            >
                                {confirmDialog.confirmLabel}
                            </Button>
                        </div>
                    </div>
                </>
            )}
        </>
    );
}

function InfoRow({ label, value }: { label: string; value: string }) {
    return (
        <div style={{ display: "flex", gap: "6px", fontSize: "12px" }}>
            <span style={{ color: "var(--text-tertiary)", minWidth: "80px", flexShrink: 0 }}>{label}</span>
            <span style={{ color: "var(--text-secondary)" }}>{value}</span>
        </div>
    );
}

function ParasutBadge({
    status,
    invoiceId,
    error,
}: {
    status: "idle" | "sending" | "sent" | "error";
    invoiceId: string | null;
    error: string | null;
}) {
    if (status === "idle") return null;

    if (status === "sending") {
        return (
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "7px",
                    padding: "7px 10px",
                    background: "var(--warning-bg)",
                    border: "0.5px solid var(--warning-border)",
                    borderRadius: "6px",
                    fontSize: "12px",
                    color: "var(--warning-text)",
                }}
            >
                <div
                    style={{
                        width: "6px",
                        height: "6px",
                        borderRadius: "50%",
                        background: "var(--warning)",
                        flexShrink: 0,
                    }}
                />
                Paraşüt&apos;e gönderiliyor...
            </div>
        );
    }

    if (status === "sent") {
        return (
            <div
                style={{
                    padding: "7px 10px",
                    background: "var(--success-bg)",
                    border: "0.5px solid var(--success-border)",
                    borderRadius: "6px",
                    fontSize: "12px",
                    color: "var(--success-text)",
                    fontWeight: 500,
                }}
            >
                Fatura {invoiceId} Paraşüt&apos;e gönderildi
            </div>
        );
    }

    return (
        <div
            style={{
                padding: "7px 10px",
                background: "var(--danger-bg)",
                border: "0.5px solid var(--danger-border)",
                borderRadius: "6px",
            }}
        >
            <div style={{ fontSize: "12px", color: "var(--danger-text)", fontWeight: 500, marginBottom: "2px" }}>
                Paraşüt&apos;e gönderilemedi
            </div>
            <div style={{ fontSize: "11px", color: "var(--danger-text)", opacity: 0.8 }}>
                {error}
            </div>
        </div>
    );
}
