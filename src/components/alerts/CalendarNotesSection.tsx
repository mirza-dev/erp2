"use client";

import { Building2, Clock3, LockKeyhole, NotebookText, Plus } from "lucide-react";
import Button from "@/components/ui/Button";
import type { CalendarNote } from "@/lib/calendar-notes";
import { sortCalendarNotes } from "@/lib/calendar-notes";

interface Props {
    notes: CalendarNote[];
    onAdd: () => void;
    onDetail: (note: CalendarNote) => void;
}

export function CalendarNotesSection({ notes, onAdd, onDetail }: Props) {
    const sorted = sortCalendarNotes(notes);
    return (
        <section aria-label="Takvim notları" style={{ padding: "14px 20px 15px", borderBottom: "1px solid var(--border-tertiary)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", marginBottom: sorted.length ? "10px" : 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "7px", minWidth: 0 }}>
                    <NotebookText size={14} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
                    <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-secondary)", letterSpacing: "0.04em", textTransform: "uppercase" }}>Notlar</span>
                    <span style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>{sorted.length}</span>
                </div>
                <Button variant="ghost" size="xs" onClick={onAdd} leftIcon={<Plus size={13} />}>Not Ekle</Button>
            </div>

            {sorted.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {sorted.map((note) => (
                        <button
                            key={note.id}
                            type="button"
                            onClick={() => onDetail(note)}
                            style={{
                                width: "100%", display: "grid", gridTemplateColumns: "52px minmax(0, 1fr) auto",
                                gap: "9px", alignItems: "center", padding: "8px 9px", borderRadius: "7px",
                                border: "1px solid var(--border-tertiary)", background: "var(--surface-raised)",
                                color: "var(--text-primary)", textAlign: "left", cursor: "pointer",
                            }}
                        >
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", color: "var(--text-tertiary)", fontSize: "10px", fontFamily: "var(--font-mono, monospace)" }}>
                                {note.noteTime ? <><Clock3 size={11} />{note.noteTime}</> : "TÜM GÜN"}
                            </span>
                            <span style={{ minWidth: 0 }}>
                                <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "12px", fontWeight: 600 }}>{note.title}</span>
                                {note.description && <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "10.5px", color: "var(--text-tertiary)", marginTop: "2px" }}>{note.description}</span>}
                                {note.visibility === "company" && (
                                    <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "9.5px", color: "var(--text-tertiary)", marginTop: "3px" }}>
                                        {note.ownerLabel ? `${note.ownerLabel} · ` : ""}{formatCreatedAt(note.createdAt)}
                                    </span>
                                )}
                            </span>
                            <span title={note.visibility === "personal" ? "Yalnız ben" : "Şirket geneli"} style={{
                                display: "inline-flex", alignItems: "center", gap: "4px", padding: "3px 5px",
                                borderRadius: "5px", border: "1px solid var(--border-tertiary)",
                                background: "var(--surface-subtle)", color: "var(--text-tertiary)",
                                fontSize: "9px", fontWeight: 650, whiteSpace: "nowrap",
                            }}>
                                {note.visibility === "personal" ? <LockKeyhole size={12} /> : <Building2 size={12} />}
                                {note.visibility === "personal" ? "Kişisel" : "Şirket"}
                            </span>
                        </button>
                    ))}
                </div>
            )}
        </section>
    );
}

function formatCreatedAt(value: string): string {
    return new Intl.DateTimeFormat("tr-TR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    }).format(new Date(value));
}
