import { NextRequest, NextResponse } from "next/server";
import { dbGetBatch, dbUpdateBatchStatus, dbDeleteBatch } from "@/lib/supabase/import";
import type { ImportBatchStatus } from "@/lib/database.types";
import { safeParseJson } from "@/lib/api-error";

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

// DELETE /api/import/[batchId]
// Called when user abandons the column-mapping step and goes back to sheet-select.
export async function DELETE(
    _req: NextRequest,
    { params }: { params: Promise<{ batchId: string }> }
) {
    try {
        const { batchId } = await params;
        await dbDeleteBatch(batchId);
        return new NextResponse(null, { status: 204 });
    } catch (err) {
        console.error("[DELETE /api/import/[batchId]]", err);
        return NextResponse.json({ error: "Batch silinemedi." }, { status: 500 });
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
        const safeParsed = await safeParseJson(req);
        if (!safeParsed.ok) return safeParsed.response;
        const { status } = safeParsed.data as { status: ImportBatchStatus };
        if (!status) return NextResponse.json({ error: "'status' zorunludur." }, { status: 400 });

        const updated = await dbUpdateBatchStatus(batchId, status);
        return NextResponse.json(updated);
    } catch (err) {
        console.error("[PATCH /api/import/[batchId]]", err);
        return NextResponse.json({ error: "Batch güncellenemedi." }, { status: 500 });
    }
}
