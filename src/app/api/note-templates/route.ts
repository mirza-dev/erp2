import { NextRequest, NextResponse } from "next/server";
import {
    dbListNoteTemplates,
    dbCreateNoteTemplate,
    isValidNoteTemplateKind,
} from "@/lib/supabase/note-templates";
import { mapNoteTemplate } from "@/lib/api-mappers";
import { handleApiError, safeParseJson, validateStringLengths } from "@/lib/api-error";
import { requireRole } from "@/lib/auth/role-guard";
import type { NoteTemplateKind } from "@/lib/database.types";

export const dynamic = "force-dynamic";

// GET /api/note-templates?kind=notes|delivery|payment|general
// Authenticated kullanıcıya açık (satış kullanıcısı QuoteForm picker'ında tüketir;
// requireRole YOK). Yalnız aktif şablonlar döner.
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const kindParam = searchParams.get("kind");
        // ?kind= verildiyse geçerli olmalı: typo (?kind=delivary) sessizce TÜM
        // şablonları döndürmesin (fail-closed). Param yoksa filtresiz tam liste.
        if (kindParam !== null && !isValidNoteTemplateKind(kindParam)) {
            return NextResponse.json({ error: "Geçersiz şablon türü." }, { status: 400 });
        }
        const kind = kindParam !== null ? kindParam as NoteTemplateKind : undefined;

        const rows = await dbListNoteTemplates({ kind });
        return NextResponse.json(rows.map(mapNoteTemplate));
    } catch (err) {
        return handleApiError(err, "GET /api/note-templates");
    }
}

// POST /api/note-templates  (admin only)
export async function POST(req: NextRequest) {
    const forbidden = await requireRole(req, ["admin"]);
    if (forbidden) return forbidden;

    try {
        const parsed = await safeParseJson(req);
        if (!parsed.ok) return parsed.response;

        const body = parsed.data as Record<string, unknown>;
        const lengthErr = validateStringLengths(body);
        if (lengthErr) return NextResponse.json({ error: lengthErr }, { status: 400 });

        if (!isValidNoteTemplateKind(body.kind)) {
            return NextResponse.json({ error: "Geçersiz şablon türü." }, { status: 400 });
        }

        const created = await dbCreateNoteTemplate({
            kind: body.kind,
            title: String(body.title ?? "").trim(),
            body: String(body.body ?? ""),
            sort_order: body.sort_order != null ? Number(body.sort_order) : undefined,
        });

        return NextResponse.json(mapNoteTemplate(created), { status: 201 });
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
        return handleApiError(err, "POST /api/note-templates");
    }
}
