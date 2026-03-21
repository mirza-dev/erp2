import { NextRequest, NextResponse } from "next/server";
import { dbListDrafts } from "@/lib/supabase/import";
import { serviceAddDraftsToBatch } from "@/lib/services/import-service";

// GET /api/import/[batchId]/drafts
export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ batchId: string }> }
) {
    try {
        const { batchId } = await params;
        const drafts = await dbListDrafts(batchId);
        return NextResponse.json(drafts);
    } catch (err) {
        console.error("[GET /api/import/[batchId]/drafts]", err);
        return NextResponse.json({ error: "Draftlar alınamadı." }, { status: 500 });
    }
}

// POST /api/import/[batchId]/drafts
// Body: array of { entity_type, parsed_data, raw_data?, confidence?, ai_reason? }
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ batchId: string }> }
) {
    try {
        const { batchId } = await params;
        const body = await req.json();
        const drafts = Array.isArray(body) ? body : [body];

        if (drafts.length === 0) {
            return NextResponse.json({ error: "En az bir draft gerekli." }, { status: 400 });
        }

        const created = await serviceAddDraftsToBatch(batchId, drafts);
        return NextResponse.json(created, { status: 201 });
    } catch (err) {
        console.error("[POST /api/import/[batchId]/drafts]", err);
        const msg = err instanceof Error ? err.message : "Draftlar eklenemedi.";
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
