import { NextRequest, NextResponse } from "next/server";
import {
    dbGetNoteTemplate,
    dbUpdateNoteTemplate,
    dbDeactivateNoteTemplate,
    isValidNoteTemplateKind,
} from "@/lib/supabase/note-templates";
import { mapNoteTemplate } from "@/lib/api-mappers";
import { handleApiError, safeParseJson, validateStringLengths } from "@/lib/api-error";
import { requireRole } from "@/lib/auth/role-guard";
import type { NoteTemplateKind } from "@/lib/database.types";

// GET /api/note-templates/[id]
export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const { id } = await params;
        const row = await dbGetNoteTemplate(id);
        if (!row) return NextResponse.json({ error: "Şablon bulunamadı." }, { status: 404 });
        return NextResponse.json(mapNoteTemplate(row));
    } catch (err) {
        return handleApiError(err, "GET /api/note-templates/[id]");
    }
}

// PATCH /api/note-templates/[id]  (admin only)
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const forbidden = await requireRole(req, ["admin"]);
    if (forbidden) return forbidden;

    try {
        const { id } = await params;

        const existing = await dbGetNoteTemplate(id);
        if (!existing) return NextResponse.json({ error: "Şablon bulunamadı." }, { status: 404 });

        const parsed = await safeParseJson(req);
        if (!parsed.ok) return parsed.response;

        const body = parsed.data as Record<string, unknown>;
        const lengthErr = validateStringLengths(body);
        if (lengthErr) return NextResponse.json({ error: lengthErr }, { status: 400 });

        if (body.kind !== undefined && !isValidNoteTemplateKind(body.kind)) {
            return NextResponse.json({ error: "Geçersiz şablon türü." }, { status: 400 });
        }

        const updated = await dbUpdateNoteTemplate(id, {
            kind: body.kind !== undefined ? (body.kind as NoteTemplateKind) : undefined,
            title: body.title !== undefined ? String(body.title) : undefined,
            body: body.body !== undefined ? String(body.body) : undefined,
            sort_order: body.sort_order != null ? Number(body.sort_order) : undefined,
        });

        return NextResponse.json(mapNoteTemplate(updated));
    } catch (err) {
        if (err instanceof Error && (
            err.message.includes("zorunludur") ||
            err.message.includes("aşamaz") ||
            err.message.includes("olamaz") ||
            err.message.toLowerCase().includes("geçersiz") ||
            err.message.includes("tam sayı")
        )) {
            return NextResponse.json({ error: err.message }, { status: 400 });
        }
        if (err instanceof Error && err.message.includes("bulunamadı")) {
            return NextResponse.json({ error: err.message }, { status: 404 });
        }
        return handleApiError(err, "PATCH /api/note-templates/[id]");
    }
}

// DELETE /api/note-templates/[id]  (admin only) — soft-delete
export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const forbidden = await requireRole(req, ["admin"]);
    if (forbidden) return forbidden;

    try {
        const { id } = await params;

        const existing = await dbGetNoteTemplate(id);
        if (!existing) return NextResponse.json({ error: "Şablon bulunamadı." }, { status: 404 });

        await dbDeactivateNoteTemplate(id);
        return NextResponse.json({ success: true });
    } catch (err) {
        if (err instanceof Error && err.message.includes("zaten pasif")) {
            return NextResponse.json({ error: err.message }, { status: 409 });
        }
        if (err instanceof Error && err.message.includes("bulunamadı")) {
            return NextResponse.json({ error: err.message }, { status: 404 });
        }
        return handleApiError(err, "DELETE /api/note-templates/[id]");
    }
}
