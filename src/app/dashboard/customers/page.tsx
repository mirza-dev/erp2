"use client";

import { useState } from "react";
import { formatCurrency } from "@/lib/utils";
import { type Customer } from "@/lib/mock-data";
import { useData } from "@/lib/data-context";
import CustomerDetailPanel from "@/components/customers/CustomerDetailPanel";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

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
    outline: "none",
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
    const { customers: mockCustomers, addCustomer } = useData();
    const { toast } = useToast();
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [search, setSearch] = useState("");
    const [activeFilter, setActiveFilter] = useState<"all" | "active" | "passive">("all");
    const [showAddModal, setShowAddModal] = useState(false);
    const [newCustomer, setNewCustomer] = useState(newCustomerInitial);

    const setField = (key: keyof typeof newCustomerInitial) =>
        (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
            setNewCustomer(f => ({ ...f, [key]: e.target.value }));

    const handleAdd = () => {
        if (!newCustomer.name) return;
        addCustomer(newCustomer);
        toast({ type: "success", message: `${newCustomer.name} müşteri olarak eklendi` });
        setShowAddModal(false);
        setNewCustomer(newCustomerInitial);
    };

    const activeCount = mockCustomers.filter(c => c.isActive).length;
    const passiveCount = mockCustomers.filter(c => !c.isActive).length;

    const filtered = mockCustomers.filter((c) => {
        if (activeFilter === "active" && !c.isActive) return false;
        if (activeFilter === "passive" && c.isActive) return false;
        const q = search.toLowerCase();
        return c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q) || c.country.toLowerCase().includes(q);
    });

    return (
        <>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {/* Header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                        <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
                            Cariler
                        </div>
                        <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "3px" }}>
                            {mockCustomers.length} aktif müşteri · {new Set(mockCustomers.map(c => c.country)).size} ülke
                        </div>
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
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
                                width: "220px",
                                outline: "none",
                            }}
                        />
                        <Button variant="primary" onClick={() => setShowAddModal(true)}>
                            + Yeni Müşteri
                        </Button>
                    </div>
                </div>

                {/* Filter Tabs */}
                <div style={{ display: "flex", gap: "4px" }}>
                    {([
                        { key: "all", label: "Tümü", count: mockCustomers.length },
                        { key: "active", label: "Aktif", count: activeCount },
                        { key: "passive", label: "Pasif", count: passiveCount },
                    ] as const).map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveFilter(tab.key)}
                            style={{
                                fontSize: "12px",
                                padding: "5px 12px",
                                border: "0.5px solid",
                                borderColor: activeFilter === tab.key ? "var(--accent-border)" : "var(--border-secondary)",
                                borderRadius: "6px",
                                background: activeFilter === tab.key ? "var(--accent-bg)" : "transparent",
                                color: activeFilter === tab.key ? "var(--accent-text)" : "var(--text-secondary)",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                            }}
                        >
                            {tab.label}
                            <span style={{
                                fontSize: "11px",
                                padding: "1px 5px",
                                borderRadius: "10px",
                                background: activeFilter === tab.key ? "rgba(255,255,255,0.15)" : "var(--bg-tertiary)",
                                color: activeFilter === tab.key ? "var(--accent-text)" : "var(--text-tertiary)",
                            }}>{tab.count}</span>
                        </button>
                    ))}
                    <span style={{ fontSize: "12px", color: "var(--text-tertiary)", marginLeft: "auto", alignSelf: "center" }}>
                        {filtered.length} müşteri
                    </span>
                </div>

                {/* Table */}
                <div
                    style={{
                        background: "var(--bg-primary)",
                        border: "0.5px solid var(--border-tertiary)",
                        borderRadius: "6px",
                        overflow: "hidden",
                    }}
                >
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                        <thead>
                            <tr style={{ background: "var(--bg-secondary)" }}>
                                <th style={thStyle}>Müşteri</th>
                                <th style={thStyle}>Ülke</th>
                                <th style={thStyle}>E-posta</th>
                                <th style={thStyle}>Telefon</th>
                                <th style={{ ...thStyle, textAlign: "center" }}>Sipariş</th>
                                <th style={{ ...thStyle, textAlign: "right" }}>Toplam Gelir</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((customer) => (
                                <tr
                                    key={customer.id}
                                    style={{ cursor: "pointer" }}
                                    onClick={() => setSelectedCustomer(customer)}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.querySelectorAll("td").forEach(td => (td.style.background = "var(--bg-secondary)"));
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.querySelectorAll("td").forEach(td => (td.style.background = "transparent"));
                                    }}
                                >
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
                                        {formatCurrency(customer.totalRevenue, customer.currency)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <CustomerDetailPanel
                customer={selectedCustomer}
                onClose={() => setSelectedCustomer(null)}
            />

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
                            <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
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
                                    <input style={modalInputStyle} value={newCustomer.country} onChange={setField("country")} placeholder="TR, US, AE..." />
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
                                padding: "12px 18px",
                                borderTop: "0.5px solid var(--border-tertiary)",
                            }}
                        >
                            <Button variant="primary" size="md" onClick={handleAdd} disabled={!newCustomer.name}>
                                Müşteriyi Kaydet
                            </Button>
                            <Button variant="secondary" size="md" onClick={() => setShowAddModal(false)}>
                                İptal
                            </Button>
                        </div>
                    </div>
                </>
            )}
        </>
    );
}
