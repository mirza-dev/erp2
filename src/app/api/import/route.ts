import { NextRequest, NextResponse } from "next/server";
import { dbCreateBatch, dbListBatches } from "@/lib/supabase/import";

// GET /api/import — batch listesi
export async function GET() {
    try {
        const batches = await dbListBatches();
        return NextResponse.json(batches);
    } catch (err) {
        console.error("[GET /api/import]", err);
        return NextResponse.json({ error: "Batch listesi alınamadı." }, { status: 500 });
    }
}

// POST /api/import — yeni batch oluştur
// Body: { file_name?, file_size?, created_by? }
export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));
        const batch = await dbCreateBatch({
            file_name: body.file_name,
            file_size: body.file_size,
            created_by: body.created_by,
        });
        return NextResponse.json(batch, { status: 201 });
    } catch (err) {
        console.error("[POST /api/import]", err);
        return NextResponse.json({ error: "Batch oluşturulamadı." }, { status: 500 });
    }
}
