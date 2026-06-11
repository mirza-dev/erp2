import { NextRequest, NextResponse } from "next/server";
import { getCalendarNoteActor } from "@/lib/auth/calendar-note-access";
import { requirePermission } from "@/lib/auth/role-guard";
import {
    isValidCalendarDate,
    isValidCalendarNoteVisibility,
    isValidCalendarTime,
    mapCalendarNote,
} from "@/lib/calendar-notes";
import { dbCreateCalendarNote, dbListVisibleCalendarNotes } from "@/lib/supabase/calendar-notes";
import { safeParseJson } from "@/lib/api-error";

export const dynamic = "force-dynamic";

function unauthorized() {
    return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
}

function validateText(title: unknown, description: unknown): { title: string; description: string | null } | NextResponse {
    const cleanTitle = typeof title === "string" ? title.trim() : "";
    if (!cleanTitle) return NextResponse.json({ error: "Başlık zorunludur." }, { status: 400 });
    if (cleanTitle.length > 200) return NextResponse.json({ error: "Başlık en fazla 200 karakter olabilir." }, { status: 400 });
    const cleanDescription = typeof description === "string" ? description.trim() : "";
    if (cleanDescription.length > 2000) return NextResponse.json({ error: "Açıklama en fazla 2000 karakter olabilir." }, { status: 400 });
    return { title: cleanTitle, description: cleanDescription || null };
}

export async function GET(req: NextRequest) {
    try {
        const actor = await getCalendarNoteActor();
        if (!actor) return unauthorized();
        const guard = await requirePermission(req, "view_alerts");
        if (guard) return guard;

        const from = req.nextUrl.searchParams.get("from");
        const to = req.nextUrl.searchParams.get("to");
        if (!isValidCalendarDate(from) || !isValidCalendarDate(to) || from > to) {
            return NextResponse.json({ error: "Geçerli bir tarih aralığı zorunludur." }, { status: 400 });
        }

        const rows = await dbListVisibleCalendarNotes(actor.id, from, to);
        return NextResponse.json(rows.map((row) => mapCalendarNote(row, actor)));
    } catch (err) {
        console.error("[GET /api/calendar-notes]", err);
        return NextResponse.json({ error: "Takvim notları alınamadı." }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const actor = await getCalendarNoteActor();
        if (!actor) return unauthorized();
        const guard = await requirePermission(req, "view_alerts");
        if (guard) return guard;

        const parsed = await safeParseJson(req);
        if (!parsed.ok) return parsed.response;
        const body = parsed.data as Record<string, unknown>;

        const text = validateText(body.title, body.description);
        if (text instanceof NextResponse) return text;
        if (!isValidCalendarDate(body.note_date)) {
            return NextResponse.json({ error: "Geçerli bir tarih zorunludur." }, { status: 400 });
        }
        if (body.note_time !== undefined && body.note_time !== null && body.note_time !== "" && !isValidCalendarTime(body.note_time)) {
            return NextResponse.json({ error: "Saat SS:DD biçiminde olmalıdır." }, { status: 400 });
        }
        const visibility = body.visibility === undefined ? "personal" : body.visibility;
        if (!isValidCalendarNoteVisibility(visibility)) {
            return NextResponse.json({ error: "Geçersiz görünürlük." }, { status: 400 });
        }

        const row = await dbCreateCalendarNote({
            ...text,
            noteDate: body.note_date,
            noteTime: typeof body.note_time === "string" && body.note_time ? body.note_time : null,
            visibility,
            ownerId: actor.id,
            ownerLabel: actor.label,
        });
        return NextResponse.json(mapCalendarNote(row, actor), { status: 201 });
    } catch (err) {
        console.error("[POST /api/calendar-notes]", err);
        return NextResponse.json({ error: "Takvim notu oluşturulamadı." }, { status: 500 });
    }
}
