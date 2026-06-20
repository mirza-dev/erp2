"use client";

import { useEffect, useState } from "react";
import { useSWRConfig } from "swr";
import { maskCurrency } from "@/lib/utils";
import { type Customer } from "@/lib/mock-data";
import { CUSTOMERS_KEY } from "@/lib/data-context";
import { mapCustomer } from "@/lib/api-mappers";
import { decrementCount, patchCountRecord, removeByIds, successfulResponseIds, upsertFirst } from "@/lib/fast-mutation";
import { useListUrlState, useDebouncedSearch } from "@/hooks/useListUrlState";
import { usePermissions } from "@/lib/auth/use-permissions";
import CustomerDetailPanel from "@/components/customers/CustomerDetailPanel";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import DataTable, { type DataTableColumn } from "@/components/ui/DataTable";
import { useToast } from "@/components/ui/Toast";
import { useIsDemo, DEMO_DISABLED_TOOLTIP, DEMO_BLOCK_TOAST } from "@/lib/demo-utils";
import Pagination from "@/components/ui/Pagination";
import { computeTotalPages } from "@/hooks/usePagination";
import { useSelection } from "@/hooks/useSelection";
import { Plus, Trash2 } from "lucide-react";
import UnderlinedFilterTabs from "@/components/ui/UnderlinedFilterTabs";
import type { CustomerTab } from "@/lib/supabase/customers";

const newCustomerInitial = {
    name: "", email: "", phone: "", address: "",
    taxNumber: "", taxOffice: "", country: "", currency: "USD", notes: "",
};

const modalInputStyle: React.CSSProperties = {
    fontSize: "13px",
    padding: "6px 10px",
    border: "0.5px solid var(--border-secondary)",
    borderRadius: "6px",
    background: "var(--bg-tertiary)",
    color: "var(--text-primary)",
    width: "100%",
    boxSizing: "border-box" as const,
};

const modalLabelStyle: React.CSSProperties = {
    fontSize: "11px",
    color: "var(--text-tertiary)",
    display: "block",
    marginBottom: "3px",
};

export interface CustomersClientProps {
    customers: Customer[];                 // YALNIZ geçerli sayfa
    total: number;
    counts: Record<CustomerTab, number>;
    page: number;
    pageSize: number;
    tab: CustomerTab;
    search: string;
}

interface FilterState {
    tab: CustomerTab;
    search: string;
    page: number;
}

