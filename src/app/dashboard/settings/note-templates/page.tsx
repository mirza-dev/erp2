"use client";

import { useEffect, useState, useCallback } from "react";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useIsDemo, DEMO_DISABLED_TOOLTIP, DEMO_BLOCK_TOAST } from "@/lib/demo-utils";
import type { NoteTemplate, NoteTemplateKind } from "@/lib/mock-data";
import { Plus } from "lucide-react";

export const KIND_META: Record<NoteTemplateKind, { label: string; badge: string }> = {
    notes: { label: "Notlar & Şartlar", badge: "Not" },
    delivery: { label: "Teslimat", badge: "Teslimat" },
    payment: { label: "Ödeme", badge: "Ödeme" },
    general: { label: "Genel", badge: "Genel" },
};

const KIND_ORDER: NoteTemplateKind[] = ["notes", "delivery", "payment", "general"];

const containerStyle: React.CSSProperties = { padding: "24px", maxWidth: "900px", margin: "0 auto" };
const headerStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" };
const tabsStyle: React.CSSProperties = { display: "flex", gap: "6px", marginBottom: "20px", flexWrap: "wrap" };
const rowStyle: React.CSSProperties = {
    display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px",
    background: "var(--bg-secondary)", border: "0.5px solid var(--border-tertiary)",
    borderRadius: "8px", padding: "12px 14px", marginBottom: "10px",
};
const badgeStyle: React.CSSProperties = {
    display: "inline-block", fontSize: "10px", padding: "2px 6px",
    background: "var(--accent-bg)", color: "var(--accent-text)", borderRadius: "4px", marginRight: "8px",
};
const modalBackdropStyle: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" };
const modalStyle: React.CSSProperties = { background: "var(--bg-primary)", border: "0.5px solid var(--border-tertiary)", borderRadius: "10px", padding: "24px", width: "100%", maxWidth: "480px", zIndex: 201 };
const inputStyle: React.CSSProperties = { width: "100%", fontSize: "13px", padding: "8px 10px", border: "0.5px solid var(--border-secondary)", borderRadius: "6px", background: "var(--bg-tertiary)", color: "var(--text-primary)", boxSizing: "border-box" };
const labelStyle: React.CSSProperties = { fontSize: "12px", color: "var(--text-secondary)", marginBottom: "4px", display: "block" };
const errStyle: React.CSSProperties = { color: "var(--danger)", fontSize: "12px", marginTop: "8px" };

type FilterKind = NoteTemplateKind | "all";

