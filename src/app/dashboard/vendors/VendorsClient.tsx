"use client";

import { useEffect, useState } from "react";
import { fieldStyle, labelStyle as sharedLabelStyle } from "@/components/ui/Input";
import { useListUrlState, useDebouncedSearch } from "@/hooks/useListUrlState";
import { useToast } from "@/components/ui/Toast";
import { useIsDemo, DEMO_DISABLED_TOOLTIP, DEMO_BLOCK_TOAST } from "@/lib/demo-utils";
import Pagination from "@/components/ui/Pagination";
import { computeTotalPages } from "@/hooks/usePagination";
import { useSelection } from "@/hooks/useSelection";
import { usePermissions } from "@/lib/auth/use-permissions";
import type { VendorRow } from "@/lib/database.types";
import { decrementCount, removeByIds, successfulResponseIds, upsertFirst } from "@/lib/fast-mutation";
import Button from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/Modal";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import DataTable, { type DataTableColumn } from "@/components/ui/DataTable";
import VendorDetailPanel from "@/components/vendors/VendorDetailPanel";
import Drawer from "@/components/ui/Drawer";
import { CircleOff, Pencil, Plus, RotateCcw } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import SectionHeader from "@/components/ui/SectionHeader";

// ── Styles ────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = fieldStyle("md");

const labelStyle: React.CSSProperties = { ...sharedLabelStyle(), display: "block", marginBottom: "3px" };

/* `drawerOverlayStyle` + `drawerPanelStyle` SİLİNDİ (2026-09-05): sayfaya gömülü
   yerel çekmece lehçesiydi. Yerine geçen garanti `ui/Drawer` — konumlandırma,
   katman, yüzey token'ları ve erişilebilirlik orada; kapı kuralı
   `gate/surface-consistency`te. Genişlik/boşluk çağıranda kaldı. */

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

export interface VendorsClientProps {
    vendors: VendorRow[];          // YALNIZ geçerli sayfa
    total: number;
    page: number;
    pageSize: number;
    search: string;
    showAll: boolean;
}

interface FilterState {
    search: string;
    showAll: boolean;
    page: number;
}

// ── Component ─────────────────────────────────────────────────

