"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
    AlertTriangle,
    ArchiveRestore,
    ArrowDown,
    ArrowUp,
    CheckCircle2,
    Pencil,
    Plus,
    RotateCcw,
    SlidersHorizontal,
} from "lucide-react";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { DEMO_BLOCK_TOAST, DEMO_DISABLED_TOOLTIP, useIsDemo } from "@/lib/demo-utils";
import { generateTechnicalFieldKey } from "@/lib/technical-templates";
import type { ProductFieldType, ProductTypeFieldRow, ProductTypeRow } from "@/lib/database.types";
import type { ProductTypeStatsRow } from "@/lib/supabase/product-types";

const FIELD_TYPE_LABELS: Record<ProductFieldType, string> = {
    text: "Metin",
    longtext: "Uzun metin",
    number: "Sayı",
    select: "Tek seçim",
    multiselect: "Çok seçim",
    date: "Tarih",
    boolean: "Evet/Hayır",
};

const FIELD_TYPES: ProductFieldType[] = ["text", "longtext", "number", "select", "multiselect", "date", "boolean"];

interface TemplateWithFields extends ProductTypeRow {
    fields: ProductTypeFieldRow[];
}

interface FieldDraft {
    id?: string;
    field_key: string;
    label_tr: string;
    label_en: string;
    field_type: ProductFieldType;
    unit: string;
    options: string;
    required: boolean;
}

const EMPTY_FIELD_DRAFT: FieldDraft = {
    field_key: "",
    label_tr: "",
    label_en: "",
    field_type: "text",
    unit: "",
    options: "",
    required: false,
};

const pageStyle: React.CSSProperties = {
    padding: "24px",
    maxWidth: "1180px",
    margin: "0 auto",
};

const cardStyle: React.CSSProperties = {
    background: "var(--bg-secondary)",
    border: "0.5px solid var(--border-tertiary)",
    borderRadius: "8px",
    padding: "16px",
};

const inputStyle: React.CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    fontSize: "13px",
    padding: "8px 10px",
    border: "0.5px solid var(--border-secondary)",
    borderRadius: "6px",
    background: "var(--bg-tertiary)",
    color: "var(--text-primary)",
};

const labelStyle: React.CSSProperties = {
    fontSize: "11px",
    color: "var(--text-tertiary)",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    marginBottom: "5px",
    display: "block",
};

const thStyle: React.CSSProperties = {
    textAlign: "left",
    padding: "9px 10px",
    fontSize: "11px",
    color: "var(--text-tertiary)",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    borderBottom: "0.5px solid var(--border-tertiary)",
    background: "var(--bg-tertiary)",
};

const tdStyle: React.CSSProperties = {
    padding: "10px",
    borderBottom: "0.5px solid var(--border-tertiary)",
    color: "var(--text-primary)",
    fontSize: "13px",
    verticalAlign: "top",
};

const modalBackdropStyle: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    zIndex: 220,
    background: "rgba(0,0,0,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "18px",
};

const modalStyle: React.CSSProperties = {
    width: "100%",
    maxWidth: "560px",
    background: "var(--bg-primary)",
    border: "0.5px solid var(--border-tertiary)",
    borderRadius: "8px",
    padding: "18px",
};

function parseFieldOptions(field: ProductTypeFieldRow | FieldDraft): string {
    return Array.isArray(field.options) ? field.options.join("\n") : "";
}

function buildFieldPayload(draft: FieldDraft, sortOrder?: number): Record<string, unknown> {
    const needsOptions = draft.field_type === "select" || draft.field_type === "multiselect";
    return {
        field_key: draft.field_key.trim(),
        label_tr: draft.label_tr.trim(),
        label_en: draft.label_en.trim() || null,
        field_type: draft.field_type,
        unit: draft.field_type === "number" && draft.unit.trim() ? draft.unit.trim() : null,
        options: needsOptions
            ? draft.options.split("\n").map(o => o.trim()).filter(Boolean)
            : null,
        required: draft.required,
        ...(typeof sortOrder === "number" ? { sort_order: sortOrder } : {}),
    };
}

