import { NextRequest, NextResponse } from "next/server";
import { serviceConfirmBatch } from "@/lib/services/import-service";

// POST /api/import/[batchId]/confirm
// Tüm confirmed/pending draftları gerçek entity'lere merge eder (domain-rules §9.2)
export async function POST(
    _req: NextRequest,
    { params }: { params: Promise<{ batchId: string }> }
) {
    try {
        const { batchId } = await params;
        const result = await serviceConfirmBatch(batchId);
        return NextResponse.json(result);
    } catch (err) {
        console.error("[POST /api/import/[batchId]/confirm]", err);
        const msg = err instanceof Error ? err.message : "Batch onaylanamadı.";
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
