"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useData, type ShortageItem, type CommercialStatus, type FulfillmentStatus } from "@/lib/data-context";
import { mapOrderDetail } from "@/lib/api-mappers";
import type { OrderDetail } from "@/lib/mock-data";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useIsDemo, DEMO_DISABLED_TOOLTIP, DEMO_BLOCK_TOAST } from "@/lib/demo-utils";
type ParasutStepKey = "contact" | "product" | "shipment" | "invoice" | "edoc";

interface ParasutStatusPayload {
    orderNumber:    string;
    parasutStep:    "contact" | "product" | "shipment" | "invoice" | "edoc" | "done" | null;
    errorKind:      string | null;
    error:          string | null;
    lastFailedStep: string | null;
    retryCount:     number;
    nextRetryAt:    string | null;
    invoiceId:      string | null;
    invoiceNo:      string | null;
    invoiceType:    "e_invoice" | "e_archive" | "manual" | null;
    shipmentDocId:  string | null;
    attemptsLast24h: Record<string, number>;
    eDoc: {
        status: "running" | "done" | "error" | "skipped" | null;
        error:  string | null;
        id:     string | null;
    };
    badges: {
        contactDone:  boolean;
        productDone:  boolean;
        shipmentDone: boolean;
        invoiceDone:  boolean;
        edocStatus:   "running" | "done" | "error" | "skipped" | null;
    };
}

const STEP_LABELS: Record<ParasutStepKey, string> = {
    contact:  "Müşteri",
    product:  "Ürün",
    shipment: "İrsaliye",
    invoice:  "Fatura",
    edoc:     "E-Belge",
};

const commercialStatusConfig: Record<CommercialStatus, { label: string; cls: string; description: string }> = {
    draft:            { label: "Taslak",      cls: "badge-neutral", description: "Onaya gönderilmedi" },
    pending_approval: { label: "Bekliyor",    cls: "badge-warning", description: "Stok kontrol bekleniyor" },
    approved:         { label: "Onaylı",      cls: "badge-accent",  description: "Stok rezerve edildi" },
    cancelled:        { label: "İptal",       cls: "badge-danger",  description: "Sipariş kapatıldı" },
};

