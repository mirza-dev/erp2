import { NextRequest, NextResponse } from "next/server";
import { dbListDrafts } from "@/lib/supabase/import";

// GET /api/import/[batchId]/drafts
// (POST handler kaldırıldı — 2026-06-10 sadeleştirme: hiçbir UI tüketicisi yoktu,
// draft yaratma yalnız apply-mappings hattında.)
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
