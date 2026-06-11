import { describe, expect, it } from "vitest";
import {
    canManageCalendarNote,
    canViewCalendarNote,
    getCalendarNotesForDate,
    isValidCalendarDate,
    isValidCalendarTime,
    mapCalendarNote,
    sortCalendarNotes,
    type CalendarNote,
    type CalendarNoteActor,
} from "@/lib/calendar-notes";
import type { CalendarNoteRow } from "@/lib/database.types";

const actor: CalendarNoteActor = { id: "u1", label: "Ali", isAdmin: false };
const row: CalendarNoteRow = {
    id: "n1", title: "Not", description: null, note_date: "2026-06-11", note_time: null,
    visibility: "personal", owner_id: "u1", owner_label: "Ali", legacy_alert_id: null,
    created_at: "2026-06-01T08:00:00Z", updated_at: "2026-06-01T08:00:00Z",
};
const note = (over: Partial<CalendarNote>): CalendarNote => ({
    id: "n1", title: "Not", description: null, noteDate: "2026-06-11", noteTime: null,
    visibility: "personal", ownerLabel: "Ali", createdAt: "2026-06-01T08:00:00Z",
    updatedAt: "2026-06-01T08:00:00Z", canManage: true, ...over,
});

describe("calendar note validation", () => {
    it("geçmiş/gelecek geçerli tarihleri ve 24 saat formatını kabul eder", () => {
        expect(isValidCalendarDate("2020-02-29")).toBe(true);
        expect(isValidCalendarDate("2026-02-30")).toBe(false);
        expect(isValidCalendarTime("00:00")).toBe(true);
        expect(isValidCalendarTime("23:59")).toBe(true);
        expect(isValidCalendarTime("24:00")).toBe(false);
    });
});

describe("calendar note visibility", () => {
    it("kişisel not yalnız sahibi; şirket notu herkes tarafından görünür", () => {
        expect(canViewCalendarNote(row, actor)).toBe(true);
        expect(canViewCalendarNote({ ...row, owner_id: "other" }, actor)).toBe(false);
        expect(canViewCalendarNote({ ...row, owner_id: "other", visibility: "company" }, actor)).toBe(true);
    });
    it("sahip veya admin yönetir; sahipsiz legacy yalnız admin", () => {
        expect(canManageCalendarNote(row, actor)).toBe(true);
        expect(canManageCalendarNote({ ...row, owner_id: "other" }, actor)).toBe(false);
        expect(canManageCalendarNote({ ...row, owner_id: null }, { ...actor, isAdmin: true })).toBe(true);
    });
    it("API map canManage'i actor'a göre üretir ve saati HH:MM'e indirger", () => {
        expect(mapCalendarNote({ ...row, note_time: "09:15:00" }, actor)).toMatchObject({ noteTime: "09:15", canManage: true });
    });
});

describe("calendar note day sorting", () => {
    it("tüm gün önce, saatli notlar kronolojik; diğer gün dışarıda", () => {
        const notes = [
            note({ id: "late", noteTime: "16:30" }),
            note({ id: "all", noteTime: null }),
            note({ id: "early", noteTime: "08:15" }),
            note({ id: "other", noteDate: "2026-06-12" }),
        ];
        expect(sortCalendarNotes(notes.slice(0, 3)).map((item) => item.id)).toEqual(["all", "early", "late"]);
        expect(getCalendarNotesForDate(notes, new Date(2026, 5, 11)).map((item) => item.id)).toEqual(["all", "early", "late"]);
    });
});