const fulfillmentStatusConfig: Record<FulfillmentStatus, { label: string; cls: string; description: string }> = {
    unallocated:         { label: "Rezervesiz",    cls: "badge-neutral",  description: "Stok henüz ayrılmadı" },
    partially_allocated: { label: "Kısmi Rezerve", cls: "badge-warning",  description: "Stok kısmen ayrıldı" },
    allocated:           { label: "Rezerveli",     cls: "badge-warning",  description: "Stok ayrıldı, sevkiyata hazır" },
    partially_shipped:   { label: "Sevk Edildi",   cls: "badge-success",  description: "Müşteriye gönderildi" },
    shipped:             { label: "Sevk Edildi",   cls: "badge-success",  description: "Müşteriye gönderildi" },
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
    const router = useRouter();
    const { updateOrderStatus } = useData();
    const { toast } = useToast();
    const isDemo = useIsDemo();
    const [order, setOrder] = useState<OrderDetail | null>(null);
    const [orderLoading, setOrderLoading] = useState(true);

    // Fetch order from API on mount
    useEffect(() => {
        const controller = new AbortController();
        const fetchOrder = async () => {
            setOrderLoading(true);
            setOrder(null);
            try {
                const res = await fetch(`/api/orders/${params.id}`, { signal: controller.signal });
                if (res.ok) {
                    const data = await res.json();
                    setOrder(mapOrderDetail(data));
                } else {
                    setOrder(null);
                }
            } catch (err) {
                if (err instanceof DOMException && err.name === "AbortError") return;
                setOrder(null);
                console.error("Failed to fetch order:", err);
            } finally {
                setOrderLoading(false);
            }
        };
        if (params.id) fetchOrder();
        return () => controller.abort();
    }, [params.id]);

    const [commercialStatus, setCommercialStatus] = useState<CommercialStatus>(order?.commercial_status ?? "draft");
    const [fulfillmentStatus, setFulfillmentStatus] = useState<FulfillmentStatus>(order?.fulfillment_status ?? "unallocated");
    const [shortageDialogOpen, setShortageDialogOpen] = useState(false);
    const [shortages, setShortages] = useState<ShortageItem[]>([]);
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

    const [hardDeleteOpen, setHardDeleteOpen] = useState(false);
    const [hardDeleteLoading, setHardDeleteLoading] = useState(false);

    type ParasutStatus = "idle" | "sending" | "sent" | "error";
    const [parasutStatus, setParasutStatus] = useState<ParasutStatus>("idle");
    const [parasutInvoiceId, setParasutInvoiceId] = useState<string | null>(null);
    const [parasutError, setParasutError] = useState<string | null>(null);

    // Faz 11.3 — step badges
    const [parasutSteps, setParasutSteps] = useState<ParasutStatusPayload | null>(null);
    const [retryingStep, setRetryingStep] = useState<string | null>(null);
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

    // Faz 11.3 — Paraşüt step badges fetch
    const fetchParasutStatus = useCallback(async () => {
        if (!order || order.fulfillment_status !== "shipped") return;
        try {
            const res = await fetch(`/api/orders/${order.id}/parasut-status`);
            if (res.ok) {
                const data = (await res.json()) as ParasutStatusPayload;
                setParasutSteps(data);
            }
        } catch (err) {
            console.error("Failed to fetch parasut status:", err);
        }
    }, [order]);

    useEffect(() => {
        fetchParasutStatus();
    }, [fetchParasutStatus]);

    const handleRetryStep = async (step: "contact" | "product" | "shipment" | "invoice" | "edoc" | "all") => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        if (!order) return;
        setRetryingStep(step);
        try {
            const res = await fetch("/api/parasut/retry", {
                method:  "POST",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify({ orderId: order.id, step }),
            });
            const data = await res.json();
            if (res.ok && data.success) {
                toast({ type: "success", message: `'${step}' adımı yeniden gönderildi` });
            } else if (data.skipped) {
                toast({ type: "info", message: "Başka bir işlem bu siparişi tutuyor; daha sonra tekrar deneyin" });
            } else {
                toast({ type: "error", message: data.error || "Adım yeniden denenemedi" });
            }
            await fetchParasutStatus();
        } catch (err) {
            toast({ type: "error", message: err instanceof Error ? err.message : "Adım yeniden denenemedi" });
        } finally {
            setRetryingStep(null);
        }
    };

    // Sync commercial/fulfillment status when order loads
    useEffect(() => {
        if (order) {
            setCommercialStatus(order.commercial_status);
            setFulfillmentStatus(order.fulfillment_status);
        }
    }, [order]);

    if (orderLoading) {
        return (
            <div style={{ padding: "40px", textAlign: "center", color: "var(--text-secondary)", fontSize: "13px" }}>
                Sipariş yükleniyor...
            </div>
        );
    }

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
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        setLoading(next);
        try {
            if (next === "shipped") {
                setParasutStatus("sending");
                const result = await updateOrderStatus(order.id, "shipped");
                if (!result.ok) {
                    toast({ type: "error", message: result.error || "Sevk işlemi başarısız." });
                    setParasutStatus("idle");
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
                        } else {
                            setParasutStatus("idle");
                        }
                    }
                } catch (err) {
                    console.error("Failed to fetch updated order:", err);
                    setParasutStatus("idle");
                }
                return;
            }

            if (next === "approved") {
                const result = await updateOrderStatus(order.id, "approved");
                if (!result.ok) {
                    toast({ type: "error", message: result.error || "Onaylama başarısız." });
                    return;
                }
                const realFulfillment = result.fulfillment_status ?? "allocated";
                setCommercialStatus("approved");
                setFulfillmentStatus(realFulfillment);
                setJustTransitionedCommercial("approved");
                setTimeout(() => setJustTransitionedCommercial(null), 1500);
                if (realFulfillment === "partially_allocated" && result.shortages?.length) {
                    setShortages(result.shortages);
                    setShortageDialogOpen(true);
                    toast({ type: "warning", message: "Sipariş kısmi rezerve ile onaylandı" });
                } else {
                    toast({ type: "success", message: "Sipariş onaylandı ve stok rezerve edildi" });
                }
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

    const handleHardDelete = async () => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        setHardDeleteLoading(true);
        try {
            const res = await fetch(`/api/orders/${order.id}?permanent=1`, { method: "DELETE" });
            if (res.ok) {
                toast({ type: "success", message: "Sipariş kalıcı olarak silindi" });
                router.push("/dashboard/orders");
            } else {
                const data = await res.json();
                toast({ type: "error", message: data.error || "Sipariş silinemedi." });
                setHardDeleteOpen(false);
            }
        } catch {
            toast({ type: "error", message: "Beklenmeyen bir hata oluştu." });
            setHardDeleteOpen(false);
        } finally {
            setHardDeleteLoading(false);
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
                    </div>

                    {/* Action buttons by status */}
                    <div style={{ display: "flex", gap: "8px" }}>
                        {commercialStatus === "draft" && (
                            <>
                                <button
                                    onClick={() => setHardDeleteOpen(true)}
                                    disabled={isDemo}
                                    title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}
                                    style={{
                                        fontSize: "11px", padding: "5px 10px",
                                        borderRadius: "5px", border: "1px solid var(--danger-border)",
                                        background: "transparent", color: "var(--danger-text)",
                                        cursor: isDemo ? "not-allowed" : "pointer",
                                        opacity: isDemo ? 0.5 : 1,
                                    }}
                                >
                                    Kalıcı Sil
                                </button>
                                <Button variant="danger" onClick={() => requestTransition("cancelled")} disabled={isDemo || loading !== null} loading={loading === "cancelled"} title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}>
                                    İptal Et
                                </Button>
                                <Button variant="primary" onClick={() => handleTransition("pending_approval")} disabled={isDemo || loading !== null} loading={loading === "pending_approval"} title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}>
                                    {loading === "pending_approval" ? "Gönderiliyor..." : "Onaya Gönder"}
                                </Button>
                            </>
                        )}
                        {commercialStatus === "pending_approval" && (
                            <>
                                <Button variant="danger" onClick={() => requestTransition("cancelled")} disabled={isDemo || loading !== null} loading={loading === "cancelled"} title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}>
                                    İptal Et
                                </Button>
                                <Button variant="primary" onClick={() => requestTransition("approved")} disabled={isDemo || loading !== null} loading={loading === "approved"} title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}>
                                    {loading === "approved" ? "Kontrol ediliyor..." : "Onayla"}
                                </Button>
                            </>
                        )}
                        {commercialStatus === "approved" && fulfillmentStatus !== "shipped" && (
                            <>
                                <Button variant="danger" onClick={() => requestTransition("cancelled")} disabled={isDemo || loading !== null} loading={loading === "cancelled"} title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}>
                                    İptal Et
                                </Button>
                                <Button variant="primary" onClick={() => handleTransition("shipped")} disabled={isDemo || loading !== null} loading={loading === "shipped"} title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}>
                                    {loading === "shipped" ? "Paraşüt'e gönderiliyor..." : "Sevket"}
                                </Button>
                            </>
                        )}
                        {(fulfillmentStatus === "shipped" || commercialStatus === "cancelled") && (
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                {commercialStatus === "cancelled" && (
                                    <button
                                        onClick={() => setHardDeleteOpen(true)}
                                        disabled={isDemo}
                                        title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}
                                        style={{
                                            fontSize: "11px", padding: "5px 10px",
                                            borderRadius: "5px", border: "1px solid var(--danger-border)",
                                            background: "transparent", color: "var(--danger-text)",
                                            cursor: isDemo ? "not-allowed" : "pointer",
                                            opacity: isDemo ? 0.5 : 1,
                                        }}
                                    >
                                        Kalıcı Sil
                                    </button>
                                )}
                                <div style={{ fontSize: "12px", color: "var(--text-tertiary)", padding: "6px 0" }}>
                                    {fulfillmentStatus === "shipped" ? "Teslim edildi — kapalı" : "İptal edildi — kapalı"}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Teklif süresi doldu uyarısı */}
                {order.quoteValidUntil &&
                 order.quoteValidUntil < new Date().toISOString().slice(0, 10) &&
                 (commercialStatus === "draft" || commercialStatus === "pending_approval") && (
                    <div style={{
                        background: "var(--danger-bg)",
                        border: "0.5px solid var(--danger-border)",
                        borderRadius: "6px",
                        padding: "10px 16px",
                        fontSize: "12px",
                        color: "var(--danger-text)",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                    }}>
                        <strong>Teklif Süresi Doldu</strong>
                        <span style={{ color: "var(--text-secondary)" }}>
                            — Geçerlilik tarihi: {new Date(order.quoteValidUntil).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })}
                        </span>
                    </div>
                )}

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
                                    {order.quoteValidUntil && (
                                        <InfoRow
                                            label="Teklif Geçerliliği"
                                            value={new Date(order.quoteValidUntil).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })}
                                        />
                                    )}
                                    {order.notes && <InfoRow label="Not" value={order.notes} />}
                                    {order.quoteId && (
                                        <div style={{ display: "flex", gap: "6px", fontSize: "12px" }}>
                                            <span style={{ color: "var(--text-tertiary)", minWidth: "100px", flexShrink: 0 }}>Kaynak Teklif</span>
                                            <Link
                                                href={`/dashboard/quotes/${order.quoteId}`}
                                                style={{ color: "var(--accent-text)", textDecoration: "none" }}
                                            >
                                                Teklif Detayı →
                                            </Link>
                                        </div>
                                    )}
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
                                        <div key={s} style={{ display: "flex", alignItems: "flex-start", gap: "8px", marginBottom: i < commercialSteps.length - 1 ? "6px" : 0 }}>
                                            <div
                                                style={{
                                                    width: isJust ? "8px" : "6px",
                                                    height: isJust ? "8px" : "6px",
                                                    borderRadius: "50%",
                                                    flexShrink: 0,
                                                    marginTop: "3px",
                                                    background: isCurrent
                                                        ? "var(--accent)"
                                                        : isDone
                                                        ? "var(--success)"
                                                        : "var(--border-primary)",
                                                    boxShadow: isJust ? "0 0 8px var(--accent)" : "none",
                                                }}
                                            />
                                            <div style={{ display: "flex", flexDirection: "column" }}>
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
                                                {isCurrent && (
                                                    <span style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "1px" }}>
                                                        {commercialStatusConfig[s].description}
                                                    </span>
                                                )}
                                            </div>
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
                                        <div key={s} style={{ display: "flex", alignItems: "flex-start", gap: "8px", marginBottom: i < 2 ? "6px" : 0 }}>
                                            <div
                                                style={{
                                                    width: isJust ? "8px" : "6px",
                                                    height: isJust ? "8px" : "6px",
                                                    borderRadius: "50%",
                                                    flexShrink: 0,
                                                    marginTop: "3px",
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
                                            <div style={{ display: "flex", flexDirection: "column" }}>
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
                                                {isCurrent && (
                                                    <span style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "1px" }}>
                                                        {fulfillmentStatusConfig[s].description}
                                                    </span>
                                                )}
                                            </div>
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
                                    {/* Faz 11.3 — Step badges */}
                                    {parasutSteps && (
                                        <ParasutStepBadges
                                            data={parasutSteps}
                                            isDemo={isDemo}
                                            retrying={retryingStep}
                                            onRetry={handleRetryStep}
                                        />
                                    )}
                                </div>
                            )}

                        </div>
                    </div>
                </div>
            </div>

            {/* Shortage Dialog — partial allocation warning */}
            {shortageDialogOpen && (
                <>
                    <div
                        onClick={() => setShortageDialogOpen(false)}
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
                            border: "0.5px solid var(--warning-border)",
                            borderRadius: "8px",
                            padding: "20px 24px",
                            width: "400px",
                            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
                        }}
                    >
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                            <div
                                style={{
                                    width: "22px",
                                    height: "22px",
                                    borderRadius: "4px",
                                    background: "var(--warning-bg)",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    flexShrink: 0,
                                }}
                            >
                                <svg width="10" height="10" viewBox="0 0 10 10">
                                    <path d="M5 1L9 9H1z" fill="var(--warning-text)" />
                                </svg>
                            </div>
                            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--warning-text)" }}>
                                Kısmi Rezervasyon
                            </div>
                        </div>
                        <div style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: "14px" }}>
                            Sipariş onaylandı ancak aşağıdaki ürünlerde stok yetersiz kaldı. Eksik stok tamamlanmadan sevk yapılamaz.
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
                                <span>Rezerve / Talep (Eksik)</span>
                            </div>
                            {shortages.map((s, i) => (
                                <div key={i} style={{ display: "flex", justifyContent: "space-between", color: "var(--text-primary)", marginTop: i > 0 ? "4px" : 0 }}>
                                    <span>{s.product_name}</span>
                                    <span style={{ color: "var(--warning-text)" }}>{s.reserved} / {s.requested} adet ({s.shortage} eksik)</span>
                                </div>
                            ))}
                        </div>
                        <div style={{ display: "flex", gap: "8px" }}>
                            <Button variant="secondary" onClick={() => setShortageDialogOpen(false)} style={{ flex: 1 }}>
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

            {/* Hard Delete Confirmation Modal */}
            {hardDeleteOpen && (
                <>
                    <div
                        onClick={() => !hardDeleteLoading && setHardDeleteOpen(false)}
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
                            width: "400px",
                            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
                        }}
                    >
                        <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--danger-text)", marginBottom: "10px" }}>
                            Siparişi Kalıcı Sil
                        </div>
                        <div style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: "16px" }}>
                            <strong style={{ color: "var(--text-primary)" }}>{order.orderNumber}</strong> numaralı sipariş kalıcı olarak silinecek. Bu işlem geri alınamaz. Sipariş satırları ve rezervasyonlar da silinir.
                        </div>
                        <div style={{ display: "flex", gap: "8px" }}>
                            <Button variant="secondary" onClick={() => setHardDeleteOpen(false)} disabled={hardDeleteLoading} style={{ flex: 1 }}>
                                Vazgeç
                            </Button>
                            <Button variant="danger" onClick={handleHardDelete} disabled={hardDeleteLoading} style={{ flex: 1 }}>
                                {hardDeleteLoading ? "Siliniyor..." : "Evet, kalıcı sil"}
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

