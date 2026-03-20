"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useData, type ConflictItem } from "@/lib/data-context";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

type OrderStatus = "DRAFT" | "PENDING" | "APPROVED" | "SHIPPED" | "CANCELLED";

const statusConfig: Record<OrderStatus, { label: string; cls: string }> = {
    DRAFT:     { label: "Taslak",      cls: "badge-neutral" },
    PENDING:   { label: "Bekliyor",    cls: "badge-warning" },
    APPROVED:  { label: "Onaylı",      cls: "badge-accent"  },
    SHIPPED:   { label: "Sevk Edildi", cls: "badge-success" },
    CANCELLED: { label: "İptal",       cls: "badge-danger"  },
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
    const { orderDetails, updateOrderStatus } = useData();
    const { toast } = useToast();
    const order = orderDetails.find(o => o.id === params.id);

    const [status, setStatus] = useState<OrderStatus>(order?.status ?? "DRAFT");
    const [conflictOpen, setConflictOpen] = useState(false);
    const [conflicts, setConflicts] = useState<ConflictItem[]>([]);
    const [loading, setLoading] = useState<string | null>(null);

    type ParasutStatus = "idle" | "sending" | "sent" | "error";
    const [parasutStatus, setParasutStatus] = useState<ParasutStatus>(
        order?.parasutInvoiceId ? "sent" : "idle"
    );
    const [parasutInvoiceId, setParasutInvoiceId] = useState<string | null>(
        order?.parasutInvoiceId ?? null
    );
    const [parasutError, setParasutError] = useState<string | null>(
        order?.parasutError ?? null
    );

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

    const handleTransition = async (next: OrderStatus) => {
        setLoading(next);

        if (next === "SHIPPED") {
            setParasutStatus("sending");
            const result = await updateOrderStatus(order!.id, next);
            if (result.ok) {
                setStatus("SHIPPED");
                toast({ type: "success", message: "Sipariş sevk edildi" });
                if (result.parasutSync && result.parasutSync.success) {
                    setParasutStatus("sent");
                    setParasutInvoiceId((result.parasutSync as { success: true; invoiceId: string }).invoiceId);
                    toast({ type: "info", message: "Fatura Paraşüt'e gönderildi" });
                } else {
                    setParasutStatus("error");
                    setParasutError(
                        result.parasutSync && !result.parasutSync.success
                            ? result.parasutSync.error
                            : "Bilinmeyen hata"
                    );
                    toast({ type: "error", message: "Paraşüt sync başarısız" });
                }
            }
            setLoading(null);
            return;
        }

        // Diğer geçişler: mevcut 600ms simülasyon korunur
        setTimeout(async () => {
            const result = await updateOrderStatus(order!.id, next);
            if (!result.ok && result.conflicts) {
                setConflicts(result.conflicts);
                setConflictOpen(true);
                toast({ type: "error", message: "Stok yetersiz — sipariş onaylanamadı" });
            } else if (result.ok) {
                setStatus(next);
                const labels: Record<string, string> = {
                    PENDING: "Sipariş onaya gönderildi",
                    APPROVED: "Sipariş onaylandı",
                    CANCELLED: "Sipariş iptal edildi",
                };
                toast({ type: next === "CANCELLED" ? "warning" : "success", message: labels[next] ?? "Durum güncellendi" });
            }
            setLoading(null);
        }, 600);
    };

    const cfg = statusConfig[status];

    return (
        <>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {/* Header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
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
                        <span className={`badge ${cfg.cls}`}>{cfg.label}</span>
                    </div>

                    {/* Action buttons by status */}
                    <div style={{ display: "flex", gap: "8px" }}>
                        {status === "DRAFT" && (
                            <>
                                <Button variant="danger" onClick={() => handleTransition("CANCELLED")} disabled={loading !== null} loading={loading === "CANCELLED"}>
                                    İptal Et
                                </Button>
                                <Button variant="primary" onClick={() => handleTransition("PENDING")} disabled={loading !== null} loading={loading === "PENDING"}>
                                    {loading === "PENDING" ? "Gönderiliyor..." : "Onaya Gönder"}
                                </Button>
                            </>
                        )}
                        {status === "PENDING" && (
                            <>
                                <Button variant="danger" onClick={() => handleTransition("CANCELLED")} disabled={loading !== null} loading={loading === "CANCELLED"}>
                                    İptal Et
                                </Button>
                                <Button variant="primary" onClick={() => handleTransition("APPROVED")} disabled={loading !== null} loading={loading === "APPROVED"}>
                                    {loading === "APPROVED" ? "Kontrol ediliyor..." : "Onayla"}
                                </Button>
                            </>
                        )}
                        {status === "APPROVED" && (
                            <>
                                <Button variant="danger" onClick={() => handleTransition("CANCELLED")} disabled={loading !== null} loading={loading === "CANCELLED"}>
                                    İptal Et
                                </Button>
                                <Button variant="primary" onClick={() => handleTransition("SHIPPED")} disabled={loading !== null} loading={loading === "SHIPPED"}>
                                    {loading === "SHIPPED" ? "Paraşüt'e gönderiliyor..." : "Sevket"}
                                </Button>
                            </>
                        )}
                        {(status === "SHIPPED" || status === "CANCELLED") && (
                            <div style={{ fontSize: "12px", color: "var(--text-tertiary)", padding: "6px 0" }}>
                                {status === "SHIPPED" ? "Teslim edildi — kapalı" : "İptal edildi — kapalı"}
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

                            {/* Status timeline */}
                            <div style={{ marginTop: "16px", paddingTop: "14px", borderTop: "0.5px solid var(--border-tertiary)" }}>
                                <div style={{ fontSize: "11px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "10px" }}>
                                    Durum
                                </div>
                                {(["DRAFT", "PENDING", "APPROVED", "SHIPPED"] as OrderStatus[]).map((s, i) => {
                                    const steps = ["DRAFT", "PENDING", "APPROVED", "SHIPPED"];
                                    const currentIdx = status === "CANCELLED"
                                        ? steps.indexOf("PENDING")
                                        : steps.indexOf(status);
                                    const stepIdx = steps.indexOf(s);
                                    const isDone = stepIdx <= currentIdx && status !== "CANCELLED";
                                    const isCurrent = s === status;
                                    return (
                                        <div key={s} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: i < 3 ? "6px" : 0 }}>
                                            <div
                                                style={{
                                                    width: "6px",
                                                    height: "6px",
                                                    borderRadius: "50%",
                                                    flexShrink: 0,
                                                    background: isCurrent
                                                        ? "var(--accent)"
                                                        : isDone
                                                        ? "var(--success)"
                                                        : "var(--border-primary)",
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
                                                }}
                                            >
                                                {statusConfig[s].label}
                                            </span>
                                        </div>
                                    );
                                })}
                                {status === "CANCELLED" && (
                                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "6px" }}>
                                        <div style={{ width: "6px", height: "6px", borderRadius: "50%", flexShrink: 0, background: "var(--danger)" }} />
                                        <span style={{ fontSize: "12px", color: "var(--danger-text)", fontWeight: 600 }}>İptal Edildi</span>
                                    </div>
                                )}
                            </div>

                            {/* Paraşüt Muhasebe Sync */}
                            {status === "SHIPPED" && (
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
                            Asagidaki urunlerin stoku baska bir siparis tarafindan rezerve edildi. Siparis onaylanamıyor.
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
                                <span>Urun</span>
                                <span>Talep / Mevcut</span>
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
                            <Button variant="primary" onClick={() => setConflictOpen(false)} style={{ flex: 1 }}>
                                Stoku Yenile
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
