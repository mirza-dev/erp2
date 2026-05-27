"use client";

import { useEffect, useState, useCallback, use } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useIsDemo, DEMO_DISABLED_TOOLTIP, DEMO_BLOCK_TOAST } from "@/lib/demo-utils";
import type { ProductFieldType, ProductTypeRow, ProductTypeFieldRow } from "@/lib/database.types";

const FIELD_TYPE_LABELS: Record<ProductFieldType, string> = {
    text: "Metin (kısa)",
    longtext: "Metin (uzun)",
    number: "Sayı",
    select: "Tek seçim",
    multiselect: "Çok seçim",
    date: "Tarih",
    boolean: "Evet/Hayır",
};

interface TypeWithFields extends ProductTypeRow {
    fields: ProductTypeFieldRow[];
}

const containerStyle: React.CSSProperties = {
    padding: "24px",
    maxWidth: "1100px",
    margin: "0 auto",
};

const breadcrumbStyle: React.CSSProperties = {
    fontSize: "13px",
    color: "var(--text-secondary)",
    marginBottom: "12px",
};

const headerStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "16px",
};

const sectionStyle: React.CSSProperties = {
    background: "var(--bg-secondary)",
    border: "0.5px solid var(--border-tertiary)",
    borderRadius: "8px",
    padding: "16px",
    marginBottom: "16px",
};

const tableStyle: React.CSSProperties = {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "13px",
};

const thStyle: React.CSSProperties = {
    textAlign: "left",
    padding: "8px 12px",
    background: "var(--bg-tertiary)",
    color: "var(--text-secondary)",
    fontSize: "12px",
    fontWeight: 600,
    borderBottom: "0.5px solid var(--border-tertiary)",
};

const tdStyle: React.CSSProperties = {
    padding: "8px 12px",
    borderBottom: "0.5px solid var(--border-tertiary)",
    color: "var(--text-primary)",
};

const inputStyle: React.CSSProperties = {
    width: "100%",
    fontSize: "13px",
    padding: "7px 10px",
    border: "0.5px solid var(--border-secondary)",
    borderRadius: "6px",
    background: "var(--bg-tertiary)",
    color: "var(--text-primary)",
    boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
    fontSize: "12px",
    color: "var(--text-secondary)",
    marginBottom: "4px",
    display: "block",
};

const errStyle: React.CSSProperties = {
    color: "var(--danger)",
    fontSize: "12px",
    marginTop: "8px",
};

const systemBadgeStyle: React.CSSProperties = {
    display: "inline-block",
    fontSize: "10px",
    padding: "2px 6px",
    background: "var(--accent-bg)",
    color: "var(--accent-text)",
    borderRadius: "4px",
    marginLeft: "8px",
    verticalAlign: "middle",
};

const requiredBadgeStyle: React.CSSProperties = {
    display: "inline-block",
    fontSize: "10px",
    padding: "2px 6px",
    background: "var(--danger-bg)",
    color: "var(--danger-text)",
    borderRadius: "4px",
    marginLeft: "8px",
};

const FIELD_TYPES: ProductFieldType[] = [
    "text", "longtext", "number", "select", "multiselect", "date", "boolean",
];

interface NewFieldDraft {
    field_key: string;
    label_tr: string;
    label_en: string;
    field_type: ProductFieldType;
    unit: string;
    options: string; // textarea: line-per-option
    required: boolean;
}

const EMPTY_DRAFT: NewFieldDraft = {
    field_key: "",
    label_tr: "",
    label_en: "",
    field_type: "text",
    unit: "",
    options: "",
    required: false,
};