// ── Faz 11.3 — Step Badges ────────────────────────────────────

type StepColor = "gray" | "blue" | "green" | "red";

function stepColor(c: StepColor): { bg: string; border: string; text: string; dot: string } {
    if (c === "green")
        return { bg: "var(--success-bg)", border: "var(--success-border)", text: "var(--success-text)", dot: "var(--success)" };
    if (c === "blue")
        return { bg: "var(--accent-bg)",  border: "var(--accent-border)",  text: "var(--accent-text)",  dot: "var(--accent)" };
    if (c === "red")
        return { bg: "var(--danger-bg)",  border: "var(--danger-border)",  text: "var(--danger-text)",  dot: "var(--danger)" };
    return { bg: "var(--bg-tertiary)",    border: "var(--border-tertiary)", text: "var(--text-tertiary)", dot: "var(--border-primary)" };
}

function ParasutStepBadges({
    data,
    isDemo,
    retrying,
    onRetry,
}: {
    data:     ParasutStatusPayload;
    isDemo:   boolean;
    retrying: string | null;
    onRetry:  (step: ParasutStepKey | "all") => void;
}) {
    const order: ParasutStepKey[] = ["contact", "product", "shipment", "invoice", "edoc"];
    const isErrorOnStep = (s: ParasutStepKey): boolean =>
        data.lastFailedStep === s || (s === "edoc" && data.eDoc.status === "error");

    function colorFor(s: ParasutStepKey): StepColor {
        if (isErrorOnStep(s)) return "red";
        if (s === "edoc") {
            if (data.eDoc.status === "done")    return "green";
            if (data.eDoc.status === "skipped") return "gray";
            if (data.eDoc.status === "running") return "blue";
            return "gray";
        }
        const done = (
            (s === "contact"  && data.badges.contactDone) ||
            (s === "product"  && data.badges.productDone) ||
            (s === "shipment" && data.badges.shipmentDone) ||
            (s === "invoice"  && data.badges.invoiceDone)
        );
        if (done) return "green";
        if (data.parasutStep === s) return "blue";
        return "gray";
    }

    function labelFor(s: ParasutStepKey): string {
        const base = STEP_LABELS[s];
        if (s === "edoc") {
            if (data.eDoc.status === "done")    return `${base} ✓`;
            if (data.eDoc.status === "skipped") return `${base} (Manuel)`;
            if (data.eDoc.status === "running") return `${base}…`;
            if (data.eDoc.status === "error")   return `${base} ✕`;
        }
        if (colorFor(s) === "green") return `${base} ✓`;
        if (colorFor(s) === "blue")  return `${base}…`;
        if (colorFor(s) === "red")   return `${base} ✕`;
        return base;
    }

    function tooltipFor(s: ParasutStepKey): string {
        const parts: string[] = [];
        if (isErrorOnStep(s)) {
            const msg = s === "edoc" ? data.eDoc.error : data.error;
            if (msg) parts.push(msg);
            if (data.errorKind) parts.push(`Tip: ${data.errorKind}`);
            if (data.nextRetryAt) parts.push(`Sonraki deneme: ${new Date(data.nextRetryAt).toLocaleString("tr-TR")}`);
            if (data.retryCount > 0) parts.push(`Deneme: ${data.retryCount}`);
        }
        // Audit: son 24 saatteki bu step için toplam deneme (hata olmasa bile bilgilendirici)
        const last24h = data.attemptsLast24h?.[s] ?? 0;
        if (last24h > 0) parts.push(`Son 24h: ${last24h} deneme`);
        return parts.join("\n");
    }

    return (
        <div style={{ marginTop: "10px" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {order.map((s) => {
                    const c   = stepColor(colorFor(s));
                    const err = isErrorOnStep(s);
                    const tip = tooltipFor(s);
                    const color = colorFor(s);
                    const canRetry =
                        !isDemo &&
                        color !== "green" &&
                        !(s === "edoc" && data.eDoc.status === "skipped");
                    return (
                        <div
                            key={s}
                            title={tip || undefined}
                            style={{
                                display:    "inline-flex",
                                alignItems: "center",
                                gap:        "6px",
                                padding:    "5px 8px",
                                background: c.bg,
                                border:     `0.5px solid ${c.border}`,
                                borderRadius: "5px",
                                fontSize:   "11px",
                                color:      c.text,
                                fontWeight: 500,
                            }}
                        >
                            <span
                                style={{
                                    width:        "5px",
                                    height:       "5px",
                                    borderRadius: "50%",
                                    background:   c.dot,
                                }}
                            />
                            <span>{labelFor(s)}</span>
                            {canRetry && (
                                <button
                                    type="button"
                                    onClick={() => onRetry(s)}
                                    disabled={retrying === s}
                                    title={isDemo ? DEMO_DISABLED_TOOLTIP : `'${STEP_LABELS[s]}' adımını yeniden dene`}
                                    style={{
                                        marginLeft: "2px",
                                        background: "transparent",
                                        border:     "none",
                                        color:      c.text,
                                        cursor:     retrying === s ? "wait" : "pointer",
                                        fontSize:   "10px",
                                        textDecoration: "underline",
                                        padding:    0,
                                    }}
                                >
                                    {retrying === s ? "…" : "yeniden dene"}
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>
            {(data.error || data.eDoc.error) && (
                <div style={{ marginTop: "6px", fontSize: "11px", color: "var(--danger-text)" }}>
                    {data.error || data.eDoc.error}
                </div>
            )}
            {!isDemo && (data.parasutStep && data.parasutStep !== "done") && (
                <button
                    type="button"
                    onClick={() => onRetry("all")}
                    disabled={retrying === "all"}
                    style={{
                        marginTop:  "8px",
                        padding:    "4px 10px",
                        background: "var(--bg-tertiary)",
                        border:     "0.5px solid var(--border-secondary)",
                        borderRadius: "4px",
                        fontSize:   "11px",
                        color:      "var(--text-secondary)",
                        cursor:     retrying === "all" ? "wait" : "pointer",
                    }}
                >
                    {retrying === "all" ? "Senkronize ediliyor…" : "Tüm adımları yeniden dene"}
                </button>
            )}
        </div>
    );
}
