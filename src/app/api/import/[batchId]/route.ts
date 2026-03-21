import { NextRequest, NextResponse } from "next/server";
import { dbGetBatch, dbUpdateBatchStatus } from "@/lib/supabase/import";
import type { ImportBatchStatus } from "@/lib/database.types";

// GET /api/import/[batchId]
export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ batchId: string }> }
) {
    try {
        const { batchId } = await params;
        const batch = await dbGetBatch(batchId);
        if (!batch) return NextResponse.json({ error: "Batch bulunamadı." }, { status: 404 });
        return NextResponse.json(batch);
    } catch (err) {
        console.error("[GET /api/import/[batchId]]", err);
        return NextResponse.json({ error: "Batch alınamadı." }, { status: 500 });
    }
}

// PATCH /api/import/[batchId]
// Body: { status: "processing" | "review" | "failed" }
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ batchId: string }> }
) {
    try {
        const { batchId } = await params;
        const { status } = await req.json() as { status: ImportBatchStatus };
        if (!status) return NextResponse.json({ error: "'status' zorunludur." }, { status: 400 });

        const updated = await dbUpdateBatchStatus(batchId, status);
        return NextResponse.json(updated);
    } catch (err) {
        console.error("[PATCH /api/import/[batchId]]", err);
        return NextResponse.json({ error: "Batch güncellenemedi." }, { status: 500 });
    }
}