export default function ProductTypeDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const { toast } = useToast();
    const isDemo = useIsDemo();

    const [type, setType] = useState<TypeWithFields | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Edit type header
    const [editName, setEditName] = useState("");
    const [editIcon, setEditIcon] = useState("");
    const [editDescription, setEditDescription] = useState("");
    const [savingHeader, setSavingHeader] = useState(false);

    // Add field form
    const [draft, setDraft] = useState<NewFieldDraft>(EMPTY_DRAFT);
    const [adding, setAdding] = useState(false);
    const [addError, setAddError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/product-types/${id}?withFields=1`);
            if (res.status === 404) {
                setError("Tip bulunamadı.");
                return;
            }
            if (!res.ok) throw new Error("Tip yüklenemedi");
            const data = (await res.json()) as TypeWithFields;
            setType(data);
            setEditName(data.name);
            setEditIcon(data.icon ?? "");
            setEditDescription(data.description ?? "");
        } catch (e) {
            setError(e instanceof Error ? e.message : "Bilinmeyen hata");
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        load();
    }, [load]);

    const saveHeader = async () => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        if (!editName.trim()) {
            toast({ type: "error", message: "Tip adı zorunludur." });
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
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error ?? "Güncellenemedi");
            }
            toast({ type: "success", message: "Tip güncellendi." });
            load();
        } catch (e) {
            toast({ type: "error", message: e instanceof Error ? e.message : "Bilinmeyen hata" });
        } finally {
            setSavingHeader(false);
        }
    };

    const submitField = async () => {
        setAddError(null);
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }

        if (!/^[a-z][a-z0-9_]*$/.test(draft.field_key)) {
            setAddError("Alan anahtarı küçük harf, rakam, alt çizgi içermeli ve harf ile başlamalı.");
            return;
        }
        if (!draft.label_tr.trim()) {
            setAddError("Türkçe etiket zorunludur.");
            return;
        }

        let optionsArr: string[] | null = null;
        if (draft.field_type === "select" || draft.field_type === "multiselect") {
            optionsArr = draft.options
                .split("\n")
                .map((o) => o.trim())
                .filter((o) => o.length > 0);
            if (optionsArr.length === 0) {
                setAddError("Seçim alanları için en az bir seçenek girin.");
                return;
            }
        }

        setAdding(true);
        try {
            const res = await fetch(`/api/product-types/${id}/fields`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    field_key: draft.field_key,
                    label_tr: draft.label_tr.trim(),
                    label_en: draft.label_en.trim() || null,
                    field_type: draft.field_type,
                    unit: draft.unit.trim() || null,
                    options: optionsArr,
                    required: draft.required,
                    sort_order: (type?.fields.length ?? 0) * 10 + 10,
                }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error ?? "Alan eklenemedi");
            }
            toast({ type: "success", message: "Alan eklendi." });
            setDraft(EMPTY_DRAFT);
            load();
        } catch (e) {
            setAddError(e instanceof Error ? e.message : "Bilinmeyen hata");
        } finally {
            setAdding(false);
        }
    };

    const deleteField = async (fieldId: string) => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        if (!confirm("Bu alanı silmek istediğinden emin misin? Bu tipte oluşturulmuş ürünlerin bu alanı kaybolur.")) return;
        try {
            const res = await fetch(`/api/product-types/${id}/fields/${fieldId}`, { method: "DELETE" });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error ?? "Silinemedi");
            }
            toast({ type: "success", message: "Alan silindi." });
            load();
        } catch (e) {
            toast({ type: "error", message: e instanceof Error ? e.message : "Bilinmeyen hata" });
        }
    };

    const moveField = async (fieldId: string, direction: "up" | "down") => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        if (!type) return;
        const idx = type.fields.findIndex((f) => f.id === fieldId);
        if (idx < 0) return;
        const newIdx = direction === "up" ? idx - 1 : idx + 1;
        if (newIdx < 0 || newIdx >= type.fields.length) return;

        const reordered = [...type.fields];
        const tmp = reordered[idx];
        reordered[idx] = reordered[newIdx];
        reordered[newIdx] = tmp;

        try {
            const res = await fetch(`/api/product-types/${id}/fields`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ids: reordered.map((f) => f.id) }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error ?? "Sıralama güncellenemedi");
            }
            load();
        } catch (e) {
            toast({ type: "error", message: e instanceof Error ? e.message : "Bilinmeyen hata" });
        }
    };

    const toggleRequired = async (field: ProductTypeFieldRow) => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        try {
            const res = await fetch(`/api/product-types/${id}/fields/${field.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ required: !field.required }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error ?? "Güncellenemedi");
            }
            load();
        } catch (e) {
            toast({ type: "error", message: e instanceof Error ? e.message : "Bilinmeyen hata" });
        }
    };

    const deleteType = async () => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        if (!type) return;
        if (!confirm(`"${type.name}" tipini silmek istediğine emin misin?`)) return;
        try {
            const res = await fetch(`/api/product-types/${id}`, { method: "DELETE" });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error ?? "Silinemedi");
            }
            toast({ type: "success", message: "Tip silindi." });
            window.location.href = "/dashboard/settings/product-types";
        } catch (e) {
            toast({ type: "error", message: e instanceof Error ? e.message : "Bilinmeyen hata" });
        }
    };

    if (loading) {
        return (
            <div style={containerStyle}>
                <div style={{ color: "var(--text-secondary)" }}>Yükleniyor...</div>
            </div>
        );
    }

    if (error || !type) {
        return (
            <div style={containerStyle}>
                <div style={breadcrumbStyle}>
                    <Link href="/dashboard/settings/product-types" style={{ color: "var(--text-tertiary)" }}>← Ürün Tipleri</Link>
                </div>
                <div style={errStyle} role="alert">{error ?? "Tip bulunamadı."}</div>
            </div>
        );
    }

    return (
        <div style={containerStyle}>
            <div style={breadcrumbStyle}>
                <Link href="/dashboard/settings/product-types" style={{ color: "var(--text-tertiary)", textDecoration: "none" }}>
                    ← Ürün Tipleri
                </Link>
            </div>

            <div style={headerStyle}>
                <h1 style={{ fontSize: "22px", fontWeight: 700 }}>
                    {type.icon ?? "📦"} {type.name}
                    {type.is_system && <span style={systemBadgeStyle}>SİSTEM</span>}
                </h1>
                <Button
                    variant="ghost"
                    onClick={deleteType}
                    disabled={isDemo || type.is_system}
                    title={type.is_system ? "Sistem tipini silmek için önce 'is_system' kilidini düşürmek üzere düzenleyin" : (isDemo ? DEMO_DISABLED_TOOLTIP : undefined)}
                    style={{ color: type.is_system ? "var(--text-tertiary)" : "var(--danger)" }}
                >
                    Tipi Sil
                </Button>
            </div>

            {/* Tip başlığı düzenleme */}
            <div style={sectionStyle}>
                <h2 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "12px" }}>Tip Bilgileri</h2>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 80px", gap: "12px" }}>
                    <div>
                        <label style={labelStyle}>Tip Adı *</label>
                        <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            style={inputStyle}
                            aria-label="Tip adı"
                        />
                    </div>
                    <div>
                        <label style={labelStyle}>Icon</label>
                        <input
                            type="text"
                            value={editIcon}
                            onChange={(e) => setEditIcon(e.target.value)}
                            style={inputStyle}
                            aria-label="Icon"
                            maxLength={4}
                        />
                    </div>
                </div>
                <div style={{ marginTop: "12px" }}>
                    <label style={labelStyle}>Açıklama</label>
                    <textarea
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        style={{ ...inputStyle, minHeight: "50px", resize: "vertical" as const }}
                        aria-label="Açıklama"
                    />
                </div>
                <div style={{ marginTop: "12px", textAlign: "right" }}>
                    <Button
                        onClick={saveHeader}
                        disabled={isDemo || savingHeader}
                        title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}
                    >
                        {savingHeader ? "Kaydediliyor..." : "Kaydet"}
                    </Button>
                </div>
                {type.is_system && (
                    <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "8px" }}>
                        Not: Sistem tipleri değiştirilince &quot;is_system&quot; kilidi düşer ve kullanıcı tipi sayılır.
                    </div>
                )}
            </div>

            {/* Alanlar tablosu */}
            <div style={sectionStyle}>
                <h2 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "12px" }}>
                    Teknik Alanlar ({type.fields.length})
                </h2>

                {type.fields.length === 0 ? (
                    <div style={{ color: "var(--text-tertiary)", padding: "16px 0" }}>
                        Henüz alan yok. Aşağıdaki form ile ekle.
                    </div>
                ) : (
                    <table style={tableStyle}>
                        <thead>
                            <tr>
                                <th style={thStyle}>#</th>
                                <th style={thStyle}>Anahtar</th>
                                <th style={thStyle}>Etiket (TR/EN)</th>
                                <th style={thStyle}>Tip</th>
                                <th style={thStyle}>Birim</th>
                                <th style={thStyle}>Zorunlu</th>
                                <th style={thStyle}>İşlem</th>
                            </tr>
                        </thead>
                        <tbody>
                            {type.fields.map((f, idx) => (
                                <tr key={f.id}>
                                    <td style={tdStyle}>{idx + 1}</td>
                                    <td style={{ ...tdStyle, fontFamily: "monospace", color: "var(--text-secondary)" }}>
                                        {f.field_key}
                                    </td>
                                    <td style={tdStyle}>
                                        <div>{f.label_tr}</div>
                                        {f.label_en && <div style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>{f.label_en}</div>}
                                    </td>
                                    <td style={tdStyle}>
                                        {FIELD_TYPE_LABELS[f.field_type]}
                                        {(f.field_type === "select" || f.field_type === "multiselect") && f.options && (
                                            <div style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>
                                                {(f.options as string[]).slice(0, 3).join(", ")}
                                                {(f.options as string[]).length > 3 && ` (+${(f.options as string[]).length - 3})`}
                                            </div>
                                        )}
                                    </td>
                                    <td style={tdStyle}>{f.unit ?? "—"}</td>
                                    <td style={tdStyle}>
                                        <button
                                            type="button"
                                            onClick={() => toggleRequired(f)}
                                            disabled={isDemo}
                                            title={isDemo ? DEMO_DISABLED_TOOLTIP : "Zorunluluğu değiştir"}
                                            style={{ background: "transparent", border: "none", cursor: isDemo ? "not-allowed" : "pointer", padding: 0 }}
                                            aria-label={f.required ? `${f.label_tr} alanını opsiyonel yap` : `${f.label_tr} alanını zorunlu yap`}
                                        >
                                            {f.required ? (
                                                <span style={requiredBadgeStyle}>ZORUNLU</span>
                                            ) : (
                                                <span style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>—</span>
                                            )}
                                        </button>
                                    </td>
                                    <td style={tdStyle}>
                                        <div style={{ display: "flex", gap: "4px" }}>
                                            <button
                                                type="button"
                                                onClick={() => moveField(f.id, "up")}
                                                disabled={isDemo || idx === 0}
                                                aria-label="Yukarı taşı"
                                                style={{ background: "transparent", border: "0.5px solid var(--border-secondary)", padding: "2px 6px", borderRadius: "4px", cursor: idx === 0 ? "not-allowed" : "pointer", color: idx === 0 ? "var(--text-tertiary)" : "var(--text-primary)" }}
                                            >
                                                ↑
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => moveField(f.id, "down")}
                                                disabled={isDemo || idx === type.fields.length - 1}
                                                aria-label="Aşağı taşı"
                                                style={{ background: "transparent", border: "0.5px solid var(--border-secondary)", padding: "2px 6px", borderRadius: "4px", cursor: idx === type.fields.length - 1 ? "not-allowed" : "pointer", color: idx === type.fields.length - 1 ? "var(--text-tertiary)" : "var(--text-primary)" }}
                                            >
                                                ↓
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => deleteField(f.id)}
                                                disabled={isDemo}
                                                aria-label={`${f.label_tr} alanını sil`}
                                                style={{ background: "transparent", border: "0.5px solid var(--danger-border)", padding: "2px 6px", borderRadius: "4px", cursor: "pointer", color: "var(--danger)" }}
                                            >
                                                Sil
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Alan ekle formu */}
            <div style={sectionStyle}>
                <h2 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "12px" }}>Yeni Alan Ekle</h2>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
                    <div>
                        <label style={labelStyle}>Alan Anahtarı * <span style={{ color: "var(--text-tertiary)" }}>(snake_case)</span></label>
                        <input
                            type="text"
                            value={draft.field_key}
                            onChange={(e) => setDraft({ ...draft, field_key: e.target.value.toLowerCase() })}
                            placeholder="ornegin_alan_adi"
                            style={inputStyle}
                            aria-label="Alan anahtarı"
                            maxLength={50}
                        />
                    </div>
                    <div>
                        <label style={labelStyle}>Etiket (TR) *</label>
                        <input
                            type="text"
                            value={draft.label_tr}
                            onChange={(e) => setDraft({ ...draft, label_tr: e.target.value })}
                            placeholder="Örnek Alan"
                            style={inputStyle}
                            aria-label="Türkçe etiket"
                        />
                    </div>
                    <div>
                        <label style={labelStyle}>Etiket (EN)</label>
                        <input
                            type="text"
                            value={draft.label_en}
                            onChange={(e) => setDraft({ ...draft, label_en: e.target.value })}
                            placeholder="Example Field"
                            style={inputStyle}
                            aria-label="İngilizce etiket"
                        />
                    </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 100px", gap: "12px", marginTop: "12px" }}>
                    <div>
                        <label style={labelStyle}>Alan Tipi</label>
                        <select
                            value={draft.field_type}
                            onChange={(e) => setDraft({ ...draft, field_type: e.target.value as ProductFieldType })}
                            style={inputStyle}
                            aria-label="Alan tipi"
                        >
                            {FIELD_TYPES.map((t) => (
                                <option key={t} value={t}>{FIELD_TYPE_LABELS[t]}</option>
                            ))}
                        </select>
                    </div>
                    {draft.field_type === "number" && (
                        <div>
                            <label style={labelStyle}>Birim (opsiyonel)</label>
                            <input
                                type="text"
                                value={draft.unit}
                                onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
                                placeholder="mm, bar, °C, kg"
                                style={inputStyle}
                                aria-label="Birim"
                                maxLength={20}
                            />
                        </div>
                    )}
                    <div style={{ display: "flex", alignItems: "center", paddingTop: "20px" }}>
                        <label style={{ ...labelStyle, marginBottom: 0, display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                            <input
                                type="checkbox"
                                checked={draft.required}
                                onChange={(e) => setDraft({ ...draft, required: e.target.checked })}
                            />
                            Zorunlu
                        </label>
                    </div>
                </div>

                {(draft.field_type === "select" || draft.field_type === "multiselect") && (
                    <div style={{ marginTop: "12px" }}>
                        <label style={labelStyle}>
                            Seçenekler (her satıra bir tane)
                        </label>
                        <textarea
                            value={draft.options}
                            onChange={(e) => setDraft({ ...draft, options: e.target.value })}
                            placeholder={"Seçenek 1\nSeçenek 2\nSeçenek 3"}
                            style={{ ...inputStyle, minHeight: "100px", resize: "vertical" as const, fontFamily: "monospace" }}
                            aria-label="Seçenekler"
                        />
                    </div>
                )}

                {addError && <div style={errStyle} role="alert" aria-live="polite">{addError}</div>}

                <div style={{ marginTop: "16px", textAlign: "right" }}>
                    <Button
                        onClick={submitField}
                        disabled={isDemo || adding}
                        title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}
                    >
                        {adding ? "Ekleniyor..." : "+ Alan Ekle"}
                    </Button>
                </div>
            </div>
        </div>
    );
}