function validateFieldDraft(draft: FieldDraft): string | null {
    if (!/^[a-z][a-z0-9_]*$/.test(draft.field_key.trim())) {
        return "Teknik anahtar küçük harf ile başlamalı; yalnız küçük harf, rakam ve alt çizgi kullanmalı.";
    }
    if (!draft.label_tr.trim()) return "Türkçe etiket zorunludur.";
    if ((draft.field_type === "select" || draft.field_type === "multiselect") && draft.options.split("\n").map(o => o.trim()).filter(Boolean).length === 0) {
        return "Seçim alanları için en az bir seçenek girin.";
    }
    return null;
}

function FieldStatus({ field }: { field: ProductTypeFieldRow }) {
    if (!field.is_active) {
        return <span style={{ color: "var(--text-tertiary)", border: "0.5px solid var(--border-secondary)", borderRadius: "999px", padding: "2px 7px", fontSize: "11px" }}>Pasif</span>;
    }
    if (field.required) {
        return <span style={{ color: "var(--warning-text)", background: "var(--warning-bg)", border: "0.5px solid var(--warning-border)", borderRadius: "999px", padding: "2px 7px", fontSize: "11px" }}>Zorunlu</span>;
    }
    return <span style={{ color: "var(--success-text)", background: "var(--success-bg)", border: "0.5px solid var(--success-border)", borderRadius: "999px", padding: "2px 7px", fontSize: "11px" }}>Aktif</span>;
}

function Metric({ label, value, sub }: { label: string; value: string | number; sub: string }) {
    return (
        <div style={{ border: "0.5px solid var(--border-tertiary)", borderRadius: "8px", padding: "12px", background: "var(--bg-primary)" }}>
            <div style={{ fontSize: "11px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
            <div style={{ fontSize: "22px", fontWeight: 750, color: "var(--text-primary)", lineHeight: 1.1, marginTop: "7px" }}>{value}</div>
            <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "5px" }}>{sub}</div>
        </div>
    );
}

