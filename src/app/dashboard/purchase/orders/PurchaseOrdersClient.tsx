"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSWRConfig } from "swr";
import { useListUrlState, useDebouncedSearch } from "@/hooks/useListUrlState";
import { useToast } from "@/components/ui/Toast";
import { useIsDemo, DEMO_DISABLED_TOOLTIP } from "@/lib/demo-utils";
import Pagination from "@/components/ui/Pagination";
import { computeTotalPages } from "@/hooks/usePagination";
import { useSelection } from "@/hooks/useSelection";
import { usePermissions } from "@/lib/auth/use-permissions";
import type { PurchaseOrderRow, PurchaseOrderStatus } from "@/lib/database.types";
import type { PurchaseOrderTab } from "@/lib/supabase/purchase-orders";
import { PRODUCTS_KEY } from "@/lib/data-context";
import { decrementCount, patchCountRecord, successfulResponseIds } from "@/lib/fast-mutation";
import Button, { ButtonLink } from "@/components/ui/Button";
import { CircleOff, Plus, RefreshCw } from "lucide-react";
import UnderlinedFilterTabs from "@/components/ui/UnderlinedFilterTabs";

const thStyle: React.CSSProperties = {
    textAlign: "left", padding: "10px 14px", fontSize: "12px", fontWeight: 500,
    color: "var(--text-secondary)", borderBottom: "0.5px solid var(--border-tertiary)",
};
const tdStyle: React.CSSProperties = {
    padding: "10px 14px", fontSize: "13px", borderBottom: "0.5px solid var(--border-tertiary)",
    color: "var(--text-primary)", lineHeight: 1.4,
};

