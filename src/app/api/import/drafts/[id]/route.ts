import { NextRequest, NextResponse } from "next/server";
import { dbGetDraft, dbUpdateDraft } from "@/lib/supabase/import";
import type { ImportDraftStatus } from "@/lib/database.types";
import { safeParseJson } from "@/lib/api-error";

// GET /api/import/drafts/[id]
export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const draft = await dbGetDraft(id);
        if (!draft) return NextResponse.json({ error: "Draft bulunamadı." }, { status: 404 });
        return NextResponse.json(draft);
    } catch (err) {
        console.error("[GET /api/import/drafts/[id]]", err);
        return NextResponse.json({ error: "Draft alınamadı." }, { status: 500 });
    }
}

// PATCH /api/import/drafts/[id]
// Body: { status?: "confirmed"|"rejected", user_corrections?: Record<string, unknown> }
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const safeParsed = await safeParseJson(req);
        if (!safeParsed.ok) return safeParsed.response;
        const { status, user_corrections } = safeParsed.data as {
            status?: ImportDraftStatus;
            user_corrections?: Record<string, unknown>;
        };

        const validStatuses: ImportDraftStatus[] = ["confirmed", "rejected", "pending"];
        if (status && !validStatuses.includes(status)) {
            return NextResponse.json({ error: `Geçersiz status: ${status}` }, { status: 400 });
        }

        const updated = await dbUpdateDraft(id, { status, user_corrections });
        return NextResponse.json(updated);
    } catch (err) {
        console.error("[PATCH /api/import/drafts/[id]]", err);
        return NextResponse.json({ error: "Draft güncellenemedi." }, { status: 500 });
    }
}