export default function ProductTypeDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const { toast } = useToast();
    const isDemo = useIsDemo();

    const [template, setTemplate] = useState<TemplateWithFields | null>(null);
    const [stats, setStats] = useState<ProductTypeStatsRow | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [editName, setEditName] = useState("");
    const [editIcon, setEditIcon] = useState("");
    const [editDescription, setEditDescription] = useState("");
    const [savingHeader, setSavingHeader] = useState(false);

    const [fieldModal, setFieldModal] = useState<"new" | "edit" | null>(null);
    const [fieldDraft, setFieldDraft] = useState<FieldDraft>(EMPTY_FIELD_DRAFT);
    const [fieldError, setFieldError] = useState<string | null>(null);
    const [fieldSaving, setFieldSaving] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [templateRes, statsRes] = await Promise.all([
                fetch(`/api/product-types/${id}?withFields=1&includeInactive=1`),
                fetch("/api/product-types?withStats=1&includeInactive=1"),
            ]);
            if (templateRes.status === 404) {
                setError("Teknik şablon bulunamadı.");
                return;
            }
            if (!templateRes.ok) throw new Error("Teknik şablon yüklenemedi.");
            const data = await templateRes.json() as TemplateWithFields;
            setTemplate(data);
            setEditName(data.name);
            setEditIcon(data.icon ?? "");
            setEditDescription(data.description ?? "");
            if (statsRes.ok) {
                const rows = await statsRes.json() as ProductTypeStatsRow[];
                setStats(rows.find(row => row.id === id) ?? null);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Bilinmeyen hata");
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        void load();
    }, [load]);

    const activeFields = useMemo(
        () => (template?.fields ?? []).filter(field => field.is_active),
        [template?.fields],
    );
    const inactiveFields = useMemo(
        () => (template?.fields ?? []).filter(field => !field.is_active),
        [template?.fields],
    );

    async function saveHeader() {
        if (isDemo) {
            toast({ type: "info", message: DEMO_BLOCK_TOAST });
            return;
        }
        if (!editName.trim()) {
            toast({ type: "error", message: "Şablon adı zorunludur." });
            return;
        }
        setSavingHeader(true);
        try {
            const res = await fetch(`/api/product-types/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: editName.trim(),
                    icon: editIcon.trim() || null,
                    description: editDescription.trim() || null,
                }),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(body.error ?? "Şablon güncellenemedi.");
            toast({ type: "success", message: "Teknik şablon güncellendi." });
            await load();
        } catch (err) {
            toast({ type: "error", message: err instanceof Error ? err.message : "Bilinmeyen hata" });
        } finally {
            setSavingHeader(false);
        }
    }

    async function setTemplateActive(isActive: boolean) {
        if (!template) return;
        if (isDemo) {
            toast({ type: "info", message: DEMO_BLOCK_TOAST });
            return;
        }
        const ok = isActive
            ? window.confirm(`"${template.name}" teknik şablonu yeniden aktif olacak. Yeni ürünlerde seçilebilir hale gelsin mi?`)
            : window.confirm(`"${template.name}" teknik şablonu pasifleştirilecek. Mevcut ürünlerdeki teknik bilgiler korunur, yeni ürünlerde seçilemez. Onaylıyor musun?`);
        if (!ok) return;
        try {
            const res = isActive
                ? await fetch(`/api/product-types/${id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ is_active: true }),
                })
                : await fetch(`/api/product-types/${id}`, { method: "DELETE" });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(body.error ?? "Durum güncellenemedi.");
            toast({ type: "success", message: isActive ? "Şablon aktifleştirildi." : "Şablon pasifleştirildi." });
            await load();
        } catch (err) {
            toast({ type: "error", message: err instanceof Error ? err.message : "Bilinmeyen hata" });
        }
    }

    function openNewField() {
        if (isDemo) {
            toast({ type: "info", message: DEMO_BLOCK_TOAST });
            return;
        }
        setFieldDraft(EMPTY_FIELD_DRAFT);
        setFieldError(null);
        setFieldModal("new");
    }

    function openEditField(field: ProductTypeFieldRow) {
        if (isDemo) {
            toast({ type: "info", message: DEMO_BLOCK_TOAST });
            return;
        }
        setFieldDraft({
            id: field.id,
            field_key: field.field_key,
            label_tr: field.label_tr,
            label_en: field.label_en ?? "",
            field_type: field.field_type,
            unit: field.unit ?? "",
            options: parseFieldOptions(field),
            required: field.required,
        });
        setFieldError(null);
        setFieldModal("edit");
    }

    async function submitField() {
        if (!template || !fieldModal) return;
        const validation = validateFieldDraft(fieldDraft);
        if (validation) {
            setFieldError(validation);
            return;
        }
        setFieldSaving(true);
        setFieldError(null);
        try {
            const endpoint = fieldModal === "new"
                ? `/api/product-types/${id}/fields`
                : `/api/product-types/${id}/fields/${fieldDraft.id}`;
            const res = await fetch(endpoint, {
                method: fieldModal === "new" ? "POST" : "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(buildFieldPayload(fieldDraft, fieldModal === "new" ? activeFields.length * 10 + 10 : undefined)),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(body.error ?? "Alan kaydedilemedi.");
            toast({ type: "success", message: fieldModal === "new" ? "Teknik alan eklendi." : "Teknik alan güncellendi." });
            setFieldModal(null);
            await load();
        } catch (err) {
            setFieldError(err instanceof Error ? err.message : "Bilinmeyen hata");
        } finally {
            setFieldSaving(false);
        }
    }

    async function setFieldActive(field: ProductTypeFieldRow, isActive: boolean) {
        if (isDemo) {
            toast({ type: "info", message: DEMO_BLOCK_TOAST });
            return;
        }
        const ok = isActive
            ? window.confirm(`"${field.label_tr}" alanı yeniden aktif olacak. Onaylıyor musun?`)
            : window.confirm(`"${field.label_tr}" alanı pasifleştirilecek. Mevcut ürün değerleri korunur ama yeni/aktif düzenlemelerde kullanılmaz. Onaylıyor musun?`);
        if (!ok) return;
        try {
            const res = isActive
                ? await fetch(`/api/product-types/${id}/fields/${field.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ is_active: true }),
                })
                : await fetch(`/api/product-types/${id}/fields/${field.id}`, { method: "DELETE" });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(body.error ?? "Alan durumu güncellenemedi.");
            toast({ type: "success", message: isActive ? "Alan aktifleştirildi." : "Alan pasifleştirildi." });
            await load();
        } catch (err) {
            toast({ type: "error", message: err instanceof Error ? err.message : "Bilinmeyen hata" });
        }
    }

    async function toggleRequired(field: ProductTypeFieldRow) {
        if (isDemo) {
            toast({ type: "info", message: DEMO_BLOCK_TOAST });
            return;
        }
        try {
            const res = await fetch(`/api/product-types/${id}/fields/${field.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ required: !field.required }),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(body.error ?? "Zorunluluk güncellenemedi.");
            await load();
        } catch (err) {
            toast({ type: "error", message: err instanceof Error ? err.message : "Bilinmeyen hata" });
        }
    }

    async function moveField(fieldId: string, direction: "up" | "down") {
        if (!template) return;
        if (isDemo) {
            toast({ type: "info", message: DEMO_BLOCK_TOAST });
            return;
        }
        const index = activeFields.findIndex(field => field.id === fieldId);
        const nextIndex = direction === "up" ? index - 1 : index + 1;
        if (index < 0 || nextIndex < 0 || nextIndex >= activeFields.length) return;
        const reordered = [...activeFields];
        [reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]];
        try {
            const res = await fetch(`/api/product-types/${id}/fields`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ids: reordered.map(field => field.id) }),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(body.error ?? "Sıralama güncellenemedi.");
            await load();
        } catch (err) {
            toast({ type: "error", message: err instanceof Error ? err.message : "Bilinmeyen hata" });
        }
    }

    if (loading) {
        return <div style={pageStyle}><div style={{ color: "var(--text-secondary)" }}>Yükleniyor…</div></div>;
    }

    if (error || !template) {
        return (
            <div style={pageStyle}>
                <Link href="/dashboard/settings/product-types" style={{ color: "var(--text-tertiary)", textDecoration: "none", fontSize: "13px" }}>← Teknik Şablonlar</Link>
                <div role="alert" style={{ marginTop: "16px", color: "var(--danger-text)" }}>{error ?? "Teknik şablon bulunamadı."}</div>
            </div>
        );
    }

    const hasMissingRequired = (stats?.missing_required_product_count ?? 0) > 0;

    return (
        <div style={pageStyle}>
            <Link href="/dashboard/settings/product-types" style={{ color: "var(--text-tertiary)", textDecoration: "none", fontSize: "13px" }}>← Teknik Şablonlar</Link>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", marginTop: "12px", marginBottom: "18px" }}>
                <div>
                    <h1 style={{ fontSize: "24px", fontWeight: 760, color: "var(--text-primary)", margin: "0 0 6px" }}>
                        {template.icon || <SlidersHorizontal size={22} />} {template.name}
                    </h1>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", fontSize: "12px", color: "var(--text-secondary)" }}>
                        {template.is_active ? (
                            <span style={{ color: "var(--success-text)", display: "inline-flex", alignItems: "center", gap: "4px" }}><CheckCircle2 size={13} /> Aktif</span>
                        ) : (
                            <span style={{ color: "var(--text-tertiary)" }}>Pasif</span>
                        )}
                        {template.is_system && <span>Sistem şablonu</span>}
                        <span>{activeFields.length} aktif alan</span>
                    </div>
                </div>
                <Button
                    variant={template.is_active ? "danger" : "secondary"}
                    onClick={() => void setTemplateActive(!template.is_active)}
                    disabled={isDemo}
                    title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}
                >
                    {template.is_active ? <ArchiveRestore size={14} /> : <RotateCcw size={14} />}
                    {template.is_active ? "Pasifleştir" : "Aktifleştir"}
                </Button>
            </div>

            {hasMissingRequired && (
                <div role="alert" style={{ marginBottom: "14px", padding: "10px 12px", border: "0.5px solid var(--warning-border)", background: "var(--warning-bg)", color: "var(--warning-text)", borderRadius: "8px", display: "flex", alignItems: "center", gap: "8px", fontSize: "12px" }}>
                    <AlertTriangle size={15} />
                    {stats?.missing_required_product_count} üründe zorunlu teknik bilgi eksik. Zorunlu alan eklemeden önce etkilenen ürünleri gözden geçirin.
                </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.35fr) minmax(300px, 0.65fr)", gap: "14px", alignItems: "start" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                    <div style={cardStyle}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
                            <h2 style={{ fontSize: "15px", fontWeight: 700, margin: 0 }}>Şablon Bilgileri</h2>
                            <Button onClick={saveHeader} loading={savingHeader} disabled={isDemo} title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}>Kaydet</Button>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 84px", gap: "10px" }}>
                            <label>
                                <span style={labelStyle}>Şablon Adı</span>
                                <input aria-label="Şablon adı" value={editName} onChange={event => setEditName(event.target.value)} style={inputStyle} />
                            </label>
                            <label>
                                <span style={labelStyle}>Simge</span>
                                <input aria-label="Simge" value={editIcon} onChange={event => setEditIcon(event.target.value)} style={inputStyle} maxLength={4} />
                            </label>
                        </div>
                        <label style={{ display: "block", marginTop: "10px" }}>
                            <span style={labelStyle}>Açıklama</span>
                            <textarea aria-label="Açıklama" value={editDescription} onChange={event => setEditDescription(event.target.value)} style={{ ...inputStyle, minHeight: "72px", resize: "vertical" }} />
                        </label>
                    </div>

                    <div style={cardStyle}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
                            <div>
                                <h2 style={{ fontSize: "15px", fontWeight: 700, margin: "0 0 3px" }}>Teknik Alanlar</h2>
                                <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                                    Teknik anahtarlar ürün bilgilerindeki attribute kayıtlarıyla birebir eşleşir.
                                </div>
                            </div>
                            <Button onClick={openNewField} disabled={isDemo} title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}>
                                <Plus size={14} /> Alan Ekle
                            </Button>
                        </div>

                        <div style={{ border: "0.5px solid var(--border-tertiary)", borderRadius: "8px", overflow: "hidden", background: "var(--bg-primary)" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                <thead>
                                    <tr>
                                        <th style={thStyle}>Alan</th>
                                        <th style={thStyle}>Teknik Anahtar</th>
                                        <th style={thStyle}>Tip</th>
                                        <th style={thStyle}>Durum</th>
                                        <th style={{ ...thStyle, textAlign: "right" }}>İşlem</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {template.fields.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} style={{ ...tdStyle, color: "var(--text-tertiary)" }}>Henüz teknik alan yok.</td>
                                        </tr>
                                    ) : template.fields.map(field => {
                                        const activeIndex = activeFields.findIndex(item => item.id === field.id);
                                        return (
                                            <tr key={field.id} style={{ opacity: field.is_active ? 1 : 0.55 }}>
                                                <td style={tdStyle}>
                                                    <div style={{ fontWeight: 650 }}>{field.label_tr}</div>
                                                    {field.label_en && <div style={{ color: "var(--text-tertiary)", fontSize: "12px", marginTop: "2px" }}>{field.label_en}</div>}
                                                    {field.help_text && <div style={{ color: "var(--text-tertiary)", fontSize: "11px", marginTop: "3px" }}>{field.help_text}</div>}
                                                </td>
                                                <td style={{ ...tdStyle, fontFamily: "monospace", color: "var(--text-secondary)" }}>{field.field_key}</td>
                                                <td style={tdStyle}>
                                                    {FIELD_TYPE_LABELS[field.field_type]}
                                                    {field.unit && <span style={{ color: "var(--text-tertiary)" }}> · {field.unit}</span>}
                                                    {(field.field_type === "select" || field.field_type === "multiselect") && field.options && (
                                                        <div style={{ color: "var(--text-tertiary)", fontSize: "11px", marginTop: "2px" }}>
                                                            {(field.options as string[]).slice(0, 3).join(", ")}
                                                            {(field.options as string[]).length > 3 ? ` (+${(field.options as string[]).length - 3})` : ""}
                                                        </div>
                                                    )}
                                                </td>
                                                <td style={tdStyle}><FieldStatus field={field} /></td>
                                                <td style={{ ...tdStyle, textAlign: "right" }}>
                                                    <div style={{ display: "inline-flex", gap: "5px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                                                        <button type="button" onClick={() => void moveField(field.id, "up")} disabled={!field.is_active || activeIndex <= 0 || isDemo} aria-label={`${field.label_tr} yukarı taşı`} style={iconButtonStyle}>
                                                            <ArrowUp size={13} />
                                                        </button>
                                                        <button type="button" onClick={() => void moveField(field.id, "down")} disabled={!field.is_active || activeIndex < 0 || activeIndex >= activeFields.length - 1 || isDemo} aria-label={`${field.label_tr} aşağı taşı`} style={iconButtonStyle}>
                                                            <ArrowDown size={13} />
                                                        </button>
                                                        <button type="button" onClick={() => openEditField(field)} disabled={isDemo} aria-label={`${field.label_tr} düzenle`} style={iconButtonStyle}>
                                                            <Pencil size={13} />
                                                        </button>
                                                        {field.is_active && (
                                                            <button type="button" onClick={() => void toggleRequired(field)} disabled={isDemo} style={smallButtonStyle}>
                                                                {field.required ? "Opsiyonel" : "Zorunlu"}
                                                            </button>
                                                        )}
                                                        <button
                                                            type="button"
                                                            onClick={() => void setFieldActive(field, !field.is_active)}
                                                            disabled={isDemo}
                                                            style={field.is_active ? dangerTextButtonStyle : smallButtonStyle}
                                                        >
                                                            {field.is_active ? "Pasifleştir" : "Aktifleştir"}
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <aside style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                    <div style={cardStyle}>
                        <h2 style={{ fontSize: "15px", fontWeight: 700, margin: "0 0 12px" }}>Kullanım Özeti</h2>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                            <Metric label="Ürün" value={stats?.product_count ?? "—"} sub="Bu şablona bağlı" />
                            <Metric label="Alan" value={stats?.field_count ?? activeFields.length} sub="Aktif teknik alan" />
                            <Metric label="Zorunlu" value={stats?.required_field_count ?? activeFields.filter(f => f.required).length} sub="Doldurulması beklenir" />
                            <Metric label="Eksik" value={stats?.missing_required_product_count ?? "—"} sub="Üründe boş kalmış" />
                        </div>
                        <Link href="/dashboard/products" style={{ display: "inline-flex", marginTop: "12px", color: "var(--accent-text)", textDecoration: "none", fontSize: "12px", fontWeight: 650 }}>
                            Ürünleri gör →
                        </Link>
                    </div>

                    <div style={cardStyle}>
                        <h2 style={{ fontSize: "15px", fontWeight: 700, margin: "0 0 10px" }}>Ürün Formu Önizlemesi</h2>
                        {activeFields.length === 0 ? (
                            <div style={{ color: "var(--text-tertiary)", fontSize: "12px" }}>Aktif alan ekleyince ürün detayında burada tanımlanan teknik bilgiler görünür.</div>
                        ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                {activeFields.slice(0, 8).map(field => (
                                    <div key={field.id} style={{ borderBottom: "0.5px solid var(--border-tertiary)", paddingBottom: "7px" }}>
                                        <div style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
                                            <span style={{ color: "var(--text-primary)", fontSize: "12px", fontWeight: 650 }}>{field.label_tr}{field.required ? " *" : ""}</span>
                                            <span style={{ color: "var(--text-tertiary)", fontSize: "11px" }}>{FIELD_TYPE_LABELS[field.field_type]}</span>
                                        </div>
                                        <div style={{ color: "var(--text-tertiary)", fontSize: "11px", fontFamily: "monospace", marginTop: "2px" }}>{field.field_key}</div>
                                    </div>
                                ))}
                                {activeFields.length > 8 && <div style={{ color: "var(--text-tertiary)", fontSize: "12px" }}>+{activeFields.length - 8} alan daha</div>}
                            </div>
                        )}
                    </div>

                    {inactiveFields.length > 0 && (
                        <div style={cardStyle}>
                            <h2 style={{ fontSize: "15px", fontWeight: 700, margin: "0 0 10px" }}>Pasif Alanlar</h2>
                            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                {inactiveFields.map(field => (
                                    <div key={field.id} style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "center", fontSize: "12px" }}>
                                        <span style={{ color: "var(--text-secondary)" }}>{field.label_tr}</span>
                                        <button type="button" onClick={() => void setFieldActive(field, true)} disabled={isDemo} style={smallButtonStyle}>Aktifleştir</button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </aside>
            </div>

            {fieldModal && (
                <div style={modalBackdropStyle} role="dialog" aria-modal="true" aria-label={fieldModal === "new" ? "Teknik alan ekle" : "Teknik alan düzenle"}>
                    <div style={modalStyle}>
                        <h2 style={{ fontSize: "16px", fontWeight: 720, margin: "0 0 14px" }}>
                            {fieldModal === "new" ? "Yeni Teknik Alan" : "Teknik Alanı Düzenle"}
                        </h2>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                            <label>
                                <span style={labelStyle}>Türkçe Etiket</span>
                                <input
                                    aria-label="Türkçe etiket"
                                    value={fieldDraft.label_tr}
                                    onChange={event => {
                                        const nextLabel = event.target.value;
                                        setFieldDraft(prev => ({
                                            ...prev,
                                            label_tr: nextLabel,
                                            field_key: fieldModal === "new" && !prev.field_key ? generateTechnicalFieldKey(nextLabel) : prev.field_key,
                                        }));
                                    }}
                                    style={inputStyle}
                                />
                            </label>
                            <label>
                                <span style={labelStyle}>İngilizce Etiket</span>
                                <input aria-label="İngilizce etiket" value={fieldDraft.label_en} onChange={event => setFieldDraft(prev => ({ ...prev, label_en: event.target.value }))} style={inputStyle} />
                            </label>
                        </div>
                        <label style={{ display: "block", marginTop: "10px" }}>
                            <span style={labelStyle}>Teknik Anahtar</span>
                            <input
                                aria-label="Teknik anahtar"
                                value={fieldDraft.field_key}
                                onChange={event => setFieldDraft(prev => ({ ...prev, field_key: generateTechnicalFieldKey(event.target.value) }))}
                                style={{ ...inputStyle, fontFamily: "monospace" }}
                                placeholder="ornek_alan_anahtari"
                            />
                        </label>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginTop: "10px" }}>
                            <label>
                                <span style={labelStyle}>Alan Tipi</span>
                                <select aria-label="Alan tipi" value={fieldDraft.field_type} onChange={event => setFieldDraft(prev => ({ ...prev, field_type: event.target.value as ProductFieldType }))} style={inputStyle}>
                                    {FIELD_TYPES.map(type => <option key={type} value={type}>{FIELD_TYPE_LABELS[type]}</option>)}
                                </select>
                            </label>
                            <label>
                                <span style={labelStyle}>Birim</span>
                                <input aria-label="Birim" value={fieldDraft.unit} onChange={event => setFieldDraft(prev => ({ ...prev, unit: event.target.value }))} disabled={fieldDraft.field_type !== "number"} style={inputStyle} placeholder="mm, bar, kg" />
                            </label>
                        </div>
                        {(fieldDraft.field_type === "select" || fieldDraft.field_type === "multiselect") && (
                            <label style={{ display: "block", marginTop: "10px" }}>
                                <span style={labelStyle}>Seçenekler</span>
                                <textarea aria-label="Seçenekler" value={fieldDraft.options} onChange={event => setFieldDraft(prev => ({ ...prev, options: event.target.value }))} style={{ ...inputStyle, minHeight: "96px", resize: "vertical", fontFamily: "monospace" }} placeholder={"Seçenek 1\nSeçenek 2"} />
                            </label>
                        )}
                        <label style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "12px", fontSize: "13px", color: "var(--text-secondary)" }}>
                            <input aria-label="Zorunlu alan" type="checkbox" checked={fieldDraft.required} onChange={event => setFieldDraft(prev => ({ ...prev, required: event.target.checked }))} />
                            Bu alan ürünlerde zorunlu olsun
                        </label>
                        {fieldError && <div role="alert" style={{ marginTop: "10px", color: "var(--danger-text)", fontSize: "12px" }}>{fieldError}</div>}
                        {fieldModal === "edit" && (
                            <div style={{ marginTop: "10px", padding: "8px 10px", borderRadius: "6px", background: "var(--warning-bg)", color: "var(--warning-text)", border: "0.5px solid var(--warning-border)", fontSize: "12px" }}>
                                Teknik anahtar değişirse mevcut ürün attribute kayıtları güvenli şekilde yeni anahtara taşınır. Çakışma varsa işlem durur.
                            </div>
                        )}
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "16px" }}>
                            <Button variant="secondary" onClick={() => setFieldModal(null)} disabled={fieldSaving}>İptal</Button>
                            <Button onClick={() => void submitField()} loading={fieldSaving}>{fieldModal === "new" ? "Ekle" : "Kaydet"}</Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

const iconButtonStyle: React.CSSProperties = {
    width: "28px",
    height: "28px",
    border: "0.5px solid var(--border-secondary)",
    borderRadius: "6px",
    background: "transparent",
    color: "var(--text-secondary)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
};

const smallButtonStyle: React.CSSProperties = {
    fontSize: "11px",
    padding: "5px 8px",
    border: "0.5px solid var(--border-secondary)",
    borderRadius: "6px",
    background: "transparent",
    color: "var(--text-secondary)",
    cursor: "pointer",
};

const dangerTextButtonStyle: React.CSSProperties = {
    ...smallButtonStyle,
    color: "var(--danger-text)",
    borderColor: "var(--danger-border)",
};