export default function VendorsClient(props: VendorsClientProps) {
    const { vendors, total, page, pageSize, search, showAll } = props;
    const { toast } = useToast();
    const isDemo = useIsDemo();
    const { has } = usePermissions();
    const [displayVendors, setDisplayVendors] = useState<VendorRow[]>(vendors);
    const [displayTotal, setDisplayTotal] = useState(total);

    // Drawer state
    const [drawerMode, setDrawerMode] = useState<"create" | "edit" | null>(null);
    const [editTarget, setEditTarget] = useState<VendorRow | null>(null);
    const [selectedVendor, setSelectedVendor] = useState<VendorRow | null>(null);
    const [form, setForm] = useState<FormState>(emptyForm);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    // Deactivate / reactivate
    const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
    const [reactivatingId, setReactivatingId] = useState<string | null>(null);
    const [bulkDeactivateConfirm, setBulkDeactivateConfirm] = useState(false);
    const [bulkDeactivating, setBulkDeactivating] = useState(false);

    const serialize = (p: FilterState) => {
        const params = new URLSearchParams();
        if (p.search) params.set("search", p.search);
        if (p.showAll) params.set("all", "1");
        if (p.page > 1) params.set("page", String(p.page));
        return params;
    };
    const { navigate, isPending } = useListUrlState<FilterState>({ search, showAll, page }, serialize);
    const { value: searchText, setValue: setSearchText } = useDebouncedSearch(
        search,
        (v) => navigate({ search: v, page: 1 }),
    );

    useEffect(() => {
        setDisplayVendors(vendors);
        setDisplayTotal(total);
    }, [vendors, total]);

    const matchesCurrentView = (vendor: VendorRow): boolean => {
        if (!showAll && !vendor.is_active) return false;
        const needle = search.trim().toLowerCase();
        if (!needle) return true;
        return [
            vendor.name,
            vendor.contact_person,
            vendor.contact_email,
        ].some(value => (value ?? "").toLowerCase().includes(needle));
    };

    const applySavedVendor = (vendor: VendorRow, mode: "create" | "edit") => {
        if (!matchesCurrentView(vendor)) {
            setDisplayVendors(prev => prev.filter(v => v.id !== vendor.id));
            if (mode === "edit") setDisplayTotal(prev => decrementCount(prev));
            return;
        }
        setDisplayVendors(prev => {
            if (mode === "create") return page === 1 ? upsertFirst(prev, vendor) : prev;
            return prev.map(v => v.id === vendor.id ? vendor : v);
        });
        if (mode === "create") setDisplayTotal(prev => prev + 1);
    };

    const applyDeactivatedVendors = (ids: string[]) => {
        if (ids.length === 0) return;
        const idSet = new Set(ids);
        if (showAll) {
            setDisplayVendors(prev => prev.map(v => idSet.has(v.id) ? { ...v, is_active: false } : v));
        } else {
            setDisplayVendors(prev => removeByIds(prev, idSet));
            setDisplayTotal(prev => decrementCount(prev, ids.length));
        }
    };

    const applyReactivatedVendor = (vendor: VendorRow) => {
        setDisplayVendors(prev => prev.map(v => v.id === vendor.id ? vendor : v));
    };

    const { selectedIds, toggleOne, toggleAll, clearAll, isPageAllSelected, isPageIndeterminate } =
        useSelection(`${search}|${showAll}|${page}`);
    // Toplu pasifleştirme yalnız aktif tedarikçiler için anlamlı (PO paterni).
    const pageIds = displayVendors.filter(v => v.is_active).map(v => v.id);

    const handleBulkDeactivate = async () => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        setBulkDeactivating(true);
        const ids = Array.from(selectedIds);
        const results = await Promise.allSettled(
            ids.map(id => fetch(`/api/vendors/${id}`, { method: "DELETE" })),
        );
        const succeededIds = successfulResponseIds(ids, results);
        const failed = ids.length - succeededIds.length;
        const succeeded = succeededIds.length;
        if (succeeded > 0) toast({ type: "success", message: `${succeeded} tedarikçi pasife alındı.` });
        if (failed > 0) toast({ type: "error", message: `${failed} tedarikçi pasife alınamadı.` });
        clearAll();
        setBulkDeactivateConfirm(false);
        setBulkDeactivating(false);
        applyDeactivatedVendors(succeededIds);
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
        const mode = drawerMode;
        if (!mode) return;
        if (!form.name.trim()) { setFormError("Tedarikçi adı zorunludur."); return; }
        setSaving(true);
        setFormError(null);
        try {
            const payload = formToPayload(form);
            let res: Response;
            if (mode === "create") {
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
            toast({ type: "success", message: mode === "create" ? "Tedarikçi eklendi." : "Tedarikçi güncellendi." });
            closeDrawer();
            applySavedVendor(data as VendorRow, mode);
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
            applyDeactivatedVendors([v.id]);
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
            applyReactivatedVendor(data as VendorRow);
        } catch {
            toast({ type: "error", message: "Beklenmeyen bir hata oluştu." });
        } finally {
            setReactivatingId(null);
        }
    };

    const totalPages = computeTotalPages(displayTotal, pageSize);

    const checkboxCellStyle: React.CSSProperties = { width: "36px", padding: "10px 8px 10px 14px" };

    const columns: DataTableColumn<VendorRow>[] = [
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
                    aria-label="Sayfadaki tüm tedarikçileri seç"
                />
            ),
            cell: v => v.is_active ? (
                <input
                    type="checkbox"
                    checked={selectedIds.has(v.id)}
                    onChange={() => toggleOne(v.id)}
                    onClick={e => e.stopPropagation()}
                    style={{ width: "14px", height: "14px", accentColor: "var(--accent)", cursor: "pointer" }}
                    aria-label={`${v.name} seç`}
                />
            ) : null,
        },
        {
            key: "vendor",
            header: "Tedarikçi",
            cell: v => (
                <>
                    <div style={{ fontWeight: 500 }}>{v.name}</div>
                    {v.contact_person && (
                        <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>{v.contact_person}</div>
                    )}
                </>
            ),
        },
        {
            key: "contact",
            header: "İletişim",
            cell: v => (
                <>
                    {v.contact_email && (
                        <div style={{ fontSize: "12px" }}>{v.contact_email}</div>
                    )}
                    {v.contact_phone && (
                        <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>{v.contact_phone}</div>
                    )}
                    {!v.contact_email && !v.contact_phone && (
                        <span style={{ color: "var(--text-tertiary)", fontSize: "12px" }}>—</span>
                    )}
                </>
            ),
        },
        {
            key: "currency",
            header: "Para Birimi",
            cell: v => <Badge tone="neutral">{v.currency}</Badge>,
        },
        {
            key: "lead_time",
            header: "Tedarik Süresi",
            align: "center",
            cell: v => v.lead_time_days != null ? `${v.lead_time_days} gün` : "—",
        },
        {
            key: "payment_terms",
            header: "Ödeme Vadesi",
            align: "center",
            cell: v => v.payment_terms_days != null ? `${v.payment_terms_days} gün` : "—",
        },
        {
            key: "status",
            header: "Durum",
            align: "center",
            cell: v => (
                <Badge tone={v.is_active ? "success" : "neutral"}>
                    {v.is_active ? "Aktif" : "Pasif"}
                </Badge>
            ),
        },
        {
            key: "actions",
            header: "İşlem",
            align: "right",
            cell: v => (
                // A3: satır artık detay panelini açıyor → aksiyon butonları
                // tıklamayı satıra SIZDIRMAMALI (Düzenle'ye basınca panel de açılırdı).
                <div
                    style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}
                    onClick={e => e.stopPropagation()}
                >
                    <Button
                        variant="secondary"
                        size="sm"
                        leftIcon={<Pencil size={14} />}
                        onClick={() => openEdit(v)}
                        disabled={isDemo}
                        title={isDemo ? DEMO_DISABLED_TOOLTIP : "Düzenle"}
                    >
                        Düzenle
                    </Button>
                    {v.is_active ? (
                        <Button
                            variant="dangerSoft"
                            size="sm"
                            leftIcon={<CircleOff size={14} />}
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
                            leftIcon={<RotateCcw size={14} />}
                            onClick={() => handleReactivate(v)}
                            disabled={isDemo || reactivatingId === v.id}
                            title={isDemo ? DEMO_DISABLED_TOOLTIP : "Aktifleştir"}
                        >
                            {reactivatingId === v.id ? "..." : "Aktifleştir"}
                        </Button>
                    )}
                </div>
            ),
        },
    ];

    return (
        <div style={{ maxWidth: "1100px", margin: "0 auto", opacity: isPending ? 0.7 : 1, transition: "opacity 0.12s" }}>
            <div style={{ marginBottom: "20px" }}>
                <PageHeader
                    title="Tedarikçiler"
                    subtitle={`${displayTotal} tedarikçi`}
                    actions={has("manage_vendors") ? (
                        <Button
                            size="cta"
                            leftIcon={<Plus size={15} />}
                            onClick={openCreate}
                            disabled={isDemo}
                            title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}
                        >
                            Yeni Tedarikçi
                        </Button>
                    ) : null}
                />
            </div>

            {/* Filters */}
            <div style={{ display: "flex", gap: "12px", marginBottom: "16px", alignItems: "center" }}>
                <input
                    type="text"
                    placeholder="İsim, kişi veya e-posta ara..."
                    value={searchText}
                    onChange={e => setSearchText(e.target.value)}
                    aria-label="Tedarikçi ara"
                    style={{ ...inputStyle, maxWidth: "320px" }}
                />
                <label style={{ fontSize: "12px", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                    <input
                        type="checkbox"
                        checked={showAll}
                        onChange={e => navigate({ showAll: e.target.checked, page: 1 })}
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
                    marginBottom: "16px",
                }}>
                    <span style={{ color: "var(--accent-text)", fontWeight: 500 }}>
                        {selectedIds.size} tedarikçi seçildi
                    </span>
                    <Button
                        variant="dangerSoft"
                        size="sm"
                        leftIcon={<CircleOff size={14} />}
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
            <Card>
                <DataTable
                    columns={columns}
                    rows={displayVendors}
                    rowKey={v => v.id}
                    // A3: satır detay panelini açar — tedarik ettiği ürünler,
                    // son fiyatlar ve satın alma özeti (veri vardı, yeri yoktu).
                    onRowClick={v => setSelectedVendor(v)}
                    rowAriaLabel={v => `${v.name} detayını gör`}
                    emptyMessage={search ? "Arama kriterine uyan tedarikçi bulunamadı." : "Henüz tedarikçi eklenmemiş."}
                    footer={displayTotal > 0 ? (
                        <Pagination
                            currentPage={page}
                            totalPages={totalPages}
                            totalItems={displayTotal}
                            pageSize={pageSize}
                            onPageChange={(p) => navigate({ page: p })}
                            itemLabel="tedarikçi"
                        />
                    ) : null}
                />
            </Card>

            {/* Toplu pasife alma onayı — ortak ConfirmModal. Elle yazılmış
                sürümde Escape ve focus tuzağı yoktu. */}
            {bulkDeactivateConfirm && (
                <ConfirmModal
                    title={`${selectedIds.size} tedarikçiyi pasife al`}
                    message="Seçili tedarikçileri pasife almak istediğinizden emin misiniz?"
                    confirmLabel={bulkDeactivating ? "İşleniyor…" : "Pasife Al"}
                    busy={bulkDeactivating}
                    onConfirm={handleBulkDeactivate}
                    onCancel={() => setBulkDeactivateConfirm(false)}
                />
            )}

            {/* Drawer — 2026-09-05: çerçeve `ui/Drawer`'a taşındı. Bu, sayfanın
                İÇİNE gömülü iki yerel çekmece lehçesinden biriydi (`drawerOverlayStyle`
                + `drawerPanelStyle`); Escape'i ve odak yönetimi yoktu. Erişilebilir
                ad artık GÖRÜNEN başlıktan geliyor (`labelledBy`) — uydurma
                `aria-label` yerine. `dismissible={!saving}`: kayıt sürerken
                Escape/backdrop formu kapatmasın. */}
            {drawerMode && (
                    <Drawer
                        onClose={closeDrawer}
                        labelledBy="vendor-form-title"
                        width="min(420px, 100vw)"
                        dismissible={!saving}
                        surfaceStyle={{ padding: "24px", gap: "16px" }}
                    >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <SectionHeader variant="dialog" id="vendor-form-title">
                                {drawerMode === "create" ? "Yeni Tedarikçi" : "Tedarikçi Düzenle"}
                            </SectionHeader>
                            <button
                                type="button"
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
                    </Drawer>
            )}

            <VendorDetailPanel vendor={selectedVendor} onClose={() => setSelectedVendor(null)} />
        </div>
    );
}
