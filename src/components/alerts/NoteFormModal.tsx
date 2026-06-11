"use client";

import { useEffect, useRef, useState } from "react";
import Button from "@/components/ui/Button";

interface Props {
    onClose: () => void;
    /** Başarılı kayıt sonrası (POST 201) — sayfa refetch + toast yapar. */
    onCreated: () => void;
    isDemo: boolean;
}

/**
 * Kullanıcı notu / hatırlatma formu (090). Başlık + açıklama + opsiyonel
 * hatırlatma tarihi → POST /api/alerts (type=user_note, source=ui).
 * Hatırlatma tarihi verilirse not takvimde o günde de görünür; tarih geçince
 * günlük tarama önemini BİLGİ→UYARI yükseltir.
 */
export function NoteFormModal({ onClose, onCreated, isDemo }: Props) {
    const todayStr = new Date().toISOString().slice(0, 10);
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [dueDate, setDueDate] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Focus: açılışta başlığa; Escape kapatır; kapanışta tetikleyiciye dönüş.
    const titleRef = useRef<HTMLInputElement>(null);
    useEffect(() => {
        const prevFocus = document.activeElement as HTMLElement | null;
        titleRef.current?.focus();
        const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", handler);
        return () => { window.removeEventListener("keydown", handler); prevFocus?.focus?.(); };
    }, [onClose]);

    const handleSave = async () => {
        if (isDemo || saving) return;
        const t = title.trim();
        if (!t) { setError("Başlık zorunludur."); return; }
        setSaving(true);
        setError(null);
        try {
            const res = await fetch("/api/alerts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: t,
                    description: description.trim() || undefined,
                    due_date: dueDate || undefined,
                }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
            }
            onCreated();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Not kaydedilemedi.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)", animation: "fade-in 0.2s ease-out" }} />
            <div
                role="dialog"
                aria-modal="true"
                aria-label="Yeni not"
                style={{
                    position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
                    zIndex: 201, width: "min(440px, calc(100vw - 32px))",
                    background: "var(--bg-primary)", border: "0.5px solid var(--border-secondary)",
                    borderRadius: "12px", boxShadow: "0 16px 48px rgba(0,0,0,0.35)",
                    padding: "20px 22px", display: "flex", flexDirection: "column", gap: "12px",
                }}
            >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: "15px", fontWeight: 650, color: "var(--text-primary)" }}>✎ Yeni Not</span>
                    <Button variant="icon" size="md" iconOnly aria-label="Kapat" onClick={onClose}>
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                    </Button>
                </div>

                <div style={{ fontSize: "11.5px", color: "var(--text-tertiary)", lineHeight: 1.5 }}>
                    Not herkese görünür ve takvimde bugüne düşer. Hatırlatma tarihi verirsen o günde de
                    görünür; tarih geçince önemi otomatik yükselir.
                </div>

                <label htmlFor="note-title" style={labelStyle}>BAŞLIK *</label>
                <input
                    id="note-title"
                    ref={titleRef}
                    type="text"
                    value={title}
                    maxLength={200}
                    placeholder="Tedarikçiyi aramayı unutma…"
                    onChange={(e) => { setTitle(e.target.value); setError(null); }}
                    disabled={isDemo || saving}
                    style={inputStyle}
                />

                <label htmlFor="note-desc" style={labelStyle}>AÇIKLAMA (opsiyonel)</label>
                <textarea
                    id="note-desc"
                    value={description}
                    maxLength={2000}
                    rows={3}
                    placeholder="Detay…"
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={isDemo || saving}
                    style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
                />

                <label htmlFor="note-due" style={labelStyle}>HATIRLATMA TARİHİ (opsiyonel)</label>
                <input
                    id="note-due"
                    type="date"
                    value={dueDate}
                    min={todayStr}
                    onChange={(e) => { setDueDate(e.target.value); setError(null); }}
                    disabled={isDemo || saving}
                    style={inputStyle}
                />

                {error && <span role="alert" aria-live="polite" style={{ fontSize: "11px", color: "var(--danger-text)" }}>{error}</span>}

                <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
                    <Button variant="secondary" size="md" fullWidth onClick={onClose} disabled={saving}>Vazgeç</Button>
                    <Button variant="primary" size="md" fullWidth onClick={handleSave} disabled={isDemo || saving}>
                        {saving ? "Kaydediliyor..." : "Notu Kaydet"}
                    </Button>
                </div>
            </div>
        </>
    );
}

const labelStyle: React.CSSProperties = {
    fontSize: "10px", fontWeight: 700, color: "var(--text-tertiary)",
    letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: "-6px",
};
const inputStyle: React.CSSProperties = {
    fontSize: "13px", padding: "8px 10px",
    border: "0.5px solid var(--border-secondary)", borderRadius: "6px",
    background: "var(--bg-primary)", color: "var(--text-primary)",
    width: "100%", boxSizing: "border-box",
};