const STATUS_TABS: { key: PurchaseOrderTab; label: string }[] = [
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

/** ISO tarih (YYYY-MM-DD) → tr-TR (DD.MM.YYYY). null → "—". UTC midnight gün kayması önlenir. */
export function formatExpectedDate(iso: string | null): string {
    if (!iso) return "—";
    return new Date(iso + "T00:00:00Z").toLocaleDateString("tr-TR");
}

/** PO iptal edilebilir mi? Toplu iptal seçimi yalnız bunları kapsar. */
export function isPoCancellable(po: { status: PurchaseOrderStatus }): boolean {
    return !["received", "cancelled"].includes(po.status);
}

export interface PurchaseOrdersClientProps {
    orders: PurchaseOrderRow[];                 // YALNIZ geçerli sayfa
    total: number;
    counts: Record<PurchaseOrderTab, number>;
    page: number;
    pageSize: number;
    tab: PurchaseOrderTab;
    search: string;
    vendorMap: Record<string, string>;         // id → ad (gösterim)
}

interface FilterState {
    tab: PurchaseOrderTab;
    search: string;
    page: number;
}

export default function PurchaseOrdersClient(props: PurchaseOrdersClientProps) {
    const { orders, total, counts, page, pageSize, tab, search, vendorMap } = props;
    const router = useRouter();
    const { mutate } = useSWRConfig();
    const { toast } = useToast();
    const isDemo = useIsDemo();
    const { has } = usePermissions();

    const [displayOrders, setDisplayOrders] = useState<PurchaseOrderRow[]>(orders);
    const [displayCounts, setDisplayCounts] = useState<Record<PurchaseOrderTab, number>>(counts);
    const [displayTotal, setDisplayTotal] = useState(total);
    const [refreshing, setRefreshing] = useState(false);
    const [bulkCancelConfirm, setBulkCancelConfirm] = useState(false);
    const [bulkCancelling, setBulkCancelling] = useState(false);
    const [hoveredId, setHoveredId] = useState<string | null>(null);

    useEffect(() => { document.title = "Satın Alma Siparişleri · Roven"; }, []);

    useEffect(() => {
        setDisplayOrders(orders);
        setDisplayCounts(counts);
        setDisplayTotal(total);
    }, [orders, counts, total]);

    const serialize = (p: FilterState) => {
        const params = new URLSearchParams();
        if (p.tab && p.tab !== "all") params.set("tab", p.tab);
        if (p.search) params.set("search", p.search);
        if (p.page > 1) params.set("page", String(p.page));
        return params;
    };
    const { navigate, isPending } = useListUrlState<FilterState>({ tab, search, page }, serialize);
    const { value: searchText, setValue: setSearchText } = useDebouncedSearch(
        search,
        (v) => navigate({ search: v, page: 1 }),
    );

    const handleRefresh = () => {
        if (refreshing || isPending) return;
        setRefreshing(true);
        router.refresh();
        setTimeout(() => setRefreshing(false), 500);
    };

    const { selectedIds, toggleOne, toggleAll, clearAll, isPageAllSelected, isPageIndeterminate } =
        useSelection(`${search}|${tab}|${page}`);
    const cancellablePageIds = displayOrders.filter(isPoCancellable).map(o => o.id);

    const applyCancelledPurchaseOrders = (ids: string[]) => {
        if (ids.length === 0) return;
        const idSet = new Set(ids);
        const previous = displayOrders.filter(order => idSet.has(order.id));

        setDisplayOrders(prev => {
            const cancelled = prev.map(order => idSet.has(order.id)
                ? { ...order, status: "cancelled" as const }
                : order);
            if (tab === "all" || tab === "cancelled") return cancelled;
            return cancelled.filter(order => !idSet.has(order.id));
        });

        setDisplayCounts(prev => {
            const patches: Partial<Record<PurchaseOrderTab, number>> = { cancelled: ids.length };
            for (const order of previous) {
                patches[order.status] = (patches[order.status] ?? 0) - 1;
            }
            return patchCountRecord(prev, patches);
        });

        if (tab !== "all" && tab !== "cancelled") {
            setDisplayTotal(prev => decrementCount(prev, ids.length));
        }
    };

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
        const succeededIds = successfulResponseIds(ids, results);
        const failed = ids.length - succeededIds.length;
        const succeeded = succeededIds.length;
        if (succeeded > 0) toast({ type: "success", message: `${succeeded} sipariş iptal edildi.` });
        if (failed > 0) toast({ type: "error", message: `${failed} sipariş iptal edilemedi.` });
        clearAll();
        setBulkCancelConfirm(false);
        setBulkCancelling(false);
        applyCancelledPurchaseOrders(succeededIds);
        void mutate(PRODUCTS_KEY);
    };

    const totalPages = computeTotalPages(displayTotal, pageSize);

    return (
        <div style={{ maxWidth: "1200px", margin: "0 auto", opacity: isPending ? 0.7 : 1, transition: "opacity 0.12s" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
                <div>
                    <h1 style={{ fontSize: "20px", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
                        Satın Alma Siparişleri
                    </h1>
                    <p style={{ fontSize: "13px", color: "var(--text-tertiary)", margin: "4px 0 0" }}>
                        {displayTotal} sipariş
                    </p>
                </div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <Button
                        variant="toolbar"
                        size="md"
                        onClick={handleRefresh}
                        disabled={refreshing || isPending}
                        aria-label="Siparişleri yenile"
                        leftIcon={<RefreshCw size={15} />}
                    >
                        {refreshing || isPending ? "Yenileniyor…" : "Yenile"}
                    </Button>
                    {has("manage_purchase_orders") && (
                        <ButtonLink
                            href="/dashboard/purchase/orders/new"
                            size="cta"
                            leftIcon={<Plus size={15} />}
                            disabled={isDemo}
                            title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}
                        >
                            Yeni Sipariş
                        </ButtonLink>
                    )}
                </div>
            </div>

            <UnderlinedFilterTabs
                ariaLabel="Satın alma siparişi durumu filtresi"
                items={STATUS_TABS.map((t) => ({ key: t.key, label: t.label, count: displayCounts[t.key] }))}
                activeKey={tab}
                onChange={(key) => navigate({ tab: key, page: 1 })}
                style={{ marginBottom: "16px" }}
            />

            {/* Search */}
            <div style={{ marginBottom: "16px" }}>
                <input
                    type="text"
                    placeholder="PO numarası veya tedarikçi ara..."
                    value={searchText}
                    onChange={e => setSearchText(e.target.value)}
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
                    marginBottom: "16px",
                }}>
                    <span style={{ color: "var(--accent-text)", fontWeight: 500 }}>
                        {selectedIds.size} sipariş seçildi
                    </span>
                    <Button
                        variant="dangerSoft"
                        size="sm"
                        leftIcon={<CircleOff size={14} />}
                        onClick={() => setBulkCancelConfirm(true)}
                        disabled={bulkCancelling}
                    >
                        {bulkCancelling ? "İptal ediliyor…" : "İptal Et"}
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearAll}
                    >
                        Seçimi Temizle
                    </Button>
                </div>
            )}

            {/* Table */}
            <div style={{ background: "var(--bg-primary)", border: "0.5px solid var(--border-tertiary)", borderRadius: "8px", overflow: "hidden" }}>
                {displayOrders.length === 0 ? (
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
                            {displayOrders.map(o => {
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
                                    onClick={() => router.push(`/dashboard/purchase/orders/${o.id}`)}
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
                                    <td style={tdStyle}>{vendorMap[o.vendor_id] ?? "—"}</td>
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
                {displayTotal > 0 && (
                    <Pagination
                        currentPage={page}
                        totalPages={totalPages}
                        totalItems={displayTotal}
                        pageSize={pageSize}
                        onPageChange={(p) => navigate({ page: p })}
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
                            <Button
                                variant="secondary"
                                onClick={() => setBulkCancelConfirm(false)}
                                disabled={bulkCancelling}
                            >
                                Vazgeç
                            </Button>
                            <Button
                                variant="danger"
                                leftIcon={<CircleOff size={14} />}
                                onClick={handleBulkCancel}
                                disabled={bulkCancelling}
                            >
                                {bulkCancelling ? "İptal ediliyor…" : "İptal Et"}
                            </Button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
