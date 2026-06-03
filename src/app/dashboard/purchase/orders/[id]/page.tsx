"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useToast } from "@/components/ui/Toast";
import { useIsDemo, DEMO_DISABLED_TOOLTIP, DEMO_BLOCK_TOAST } from "@/lib/demo-utils";
import type { PurchaseOrderRow, PurchaseOrderLineRow, PurchaseOrderStatus, VendorRow, ProductRow } from "@/lib/database.types";
import type { AuditEntry } from "@/lib/supabase/audit-log";

const thStyle: React.CSSProperties = {
    textAlign: "left", padding: "10px 14px", fontSize: "12px", fontWeight: 500,
    color: "var(--text-secondary)", borderBottom: "0.5px solid var(--border-tertiary)",
};
const tdStyle: React.CSSProperties = {
    padding: "10px 14px", fontSize: "13px", borderBottom: "0.5px solid var(--border-tertiary)",
    color: "var(--text-primary)", lineHeight: 1.4,
};

const STATUS_BG: Record<PurchaseOrderStatus, { bg: string; text: string }> = {
    draft:              { bg: "var(--bg-tertiary)",     text: "var(--text-secondary)" },
    sent:               { bg: "var(--accent-bg)",       text: "var(--accent-text)" },
    confirmed:          { bg: "var(--success-bg)",      text: "var(--success-text)" },
    partially_received: { bg: "var(--warning-bg)",      text: "var(--warning-text)" },
    received:           { bg: "var(--success-bg)",      text: "var(--success-text)" },
    cancelled:          { bg: "var(--danger-bg)",       text: "var(--danger-text)" },
};
const STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
    draft: "Taslak", sent: "Gönderildi", confirmed: "Onaylandı",
    partially_received: "Kısmi Kabul", received: "Tamamlandı", cancelled: "İptal",
};

const ACTION_LABELS: Record<string, string> = {
    po_created:             "Sipariş oluşturuldu",
    po_sent:                "Tedarikçiye gönderildi",
    po_confirmed:           "Onaylandı",
    po_partially_received:  "Kısmi mal kabul",
    po_received:            "Tamamen alındı",
    po_cancelled:           "İptal edildi",
    po_revised:             "Taslağa geri alındı (revize)",
    po_lines_replaced:      "Satırlar güncellendi",
};

interface POWithLines extends PurchaseOrderRow {
    lines: PurchaseOrderLineRow[];
}

