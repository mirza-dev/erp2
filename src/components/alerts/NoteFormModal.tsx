"use client";

import { useEffect, useRef, useState } from "react";
import { Building2, CalendarDays, Clock3, LockKeyhole, NotebookPen, Save, X } from "lucide-react";
import Button from "@/components/ui/Button";
import type { CalendarNote } from "@/lib/calendar-notes";
import type { CalendarNoteVisibility } from "@/lib/database.types";

interface Props {
    onClose: () => void;
    onSaved: (note: CalendarNote) => void;
    isDemo: boolean;
    initialDate?: string;
    note?: CalendarNote | null;
}

export function NoteFormModal({ onClose, onSaved, isDemo, initialDate, note = null }: Props) {
    const [title, setTitle] = useState(note?.title ?? "");
    const [description, setDescription] = useState(note?.description ?? "");
    const [noteDate, setNoteDate] = useState(note?.noteDate ?? initialDate ?? formatInputDate(new Date()));
    const [noteTime, setNoteTime] = useState(note?.noteTime ?? "");
    const [visibility, setVisibility] = useState<CalendarNoteVisibility>(note?.visibility ?? "personal");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const titleRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const prevFocus = document.activeElement as HTMLElement | null;
        titleRef.current?.focus();
        const handler = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
        window.addEventListener("keydown", handler);
        return () => {
            window.removeEventListener("keydown", handler);
            prevFocus?.focus?.();
        };
    }, [onClose]);

    const handleSave = async () => {
        if (isDemo || saving) return;
        if (!title.trim()) { setError("Başlık zorunludur."); return; }
        if (!noteDate) { setError("Tarih zorunludur."); return; }
        setSaving(true);
        setError(null);
        try {
            const res = await fetch(note ? `/api/calendar-notes/${note.id}` : "/api/calendar-notes", {
                method: note ? "PATCH" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: title.trim(),
                    description: description.trim(),
                    note_date: noteDate,
                    note_time: noteTime || null,
                    visibility,
                }),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((body as { error?: string }).error || "Not kaydedilemedi.");
            onSaved(body as CalendarNote);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Not kaydedilemedi.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <ModalFrame onClose={onClose} ariaLabel={note ? "Takvim notunu düzenle" : "Yeni takvim notu"}>
            <div style={headerStyle}>
                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                    <span style={headerIconStyle}><NotebookPen size={16} /></span>
                    <div>
                        <div style={{ fontSize: "15px", fontWeight: 650, color: "var(--text-primary)" }}>
                            {note ? "Notu Düzenle" : "Takvime Not Ekle"}
                        </div>
                        <div style={{ fontSize: "11.5px", color: "var(--text-tertiary)", marginTop: "2px" }}>
                            Uyarı oluşturmaz; yalnız takvimde görünür.
                        </div>
                    </div>
                </div>
                <Button variant="icon" size="md" iconOnly aria-label="Kapat" onClick={onClose}><X size={15} /></Button>
            </div>

            <label htmlFor="calendar-note-title" style={labelStyle}>Başlık *</label>
            <input
                id="calendar-note-title"
                ref={titleRef}
                value={title}
                maxLength={200}
                placeholder="Önemli notun kısa başlığı"
                onChange={(event) => { setTitle(event.target.value); setError(null); }}
                disabled={isDemo || saving}
                style={inputStyle}
            />

            <label htmlFor="calendar-note-description" style={labelStyle}>Açıklama</label>
            <textarea
                id="calendar-note-description"
                value={description}
                maxLength={2000}
                rows={4}
                placeholder="Gerekli detayları ekleyin..."
                onChange={(event) => setDescription(event.target.value)}
                disabled={isDemo || saving}
                style={{ ...inputStyle, resize: "vertical", minHeight: "88px", paddingTop: "10px", fontFamily: "inherit" }}
            />

            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: "10px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <label htmlFor="calendar-note-date" style={labelStyle}><CalendarDays size={12} /> Tarih *</label>
                    <input id="calendar-note-date" type="date" value={noteDate} onChange={(event) => setNoteDate(event.target.value)} disabled={isDemo || saving} style={inputStyle} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <label htmlFor="calendar-note-time" style={labelStyle}><Clock3 size={12} /> Saat</label>
                    <input id="calendar-note-time" type="time" value={noteTime} onChange={(event) => setNoteTime(event.target.value)} disabled={isDemo || saving} style={inputStyle} />
                </div>
            </div>

            <fieldset style={{ border: 0, padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "7px" }}>
                <legend style={labelStyle}>Görünürlük</legend>
                <div style={segmentedStyle}>
                    <VisibilityOption
                        active={visibility === "personal"}
                        icon={<LockKeyhole size={14} />}
                        title="Yalnız ben"
                        detail="Kişisel takviminizde görünür"
                        onClick={() => setVisibility("personal")}
                    />
                    <VisibilityOption
                        active={visibility === "company"}
                        icon={<Building2 size={14} />}
                        title="Şirket geneli"
                        detail="Takvime erişen herkes görür"
                        onClick={() => setVisibility("company")}
                    />
                </div>
            </fieldset>

            {error && <span role="alert" aria-live="polite" style={{ fontSize: "11.5px", color: "var(--danger-text)" }}>{error}</span>}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "2px" }}>
                <Button variant="secondary" size="md" onClick={onClose} disabled={saving}>Vazgeç</Button>
                <Button variant="primary" size="md" onClick={handleSave} disabled={isDemo || saving} loading={saving} leftIcon={<Save size={15} />}>
                    {note ? "Değişiklikleri Kaydet" : "Notu Kaydet"}
                </Button>
            </div>
        </ModalFrame>
    );
}