export default function CustomersClient(props: CustomersClientProps) {
    const { customers, total, counts, page, pageSize, tab, search } = props;
    const { mutate } = useSWRConfig();
    const { toast } = useToast();
    const isDemo = useIsDemo();
    const { has, canViewFinancialSummary } = usePermissions();
    const [displayCustomers, setDisplayCustomers] = useState<Customer[]>(customers);
    const [displayCounts, setDisplayCounts] = useState<Record<CustomerTab, number>>(counts);
    const [displayTotal, setDisplayTotal] = useState(total);
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [showAddModal, setShowAddModal] = useState(false);
    const [newCustomer, setNewCustomer] = useState(newCustomerInitial);
    const [isAdding, setIsAdding] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
    const [bulkDeleting, setBulkDeleting] = useState(false);

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

    useEffect(() => {
        setDisplayCustomers(customers);
        setDisplayCounts(counts);
        setDisplayTotal(total);
        setSelectedCustomer(prev => prev ? (customers.find(c => c.id === prev.id) ?? prev) : prev);
    }, [customers, counts, total]);

    const revalidateCustomers = () => {
        void mutate(CUSTOMERS_KEY);
    };

    const matchesCurrentView = (customer: Customer): boolean => {
        if (tab === "active" && !customer.isActive) return false;
        if (tab === "passive" && customer.isActive) return false;
        const needle = search.trim().toLowerCase();
        if (!needle) return true;
        return [
            customer.name,
            customer.email,
            customer.country,
        ].some(value => (value ?? "").toLowerCase().includes(needle));
    };

    const applyDeletedCustomers = (ids: string[]) => {
        if (ids.length === 0) return;
        const idSet = new Set(ids);
        const previous = displayCustomers.filter(customer => idSet.has(customer.id));
        setDisplayCustomers(prev => removeByIds(prev, idSet));
        setDisplayCounts(prev => {
            const patches: Partial<Record<CustomerTab, number>> = { all: -ids.length };
            for (const customer of previous) {
                patches[customer.isActive ? "active" : "passive"] =
                    (patches[customer.isActive ? "active" : "passive"] ?? 0) - 1;
            }
            return patchCountRecord(prev, patches);
        });
        setDisplayTotal(prev => decrementCount(prev, ids.length));
    };

    const applyCreatedCustomer = (customer: Customer) => {
        setDisplayCounts(prev => patchCountRecord(prev, {
            all: 1,
            [customer.isActive ? "active" : "passive"]: 1,
        } as Partial<Record<CustomerTab, number>>));
        if (matchesCurrentView(customer)) {
            setDisplayTotal(prev => prev + 1);
            if (page === 1) setDisplayCustomers(prev => upsertFirst(prev, customer));
        }
    };

    const applyUpdatedCustomer = (customer: Customer) => {
        const wasVisible = displayCustomers.some(c => c.id === customer.id);
        const shouldStayVisible = matchesCurrentView(customer);
        setSelectedCustomer(customer);
        setDisplayCustomers(prev => {
            const exists = prev.some(c => c.id === customer.id);
            if (!shouldStayVisible) return prev.filter(c => c.id !== customer.id);
            if (!exists) return prev;
            return prev.map(c => c.id === customer.id ? customer : c);
        });
        if (wasVisible && !shouldStayVisible) {
            setDisplayTotal(prev => decrementCount(prev));
        }
    };

    const setField = (key: keyof typeof newCustomerInitial) =>
        (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
            setNewCustomer(f => ({ ...f, [key]: e.target.value }));

    const handleDelete = async (id: string) => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        setDeletingId(id);
        try {
            const res = await fetch(`/api/customers/${id}`, { method: "DELETE" });
            if (!res.ok) {
                const errBody = await res.json().catch(() => null);
                throw new Error(errBody?.error ?? "Müşteri silinemedi.");
            }
            toast({ type: "success", message: "Müşteri silindi" });
            if (selectedCustomer?.id === id) setSelectedCustomer(null);
            applyDeletedCustomers([id]);
            revalidateCustomers();
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Müşteri silinemedi.";
            toast({ type: "error", message: msg });
        } finally {
            setDeletingId(null);
            setConfirmDeleteId(null);
        }
    };

    const handleAdd = async () => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        if (!newCustomer.name || isAdding) return;
        setIsAdding(true);
        try {
            const res = await fetch("/api/customers", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: newCustomer.name,
                    email: newCustomer.email,
                    phone: newCustomer.phone,
                    address: newCustomer.address,
                    tax_number: newCustomer.taxNumber,
                    tax_office: newCustomer.taxOffice,
                    country: newCustomer.country,
                    currency: newCustomer.currency,
                    notes: newCustomer.notes,
                }),
            });
            if (!res.ok) {
                const errBody = await res.json().catch(() => null);
                throw new Error(errBody?.error ?? "Müşteri eklenemedi. Lütfen tekrar deneyin.");
            }
            const created = mapCustomer(await res.json());
            toast({ type: "success", message: `${newCustomer.name} müşteri olarak eklendi` });
            setShowAddModal(false);
            setNewCustomer(newCustomerInitial);
            applyCreatedCustomer(created);
            revalidateCustomers();
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Müşteri eklenemedi. Lütfen tekrar deneyin.";
            toast({ type: "error", message: msg });
        } finally {
            setIsAdding(false);
        }
    };

    const { selectedIds, toggleOne, toggleAll, clearAll, isPageAllSelected, isPageIndeterminate } =
        useSelection(`${tab}|${search}|${page}`);
    const pageIds = displayCustomers.map(c => c.id);

    const handleBulkDelete = async () => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        setBulkDeleting(true);
        const ids = Array.from(selectedIds);
        const results = await Promise.allSettled(
            ids.map(id => fetch(`/api/customers/${id}`, { method: "DELETE" })),
        );
        const succeededIds = successfulResponseIds(ids, results);
        const failed = ids.length - succeededIds.length;
        const succeeded = succeededIds.length;
        if (succeeded > 0) toast({ type: "success", message: `${succeeded} müşteri silindi.` });
        if (failed > 0) toast({ type: "error", message: `${failed} müşteri silinemedi.` });
        if (selectedCustomer && succeededIds.includes(selectedCustomer.id)) setSelectedCustomer(null);
        clearAll();
        setBulkDeleteConfirm(false);
        setBulkDeleting(false);
        applyDeletedCustomers(succeededIds);
        revalidateCustomers();
    };

    const totalPages = computeTotalPages(displayTotal, pageSize);

    const checkboxCellStyle: React.CSSProperties = { width: "36px", padding: "10px 8px 10px 14px" };

    const columns: DataTableColumn<Customer>[] = [
        {
            key: "select",
            width: "36px",
            headerStyle: checkboxCellStyle,
            cellStyle: checkboxCellStyle,
            header: (
                <input
                    type="checkbox"
                    checked={isPageAllSelected(pageIds)}
                    ref={el => { if (el) el.indeterminate = isPageIndeterminate(pageIds); }}
                    onChange={() => toggleAll(pageIds)}
                    onClick={e => e.stopPropagation()}
                    style={{ width: "14px", height: "14px", accentColor: "var(--accent)", cursor: "pointer" }}
                    aria-label="Sayfadaki tüm müşterileri seç"
                />
            ),
            cell: customer => (
                <span style={{ display: "inline-flex" }} onClick={e => e.stopPropagation()}>
                    <input
                        type="checkbox"
                        checked={selectedIds.has(customer.id)}
                        onChange={() => toggleOne(customer.id)}
                        onClick={e => e.stopPropagation()}
                        style={{ width: "14px", height: "14px", accentColor: "var(--accent)", cursor: "pointer" }}
                        aria-label={`${customer.name} seç`}
                    />
                </span>
            ),
        },
        {
            key: "name",
            header: "Müşteri",
            cellStyle: { fontWeight: 500 },
            cell: customer => (
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div
                        style={{
                            width: "26px", height: "26px", borderRadius: "50%",
                            background: "var(--accent-bg)", display: "flex",
                            alignItems: "center", justifyContent: "center",
                            fontSize: "11px", fontWeight: 600, color: "var(--accent-text)", flexShrink: 0,
                        }}
                    >
                        {customer.name.charAt(0)}
                    </div>
                    {customer.name}
                    <span style={{
                        fontSize: "10px", padding: "1px 6px", borderRadius: "8px", marginLeft: "6px",
                        background: customer.isActive ? "var(--success-bg)" : "var(--bg-tertiary)",
                        color: customer.isActive ? "var(--success-text)" : "var(--text-tertiary)",
                        border: `0.5px solid ${customer.isActive ? "var(--success-border)" : "var(--border-tertiary)"}`,
                        flexShrink: 0,
                    }}>
                        {customer.isActive ? "Aktif" : "Pasif"}
                    </span>
                </div>
            ),
        },
        {
            key: "country",
            header: "Ülke",
            cellStyle: { color: "var(--text-secondary)" },
            cell: customer => (
                <>
                    {customer.country}
                    <span style={{ marginLeft: "6px", fontSize: "11px", color: "var(--text-tertiary)" }}>
                        {customer.currency}
                    </span>
                </>
            ),
        },
        {
            key: "email",
            header: "E-posta",
            cellStyle: { color: "var(--text-secondary)" },
            cell: customer => customer.email,
        },
        {
            key: "phone",
            header: "Telefon",
            cellStyle: { color: "var(--text-secondary)" },
            cell: customer => customer.phone,
        },
        {
            key: "totalOrders",
            header: "Sipariş",
            align: "center",
            cell: customer => customer.totalOrders,
        },
        {
            key: "totalRevenue",
            header: "Toplam Gelir",
            align: "right",
            cellStyle: { fontWeight: 500, color: "var(--success-text)" },
            cell: customer => maskCurrency(customer.totalRevenue, customer.currency, canViewFinancialSummary),
        },
        {
            key: "chevron",
            header: "",
            align: "right",
            width: "32px",
            cellStyle: { color: "var(--text-tertiary)", fontSize: "16px", paddingRight: "16px" },
            cell: () => "›",
        },
        {
            key: "actions",
            header: "",
            align: "right",
            width: "120px",
            cellStyle: { paddingRight: "12px" },
            cell: customer => (
                <span onClick={e => e.stopPropagation()}>
                    {has("delete_customers") && (confirmDeleteId === customer.id ? (
                        <span style={{ display: "flex", alignItems: "center", gap: "6px", justifyContent: "flex-end" }}>
                            <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>Kalıcı silinecek. Emin misin?</span>
                            <Button
                                variant="danger"
                                size="xs"
                                leftIcon={<Trash2 size={13} />}
                                disabled={deletingId === customer.id}
                                onClick={() => handleDelete(customer.id)}
                            >
                                {deletingId === customer.id ? "…" : "Kalıcı Sil"}
                            </Button>
                            <Button
                                variant="secondary"
                                size="xs"
                                onClick={() => setConfirmDeleteId(null)}
                            >
                                Hayır
                            </Button>
                        </span>
                    ) : (
                        <Button
                            variant="dangerSoft"
                            size="xs"
                            leftIcon={<Trash2 size={13} />}
                            onClick={() => setConfirmDeleteId(customer.id)}
                            disabled={isDemo}
                            title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}
                        >
                            Kalıcı Sil
                        </Button>
                    ))}
                </span>
            ),
        },
    ];

    return (
        <>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px", opacity: isPending ? 0.7 : 1, transition: "opacity 0.12s" }}>
                {/* Header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
                    <div>
                        <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
                            Cariler
                        </div>
                        <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "3px" }}>
                            {displayCounts.all} müşteri · {displayCounts.active} aktif
                        </div>
                    </div>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end", flex: "1 1 320px" }}>
                        <input
                            type="text"
                            value={searchText}
                            onChange={(e) => setSearchText(e.target.value)}
                            placeholder="Ad, e-posta veya ülke..."
                            aria-label="Müşteri ara"
                            style={{
                                fontSize: "12px",
                                padding: "6px 12px",
                                border: "0.5px solid var(--border-secondary)",
                                borderRadius: "6px",
                                background: "var(--bg-primary)",
                                color: "var(--text-primary)",
                                width: "100%",
                                maxWidth: "220px",
                                minWidth: "0",
                                flex: "1 1 190px",
                            }}
                        />
                        {has("manage_customers") && (
                            <Button
                                size="cta"
                                leftIcon={<Plus size={15} />}
                                onClick={() => setShowAddModal(true)}
                                disabled={isDemo}
                                title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}
                            >
                                Yeni Müşteri
                            </Button>
                        )}
                    </div>
                </div>

                <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                    <UnderlinedFilterTabs
                        ariaLabel="Cari durumu filtresi"
                        items={[
                            { key: "all", label: "Tümü", count: displayCounts.all },
                            { key: "active", label: "Aktif", count: displayCounts.active },
                            { key: "passive", label: "Pasif", count: displayCounts.passive },
                        ]}
                        activeKey={tab}
                        onChange={(key) => navigate({ tab: key, page: 1 })}
                    />
                    <span style={{ fontSize: "12px", color: "var(--text-tertiary)", marginLeft: "auto", alignSelf: "center" }}>
                        {displayTotal} müşteri
                    </span>
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
                            {selectedIds.size} müşteri seçildi
                        </span>
                        <Button
                            variant="dangerSoft"
                            size="sm"
                            leftIcon={<Trash2 size={14} />}
                            onClick={() => setBulkDeleteConfirm(true)}
                            disabled={bulkDeleting}
                        >
                            {bulkDeleting ? "Siliniyor…" : "Sil"}
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
                <Card>
                    <DataTable
                        columns={columns}
                        rows={displayCustomers}
                        rowKey={c => c.id}
                        onRowClick={c => setSelectedCustomer(c)}
                        minWidth="700px"
                        emptyMessage={search ? "Arama kriterine uyan müşteri bulunamadı." : "Henüz müşteri yok."}
                        footer={displayTotal > 0 ? (
                            <Pagination
                                currentPage={page}
                                totalPages={totalPages}
                                totalItems={displayTotal}
                                pageSize={pageSize}
                                onPageChange={(p) => navigate({ page: p })}
                                itemLabel="müşteri"
                            />
                        ) : null}
                    />
                </Card>
            </div>

            <CustomerDetailPanel
                customer={selectedCustomer}
                onClose={() => setSelectedCustomer(null)}
                onCustomerUpdated={applyUpdatedCustomer}
            />

            {/* Bulk delete confirm modal */}
            {bulkDeleteConfirm && (
                <>
                    <div
                        onClick={() => !bulkDeleting && setBulkDeleteConfirm(false)}
                        style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.5)" }}
                    />
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="bulk-delete-customers-title"
                        style={{
                            position: "fixed", top: "50%", left: "50%",
                            transform: "translate(-50%, -50%)", zIndex: 101,
                            background: "var(--bg-primary)", border: "0.5px solid var(--border-primary)",
                            borderRadius: "8px", padding: "24px", width: "380px", maxWidth: "90vw",
                        }}>
                        <div id="bulk-delete-customers-title" style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "8px" }}>
                            {selectedIds.size} müşteriyi sil
                        </div>
                        <div style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "20px" }}>
                            Seçili müşterileri silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.
                        </div>
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                            <Button
                                variant="secondary"
                                size="md"
                                onClick={() => setBulkDeleteConfirm(false)}
                                disabled={bulkDeleting}
                            >
                                İptal
                            </Button>
                            <Button
                                variant="danger"
                                size="md"
                                leftIcon={<Trash2 size={14} />}
                                onClick={handleBulkDelete}
                                disabled={bulkDeleting}
                            >
                                {bulkDeleting ? "Siliniyor…" : "Sil"}
                            </Button>
                        </div>
                    </div>
                </>
            )}

            {/* Yeni Müşteri Modalı */}
            {showAddModal && (
                <>
                    <div
                        onClick={() => setShowAddModal(false)}
                        style={{
                            position: "fixed",
                            inset: 0,
                            zIndex: 60,
                            background: "rgba(0,0,0,0.5)",
                        }}
                    />
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="add-customer-title"
                        style={{
                            position: "fixed",
                            top: "50%",
                            left: "50%",
                            transform: "translate(-50%, -50%)",
                            zIndex: 61,
                            width: "100%",
                            maxWidth: "480px",
                            background: "var(--bg-primary)",
                            border: "0.5px solid var(--border-primary)",
                            borderRadius: "10px",
                            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
                            overflow: "hidden",
                        }}
                    >
                        {/* Modal Header */}
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                padding: "14px 18px",
                                borderBottom: "0.5px solid var(--border-tertiary)",
                            }}
                        >
                            <div id="add-customer-title" style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
                                Yeni Müşteri
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowAddModal(false)}
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

                        {/* Modal Form */}
                        <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: "10px" }}>
                            <div>
                                <label style={modalLabelStyle}>Firma Adı *</label>
                                <input style={modalInputStyle} value={newCustomer.name} onChange={setField("name")} placeholder="Örn. Petronas Lubricants" />
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                                <div>
                                    <label style={modalLabelStyle}>Ülke</label>
                                    <input style={modalInputStyle} value={newCustomer.country} onChange={e => setNewCustomer(prev => ({ ...prev, country: e.target.value.toUpperCase().slice(0, 2) }))} placeholder="TR, US, AE..." maxLength={2} />
                                </div>
                                <div>
                                    <label style={modalLabelStyle}>Para Birimi</label>
                                    <select style={{ ...modalInputStyle }} value={newCustomer.currency} onChange={setField("currency")}>
                                        <option value="USD">USD</option>
                                        <option value="EUR">EUR</option>
                                        <option value="TRY">TRY</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label style={modalLabelStyle}>E-posta</label>
                                <input style={modalInputStyle} value={newCustomer.email} onChange={setField("email")} placeholder="procurement@firma.com" />
                            </div>
                            <div>
                                <label style={modalLabelStyle}>Telefon</label>
                                <input style={modalInputStyle} value={newCustomer.phone} onChange={setField("phone")} placeholder="+90 212 ..." />
                            </div>
                            <div>
                                <label style={modalLabelStyle}>Adres</label>
                                <input style={modalInputStyle} value={newCustomer.address} onChange={setField("address")} placeholder="Sokak, Şehir, Ülke" />
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                                <div>
                                    <label style={modalLabelStyle}>Vergi Dairesi</label>
                                    <input style={modalInputStyle} value={newCustomer.taxOffice} onChange={setField("taxOffice")} />
                                </div>
                                <div>
                                    <label style={modalLabelStyle}>Vergi No</label>
                                    <input style={modalInputStyle} value={newCustomer.taxNumber} onChange={setField("taxNumber")} />
                                </div>
                            </div>
                            <div>
                                <label style={modalLabelStyle}>Notlar</label>
                                <textarea
                                    style={{ ...modalInputStyle, resize: "vertical", minHeight: "60px" }}
                                    value={newCustomer.notes}
                                    onChange={setField("notes")}
                                    placeholder="Opsiyonel notlar..."
                                />
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div
                            style={{
                                display: "flex",
                                gap: "8px",
                                alignItems: "center",
                                justifyContent: "flex-end",
                                padding: "12px 18px",
                                borderTop: "0.5px solid var(--border-tertiary)",
                            }}
                        >
                            <Button variant="secondary" size="md" onClick={() => setShowAddModal(false)}>
                                İptal
                            </Button>
                            <Button
                                size="md"
                                onClick={handleAdd}
                                loading={isAdding}
                                disabled={isDemo || !newCustomer.name || isAdding}
                                title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}
                            >
                                Müşteriyi Kaydet
                            </Button>
                        </div>
                    </div>
                </>
            )}
        </>
    );
}