function formatCurrency(amount: number, currency: string): string {
    const sym = currency === "USD" ? "$" : currency === "EUR" ? "€" : "₺";
    return `${sym}${amount.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** ISO tarih (YYYY-MM-DD) → tr-TR (DD.MM.YYYY); null → "—". Liste sayfasıyla tutarlı. */
function formatExpectedDate(iso: string | null): string {
    if (!iso) return "—";
    return new Date(iso + "T00:00:00Z").toLocaleDateString("tr-TR");
}

export default function PurchaseOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const { toast } = useToast();
    const isDemo = useIsDemo();

    const [po, setPo] = useState<POWithLines | null>(null);
    const [vendor, setVendor] = useState<VendorRow | null>(null);
    const [productMap, setProductMap] = useState<Map<string, ProductRow>>(new Map());
    const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionBusy, setActionBusy] = useState<string | null>(null);
    const [cancelOpen, setCancelOpen] = useState(false);
    const [cancelReason, setCancelReason] = useState("");
    const [receiveMode, setReceiveMode] = useState(false);
    // line_id → qty to receive
    const [receiveQtys, setReceiveQtys] = useState<Record<string, string>>({});

    const loadPO = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/purchase-orders/${id}`);
            if (!res.ok) {
                if (res.status === 404) toast({ type: "error", message: "Sipariş bulunamadı." });
                setPo(null);
                return;
            }
            const data: POWithLines = await res.json();
            setPo(data);

            const [vRes, pRes, audRes] = await Promise.all([
                fetch(`/api/vendors/${data.vendor_id}`),
                fetch(`/api/products?all=1`),
                fetch(`/api/audit-log?entity_type=purchase_order&entity_id=${id}`),
            ]);
            if (vRes.ok) setVendor(await vRes.json());
            if (pRes.ok) {
                const prods: ProductRow[] = await pRes.json();
                const m = new Map<string, ProductRow>();
                for (const p of prods) m.set(p.id, p);
                setProductMap(m);
            }
            if (audRes.ok) setAuditEntries(await audRes.json());
        } catch {
            toast({ type: "error", message: "Sipariş yüklenemedi." });
        } finally {
            setLoading(false);
        }
    }, [id, toast]);

    useEffect(() => { void loadPO(); }, [loadPO]);

    const doTransition = async (action: "send" | "confirm" | "revise", successMsg: string, confirmMsg?: string) => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        if (actionBusy) return;
        if (confirmMsg && !confirm(confirmMsg)) return;
        setActionBusy(action);
        try {
            const endpoint = `/api/purchase-orders/${id}/${action}`;
            const res = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
            });
            const data = await res.json();
            if (!res.ok) { toast({ type: "error", message: data.error ?? "İşlem başarısız." }); return; }
            toast({ type: "success", message: successMsg });
            await loadPO();
        } catch {
            toast({ type: "error", message: "Beklenmeyen hata." });
        } finally {
            setActionBusy(null);
        }
    };

    const handleCancel = async () => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        if (!cancelReason.trim()) { toast({ type: "error", message: "İptal gerekçesi zorunludur." }); return; }
        setActionBusy("cancel");
        try {
            const res = await fetch(`/api/purchase-orders/${id}/cancel`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reason: cancelReason.trim() }),
            });
            const data = await res.json();
            if (!res.ok) {
                const msg = res.status === 403
                    ? "Sadece admin kullanıcılar iptal edebilir."
                    : data.error ?? "İptal başarısız.";
                toast({ type: "error", message: msg });
                return;
            }
            toast({ type: "success", message: "Sipariş iptal edildi." });
            setCancelOpen(false);
            setCancelReason("");
            await loadPO();
        } catch {
            toast({ type: "error", message: "Beklenmeyen hata." });
        } finally {
            setActionBusy(null);
        }
    };

    const handleReceive = async () => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        if (!po) return;
        const lines = po.lines
            .map(l => ({ line_id: l.id, qty: parseInt(receiveQtys[l.id] ?? "0", 10) }))
            .filter(l => l.qty > 0);
        if (lines.length === 0) {
            toast({ type: "error", message: "En az 1 satır için miktar giriniz." });
            return;
        }
        setActionBusy("receive");
        try {
            const res = await fetch(`/api/purchase-orders/${id}/receive`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ lines }),
            });
            const data = await res.json();
            if (!res.ok) {
                const msg = res.status === 403
                    ? "Mal kabul için admin veya satın alma yetkilisi gerekir."
                    : data.error ?? "Mal kabul başarısız.";
                toast({ type: "error", message: msg });
                return;
            }
            toast({ type: "success", message: "Mal kabul kaydedildi." });
            setReceiveMode(false);
            setReceiveQtys({});
            await loadPO();
        } catch {
            toast({ type: "error", message: "Beklenmeyen hata." });
        } finally {
            setActionBusy(null);
        }
    };

    if (loading) {
        return <div style={{ padding: "32px", textAlign: "center", color: "var(--text-tertiary)", fontSize: "13px" }}>
            Yükleniyor...
        </div>;
    }
    if (!po) {
        return <div style={{ padding: "32px", textAlign: "center", color: "var(--text-tertiary)", fontSize: "13px" }}>
            <p>Sipariş bulunamadı.</p>
            <Link href="/dashboard/purchase/orders" style={{ color: "var(--accent-text)" }}>← Siparişlere dön</Link>
        </div>;
    }

    const isDraft = po.status === "draft";
    const isSent = po.status === "sent";
    const isCancelable = !["received", "cancelled"].includes(po.status);
    const isReceivable = po.status === "confirmed" || po.status === "partially_received";

    return (
        <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
            {/* Breadcrumb */}
            <Link href="/dashboard/purchase/orders" style={{
                fontSize: "12px", color: "var(--text-tertiary)", textDecoration: "none", display: "inline-block", marginBottom: "12px",
            }}>← Siparişler</Link>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
                <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <h1 style={{ fontSize: "20px", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
                            {po.po_number}
                        </h1>
                        <span style={{
                            fontSize: "11px", padding: "2px 8px", borderRadius: "5px",
                            background: STATUS_BG[po.status].bg, color: STATUS_BG[po.status].text, fontWeight: 500,
                        }}>{STATUS_LABEL[po.status]}</span>
                    </div>
                    <p style={{ fontSize: "13px", color: "var(--text-tertiary)", margin: "4px 0 0" }}>
                        {vendor?.name ?? "—"} · Beklenen: {formatExpectedDate(po.expected_date)}
                    </p>
                </div>

                {/* Status action buttons */}
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    {isDraft && (
                        <button onClick={() => doTransition("send", "Sipariş gönderildi olarak işaretlendi.")}
                            disabled={isDemo || actionBusy !== null}
                            title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}
                            style={btnSecondary(isDemo || actionBusy !== null)}>Gönder</button>
                    )}
                    {(isDraft || isSent) && (
                        <button onClick={() => doTransition("confirm", "Sipariş onaylandı.")}
                            disabled={isDemo || actionBusy !== null}
                            title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}
                            style={btnPrimary(isDemo || actionBusy !== null)}>Onayla</button>
                    )}
                    {isSent && (
                        <button onClick={() => doTransition("revise", "Sipariş taslağa geri alındı.",
                            "Bu sipariş 'Taslak' durumuna geri alınacak. Devam edilsin mi?")}
                            disabled={isDemo || actionBusy !== null}
                            title={isDemo ? DEMO_DISABLED_TOOLTIP : "Sent → Draft (M1 revize)"}
                            style={btnSecondary(isDemo || actionBusy !== null)}>Revize Et</button>
                    )}
                    {isDraft && (
                        <button onClick={() => router.push(`/dashboard/purchase/orders/new?fromDraft=${id}`)}
                            disabled={isDemo}
                            title={isDemo ? DEMO_DISABLED_TOOLTIP : "Bu siparişin satırlarını kopyalayarak yeni taslak"}
                            style={btnSecondary(isDemo)}>Düzenle</button>
                    )}
                    {isReceivable && !receiveMode && (
                        <button onClick={() => {
                            setReceiveMode(true);
                            // kalan miktarları varsayılan olarak doldur
                            const defaults: Record<string, string> = {};
                            for (const l of po.lines) {
                                const rem = l.quantity - l.received_qty;
                                if (rem > 0) defaults[l.id] = String(rem);
                            }
                            setReceiveQtys(defaults);
                        }}
                            disabled={isDemo || actionBusy !== null}
                            title={isDemo ? DEMO_DISABLED_TOOLTIP : "Mal kabul girişi"}
                            style={btnPrimary(isDemo || actionBusy !== null)}>Mal Kabul</button>
                    )}
                    {isCancelable && (
                        <button onClick={() => setCancelOpen(true)} disabled={isDemo}
                            title={isDemo ? DEMO_DISABLED_TOOLTIP : "Sipariş iptal (admin)"}
                            style={btnDanger(isDemo)}>İptal Et</button>
                    )}
                    <Link
                        href={`/dashboard/purchase/orders/${po.id}/print`}
                        target="_blank"
                        rel="noopener"
                        title="Sipariş belgesini yazdır veya PDF olarak kaydet"
                        aria-label="Sipariş belgesini yazdır veya PDF olarak kaydet"
                        style={{ ...btnSecondary(false), textDecoration: "none", display: "inline-block" }}
                    >📄 Yazdır / PDF</Link>
                </div>
            </div>

            {/* Summary cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px", marginBottom: "16px" }}>
                <SummaryCard label="Tedarikçi" value={vendor?.name ?? "—"} />
                <SummaryCard label="Para Birimi" value={po.currency} />
                <SummaryCard label="Ara Toplam" value={formatCurrency(po.subtotal, po.currency)} />
                <SummaryCard label="KDV" value={formatCurrency(po.vat_total, po.currency)} />
                <SummaryCard label="Genel Toplam" value={formatCurrency(po.grand_total, po.currency)} highlight />
            </div>

            {/* Mal Kabul modu */}
            {receiveMode && (
                <div role="region" aria-label="Mal kabul girişi" style={{
                    background: "var(--bg-primary)", border: "0.5px solid var(--warning-border)",
                    borderRadius: "8px", padding: "16px", marginBottom: "16px",
                }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                        <strong style={{ fontSize: "13px", color: "var(--warning-text)" }}>Mal Kabul Girişi</strong>
                        <button onClick={() => { setReceiveMode(false); setReceiveQtys({}); }}
                            style={btnSecondary(false)}>Vazgeç</button>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "12px" }}>
                        {po.lines.map(l => {
                            const prod = productMap.get(l.product_id);
                            const remaining = l.quantity - l.received_qty;
                            if (remaining <= 0) return null;
                            return (
                                <div key={l.id} style={{
                                    display: "flex", alignItems: "center", gap: "12px",
                                    padding: "8px 10px", background: "var(--bg-secondary)",
                                    borderRadius: "6px", border: "0.5px solid var(--border-tertiary)",
                                }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                            {prod?.name ?? l.product_id}
                                        </div>
                                        <div style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>
                                            Kalan: {remaining} / Toplam: {l.quantity}
                                        </div>
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                        <label htmlFor={`recv-${l.id}`} style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                                            Alınan:
                                        </label>
                                        <input
                                            id={`recv-${l.id}`}
                                            type="number"
                                            min={0}
                                            max={remaining}
                                            value={receiveQtys[l.id] ?? ""}
                                            onChange={e => setReceiveQtys(prev => ({ ...prev, [l.id]: e.target.value }))}
                                            aria-label={`${prod?.name ?? "Satır"} alınan miktar`}
                                            style={{
                                                width: "80px", padding: "4px 8px", fontSize: "13px",
                                                border: "0.5px solid var(--border-secondary)", borderRadius: "5px",
                                                background: "var(--bg-primary)", color: "var(--text-primary)",
                                                fontVariantNumeric: "tabular-nums",
                                            }}
                                        />
                                        <button
                                            onClick={() => setReceiveQtys(prev => ({ ...prev, [l.id]: String(remaining) }))}
                                            style={{ fontSize: "11px", padding: "3px 8px", background: "transparent",
                                                color: "var(--accent-text)", border: "0.5px solid var(--accent-border)",
                                                borderRadius: "4px", cursor: "pointer" }}>
                                            Tümü
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <div aria-live="polite" />
                    <button onClick={handleReceive}
                        disabled={isDemo || actionBusy !== null}
                        title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}
                        style={btnPrimary(isDemo || actionBusy !== null)}>
                        {actionBusy === "receive" ? "Kaydediliyor..." : "Kabulü Kaydet"}
                    </button>
                </div>
            )}

            {/* Lines table */}
            <div style={{ background: "var(--bg-primary)", border: "0.5px solid var(--border-tertiary)", borderRadius: "8px", overflow: "hidden", marginBottom: "16px" }}>
                <div style={{ padding: "12px 14px", borderBottom: "0.5px solid var(--border-tertiary)", background: "var(--bg-secondary)" }}>
                    <strong style={{ fontSize: "13px", color: "var(--text-primary)" }}>Satırlar ({po.lines.length})</strong>
                </div>
                {po.lines.length === 0 ? (
                    <div style={{ padding: "20px", textAlign: "center", color: "var(--text-tertiary)", fontSize: "13px" }}>
                        Satır yok.
                    </div>
                ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                            <tr style={{ background: "var(--bg-secondary)" }}>
                                <th style={thStyle}>Ürün</th>
                                <th style={{ ...thStyle, textAlign: "right" }}>Miktar</th>
                                <th style={{ ...thStyle, textAlign: "right" }}>Alındı</th>
                                <th style={{ ...thStyle, textAlign: "right" }}>Birim Fiyat</th>
                                <th style={{ ...thStyle, textAlign: "right" }}>İskonto</th>
                                <th style={{ ...thStyle, textAlign: "right" }}>Satır Toplamı</th>
                            </tr>
                        </thead>
                        <tbody>
                            {po.lines.map(l => {
                                const prod = productMap.get(l.product_id);
                                return (
                                    <tr key={l.id}>
                                        <td style={tdStyle}>
                                            <div style={{ fontWeight: 500 }}>{prod?.name ?? "—"}</div>
                                            {prod?.sku && <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>{prod.sku}</div>}
                                        </td>
                                        <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{l.quantity}</td>
                                        <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums", color: l.received_qty === l.quantity ? "var(--success-text)" : l.received_qty > 0 ? "var(--warning-text)" : "var(--text-tertiary)" }}>
                                            {l.received_qty} / {l.quantity}
                                        </td>
                                        <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                                            {formatCurrency(l.unit_price, po.currency)}
                                        </td>
                                        <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{l.discount_pct}%</td>
                                        <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 500 }}>
                                            {formatCurrency(l.line_total, po.currency)}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Notes */}
            {po.notes && (
                <div style={{
                    background: "var(--bg-primary)", border: "0.5px solid var(--border-tertiary)",
                    borderRadius: "8px", padding: "12px 14px", marginBottom: "16px",
                }}>
                    <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginBottom: "4px" }}>Notlar</div>
                    <div style={{ fontSize: "13px", color: "var(--text-primary)", whiteSpace: "pre-wrap" }}>{po.notes}</div>
                </div>
            )}

            {po.cancel_reason && (
                <div style={{
                    background: "var(--danger-bg)", border: "0.5px solid var(--danger-border)",
                    borderRadius: "8px", padding: "12px 14px", marginBottom: "16px",
                }}>
                    <div style={{ fontSize: "11px", color: "var(--danger-text)", marginBottom: "4px" }}>İptal Gerekçesi</div>
                    <div style={{ fontSize: "13px", color: "var(--danger-text)" }}>{po.cancel_reason}</div>
                </div>
            )}

            {/* Audit timeline */}
            {auditEntries.length > 0 && (
                <div style={{
                    background: "var(--bg-primary)", border: "0.5px solid var(--border-tertiary)",
                    borderRadius: "8px", overflow: "hidden", marginBottom: "16px",
                }}>
                    <div style={{
                        padding: "12px 14px", borderBottom: "0.5px solid var(--border-tertiary)",
                        background: "var(--bg-secondary)",
                    }}>
                        <strong style={{ fontSize: "13px", color: "var(--text-primary)" }}>
                            Aktivite ({auditEntries.length})
                        </strong>
                    </div>
                    <ol aria-label="Sipariş aktivite geçmişi" style={{
                        listStyle: "none", margin: 0, padding: "8px 16px",
                    }}>
                        {auditEntries.map(e => (
                            <li key={e.id} style={{
                                display: "flex", gap: "12px", padding: "6px 0",
                                fontSize: "12px", alignItems: "baseline",
                                borderBottom: "0.5px solid var(--border-tertiary)",
                            }}>
                                <span style={{ color: "var(--text-tertiary)", minWidth: "150px", fontVariantNumeric: "tabular-nums" }}>
                                    {new Date(e.occurred_at).toLocaleString("tr-TR")}
                                </span>
                                <span style={{ color: "var(--text-primary)" }}>
                                    {ACTION_LABELS[e.action] ?? e.action}
                                </span>
                                {e.actor && (
                                    <span style={{ color: "var(--text-tertiary)", marginLeft: "auto", fontSize: "11px" }}>
                                        {e.actor}
                                    </span>
                                )}
                            </li>
                        ))}
                    </ol>
                </div>
            )}

            {/* Cancel modal */}
            {cancelOpen && (
                <div role="dialog" aria-modal="true" aria-labelledby="po-cancel-title" style={{
                    position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200,
                    display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                    <div style={{
                        background: "var(--bg-primary)", padding: "24px", borderRadius: "10px",
                        width: "440px", maxWidth: "calc(100vw - 32px)", display: "flex", flexDirection: "column", gap: "12px",
                    }}>
                        <h2 id="po-cancel-title" style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
                            Siparişi İptal Et
                        </h2>
                        <p style={{ fontSize: "13px", color: "var(--text-secondary)", margin: 0 }}>
                            <strong>{po.po_number}</strong> iptal edilecek. Bekleyen commitment&apos;lar otomatik iptal olur.
                            Sadece admin yetkili kullanıcılar bu işlemi yapabilir.
                        </p>
                        <textarea
                            placeholder="İptal gerekçesi (zorunlu)"
                            value={cancelReason}
                            onChange={e => setCancelReason(e.target.value)}
                            aria-label="İptal gerekçesi"
                            rows={3}
                            style={{
                                fontSize: "13px", padding: "8px 10px",
                                border: "0.5px solid var(--border-secondary)", borderRadius: "6px",
                                background: "var(--bg-tertiary)", color: "var(--text-primary)",
                                resize: "vertical",
                            }}
                        />
                        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                            <button onClick={() => { setCancelOpen(false); setCancelReason(""); }}
                                style={btnSecondary(false)}>Vazgeç</button>
                            <button onClick={handleCancel} disabled={isDemo || actionBusy !== null || !cancelReason.trim()}
                                title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}
                                style={btnDanger(isDemo || actionBusy !== null || !cancelReason.trim())}>
                                {actionBusy === "cancel" ? "İptal ediliyor..." : "İptal Et"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function SummaryCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
    return (
        <div style={{
            background: "var(--bg-primary)",
            border: `0.5px solid ${highlight ? "var(--accent-border)" : "var(--border-tertiary)"}`,
            borderRadius: "8px", padding: "12px 14px",
        }}>
            <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginBottom: "4px" }}>{label}</div>
            <div style={{
                fontSize: "14px", fontWeight: 500,
                color: highlight ? "var(--accent-text)" : "var(--text-primary)",
                fontVariantNumeric: "tabular-nums",
            }}>{value}</div>
        </div>
    );
}

function btnPrimary(disabled: boolean): React.CSSProperties {
    return {
        padding: "6px 14px", fontSize: "13px",
        background: disabled ? "var(--bg-tertiary)" : "var(--accent)",
        color: disabled ? "var(--text-tertiary)" : "#fff",
        border: "none", borderRadius: "6px",
        cursor: disabled ? "not-allowed" : "pointer", fontWeight: 500,
    };
}
function btnSecondary(disabled: boolean): React.CSSProperties {
    return {
        padding: "6px 14px", fontSize: "13px",
        background: disabled ? "var(--bg-tertiary)" : "transparent",
        color: disabled ? "var(--text-tertiary)" : "var(--text-secondary)",
        border: "0.5px solid var(--border-secondary)", borderRadius: "6px",
        cursor: disabled ? "not-allowed" : "pointer",
    };
}
function btnDanger(disabled: boolean): React.CSSProperties {
    return {
        padding: "6px 14px", fontSize: "13px",
        background: disabled ? "var(--bg-tertiary)" : "var(--danger)",
        color: disabled ? "var(--text-tertiary)" : "#fff",
        border: "none", borderRadius: "6px",
        cursor: disabled ? "not-allowed" : "pointer", fontWeight: 500,
    };
}
