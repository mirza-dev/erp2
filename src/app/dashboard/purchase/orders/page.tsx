"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { useToast } from "@/components/ui/Toast";
import { useIsDemo, DEMO_DISABLED_TOOLTIP } from "@/lib/demo-utils";
import { usePagination } from "@/hooks/usePagination";
import Pagination from "@/components/ui/Pagination";
import { useSelection } from "@/hooks/useSelection";
import { usePermissions } from "@/lib/auth/use-permissions";
import type { PurchaseOrderRow, PurchaseOrderStatus, VendorRow } from "@/lib/database.types";
import { ButtonLink } from "@/components/ui/Button";
import { Plus } from "lucide-react";

const thStyle: React.CSSProperties = {
    textAlign: "left", padding: "10px 14px", fontSize: "12px", fontWeight: 500,
    color: "var(--text-secondary)", borderBottom: "0.5px solid var(--border-tertiary)",
};
const tdStyle: React.CSSProperties = {
    padding: "10px 14px", fontSize: "13px", borderBottom: "0.5px solid var(--border-tertiary)",
    color: "var(--text-primary)", lineHeight: 1.4,
};

type StatusFilter = PurchaseOrderStatus | "all";

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
    { key: "all", label: "Tümü" },
    { key: "draft", label: "Taslak" },
    { key: "sent", label: "Gönderildi" },
    { key: "confirmed", label: "Onaylandı" },
    { key: "partially_received", label: "Kısmi Kabul" },
    { key: "received", label: "Tamamlandı" },
    { key: "cancelled", label: "İptal" },
];

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

