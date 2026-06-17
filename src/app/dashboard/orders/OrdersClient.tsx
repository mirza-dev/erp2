"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useListUrlState, useDebouncedSearch } from "@/hooks/useListUrlState";
import { maskCurrency, formatDate } from "@/lib/utils";
import type { CommercialStatus, FulfillmentStatus } from "@/lib/database.types";
import type { OrderTab } from "@/lib/supabase/orders";
import { usePermissions } from "@/lib/auth/use-permissions";
import type { Order } from "@/lib/mock-data";
import Button, { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/StateViews";
import { useToast } from "@/components/ui/Toast";
import { useIsDemo, DEMO_DISABLED_TOOLTIP, DEMO_BLOCK_TOAST } from "@/lib/demo-utils";
import { dateDaysFromToday } from "@/lib/stock-utils";
import { computeTotalPages } from "@/hooks/usePagination";
import Pagination from "@/components/ui/Pagination";
import { useSelection } from "@/hooks/useSelection";
import { CircleOff, Plus, RefreshCw } from "lucide-react";
import UnderlinedFilterTabs from "@/components/ui/UnderlinedFilterTabs";

const commercialStatusConfig: Record<CommercialStatus, { label: string; cls: string }> = {
    draft:            { label: "Taslak",      cls: "badge-neutral" },
    pending_approval: { label: "Bekliyor",    cls: "badge-warning" },
    approved:         { label: "Onaylı",      cls: "badge-accent"  },
    cancelled:        { label: "İptal",       cls: "badge-danger"  },
};

const fulfillmentStatusConfig: Record<FulfillmentStatus, { label: string; cls: string }> = {
    unallocated:         { label: "Rezervesiz",   cls: "badge-neutral"  },
    partially_allocated: { label: "Kısmi Rezerve", cls: "badge-warning"  },
    allocated:           { label: "Rezerveli",    cls: "badge-warning"  },
    shipped:             { label: "Sevk Edildi",  cls: "badge-success"  },
};

// Kullanıcıya görünen filtre sekmeleri (commercial + fulfillment birleşik).
// Sunucu tarafı OrderTab ile aynı anahtarlar — sayaçlar `counts` prop'undan gelir.
const filterTabs: { id: OrderTab; label: string }[] = [
    { id: "ALL",              label: "Tümü" },
    { id: "pending_approval", label: "Bekleyen" },
    { id: "approved",         label: "Onaylı" },
    { id: "shipped",          label: "Sevk Edildi" },
    { id: "cancelled",        label: "İptal" },
    { id: "draft",            label: "Taslak" },
];

const thStyle: React.CSSProperties = {
    textAlign: "left",
    padding: "10px 14px",
    fontSize: "12px",
    fontWeight: "var(--font-table-heading-weight)",
    color: "var(--text-secondary)",
    borderBottom: "var(--line-width) solid var(--surface-border)",
};

const tdStyle: React.CSSProperties = {
    padding: "10px 14px",
    fontSize: "13px",
    fontWeight: "var(--font-table-cell-weight)",
    borderBottom: "var(--line-width) solid var(--border-tertiary)",
    color: "var(--text-primary)",
    lineHeight: 1.4,
};

// Toplu işlem = soft-DELETE = iptal. Yalnızca iptal edilebilir siparişler
// seçilebilir: zaten iptal edilmiş VEYA sevk edilmiş siparişler iptal edilemez
// (backend 400 döner). Sevk edilmiş approved da kapsam dışı.
export function isOrderCancellable(order: { commercial_status: CommercialStatus; fulfillment_status: FulfillmentStatus }): boolean {
    if (order.commercial_status === "cancelled") return false;
    if (order.fulfillment_status === "shipped") return false;
    return true;
}

export interface OrdersClientProps {
    orders: Order[];                       // YALNIZ geçerli sayfa (sunucu filtreledi + sayfaladı)
    total: number;                         // filtre uygulanmış toplam (pagination)
    counts: Record<OrderTab, number>;      // sekme rozet sayaçları (global)
    page: number;
    pageSize: number;
    tab: OrderTab;
    search: string;
    customerId: string;
    dateFrom: string;
    dateTo: string;
    currency: string;
}

interface FilterState {
    tab: OrderTab;
    search: string;
    customerId: string;
    dateFrom: string;
    dateTo: string;
    currency: string;
    page: number;
}

export default function OrdersClient(props: OrdersClientProps) {
    const { orders, total, counts, page, pageSize, tab, search, customerId, dateFrom, dateTo, currency } = props;
    const router = useRouter();
    const { toast } = useToast();
    const isDemo = useIsDemo();
    const { has, canViewSalesPrices } = usePermissions();

    const [refreshing, setRefreshing] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [confirmId, setConfirmId] = useState<string | null>(null);
    const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
    const [bulkDeleting, setBulkDeleting] = useState(false);
    const [hoveredId, setHoveredId] = useState<string | null>(null);

    // Browser tab title — sidebar label ile hizalı.
    useEffect(() => {
        document.title = "Satış Siparişleri · Roven";
    }, []);

    // Sunucu (URL/props) filtre durumunun tek kaynak olması: kontrol değerleri
    // prop'tan okunur, değişiklik URL'e yazılır → sunucu yeniden render eder.
    const serialize = (p: FilterState) => {
        const params = new URLSearchParams();
        if (p.tab && p.tab !== "ALL") params.set("tab", p.tab);
        if (p.search) params.set("search", p.search);
        if (p.customerId) params.set("customerId", p.customerId);
        if (p.dateFrom) params.set("from", p.dateFrom);
        if (p.dateTo) params.set("to", p.dateTo);
        if (p.currency) params.set("currency", p.currency);
        if (p.page > 1) params.set("page", String(p.page));
        return params;
    };
    const { navigate, isPending } = useListUrlState<FilterState>(
        { tab, search, customerId, dateFrom, dateTo, currency, page },
        serialize,
    );
    const { value: searchText, setValue: setSearchText } = useDebouncedSearch(
        search,
        (v) => navigate({ search: v, page: 1 }),
    );

    const handleRefresh = () => {
        if (refreshing || isPending) return;
        setRefreshing(true);
        router.refresh();
        // router.refresh() bir promise döndürmez; kısa süre dimler.
        setTimeout(() => setRefreshing(false), 500);
    };

    const handleDelete = async (e: React.MouseEvent, orderId: string) => {
        e.stopPropagation();
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        if (confirmId !== orderId) {
            setConfirmId(orderId);
            return;
        }
        setDeletingId(orderId);
        setConfirmId(null);
        try {
            const res = await fetch(`/api/orders/${orderId}`, { method: "DELETE" });
            if (!res.ok) {
                const errBody = await res.json().catch(() => ({}));
                toast({ type: "error", message: errBody.error || `İşlem başarısız (${res.status})` });
                return;
            }
            router.refresh();
        } finally {
            setDeletingId(null);
        }
    };

    const { selectedIds, toggleOne, toggleAll, clearAll, isPageAllSelected, isPageIndeterminate } =
        useSelection(`${tab}|${search}|${customerId}|${dateFrom}|${dateTo}|${currency}|${page}`);
    // Select-all yalnızca iptal edilebilir satırları kapsar (sevk/iptal edilmiş
    // siparişler toplu iptalde 400 alırdı).
    const cancellablePageIds = orders.filter(isOrderCancellable).map(o => o.id);

    const handleBulkDelete = async () => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        setBulkDeleting(true);
        const ids = Array.from(selectedIds);
        const results = await Promise.allSettled(
            ids.map(id => fetch(`/api/orders/${id}`, { method: "DELETE" })),
        );
        const failed = results.filter(r => r.status === "rejected" || (r.status === "fulfilled" && !r.value.ok)).length;
        const succeeded = ids.length - failed;
        // Soft-DELETE = iptal (silme değil). Dürüst sözcük (tekil buton "iptal et" der).
        if (succeeded > 0) toast({ type: "success", message: `${succeeded} sipariş iptal edildi.` });
        if (failed > 0) toast({ type: "error", message: `${failed} sipariş iptal edilemedi.` });
        clearAll();
        setBulkDeleteConfirm(false);
        setBulkDeleting(false);
        router.refresh();
    };

    const totalPages = computeTotalPages(total, pageSize);
    const pendingCount = counts.pending_approval;
    const hasAdvancedFilter = !!(dateFrom || dateTo || currency || customerId);

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", opacity: isPending ? 0.7 : 1, transition: "opacity 0.12s" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                    <h1 style={{ fontSize: "20px", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
                        Satış Siparişleri
                    </h1>
                    <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "3px" }}>
                        {counts.ALL} sipariş · {pendingCount} onay bekliyor
                    </div>
                </div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <Button
                        variant="toolbar"
                        size="md"
                        onClick={handleRefresh}
                        disabled={refreshing || isPending}
                        leftIcon={<RefreshCw size={15} />}
                    >
                        {refreshing || isPending ? "Yenileniyor…" : "Yenile"}
                    </Button>
                    {has("manage_sales_orders") && (
                        <ButtonLink
                            href="/dashboard/orders/new"
                            size="cta"
                            leftIcon={<Plus size={15} />}
                        >
                            Yeni Sipariş
                        </ButtonLink>
                    )}
                </div>
            </div>

            {/* Toolbar */}
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                <UnderlinedFilterTabs
                    ariaLabel="Sipariş durumu filtresi"
                    items={filterTabs.map((t) => ({ key: t.id, label: t.label, count: counts[t.id] }))}
                    activeKey={tab}
                    onChange={(key) => navigate({ tab: key, page: 1 })}
                />

                {/* Search + Gelişmiş Filtreler */}
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <input
                        type="text"
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        placeholder="Sipariş no veya müşteri..."
                        style={{
                            fontSize: "12px",
                            padding: "6px 12px",
                            border: "var(--line-width) solid var(--border-secondary)",
                            borderRadius: "6px",
                            background: "var(--input-bg)",
                            color: "var(--text-primary)",
                            width: "200px",
                        }}
                    />
                    <input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => navigate({ dateFrom: e.target.value, page: 1 })}
                        title="Başlangıç tarihi"
                        style={{
                            fontSize: "12px",
                            padding: "5px 8px",
                            border: `var(--line-width) solid ${dateFrom ? "var(--accent-border)" : "var(--border-secondary)"}`,
                            borderRadius: "6px",
                            background: "var(--input-bg)",
                            color: dateFrom ? "var(--text-primary)" : "var(--text-tertiary)",
                            cursor: "pointer",
                        }}
                    />
                    <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>—</span>
                    <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => navigate({ dateTo: e.target.value, page: 1 })}
                        title="Bitiş tarihi"
                        style={{
                            fontSize: "12px",
                            padding: "5px 8px",
                            border: `var(--line-width) solid ${dateTo ? "var(--accent-border)" : "var(--border-secondary)"}`,
                            borderRadius: "6px",
                            background: "var(--input-bg)",
                            color: dateTo ? "var(--text-primary)" : "var(--text-tertiary)",
                            cursor: "pointer",
                        }}
                    />
                    <select
                        value={currency}
                        onChange={(e) => navigate({ currency: e.target.value, page: 1 })}
                        style={{
                            fontSize: "12px",
                            padding: "5px 8px",
                            border: `var(--line-width) solid ${currency ? "var(--accent-border)" : "var(--border-secondary)"}`,
                            borderRadius: "6px",
                            background: "var(--input-bg)",
                            color: currency ? "var(--text-primary)" : "var(--text-tertiary)",
                            cursor: "pointer",
                        }}
                    >
                        <option value="">Tüm Para Birimleri</option>
                        <option value="USD">USD</option>
                        <option value="EUR">EUR</option>
                        <option value="TRY">TRY</option>
                    </select>
                    {hasAdvancedFilter && (
                        <button
                            onClick={() => navigate({ dateFrom: "", dateTo: "", currency: "", customerId: "", page: 1 })}
                            style={{
                                fontSize: "11px",
                                padding: "5px 10px",
                                border: "var(--line-width) solid var(--border-secondary)",
                                borderRadius: "6px",
                                background: "transparent",
                                color: "var(--text-secondary)",
                                cursor: "pointer",
                                whiteSpace: "nowrap",
                            }}
                        >
                            × Filtreleri Temizle
                        </button>
                    )}
                </div>
            </div>

            {/* Bulk action bar */}
            {selectedIds.size > 0 && (
                <div style={{
                    display: "flex", alignItems: "center", gap: "10px",
                    padding: "10px 14px",
                    background: "var(--accent-bg)",
                    border: "var(--line-width) solid var(--accent-border)",
                    borderRadius: "6px",
                    fontSize: "13px",
                }}>
                    <span style={{ color: "var(--accent-text)", fontWeight: 500 }}>
                        {selectedIds.size} sipariş seçildi
                    </span>
                    <Button
                        variant="dangerSoft"
                        size="sm"
                        leftIcon={<CircleOff size={14} />}
                        onClick={() => setBulkDeleteConfirm(true)}
                        disabled={bulkDeleting}
                    >
                        {bulkDeleting ? "İptal ediliyor…" : "İptal Et"}
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
            <div
                style={{
                    background: "var(--surface-raised)",
                    border: "var(--line-width) solid var(--surface-border)",
                    borderRadius: "6px",
                    overflowX: "auto",
                    boxShadow: "var(--surface-shadow-sm)",
                }}
            >
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", minWidth: "740px" }}>
                    <thead>
                        <tr style={{ background: "var(--table-header-bg)" }}>
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
                            <th style={thStyle}>Sipariş No</th>
                            <th style={thStyle}>Müşteri</th>
                            <th style={{ ...thStyle, textAlign: "center" }}>Ticari Durum</th>
                            <th style={{ ...thStyle, textAlign: "center" }}>Lojistik</th>
                            <th style={thStyle}>Tarih</th>
                            <th style={{ ...thStyle, textAlign: "center" }}>Kalem</th>
                            <th style={{ ...thStyle, textAlign: "right" }}>Tutar</th>
                            <th style={{ ...thStyle, width: "32px" }}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {orders.length === 0 ? (
                            <tr>
                                <td colSpan={9} style={{ border: "none" }}>
                                    <EmptyState
                                        title={
                                            search
                                                ? `"${search}" ile eşleşen sipariş bulunamadı`
                                                : `${filterTabs.find(t => t.id === tab)?.label ?? ""} durumunda sipariş yok`
                                        }
                                        description="Arama terimini değiştirmeyi veya filtreleri temizlemeyi deneyin."
                                        action={{
                                            label: "Filtreleri Temizle",
                                            onClick: () => navigate({ search: "", tab: "ALL", customerId: "", dateFrom: "", dateTo: "", currency: "", page: 1 }),
                                        }}
                                    />
                                </td>
                            </tr>
                        ) : (
                            orders.map((order) => {
                                const commercial = commercialStatusConfig[order.commercial_status];
                                const fulfillment = fulfillmentStatusConfig[order.fulfillment_status];
                                const isHovered = hoveredId === order.id;
                                const cellBg = isHovered ? "var(--bg-secondary)" : "transparent";
                                const cancellable = isOrderCancellable(order);
                                return (
                                    <tr
                                        key={order.id}
                                        style={{ cursor: "pointer", background: cellBg }}
                                        onClick={() => router.push(`/dashboard/orders/${order.id}`)}
                                        onMouseEnter={() => setHoveredId(order.id)}
                                        onMouseLeave={() => setHoveredId(null)}
                                    >
                                        <td
                                            style={{ ...tdStyle, background: cellBg, width: "36px", padding: "10px 8px 10px 14px", borderLeft: isHovered ? "2px solid var(--accent)" : "2px solid transparent" }}
                                            onClick={e => e.stopPropagation()}
                                        >
                                            {cancellable && (
                                                <input
                                                    type="checkbox"
                                                    checked={selectedIds.has(order.id)}
                                                    onChange={() => toggleOne(order.id)}
                                                    onClick={e => e.stopPropagation()}
                                                    style={{ width: "14px", height: "14px", accentColor: "var(--accent)", cursor: "pointer" }}
                                                    aria-label={`${order.orderNumber} seç`}
                                                />
                                            )}
                                        </td>
                                        <td style={{ ...tdStyle, background: cellBg, fontWeight: 500 }}>
                                            {order.orderNumber}
                                        </td>
                                        <td style={{ ...tdStyle, background: cellBg }}>
                                            {order.customerName}
                                        </td>
                                        <td style={{ ...tdStyle, background: cellBg, textAlign: "center" }}>
                                            <span className={`badge ${commercial.cls}`}>{commercial.label}</span>
                                            {order.quoteValidUntil &&
                                             (order.commercial_status === "draft" || order.commercial_status === "pending_approval") && (() => {
                                                const daysLeft = dateDaysFromToday(order.quoteValidUntil!);
                                                const expired = daysLeft < 0;
                                                const urgent = !expired && daysLeft <= 3;
                                                return (
                                                    <span style={{
                                                        display: "inline-block",
                                                        fontSize: "9px", fontWeight: 700,
                                                        padding: "1px 5px", borderRadius: "3px",
                                                        background: expired ? "var(--danger-bg)" : urgent ? "var(--warning-bg)" : "var(--bg-tertiary)",
                                                        color: expired ? "var(--danger-text)" : urgent ? "var(--warning-text)" : "var(--text-secondary)",
                                                        border: `var(--line-width) solid ${expired ? "var(--danger-border)" : urgent ? "var(--warning-border)" : "var(--border-secondary)"}`,
                                                        marginLeft: "4px",
                                                    }}>
                                                        {expired ? "Süresi Doldu" : `${daysLeft} gün kaldı`}
                                                    </span>
                                                );
                                            })()}
                                        </td>
                                        <td style={{ ...tdStyle, background: cellBg, textAlign: "center" }}>
                                            {order.fulfillment_status !== "unallocated" && (
                                                <span
                                                    className={`badge ${fulfillment.cls}`}
                                                    style={{ fontSize: "10px", padding: "2px 6px" }}
                                                >
                                                    {fulfillment.label}
                                                </span>
                                            )}
                                        </td>
                                        <td style={{ ...tdStyle, background: cellBg, color: "var(--text-secondary)" }}>
                                            {formatDate(order.createdAt)}
                                        </td>
                                        <td style={{ ...tdStyle, background: cellBg, textAlign: "center", color: "var(--text-secondary)" }}>
                                            {order.itemCount}
                                        </td>
                                        <td style={{ ...tdStyle, background: cellBg, textAlign: "right", fontWeight: 500 }}>
                                            {maskCurrency(order.grandTotal, order.currency, canViewSalesPrices)}
                                        </td>
                                        <td
                                            style={{ ...tdStyle, background: cellBg, width: "64px", textAlign: "right", padding: "10px 8px" }}
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "6px" }}>
                                                {has("delete_sales_orders") && (confirmId === order.id ? (
                                                    <Button
                                                        variant="danger"
                                                        size="xs"
                                                        leftIcon={<CircleOff size={13} />}
                                                        onClick={(e) => handleDelete(e, order.id)}
                                                        disabled={deletingId === order.id}
                                                    >
                                                        Evet, iptal et
                                                    </Button>
                                                ) : (
                                                    <Button
                                                        variant="dangerSoft"
                                                        size="xs"
                                                        iconOnly
                                                        leftIcon={<CircleOff size={13} />}
                                                        onClick={(e) => handleDelete(e, order.id)}
                                                        disabled={isDemo || deletingId === order.id}
                                                        title={isDemo ? DEMO_DISABLED_TOOLTIP : "İptal et"}
                                                        aria-label={`${order.orderNumber} iptal et`}
                                                        style={{ opacity: isHovered ? 1 : 0 }}
                                                    />
                                                ))}
                                                <span style={{ opacity: isHovered ? 1 : 0, color: "var(--text-tertiary)" }} aria-hidden="true">
                                                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                                        <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                                                    </svg>
                                                </span>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
                {total > 0 && (
                    <Pagination
                        currentPage={page}
                        totalPages={totalPages}
                        totalItems={total}
                        pageSize={pageSize}
                        onPageChange={(p) => navigate({ page: p })}
                        itemLabel="sipariş"
                    />
                )}
            </div>

            {/* Bulk delete confirm modal */}
            {bulkDeleteConfirm && (
                <>
                    <div
                        onClick={() => !bulkDeleting && setBulkDeleteConfirm(false)}
                        style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.5)" }}
                    />
                    <div style={{
                        position: "fixed", top: "50%", left: "50%",
                        transform: "translate(-50%, -50%)", zIndex: 101,
                        background: "var(--surface-raised)", border: "var(--line-width) solid var(--surface-border)",
                        borderRadius: "8px", padding: "24px", width: "380px", maxWidth: "90vw",
                        boxShadow: "var(--surface-shadow)",
                    }}>
                        <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "8px" }}>
                            {selectedIds.size} siparişi iptal et
                        </div>
                        <div style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "20px" }}>
                            Seçili siparişler iptal edilecek (rezerve stoklar serbest bırakılır). Devam edilsin mi?
                        </div>
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                            <Button
                                variant="secondary"
                                onClick={() => setBulkDeleteConfirm(false)}
                                disabled={bulkDeleting}
                            >
                                İptal
                            </Button>
                            <Button
                                variant="danger"
                                leftIcon={<CircleOff size={14} />}
                                onClick={handleBulkDelete}
                                disabled={bulkDeleting}
                            >
                                {bulkDeleting ? "İptal ediliyor…" : "İptal Et"}
                            </Button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
