"use client";

import { useState, useMemo } from "react";
import { maskCurrency } from "@/lib/utils";
import { type Customer } from "@/lib/mock-data";
import { useData } from "@/lib/data-context";
import { usePermissions } from "@/lib/auth/use-permissions";
import CustomerDetailPanel from "@/components/customers/CustomerDetailPanel";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useIsDemo, DEMO_DISABLED_TOOLTIP, DEMO_BLOCK_TOAST } from "@/lib/demo-utils";
import { usePagination } from "@/hooks/usePagination";
import Pagination from "@/components/ui/Pagination";
import { useSelection } from "@/hooks/useSelection";
import { Plus, Trash2 } from "lucide-react";
import UnderlinedFilterTabs from "@/components/ui/UnderlinedFilterTabs";

const thStyle: React.CSSProperties = {
    textAlign: "left",
    padding: "10px 14px",
    fontSize: "12px",
    fontWeight: 500,
    color: "var(--text-secondary)",
    borderBottom: "0.5px solid var(--border-tertiary)",
};

const tdStyle: React.CSSProperties = {
    padding: "10px 14px",
    fontSize: "13px",
    borderBottom: "0.5px solid var(--border-tertiary)",
    color: "var(--text-primary)",
    lineHeight: 1.4,
};

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

export default function CustomersPage() {
    const { customers: mockCustomers, addCustomer, deleteCustomer, loadError } = useData();
    const { toast } = useToast();
    const isDemo = useIsDemo();
    const { has, canViewFinancialSummary } = usePermissions();
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [search, setSearch] = useState("");
    const [activeFilter, setActiveFilter] = useState<"all" | "active" | "passive">("all");
    const [showAddModal, setShowAddModal] = useState(false);
    const [newCustomer, setNewCustomer] = useState(newCustomerInitial);
    const [isAdding, setIsAdding] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [hoveredId, setHoveredId] = useState<string | null>(null);
    const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
    const [bulkDeleting, setBulkDeleting] = useState(false);

    const setField = (key: keyof typeof newCustomerInitial) =>
        (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
            setNewCustomer(f => ({ ...f, [key]: e.target.value }));

    const handleDelete = async (id: string) => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        setDeletingId(id);
        try {
            await deleteCustomer(id);
            toast({ type: "success", message: "Müşteri silindi" });
            if (selectedCustomer?.id === id) setSelectedCustomer(null);
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
            await addCustomer(newCustomer);
            toast({ type: "success", message: `${newCustomer.name} müşteri olarak eklendi` });
            setShowAddModal(false);
            setNewCustomer(newCustomerInitial);
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Müşteri eklenemedi. Lütfen tekrar deneyin.";
            toast({ type: "error", message: msg });
        } finally {
            setIsAdding(false);
        }
    };

    const activeCount = mockCustomers.filter(c => c.isActive).length;
    const passiveCount = mockCustomers.filter(c => !c.isActive).length;

    const filtered = useMemo(() => mockCustomers.filter((c) => {
        if (activeFilter === "active" && !c.isActive) return false;
        if (activeFilter === "passive" && c.isActive) return false;
        const q = search.toLowerCase();
        return c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q) || c.country.toLowerCase().includes(q);
    }), [mockCustomers, activeFilter, search]);

    const { pagedItems, currentPage, setCurrentPage, totalPages, totalItems, pageSize } =
        usePagination(filtered, { resetKey: `${activeFilter}|${search}` });

    const { selectedIds, toggleOne, toggleAll, clearAll, isPageAllSelected, isPageIndeterminate } =
        useSelection(`${activeFilter}|${search}`);
    const pageIds = pagedItems.map(c => c.id);

    const handleBulkDelete = async () => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        setBulkDeleting(true);
        const ids = Array.from(selectedIds);
        // Context deleteCustomer üzerinden geç — her başarı kendi satırını
        // setCustomers filter'ıyla state'ten kaldırır (ham fetch yalnız seçimi
        // temizliyordu, silinen satırlar tabloda kalıyordu).
        const results = await Promise.allSettled(ids.map(id => deleteCustomer(id)));
        const failed = results.filter(r => r.status === "rejected").length;
        const succeeded = ids.length - failed;
        if (succeeded > 0) toast({ type: "success", message: `${succeeded} müşteri silindi.` });
        if (failed > 0) toast({ type: "error", message: `${failed} müşteri silinemedi.` });
        // Açık panel toplu silmeye dahilse kapat (tek-silme paritesi).
        if (selectedCustomer && ids.includes(selectedCustomer.id)) setSelectedCustomer(null);
        clearAll();
        setBulkDeleteConfirm(false);
        setBulkDeleting(false);
    };

    return (
        <>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {/* Load error banner */}
                {loadError && (
                    <div style={{
                        padding: "10px 14px",
                        background: "var(--danger-bg)",
                        border: "0.5px solid var(--danger-border)",
                        borderRadius: "6px",
                        fontSize: "12px",
                        color: "var(--danger-text)",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                    }}>
                        ⚠ {loadError}
                    </div>
                )}
                {/* Header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
                    <div>
                        <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
                            Cariler
                        </div>
                        <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "3px" }}>
                            {mockCustomers.length} aktif müşteri · {new Set(mockCustomers.map(c => c.country)).size} ülke
                        </div>
                    </div>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end", flex: "1 1 320px" }}>
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Ad, e-posta veya ülke..."
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
                            { key: "all", label: "Tümü", count: mockCustomers.length },
                            { key: "active", label: "Aktif", count: activeCount },
                            { key: "passive", label: "Pasif", count: passiveCount },
                        ]}
                        activeKey={activeFilter}
                        onChange={setActiveFilter}
                    />
                    <span style={{ fontSize: "12px", color: "var(--text-tertiary)", marginLeft: "auto", alignSelf: "center" }}>
                        {filtered.length} müşteri
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
                <div
                    style={{
                        background: "var(--bg-primary)",
                        border: "0.5px solid var(--border-tertiary)",
                        borderRadius: "6px",
                        overflowX: "auto",
                    }}
                >
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", minWidth: "700px" }}>
                        <thead>
                            <tr style={{ background: "var(--bg-secondary)" }}>
                                <th style={{ ...thStyle, width: "36px", padding: "10px 8px 10px 14px" }}>
                                    <input
                                        type="checkbox"
                                        checked={isPageAllSelected(pageIds)}
                                        ref={el => { if (el) el.indeterminate = isPageIndeterminate(pageIds); }}
                                        onChange={() => toggleAll(pageIds)}
                                        onClick={e => e.stopPropagation()}
                                        style={{ width: "14px", height: "14px", accentColor: "var(--accent)", cursor: "pointer" }}
                                        aria-label="Sayfadaki tüm müşterileri seç"
                                    />
                                </th>
                                <th style={thStyle}>Müşteri</th>
                                <th style={thStyle}>Ülke</th>
                                <th style={thStyle}>E-posta</th>
                                <th style={thStyle}>Telefon</th>
                                <th style={{ ...thStyle, textAlign: "center" }}>Sipariş</th>
                                <th style={{ ...thStyle, textAlign: "right" }}>Toplam Gelir</th>
                                <th style={{ ...thStyle, width: "32px" }}></th>
                                <th style={{ ...thStyle, width: "120px" }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {pagedItems.map((customer) => (
                                <tr
                                    key={customer.id}
                                    style={{
                                        cursor: "pointer",
                                        background: hoveredId === customer.id ? "var(--bg-secondary)" : "transparent",
                                    }}
                                    onClick={() => setSelectedCustomer(customer)}
                                    onMouseEnter={() => setHoveredId(customer.id)}
                                    onMouseLeave={() => setHoveredId(null)}
                                >
                                    <td
                                        style={{ ...tdStyle, width: "36px", padding: "10px 8px 10px 14px" }}
                                        onClick={e => e.stopPropagation()}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.has(customer.id)}
                                            onChange={() => toggleOne(customer.id)}
                                            onClick={e => e.stopPropagation()}
                                            style={{ width: "14px", height: "14px", accentColor: "var(--accent)", cursor: "pointer" }}
                                            aria-label={`${customer.name} seç`}
                                        />
                                    </td>
                                    <td style={{ ...tdStyle, fontWeight: 500 }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                            <div
                                                style={{
                                                    width: "26px",
                                                    height: "26px",
                                                    borderRadius: "50%",
                                                    background: "var(--accent-bg)",
                                                    display: "flex",
                                                    alignItems: "center",
                                                    justifyContent: "center",
                                                    fontSize: "11px",
                                                    fontWeight: 600,
                                                    color: "var(--accent-text)",
                                                    flexShrink: 0,
                                                }}
                                            >
                                                {customer.name.charAt(0)}
                                            </div>
                                            {customer.name}
                                            <span style={{
                                                fontSize: "10px",
                                                padding: "1px 6px",
                                                borderRadius: "8px",
                                                marginLeft: "6px",
                                                background: customer.isActive ? "var(--success-bg)" : "var(--bg-tertiary)",
                                                color: customer.isActive ? "var(--success-text)" : "var(--text-tertiary)",
                                                border: `0.5px solid ${customer.isActive ? "var(--success-border)" : "var(--border-tertiary)"}`,
                                                flexShrink: 0,
                                            }}>
                                                {customer.isActive ? "Aktif" : "Pasif"}
                                            </span>
                                        </div>
                                    </td>
                                    <td style={{ ...tdStyle, color: "var(--text-secondary)" }}>
                                        {customer.country}
                                        <span style={{ marginLeft: "6px", fontSize: "11px", color: "var(--text-tertiary)" }}>
                                            {customer.currency}
                                        </span>
                                    </td>
                                    <td style={{ ...tdStyle, color: "var(--text-secondary)" }}>
                                        {customer.email}
                                    </td>
                                    <td style={{ ...tdStyle, color: "var(--text-secondary)" }}>
                                        {customer.phone}
                                    </td>
                                    <td style={{ ...tdStyle, textAlign: "center" }}>
                                        {customer.totalOrders}
                                    </td>
                                    <td style={{ ...tdStyle, textAlign: "right", fontWeight: 500, color: "var(--success-text)" }}>
                                        {maskCurrency(customer.totalRevenue, customer.currency, canViewFinancialSummary)}
                                    </td>
                                    <td style={{ ...tdStyle, textAlign: "right", color: "var(--text-tertiary)", fontSize: "16px", paddingRight: "16px" }}>
                                        ›
                                    </td>
                                    <td
                                        style={{ ...tdStyle, textAlign: "right", paddingRight: "12px" }}
                                        onClick={e => e.stopPropagation()}
                                    >
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
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {filtered.length > 0 && (
                        <Pagination
                            currentPage={currentPage}
                            totalPages={totalPages}
                            totalItems={totalItems}
                            pageSize={pageSize}
                            onPageChange={setCurrentPage}
                            itemLabel="müşteri"
                        />
                    )}
                </div>
            </div>

            <CustomerDetailPanel
                customer={selectedCustomer}
                onClose={() => setSelectedCustomer(null)}
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