function formatCurrency(amount: number, currency: string): string {
    const sym = currency === "USD" ? "$" : currency === "EUR" ? "€" : "₺";
    return `${sym}${amount.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Test edilebilir pure helper: ISO tarih (YYYY-MM-DD) → tr-TR (DD.MM.YYYY). null → "—".
 * created_at sütunuyla tutarlı görünüm; UTC midnight ile gün kayması önlenir. */
export function formatExpectedDate(iso: string | null): string {
    if (!iso) return "—";
    return new Date(iso + "T00:00:00Z").toLocaleDateString("tr-TR");
}

/** Test edilebilir pure helper: PO iptal edilebilir mi? Detay `isCancelable` ile aynı yüklem.
 * Toplu iptal seçimi yalnız bu PO'ları kapsar (received/cancelled → 409 gürültüsü önlenir). */
export function isPoCancellable(po: { status: PurchaseOrderStatus }): boolean {
    return !["received", "cancelled"].includes(po.status);
}

export default function PurchaseOrdersPage() {
    const { toast } = useToast();
    const isDemo = useIsDemo();
    const { has } = usePermissions();
    const [orders, setOrders] = useState<PurchaseOrderRow[]>([]);
    const [vendorMap, setVendorMap] = useState<Map<string, string>>(new Map());
    const [activeTab, setActiveTab] = useState<StatusFilter>("all");
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [bulkCancelConfirm, setBulkCancelConfirm] = useState(false);
    const [bulkCancelling, setBulkCancelling] = useState(false);
    const [hoveredId, setHoveredId] = useState<string | null>(null);

    const loadOrders = useCallback(async () => {
        setLoading(true);
        setLoadError(false);
        try {
            const url = activeTab === "all"
                ? "/api/purchase-orders"
                : `/api/purchase-orders?status=${encodeURIComponent(activeTab)}`;
            const [ordersRes, vendorsRes] = await Promise.all([
                fetch(url),
                fetch("/api/vendors?all=1"),
            ]);
            // Siparişler kritik: 401/403/500'ü sessizce yutma (yanıltıcı "boş liste"
            // yerine görünür hata). Detay sayfası loadPO ile aynı dürüstlük.
            if (!ordersRes.ok) {
                setLoadError(true);
                return;
            }
            const data = await ordersRes.json();
            setOrders(Array.isArray(data) ? data : []);
            if (vendorsRes.ok) {
                const vendors: VendorRow[] = await vendorsRes.json();
                const m = new Map<string, string>();
                for (const v of vendors) m.set(v.id, v.name);
                setVendorMap(m);
            }
        } catch {
            setLoadError(true);
        } finally {
            setLoading(false);
        }
    }, [activeTab]);

    useEffect(() => { void loadOrders(); }, [loadOrders]);

    // Browser tab title — sidebar label ile hizalı (2026-05-27).
    useEffect(() => {
        document.title = "Satın Alma Siparişleri · KokpitERP";
    }, []);

    const filtered = useMemo(() => {
        if (!search.trim()) return orders;
        const q = search.toLowerCase();
        return orders.filter(o =>
            o.po_number.toLowerCase().includes(q) ||
            (vendorMap.get(o.vendor_id) ?? "").toLowerCase().includes(q),
        );
    }, [orders, search, vendorMap]);

    const { pagedItems, currentPage, setCurrentPage, totalPages, totalItems, pageSize } =
        usePagination(filtered, { resetKey: `${search}|${activeTab}` });

    const { selectedIds, toggleOne, toggleAll, clearAll, isPageAllSelected, isPageIndeterminate } =
        useSelection(`${search}|${activeTab}`);
    const cancellablePageIds = pagedItems.filter(isPoCancellable).map(o => o.id);

    const handleBulkCancel = async () => {
        if (isDemo) { toast({ type: "info", message: "Demo modda bu işlem yapılamaz." }); return; }
        setBulkCancelling(true);
        const ids = Array.from(selectedIds);
        const results = await Promise.allSettled(
            ids.map(id => fetch(`/api/purchase-orders/${id}/cancel`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reason: "Toplu iptal" }),
            })),
        );
        const failed = results.filter(r => r.status === "rejected" || (r.status === "fulfilled" && !r.value.ok)).length;
        const succeeded = ids.length - failed;
        if (succeeded > 0) toast({ type: "success", message: `${succeeded} sipariş iptal edildi.` });
        if (failed > 0) toast({ type: "error", message: `${failed} sipariş iptal edilemedi.` });
        clearAll();
        setBulkCancelConfirm(false);
        setBulkCancelling(false);
        void loadOrders();
    };

    return (
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
                <div>
                    <h1 style={{ fontSize: "20px", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
                        Satın Alma Siparişleri
                    </h1>
                    <p style={{ fontSize: "13px", color: "var(--text-tertiary)", margin: "4px 0 0" }}>
                        {filtered.length} sipariş
                    </p>
                </div>
                {has("manage_purchase_orders") && (
                    <ButtonLink
                        href="/dashboard/purchase/orders/new"
                        size="cta"
                        leftIcon={<Plus size={16} />}
                        disabled={isDemo}
                        title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}
                    >
                        Yeni Sipariş
                    </ButtonLink>
                )}
            </div>

            {/* Status tabs */}
            <div style={{ display: "flex", gap: "4px", marginBottom: "16px", flexWrap: "wrap" }} role="tablist">
                {STATUS_TABS.map(tab => {
                    const active = activeTab === tab.key;
                    return (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            role="tab"
                            aria-selected={active}
                            style={{
                                padding: "6px 14px", fontSize: "13px",
                                background: active ? "var(--accent-bg)" : "transparent",
                                color: active ? "var(--accent-text)" : "var(--text-secondary)",
                                border: `0.5px solid ${active ? "var(--accent-border)" : "var(--border-tertiary)"}`,
                                borderRadius: "6px", cursor: "pointer",
                                fontWeight: active ? 500 : 400,
                            }}
                        >
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* Search */}
            <div style={{ marginBottom: "16px" }}>
                <input
                    type="text"
                    placeholder="PO numarası veya tedarikçi ara..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    aria-label="Sipariş ara"
                    style={{
                        fontSize: "13px", padding: "6px 10px",
                        border: "0.5px solid var(--border-secondary)", borderRadius: "6px",
                        background: "var(--bg-tertiary)", color: "var(--text-primary)",
                        maxWidth: "320px", width: "100%",
                    }}
                />
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
                        {selectedIds.size} sipariş seçildi
                    </span>
                    <button
                        onClick={() => setBulkCancelConfirm(true)}
                        disabled={bulkCancelling}
                        style={{
                            fontSize: "12px", padding: "4px 12px",
                            border: "0.5px solid var(--danger-border)",
                            borderRadius: "5px", background: "var(--danger-bg)",
                            color: "var(--danger-text)", cursor: bulkCancelling ? "not-allowed" : "pointer",
                            opacity: bulkCancelling ? 0.6 : 1,
                        }}
                    >
                        {bulkCancelling ? "İptal ediliyor…" : "İptal Et"}
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
            <div style={{ background: "var(--bg-primary)", border: "0.5px solid var(--border-tertiary)", borderRadius: "8px", overflow: "hidden" }}>
                {loading ? (
                    <div style={{ padding: "32px", textAlign: "center", color: "var(--text-tertiary)", fontSize: "13px" }}>
                        Yükleniyor...
                    </div>
                ) : loadError ? (
                    <div role="alert" aria-live="polite" style={{ padding: "32px", textAlign: "center", fontSize: "13px" }}>
                        <div style={{ color: "var(--danger-text)", marginBottom: "12px" }}>
                            Siparişler yüklenemedi. Lütfen tekrar deneyin.
                        </div>
                        <button
                            onClick={() => void loadOrders()}
                            style={{
                                padding: "6px 16px", fontSize: "13px",
                                background: "var(--accent)", color: "#fff",
                                border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: 500,
                            }}
                        >
                            Yeniden dene
                        </button>
                    </div>
                ) : filtered.length === 0 ? (
                    <div style={{ padding: "32px", textAlign: "center", color: "var(--text-tertiary)", fontSize: "13px" }}>
                        {search ? "Arama kriterine uyan sipariş bulunamadı." : "Henüz sipariş yok."}
                    </div>
                ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                            <tr style={{ background: "var(--bg-secondary)" }}>
                                <th style={{ ...thStyle, width: "36px", padding: "10px 8px 10px 14px" }}>
                                    <input
                                        type="checkbox"
                                        checked={isPageAllSelected(cancellablePageIds)}
                                        ref={el => { if (el) el.indeterminate = isPageIndeterminate(cancellablePageIds); }}
                                        onChange={() => toggleAll(cancellablePageIds)}
                                        onClick={e => e.stopPropagation()}
                                        disabled={cancellablePageIds.length === 0}
                                        style={{ width: "14px", height: "14px", accentColor: "var(--accent)", cursor: cancellablePageIds.length === 0 ? "not-allowed" : "pointer" }}
                                        aria-label="Sayfadaki iptal edilebilir siparişleri seç"
                                    />
                                </th>
                                <th style={thStyle}>PO No</th>
                                <th style={thStyle}>Tedarikçi</th>
                                <th style={{ ...thStyle, textAlign: "center" }}>Durum</th>
                                <th style={{ ...thStyle, textAlign: "center" }}>Beklenen Tarih</th>
                                <th style={{ ...thStyle, textAlign: "right" }}>Toplam</th>
                                <th style={{ ...thStyle, textAlign: "right" }}>Oluşturulma</th>
                            </tr>
                        </thead>
                        <tbody>
                            {pagedItems.map(o => {
                                const isHovered = hoveredId === o.id;
                                const cancellable = isPoCancellable(o);
                                return (
                                <tr key={o.id}
                                    style={{
                                        transition: "background 0.08s", cursor: "pointer",
                                        background: isHovered ? "var(--bg-secondary)" : "transparent",
                                    }}
                                    onMouseEnter={() => setHoveredId(o.id)}
                                    onMouseLeave={() => setHoveredId(null)}
                                    onClick={() => { window.location.href = `/dashboard/purchase/orders/${o.id}`; }}
                                >
                                    <td
                                        style={{ ...tdStyle, width: "36px", padding: "10px 8px 10px 14px" }}
                                        onClick={e => e.stopPropagation()}
                                    >
                                        {cancellable && (
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.has(o.id)}
                                                onChange={() => toggleOne(o.id)}
                                                onClick={e => e.stopPropagation()}
                                                style={{ width: "14px", height: "14px", accentColor: "var(--accent)", cursor: "pointer" }}
                                                aria-label={`${o.po_number} seç`}
                                            />
                                        )}
                                    </td>
                                    <td style={tdStyle}>
                                        <Link
                                            href={`/dashboard/purchase/orders/${o.id}`}
                                            style={{ color: "var(--accent-text)", textDecoration: "none", fontWeight: 500 }}
                                            onClick={e => e.stopPropagation()}
                                        >
                                            {o.po_number}
                                        </Link>
                                    </td>
                                    <td style={tdStyle}>{vendorMap.get(o.vendor_id) ?? "—"}</td>
                                    <td style={{ ...tdStyle, textAlign: "center" }}>
                                        <span style={{
                                            fontSize: "11px", padding: "2px 8px", borderRadius: "5px",
                                            background: STATUS_BG[o.status].bg, color: STATUS_BG[o.status].text,
                                            fontWeight: 500,
                                        }}>
                                            {STATUS_LABEL[o.status]}
                                        </span>
                                    </td>
                                    <td style={{ ...tdStyle, textAlign: "center", color: "var(--text-secondary)" }}>
                                        {formatExpectedDate(o.expected_date)}
                                    </td>
                                    <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                                        {formatCurrency(o.grand_total, o.currency)}
                                    </td>
                                    <td style={{ ...tdStyle, textAlign: "right", color: "var(--text-tertiary)", fontSize: "12px" }}>
                                        {new Date(o.created_at).toLocaleDateString("tr-TR")}
                                    </td>
                                </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
                {!loading && !loadError && filtered.length > 0 && (
                    <Pagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        totalItems={totalItems}
                        pageSize={pageSize}
                        onPageChange={setCurrentPage}
                        itemLabel="sipariş"
                    />
                )}
            </div>
            {/* Bulk cancel confirm modal */}
            {bulkCancelConfirm && (
                <>
                    <div
                        onClick={() => !bulkCancelling && setBulkCancelConfirm(false)}
                        style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.5)" }}
                    />
                    <div role="dialog" aria-modal="true" aria-labelledby="bulk-cancel-title" style={{
                        position: "fixed", top: "50%", left: "50%",
                        transform: "translate(-50%, -50%)", zIndex: 101,
                        background: "var(--bg-primary)", border: "0.5px solid var(--border-primary)",
                        borderRadius: "8px", padding: "24px", width: "380px", maxWidth: "90vw",
                    }}>
                        <div id="bulk-cancel-title" style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "8px" }}>
                            {selectedIds.size} siparişi iptal et
                        </div>
                        <div style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "20px" }}>
                            Seçili siparişleri iptal etmek istediğinizden emin misiniz?
                        </div>
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                            <button
                                onClick={() => setBulkCancelConfirm(false)}
                                disabled={bulkCancelling}
                                style={{
                                    fontSize: "13px", padding: "6px 16px",
                                    border: "0.5px solid var(--border-secondary)", borderRadius: "6px",
                                    background: "transparent", color: "var(--text-secondary)", cursor: "pointer",
                                }}
                            >
                                Vazgeç
                            </button>
                            <button
                                onClick={handleBulkCancel}
                                disabled={bulkCancelling}
                                style={{
                                    fontSize: "13px", padding: "6px 16px",
                                    border: "0.5px solid var(--danger-border)", borderRadius: "6px",
                                    background: "var(--danger-bg)", color: "var(--danger-text)",
                                    cursor: bulkCancelling ? "not-allowed" : "pointer", opacity: bulkCancelling ? 0.6 : 1,
                                }}
                            >
                                {bulkCancelling ? "İptal ediliyor…" : "İptal Et"}
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
