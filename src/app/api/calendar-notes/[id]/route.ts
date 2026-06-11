import { NextRequest, NextResponse } from "next/server";
import { getCalendarNoteActor } from "@/lib/auth/calendar-note-access";
import { requirePermission } from "@/lib/auth/role-guard";
import {
    canManageCalendarNote,
    canViewCalendarNote,
    isValidCalendarDate,
    isValidCalendarNoteVisibility,
    isValidCalendarTime,
    mapCalendarNote,
} from "@/lib/calendar-notes";
import { dbDeleteCalendarNote, dbGetCalendarNote, dbUpdateCalendarNote } from "@/lib/supabase/calendar-notes";
import { safeParseJson } from "@/lib/api-error";
import type { UpdateCalendarNoteInput } from "@/lib/supabase/calendar-notes";

function notFound() {
    return NextResponse.json({ error: "Not bulunamadı." }, { status: 404 });
}

async function context(req: NextRequest, id: string) {
    const actor = await getCalendarNoteActor();
    if (!actor) return { response: NextResponse.json({ error: "Oturum gerekli." }, { status: 401 }) };
    const guard = await requirePermission(req, "view_alerts");
    if (guard) return { response: guard };
    const row = await dbGetCalendarNote(id);
    if (!row || !canViewCalendarNote(row, actor)) return { response: notFound() };
    return { actor, row };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const result = await context(req, id);
        if ("response" in result) return result.response;
        return NextResponse.json(mapCalendarNote(result.row, result.actor));
    } catch (err) {
        console.error("[GET /api/calendar-notes/[id]]", err);
        return NextResponse.json({ error: "Takvim notu alınamadı." }, { status: 500 });
    }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const result = await context(req, id);
        if ("response" in result) return result.response;
        if (!canManageCalendarNote(result.row, result.actor)) return notFound();

        const parsed = await safeParseJson(req);
        if (!parsed.ok) return parsed.response;
        const body = parsed.data as Record<string, unknown>;
        const patch: UpdateCalendarNoteInput = {};

        if (body.title !== undefined) {
            const title = typeof body.title === "string" ? body.title.trim() : "";
            if (!title || title.length > 200) return NextResponse.json({ error: "Başlık 1-200 karakter olmalıdır." }, { status: 400 });
            patch.title = title;
        }
        if (body.description !== undefined) {
            const description = typeof body.description === "string" ? body.description.trim() : "";
            if (description.length > 2000) return NextResponse.json({ error: "Açıklama en fazla 2000 karakter olabilir." }, { status: 400 });
            patch.description = description || null;
        }
        if (body.note_date !== undefined) {
            if (!isValidCalendarDate(body.note_date)) return NextResponse.json({ error: "Geçerli bir tarih zorunludur." }, { status: 400 });
            patch.noteDate = body.note_date;
        }
        if (body.note_time !== undefined) {
            if (body.note_time !== null && body.note_time !== "" && !isValidCalendarTime(body.note_time)) {
                return NextResponse.json({ error: "Saat SS:DD biçiminde olmalıdır." }, { status: 400 });
            }
            patch.noteTime = typeof body.note_time === "string" && body.note_time ? body.note_time : null;
        }
        if (body.visibility !== undefined) {
            if (!isValidCalendarNoteVisibility(body.visibility)) return NextResponse.json({ error: "Geçersiz görünürlük." }, { status: 400 });
            if (result.row.owner_id === null && body.visibility === "personal") {
                return NextResponse.json({ error: "Sahipsiz eski not kişisel yapılamaz." }, { status: 400 });
            }
            patch.visibility = body.visibility;
        }
        if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Güncellenecek alan yok." }, { status: 400 });

        const updated = await dbUpdateCalendarNote(id, patch);
        return NextResponse.json(mapCalendarNote(updated, result.actor));
    } catch (err) {
        console.error("[PATCH /api/calendar-notes/[id]]", err);
        return NextResponse.json({ error: "Takvim notu güncellenemedi." }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const result = await context(req, id);
        if ("response" in result) return result.response;
        if (!canManageCalendarNote(result.row, result.actor)) return notFound();
        await dbDeleteCalendarNote(id);
        return NextResponse.json({ success: true });
    } catch (err) {
        console.error("[DELETE /api/calendar-notes/[id]]", err);
        return NextResponse.json({ error: "Takvim notu silinemedi." }, { status: 500 });
    }
}
