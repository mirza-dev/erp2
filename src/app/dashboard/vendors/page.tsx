"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useToast } from "@/components/ui/Toast";
import { useIsDemo, DEMO_DISABLED_TOOLTIP, DEMO_BLOCK_TOAST } from "@/lib/demo-utils";
import { usePagination } from "@/hooks/usePagination";
import Pagination from "@/components/ui/Pagination";
import { useSelection } from "@/hooks/useSelection";
import { usePermissions } from "@/lib/auth/use-permissions";
import type { VendorRow } from "@/lib/database.types";
import Button from "@/components/ui/Button";
import { Plus } from "lucide-react";

// ── Styles ────────────────────────────────────────────────────

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

const inputStyle: React.CSSProperties = {
    fontSize: "13px",
    padding: "6px 10px",
    border: "0.5px solid var(--border-secondary)",
    borderRadius: "6px",
    background: "var(--bg-tertiary)",
    color: "var(--text-primary)",
    width: "100%",
    boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
    fontSize: "11px",
    color: "var(--text-tertiary)",
    display: "block",
    marginBottom: "3px",
};

const drawerOverlayStyle: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.4)",
    zIndex: 200,
    display: "flex",
    justifyContent: "flex-end",
};

const drawerPanelStyle: React.CSSProperties = {
    background: "var(--bg-primary)",
    width: "420px",
    maxWidth: "100vw",
    padding: "24px",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    height: "100vh",
    boxShadow: "-4px 0 24px rgba(0,0,0,0.18)",
};

// ── Initial form state ────────────────────────────────────────

const emptyForm = {
    name: "",
    contact_email: "",
    contact_phone: "",
    contact_person: "",
    tax_number: "",
    address: "",
    currency: "TRY",
    payment_terms_days: "",
    lead_time_days: "",
    notes: "",
};

type FormState = typeof emptyForm;

function vendorToForm(v: VendorRow): FormState {
    return {
        name: v.name,
        contact_email: v.contact_email ?? "",
        contact_phone: v.contact_phone ?? "",
        contact_person: v.contact_person ?? "",
        tax_number: v.tax_number ?? "",
        address: v.address ?? "",
        currency: v.currency,
        payment_terms_days: v.payment_terms_days != null ? String(v.payment_terms_days) : "",
        lead_time_days: v.lead_time_days != null ? String(v.lead_time_days) : "",
        notes: v.notes ?? "",
    };
}

function formToPayload(form: FormState): Record<string, unknown> {
    return {
        name: form.name.trim(),
        contact_email: form.contact_email.trim() || null,
        contact_phone: form.contact_phone.trim() || null,
        contact_person: form.contact_person.trim() || null,
        tax_number: form.tax_number.trim() || null,
        address: form.address.trim() || null,
        currency: form.currency,
        payment_terms_days: form.payment_terms_days !== "" ? Number(form.payment_terms_days) : null,
        lead_time_days: form.lead_time_days !== "" ? Number(form.lead_time_days) : null,
        notes: form.notes.trim() || null,
    };
}

// ── Component ─────────────────────────────────────────────────

