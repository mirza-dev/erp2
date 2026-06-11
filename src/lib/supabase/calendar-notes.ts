import { createServiceClient } from "@/lib/supabase/service";
import type { CalendarNoteRow, CalendarNoteVisibility } from "@/lib/database.types";

export interface CreateCalendarNoteInput {
    title: string;
    description: string | null;
    noteDate: string;
    noteTime: string | null;
    visibility: CalendarNoteVisibility;
    ownerId: string;
    ownerLabel: string | null;
}

export interface UpdateCalendarNoteInput {
    title?: string;
    description?: string | null;
    noteDate?: string;
    noteTime?: string | null;
    visibility?: CalendarNoteVisibility;
}

export async function dbListVisibleCalendarNotes(
    userId: string,
    from: string,
    to: string,
): Promise<CalendarNoteRow[]> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("calendar_notes")
        .select("*")
        .gte("note_date", from)
        .lte("note_date", to)
        .or(`visibility.eq.company,owner_id.eq.${userId}`)
        .order("note_date", { ascending: true })
        .order("note_time", { ascending: true, nullsFirst: true });
    if (error) throw new Error(error.message);
    return data ?? [];
}

export async function dbGetCalendarNote(id: string): Promise<CalendarNoteRow | null> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("calendar_notes")
        .select("*")
        .eq("id", id)
        .maybeSingle();
    if (error) throw new Error(error.message);
    return data ?? null;
}

export async function dbCreateCalendarNote(input: CreateCalendarNoteInput): Promise<CalendarNoteRow> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("calendar_notes")
        .insert({
            title: input.title,
            description: input.description,
            note_date: input.noteDate,
            note_time: input.noteTime,
            visibility: input.visibility,
            owner_id: input.ownerId,
            owner_label: input.ownerLabel,
        })
        .select()
        .single();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Not oluşturulamadı.");
    return data;
}

export async function dbUpdateCalendarNote(id: string, patch: UpdateCalendarNoteInput): Promise<CalendarNoteRow> {
    const payload: Record<string, unknown> = {};
    if (patch.title !== undefined) payload.title = patch.title;
    if (patch.description !== undefined) payload.description = patch.description;
    if (patch.noteDate !== undefined) payload.note_date = patch.noteDate;
    if (patch.noteTime !== undefined) payload.note_time = patch.noteTime;
    if (patch.visibility !== undefined) payload.visibility = patch.visibility;

    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("calendar_notes")
        .update(payload)
        .eq("id", id)
        .select()
        .single();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Not bulunamadı.");
    return data;
}

export async function dbDeleteCalendarNote(id: string): Promise<void> {
    const supabase = createServiceClient();
    const { error } = await supabase.from("calendar_notes").delete().eq("id", id);
    if (error) throw new Error(error.message);
}