function VisibilityOption({ active, icon, title, detail, onClick }: {
    active: boolean;
    icon: React.ReactNode;
    title: string;
    detail: string;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            aria-pressed={active}
            onClick={onClick}
            style={{
                flex: 1, minWidth: 0, padding: "10px 11px", borderRadius: "7px", cursor: "pointer",
                display: "flex", alignItems: "center", gap: "9px", textAlign: "left",
                border: `1px solid ${active ? "var(--accent-border)" : "transparent"}`,
                background: active ? "var(--accent-bg)" : "transparent",
                color: active ? "var(--accent-text)" : "var(--text-secondary)",
            }}
        >
            <span aria-hidden style={{ display: "inline-flex", flexShrink: 0 }}>{icon}</span>
            <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: "12px", fontWeight: 650 }}>{title}</span>
                <span style={{ display: "block", fontSize: "10px", color: "var(--text-tertiary)", marginTop: "2px", lineHeight: 1.35 }}>{detail}</span>
            </span>
        </button>
    );
}

export function ModalFrame({ onClose, ariaLabel, children }: { onClose: () => void; ariaLabel: string; children: React.ReactNode }) {
    return (
        <>
            <div onClick={onClose} style={backdropStyle} />
            <div role="dialog" aria-modal="true" aria-label={ariaLabel} style={modalStyle}>{children}</div>
        </>
    );
}

export function formatInputDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

const backdropStyle: React.CSSProperties = {
    position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.54)",
    backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)", animation: "fade-in 0.18s ease-out",
};
const modalStyle: React.CSSProperties = {
    position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
    zIndex: 201, width: "min(480px, calc(100vw - 28px))", maxHeight: "calc(100vh - 28px)", overflowY: "auto",
    background: "var(--surface-raised)", border: "1px solid var(--border-secondary)",
    borderRadius: "10px", boxShadow: "0 20px 58px rgba(0,0,0,0.38)",
    padding: "20px", display: "flex", flexDirection: "column", gap: "11px",
};
const headerStyle: React.CSSProperties = {
    display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px",
    paddingBottom: "12px", borderBottom: "1px solid var(--border-tertiary)", marginBottom: "1px",
};
const headerIconStyle: React.CSSProperties = {
    width: "32px", height: "32px", borderRadius: "7px", display: "inline-flex", alignItems: "center", justifyContent: "center",
    background: "var(--bg-tertiary)", border: "1px solid var(--border-tertiary)", color: "var(--text-secondary)",
};
const labelStyle: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "10px", fontWeight: 650,
    color: "var(--text-tertiary)", letterSpacing: "0.04em", textTransform: "uppercase",
};
const inputStyle: React.CSSProperties = {
    width: "100%", height: "38px", boxSizing: "border-box", padding: "0 10px",
    border: "1px solid var(--border-secondary)", borderRadius: "7px",
    background: "var(--bg-primary)", color: "var(--text-primary)", fontSize: "13px",
};
const segmentedStyle: React.CSSProperties = {
    display: "flex", gap: "3px", padding: "3px", borderRadius: "9px",
    border: "1px solid var(--border-tertiary)", background: "var(--surface-subtle)",
};
