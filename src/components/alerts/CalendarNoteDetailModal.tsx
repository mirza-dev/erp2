"use client";

import { useState } from "react";
import { Building2, CalendarClock, CalendarDays, Clock3, LockKeyhole, Pencil, Trash2, UserRound, X } from "lucide-react";
import Button from "@/components/ui/Button";
import type { CalendarNote } from "@/lib/calendar-notes";
import { ModalFrame } from "@/components/alerts/NoteFormModal";

interface Props {
    note: CalendarNote;
    onClose: () => void;
    onEdit: () => void;
    onDeleted: () => void;
    isDemo: boolean;
}

export function CalendarNoteDetailModal({ note, onClose, onEdit, onDeleted, isDemo }: Props) {
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleDelete = async () => {
        if (isDemo || deleting) return;
        setDeleting(true);
        setError(null);
        try {
            const res = await fetch(`/api/calendar-notes/${note.id}`, { method: "DELETE" });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((body as { error?: string }).error || "Not silinemedi.");
            onDeleted();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Not silinemedi.");
        } finally {
            setDeleting(false);
        }
    };

    return (
        <ModalFrame onClose={onClose} ariaLabel="Takvim notu detayı">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
                <div style={{ minWidth: 0 }}>
                    <VisibilityBadge visibility={note.visibility} />
                    <h2 style={{ margin: "10px 0 0", fontSize: "17px", lineHeight: 1.35, color: "var(--text-primary)", fontWeight: 650 }}>{note.title}</h2>
                </div>
                <Button variant="icon" size="md" iconOnly aria-label="Kapat" onClick={onClose}><X size={15} /></Button>
            </div>

            {note.description ? (
                <p style={{ margin: "2px 0", whiteSpace: "pre-wrap", fontSize: "13px", lineHeight: 1.65, color: "var(--text-secondary)" }}>{note.description}</p>
            ) : (
                <p style={{ margin: "2px 0", fontSize: "12px", color: "var(--text-tertiary)" }}>Açıklama eklenmemiş.</p>
            )}

            <div style={{ display: "grid", gap: "7px", padding: "11px 0", borderTop: "1px solid var(--border-tertiary)", borderBottom: "1px solid var(--border-tertiary)" }}>
                <Meta icon={<CalendarDays size={13} />} label="Tarih" value={formatDisplayDate(note.noteDate)} />
                <Meta icon={<Clock3 size={13} />} label="Saat" value={note.noteTime || "Tüm gün"} />
                {note.visibility === "company" && note.ownerLabel && <Meta icon={<UserRound size={13} />} label="Oluşturan" value={note.ownerLabel} />}
                {note.visibility === "company" && <Meta icon={<CalendarClock size={13} />} label="Oluşturma" value={formatCreatedAt(note.createdAt)} />}
            </div>

            {confirmDelete ? (
                <div style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--danger-border)", background: "var(--danger-bg)" }}>
                    <div style={{ fontSize: "12px", fontWeight: 650, color: "var(--danger-text)" }}>Bu not kalıcı olarak silinecek.</div>
                    <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "3px" }}>Bu işlem geri alınamaz.</div>
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "11px" }}>
                        <Button variant="secondary" size="sm" onClick={() => setConfirmDelete(false)} disabled={deleting}>Vazgeç</Button>
                        <Button variant="danger" size="sm" onClick={handleDelete} loading={deleting} disabled={isDemo || deleting} leftIcon={<Trash2 size={14} />}>Kalıcı Sil</Button>
                    </div>
                </div>
            ) : note.canManage ? (
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                    <Button variant="dangerSoft" size="sm" onClick={() => setConfirmDelete(true)} leftIcon={<Trash2 size={14} />}>Sil</Button>
                    <Button variant="secondary" size="sm" onClick={onEdit} leftIcon={<Pencil size={14} />}>Düzenle</Button>
                </div>
            ) : null}
            {error && <span role="alert" style={{ fontSize: "11.5px", color: "var(--danger-text)" }}>{error}</span>}
        </ModalFrame>
    );
}

function VisibilityBadge({ visibility }: { visibility: CalendarNote["visibility"] }) {
    const personal = visibility === "personal";
    return (
        <span style={{
            display: "inline-flex", alignItems: "center", gap: "5px", padding: "3px 7px", borderRadius: "5px",
            border: "1px solid var(--border-tertiary)", background: "var(--bg-tertiary)",
            color: "var(--text-secondary)", fontSize: "10px", fontWeight: 650,
        }}>
            {personal ? <LockKeyhole size={11} /> : <Building2 size={11} />}
            {personal ? "Yalnız ben" : "Şirket geneli"}
        </span>
    );
}

function Meta({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
    return (
        <div style={{ display: "grid", gridTemplateColumns: "18px 76px 1fr", alignItems: "center", gap: "5px", fontSize: "11.5px" }}>
            <span aria-hidden style={{ display: "inline-flex", color: "var(--text-tertiary)" }}>{icon}</span>
            <span style={{ color: "var(--text-tertiary)" }}>{label}</span>
            <span style={{ color: "var(--text-secondary)", fontWeight: 560 }}>{value}</span>
        </div>
    );
}

function formatDisplayDate(value: string): string {
    return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric" })
        .format(new Date(`${value}T00:00:00`));
}

function formatCreatedAt(value: string): string {
    return new Intl.DateTimeFormat("tr-TR", {
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(new Date(value));
}