export default function VendorsPage() {
    const { toast } = useToast();
    const isDemo = useIsDemo();
    const { has } = usePermissions();

    const [vendors, setVendors] = useState<VendorRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [showAll, setShowAll] = useState(false);

    // Drawer state
    const [drawerMode, setDrawerMode] = useState<"create" | "edit" | null>(null);
    const [editTarget, setEditTarget] = useState<VendorRow | null>(null);
    const [form, setForm] = useState<FormState>(emptyForm);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    // Deactivate / reactivate
    const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
    const [reactivatingId, setReactivatingId] = useState<string | null>(null);
    const [bulkDeactivateConfirm, setBulkDeactivateConfirm] = useState(false);
    const [bulkDeactivating, setBulkDeactivating] = useState(false);

    const loadVendors = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (showAll) params.set("all", "1");
            const res = await fetch(`/api/vendors?${params}`);
            if (!res.ok) throw new Error("Yüklenemedi");
            const data: VendorRow[] = await res.json();
            setVendors(data);
        } catch {
            toast({ type: "error", message: "Tedarikçiler yüklenemedi." });
        } finally {
            setLoading(false);
        }
    }, [showAll, toast]);

    useEffect(() => { loadVendors(); }, [loadVendors]);

    const filtered = useMemo(() => {
        if (!search.trim()) return vendors;
        const q = search.trim().toLowerCase();
        return vendors.filter(v =>
            v.name.toLowerCase().includes(q) ||
            (v.contact_person ?? "").toLowerCase().includes(q) ||
            (v.contact_email ?? "").toLowerCase().includes(q),
        );
    }, [vendors, search]);

    const { pagedItems, currentPage, setCurrentPage, totalPages, totalItems, pageSize } =
        usePagination(filtered, { resetKey: `${search}|${showAll}` });

    const { selectedIds, toggleOne, toggleAll, clearAll, isPageAllSelected, isPageIndeterminate } =
        useSelection(`${search}|${showAll}`);
    const pageIds = pagedItems.map(v => v.id);

    const handleBulkDeactivate = async () => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        setBulkDeactivating(true);
        const ids = Array.from(selectedIds);
        const results = await Promise.allSettled(
            ids.map(id => fetch(`/api/vendors/${id}`, { method: "DELETE" })),
        );
        const failed = results.filter(r => r.status === "rejected" || (r.status === "fulfilled" && !r.value.ok)).length;
        const succeeded = ids.length - failed;
        if (succeeded > 0) toast({ type: "success", message: `${succeeded} tedarikçi pasife alındı.` });
        if (failed > 0) toast({ type: "error", message: `${failed} tedarikçi pasife alınamadı.` });
        clearAll();
        setBulkDeactivateConfirm(false);
        setBulkDeactivating(false);
        await loadVendors();
    };

    const setField = (key: keyof FormState) =>
        (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
            setForm(f => ({ ...f, [key]: e.target.value }));

    const openCreate = () => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        setForm(emptyForm);
        setFormError(null);
        setEditTarget(null);
        setDrawerMode("create");
    };

    const openEdit = (v: VendorRow) => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        setForm(vendorToForm(v));
        setFormError(null);
        setEditTarget(v);
        setDrawerMode("edit");
    };

    const closeDrawer = () => { setDrawerMode(null); setEditTarget(null); };

    const handleSave = async () => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        if (!form.name.trim()) { setFormError("Tedarikçi adı zorunludur."); return; }
        setSaving(true);
        setFormError(null);
        try {
            const payload = formToPayload(form);
            let res: Response;
            if (drawerMode === "create") {
                res = await fetch("/api/vendors", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
            } else {
                res = await fetch(`/api/vendors/${editTarget!.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
            }
            const data = await res.json();
            if (!res.ok) { setFormError(data.error ?? "İşlem başarısız oldu."); return; }
            toast({ type: "success", message: drawerMode === "create" ? "Tedarikçi eklendi." : "Tedarikçi güncellendi." });
            closeDrawer();
            await loadVendors();
        } catch {
            setFormError("Beklenmeyen bir hata oluştu.");
        } finally {
            setSaving(false);
        }
    };

    const handleDeactivate = async (v: VendorRow) => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        if (deactivatingId) return;
        setDeactivatingId(v.id);
        try {
            const res = await fetch(`/api/vendors/${v.id}`, { method: "DELETE" });
            const data = await res.json();
            if (!res.ok) { toast({ type: "error", message: data.error ?? "Pasife alınamadı." }); return; }
            toast({ type: "success", message: `${v.name} pasife alındı.` });
            await loadVendors();
        } catch {
            toast({ type: "error", message: "Beklenmeyen bir hata oluştu." });
        } finally {
            setDeactivatingId(null);
        }
    };

    const handleReactivate = async (v: VendorRow) => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        if (reactivatingId) return;
        setReactivatingId(v.id);
        try {
            const res = await fetch(`/api/vendors/${v.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ is_active: true }),
            });
            const data = await res.json();
            if (!res.ok) { toast({ type: "error", message: data.error ?? "Aktifleştirilemedi." }); return; }
            toast({ type: "success", message: `${v.name} aktifleştirildi.` });
            await loadVendors();
        } catch {
            toast({ type: "error", message: "Beklenmeyen bir hata oluştu." });
        } finally {
            setReactivatingId(null);
        }
    };

    return (
        <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
                <div>
                    <h1 style={{ fontSize: "20px", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
                        Tedarikçiler
                    </h1>
                    <p style={{ fontSize: "13px", color: "var(--text-tertiary)", margin: "4px 0 0" }}>
                        {filtered.length} tedarikçi
                    </p>
                </div>
                {has("manage_vendors") && (
                    <Button
                        size="cta"
                        leftIcon={<Plus size={16} />}
                        onClick={openCreate}
                        disabled={isDemo}
                        title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}
                    >
                        Yeni Tedarikçi
                    </Button>
                )}
            </div>

            {/* Filters */}
            <div style={{ display: "flex", gap: "12px", marginBottom: "16px", alignItems: "center" }}>
                <input
                    type="text"
                    placeholder="İsim, kişi veya e-posta ara..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    style={{ ...inputStyle, maxWidth: "320px" }}
                />
                <label style={{ fontSize: "12px", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                    <input
                        type="checkbox"
                        checked={showAll}
                        onChange={e => setShowAll(e.target.checked)}
                        style={{ cursor: "pointer" }}
                    />
                    Pasifleri göster
                </label>
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
                        {selectedIds.size} tedarikçi seçildi
                    </span>
                    <Button
                        variant="danger"
                        size="sm"
                        onClick={() => setBulkDeactivateConfirm(true)}
                        disabled={bulkDeactivating}
                    >
                        {bulkDeactivating ? "İşleniyor…" : "Pasife Al"}
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
            <div style={{
                background: "var(--bg-primary)",
                border: "0.5px solid var(--border-tertiary)",
                borderRadius: "8px",
                overflow: "hidden",
            }}>
                {loading ? (
                    <div style={{ padding: "32px", textAlign: "center", color: "var(--text-tertiary)", fontSize: "13px" }}>
                        Yükleniyor...
                    </div>
                ) : filtered.length === 0 ? (
                    <div style={{ padding: "32px", textAlign: "center", color: "var(--text-tertiary)", fontSize: "13px" }}>
                        {search ? "Arama kriterine uyan tedarikçi bulunamadı." : "Henüz tedarikçi eklenmemiş."}
                    </div>
                ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
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
                                        aria-label="Sayfadaki tüm tedarikçileri seç"
                                    />
                                </th>
                                <th style={thStyle}>Tedarikçi</th>
                                <th style={thStyle}>İletişim</th>
                                <th style={thStyle}>Para Birimi</th>
                                <th style={{ ...thStyle, textAlign: "center" }}>Tedarik Süresi</th>
                                <th style={{ ...thStyle, textAlign: "center" }}>Ödeme Vadesi</th>
                                <th style={{ ...thStyle, textAlign: "center" }}>Durum</th>
                                <th style={{ ...thStyle, textAlign: "right" }}>İşlem</th>
                            </tr>
                        </thead>
                        <tbody>
                            {pagedItems.map(v => (
                                <tr key={v.id} style={{ transition: "background 0.08s" }}
                                    onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-secondary)")}
                                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                                >
                                    <td
                                        style={{ ...tdStyle, width: "36px", padding: "10px 8px 10px 14px" }}
                                        onClick={e => e.stopPropagation()}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.has(v.id)}
                                            onChange={() => toggleOne(v.id)}
                                            onClick={e => e.stopPropagation()}
                                            style={{ width: "14px", height: "14px", accentColor: "var(--accent)", cursor: "pointer" }}
                                            aria-label={`${v.name} seç`}
                                        />
                                    </td>
                                    <td style={tdStyle}>
                                        <div style={{ fontWeight: 500 }}>{v.name}</div>
                                        {v.contact_person && (
                                            <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>{v.contact_person}</div>
                                        )}
                                    </td>
                                    <td style={tdStyle}>
                                        {v.contact_email && (
                                            <div style={{ fontSize: "12px" }}>{v.contact_email}</div>
                                        )}
                                        {v.contact_phone && (
                                            <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>{v.contact_phone}</div>
                                        )}
                                        {!v.contact_email && !v.contact_phone && (
                                            <span style={{ color: "var(--text-tertiary)", fontSize: "12px" }}>—</span>
                                        )}
                                    </td>
                                    <td style={tdStyle}>
                                        <span style={{
                                            fontSize: "11px",
                                            padding: "2px 7px",
                                            borderRadius: "5px",
                                            background: "var(--bg-tertiary)",
                                            color: "var(--text-secondary)",
                                            fontWeight: 500,
                                        }}>
                                            {v.currency}
                                        </span>
                                    </td>
                                    <td style={{ ...tdStyle, textAlign: "center" }}>
                                        {v.lead_time_days != null ? `${v.lead_time_days} gün` : "—"}
                                    </td>
                                    <td style={{ ...tdStyle, textAlign: "center" }}>
                                        {v.payment_terms_days != null ? `${v.payment_terms_days} gün` : "—"}
                                    </td>
                                    <td style={{ ...tdStyle, textAlign: "center" }}>
                                        <span style={{
                                            fontSize: "11px",
                                            padding: "2px 7px",
                                            borderRadius: "5px",
                                            background: v.is_active ? "var(--success-bg)" : "var(--bg-tertiary)",
                                            color: v.is_active ? "var(--success-text)" : "var(--text-tertiary)",
                                            fontWeight: 500,
                                        }}>
                                            {v.is_active ? "Aktif" : "Pasif"}
                                        </span>
                                    </td>
                                    <td style={{ ...tdStyle, textAlign: "right" }}>
                                        <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                onClick={() => openEdit(v)}
                                                disabled={isDemo}
                                                title={isDemo ? DEMO_DISABLED_TOOLTIP : "Düzenle"}
                                            >
                                                Düzenle
                                            </Button>
                                            {v.is_active ? (
                                                <Button
                                                    variant="danger"
                                                    size="sm"
                                                    onClick={() => handleDeactivate(v)}
                                                    disabled={isDemo || deactivatingId === v.id}
                                                    title={isDemo ? DEMO_DISABLED_TOOLTIP : "Pasife al"}
                                                >
                                                    {deactivatingId === v.id ? "..." : "Pasife al"}
                                                </Button>
                                            ) : (
                                                <Button
                                                    variant="success"
                                                    size="sm"
                                                    onClick={() => handleReactivate(v)}
                                                    disabled={isDemo || reactivatingId === v.id}
                                                    title={isDemo ? DEMO_DISABLED_TOOLTIP : "Aktifleştir"}
                                                >
                                                    {reactivatingId === v.id ? "..." : "Aktifleştir"}
                                                </Button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
                {!loading && filtered.length > 0 && (
                    <Pagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        totalItems={totalItems}
                        pageSize={pageSize}
                        onPageChange={setCurrentPage}
                        itemLabel="tedarikçi"
                    />
                )}
            </div>

            {/* Bulk deactivate confirm modal */}
            {bulkDeactivateConfirm && (
                <>
                    <div
                        onClick={() => !bulkDeactivating && setBulkDeactivateConfirm(false)}
                        style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.5)" }}
                    />
                    <div style={{
                        position: "fixed", top: "50%", left: "50%",
                        transform: "translate(-50%, -50%)", zIndex: 101,
                        background: "var(--bg-primary)", border: "0.5px solid var(--border-primary)",
                        borderRadius: "8px", padding: "24px", width: "380px", maxWidth: "90vw",
                    }}>
                        <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "8px" }}>
                            {selectedIds.size} tedarikçiyi pasife al
                        </div>
                        <div style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "20px" }}>
                            Seçili tedarikçileri pasife almak istediğinizden emin misiniz?
                        </div>
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                            <Button
                                variant="secondary"
                                size="md"
                                onClick={() => setBulkDeactivateConfirm(false)}
                                disabled={bulkDeactivating}
                            >
                                İptal
                            </Button>
                            <Button
                                variant="danger"
                                size="md"
                                onClick={handleBulkDeactivate}
                                disabled={bulkDeactivating}
                            >
                                {bulkDeactivating ? "İşleniyor…" : "Pasife Al"}
                            </Button>
                        </div>
                    </div>
                </>
            )}

            {/* Drawer */}
            {drawerMode && (
                <div style={drawerOverlayStyle} onClick={e => { if (e.target === e.currentTarget) closeDrawer(); }}>
                    <div style={drawerPanelStyle} role="dialog" aria-label={drawerMode === "create" ? "Yeni tedarikçi" : "Tedarikçi düzenle"}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <h2 style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
                                {drawerMode === "create" ? "Yeni Tedarikçi" : "Tedarikçi Düzenle"}
                            </h2>
                            <button
                                onClick={closeDrawer}
                                style={{ background: "none", border: "none", fontSize: "18px", cursor: "pointer", color: "var(--text-tertiary)", lineHeight: 1 }}
                                aria-label="Kapat"
                            >
                                ×
                            </button>
                        </div>

                        {formError && (
                            <div
                                role="alert"
                                aria-live="polite"
                                style={{
                                    background: "var(--danger-bg)",
                                    color: "var(--danger-text)",
                                    border: "0.5px solid var(--danger-border)",
                                    borderRadius: "6px",
                                    padding: "8px 12px",
                                    fontSize: "12px",
                                }}
                            >
                                {formError}
                            </div>
                        )}

                        {/* Form fields */}
                        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                            <div>
                                <label htmlFor="v-name" style={labelStyle}>Tedarikçi Adı *</label>
                                <input id="v-name" type="text" value={form.name} onChange={setField("name")}
                                    style={{ ...inputStyle, borderColor: !form.name.trim() && formError ? "var(--danger)" : undefined }}
                                    aria-required="true"
                                />
                            </div>
                            <div>
                                <label htmlFor="v-person" style={labelStyle}>İletişim Kişisi</label>
                                <input id="v-person" type="text" value={form.contact_person} onChange={setField("contact_person")} style={inputStyle} />
                            </div>
                            <div>
                                <label htmlFor="v-email" style={labelStyle}>E-posta</label>
                                <input id="v-email" type="email" value={form.contact_email} onChange={setField("contact_email")} style={inputStyle} />
                            </div>
                            <div>
                                <label htmlFor="v-phone" style={labelStyle}>Telefon</label>
                                <input id="v-phone" type="tel" value={form.contact_phone} onChange={setField("contact_phone")} style={inputStyle} />
                            </div>
                            <div>
                                <label htmlFor="v-tax" style={labelStyle}>Vergi / TC Kimlik No</label>
                                <input id="v-tax" type="text" value={form.tax_number} onChange={setField("tax_number")} style={inputStyle} />
                            </div>
                            <div>
                                <label htmlFor="v-currency" style={labelStyle}>Para Birimi</label>
                                <select id="v-currency" value={form.currency} onChange={setField("currency")} style={inputStyle}>
                                    <option value="TRY">TRY — Türk Lirası</option>
                                    <option value="USD">USD — Amerikan Doları</option>
                                    <option value="EUR">EUR — Euro</option>
                                </select>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                                <div>
                                    <label htmlFor="v-lead" style={labelStyle}>Tedarik Süresi (gün)</label>
                                    <input id="v-lead" type="number" min="0" value={form.lead_time_days}
                                        onChange={setField("lead_time_days")} style={inputStyle} />
                                </div>
                                <div>
                                    <label htmlFor="v-terms" style={labelStyle}>Ödeme Vadesi (gün)</label>
                                    <input id="v-terms" type="number" min="0" value={form.payment_terms_days}
                                        onChange={setField("payment_terms_days")} style={inputStyle} />
                                </div>
                            </div>
                            <div>
                                <label htmlFor="v-address" style={labelStyle}>Adres</label>
                                <textarea id="v-address" rows={2} value={form.address} onChange={setField("address")}
                                    style={{ ...inputStyle, resize: "vertical" }} />
                            </div>
                            <div>
                                <label htmlFor="v-notes" style={labelStyle}>Notlar</label>
                                <textarea id="v-notes" rows={3} value={form.notes} onChange={setField("notes")}
                                    style={{ ...inputStyle, resize: "vertical" }} />
                            </div>
                        </div>

                        {/* Buttons */}
                        <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                            <Button
                                variant="secondary"
                                size="md"
                                onClick={closeDrawer}
                                disabled={saving}
                            >
                                İptal
                            </Button>
                            <Button
                                size="md"
                                onClick={handleSave}
                                disabled={saving}
                                loading={saving}
                                style={{ flex: 1 }}
                            >
                                {drawerMode === "create" ? "Ekle" : "Güncelle"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