export default function NoteTemplatesPage() {
    const { toast } = useToast();
    const isDemo = useIsDemo();

    const [templates, setTemplates] = useState<NoteTemplate[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<FilterKind>("all");

    // Form modal (create + edit)
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formKind, setFormKind] = useState<NoteTemplateKind>("notes");
    const [formTitle, setFormTitle] = useState("");
    const [formBody, setFormBody] = useState("");
    const [formSort, setFormSort] = useState("0");
    const [formError, setFormError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/note-templates");
            if (!res.ok) throw new Error("Şablonlar yüklenemedi");
            setTemplates((await res.json()) as NoteTemplate[]);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Bilinmeyen hata");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const openCreate = () => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        setEditingId(null);
        setFormKind(filter === "all" ? "notes" : filter);
        setFormTitle("");
        setFormBody("");
        setFormSort("0");
        setFormError(null);
        setShowForm(true);
    };

    const openEdit = (t: NoteTemplate) => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        setEditingId(t.id);
        setFormKind(t.kind);
        setFormTitle(t.title);
        setFormBody(t.body);
        setFormSort(String(t.sortOrder));
        setFormError(null);
        setShowForm(true);
    };

    const submitForm = async () => {
        setFormError(null);
        if (!formTitle.trim()) { setFormError("Başlık zorunludur."); return; }
        if (!formBody.trim()) { setFormError("Şablon metni zorunludur."); return; }
        setSaving(true);
        try {
            const payload = {
                kind: formKind,
                title: formTitle.trim(),
                body: formBody,
                sort_order: Number(formSort) || 0,
            };
            const url = editingId ? `/api/note-templates/${editingId}` : "/api/note-templates";
            const method = editingId ? "PATCH" : "POST";
            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error ?? "Kaydedilemedi");
            }
            toast({ type: "success", message: editingId ? "Şablon güncellendi." : "Şablon oluşturuldu." });
            setShowForm(false);
            load();
        } catch (e) {
            setFormError(e instanceof Error ? e.message : "Bilinmeyen hata");
        } finally {
            setSaving(false);
        }
    };

    const deactivate = async (t: NoteTemplate) => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        if (!window.confirm(`"${t.title}" şablonunu pasifleştirmek istiyor musunuz?`)) return;
        try {
            const res = await fetch(`/api/note-templates/${t.id}`, { method: "DELETE" });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error ?? "Pasifleştirilemedi");
            }
            toast({ type: "success", message: "Şablon pasifleştirildi." });
            load();
        } catch (e) {
            toast({ type: "error", message: e instanceof Error ? e.message : "Bilinmeyen hata" });
        }
    };

    const visible = filter === "all" ? templates : templates.filter((t) => t.kind === filter);

    return (
        <div style={containerStyle}>
            <div style={headerStyle}>
                <div>
                    <h1 style={{ fontSize: "22px", fontWeight: 700, marginBottom: "4px" }}>Not Şablonları</h1>
                    <div style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                        Teklif formunda Notlar, Teslimat ve Ödeme alanlarına tek tıkla eklenen hazır metinler.
                    </div>
                </div>
                <Button
                    size="cta"
                    leftIcon={<Plus size={16} />}
                    onClick={openCreate}
                    disabled={isDemo}
                    title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}
                >
                    Yeni Şablon
                </Button>
            </div>

            <div style={tabsStyle}>
                {(["all", ...KIND_ORDER] as FilterKind[]).map((k) => (
                    <button
                        key={k}
                        type="button"
                        onClick={() => setFilter(k)}
                        aria-pressed={filter === k}
                        style={{
                            fontSize: "12px", padding: "6px 12px", borderRadius: "6px", cursor: "pointer",
                            border: "0.5px solid var(--border-secondary)",
                            background: filter === k ? "var(--accent-bg)" : "var(--bg-secondary)",
                            color: filter === k ? "var(--accent-text)" : "var(--text-secondary)",
                        }}
                    >
                        {k === "all" ? "Tümü" : KIND_META[k].label}
                    </button>
                ))}
            </div>

            {loading && <div style={{ color: "var(--text-secondary)" }}>Yükleniyor...</div>}
            {error && (
                <div style={errStyle} role="alert">
                    {error} <button type="button" onClick={load} style={{ marginLeft: "8px", textDecoration: "underline", background: "none", border: "none", color: "var(--accent-text)", cursor: "pointer" }}>Yeniden dene</button>
                </div>
            )}

            {!loading && !error && visible.map((t) => (
                <div key={t.id} style={rowStyle}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ marginBottom: "4px" }}>
                            <span style={badgeStyle}>{KIND_META[t.kind].badge}</span>
                            <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>{t.title}</span>
                        </div>
                        <div style={{
                            fontSize: "12px", color: "var(--text-secondary)", whiteSpace: "pre-wrap", lineHeight: 1.4,
                            // Uzun şart metinleri ayar sayfasını şişirmesin — 3 satır önizleme.
                            display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden",
                        }}>{t.body}</div>
                    </div>
                    <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                        <Button variant="ghost" onClick={() => openEdit(t)} disabled={isDemo} title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}>Düzenle</Button>
                        <Button variant="ghost" onClick={() => deactivate(t)} disabled={isDemo} title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}>Pasifleştir</Button>
                    </div>
                </div>
            ))}

            {!loading && !error && visible.length === 0 && (
                <div style={{ color: "var(--text-tertiary)", marginTop: "24px" }}>
                    Bu kategoride şablon yok. Yeni Şablon ile ekle.
                </div>
            )}

            {showForm && (
                <div style={modalBackdropStyle} role="dialog" aria-modal="true" aria-label={editingId ? "Şablon düzenle" : "Yeni şablon ekle"}>
                    <div style={modalStyle}>
                        <h2 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "16px" }}>
                            {editingId ? "Şablonu Düzenle" : "Yeni Not Şablonu"}
                        </h2>

                        <label style={labelStyle}>Kategori *</label>
                        <select
                            value={formKind}
                            onChange={(e) => setFormKind(e.target.value as NoteTemplateKind)}
                            style={inputStyle}
                            aria-label="Şablon kategorisi"
                        >
                            {KIND_ORDER.map((k) => (
                                <option key={k} value={k}>{KIND_META[k].label}</option>
                            ))}
                        </select>

                        <label style={{ ...labelStyle, marginTop: "12px" }}>Başlık *</label>
                        <input
                            type="text"
                            value={formTitle}
                            onChange={(e) => setFormTitle(e.target.value)}
                            placeholder="örn: %50 Avans / %50 Sevk"
                            style={inputStyle}
                            aria-label="Şablon başlığı"
                            maxLength={120}
                            autoFocus
                        />

                        <label style={{ ...labelStyle, marginTop: "12px" }}>Metin *</label>
                        <textarea
                            value={formBody}
                            onChange={(e) => setFormBody(e.target.value)}
                            placeholder="Teklife eklenecek metin"
                            style={{ ...inputStyle, minHeight: "90px", resize: "vertical" as const }}
                            aria-label="Şablon metni"
                        />

                        <label style={{ ...labelStyle, marginTop: "12px" }}>Sıralama</label>
                        <input
                            type="number"
                            value={formSort}
                            onChange={(e) => setFormSort(e.target.value)}
                            style={inputStyle}
                            aria-label="Sıralama"
                            min={0}
                        />

                        {formError && <div style={errStyle} role="alert" aria-live="polite">{formError}</div>}

                        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "16px" }}>
                            <Button variant="ghost" onClick={() => setShowForm(false)} disabled={saving}>İptal</Button>
                            <Button onClick={submitForm} disabled={saving || isDemo}>
                                {saving ? "Kaydediliyor..." : "Kaydet"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
