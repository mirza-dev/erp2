import type { CalendarNoteRow, CalendarNoteVisibility } from "@/lib/database.types";
import { isSameDate, parseTimeMinutes, toLocalDate } from "@/lib/alert-calendar";

export interface CalendarNote {
    id: string;
    title: string;
    description: string | null;
    noteDate: string;
    noteTime: string | null;
    visibility: CalendarNoteVisibility;
    ownerLabel: string | null;
    createdAt: string;
    updatedAt: string;
    canManage: boolean;
}

export interface CalendarNoteActor {
    id: string;
    label: string | null;
    isAdmin: boolean;
}

export function isValidCalendarDate(value: unknown): value is string {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    return (
        !Number.isNaN(date.getTime()) &&
        date.getFullYear() === year &&
        date.getMonth() === month - 1 &&
        date.getDate() === day
    );
}

export function isValidCalendarTime(value: unknown): value is string {
    return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function isValidCalendarNoteVisibility(value: unknown): value is CalendarNoteVisibility {
    return value === "personal" || value === "company";
}

export function canManageCalendarNote(row: CalendarNoteRow, actor: CalendarNoteActor): boolean {
    return actor.isAdmin || row.owner_id === actor.id;
}

export function canViewCalendarNote(row: CalendarNoteRow, actor: CalendarNoteActor): boolean {
    return row.visibility === "company" || row.owner_id === actor.id;
}

export function mapCalendarNote(row: CalendarNoteRow, actor: CalendarNoteActor): CalendarNote {
    return {
        id: row.id,
        title: row.title,
        description: row.description,
        noteDate: row.note_date,
        noteTime: row.note_time ? row.note_time.slice(0, 5) : null,
        visibility: row.visibility,
        ownerLabel: row.owner_label,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        canManage: canManageCalendarNote(row, actor),
    };
}

export function getCalendarNotesForDate(notes: CalendarNote[], date: Date): CalendarNote[] {
    return sortCalendarNotes(notes.filter((note) => isSameDate(toLocalDate(note.noteDate), date)));
}

/** Tüm gün notları önce, saatli notlar kendi içinde kronolojik. */
export function sortCalendarNotes(notes: CalendarNote[]): CalendarNote[] {
    return [...notes].sort((a, b) => {
        if (!a.noteTime && b.noteTime) return -1;
        if (a.noteTime && !b.noteTime) return 1;
        if (a.noteTime && b.noteTime) {
            const time = parseTimeMinutes(a.noteTime) - parseTimeMinutes(b.noteTime);
            if (time !== 0) return time;
        }
        return a.createdAt.localeCompare(b.createdAt);
    });
}
