import { NextRequest, NextResponse } from "next/server";
import { dbCreateBatch, dbListBatches } from "@/lib/supabase/import";
import { requirePermission } from "@/lib/auth/role-guard";

// GET /api/import — batch listesi
export async function GET(req: NextRequest) {
    try {
        const guard = await requirePermission(req, "view_import");
        if (guard) return guard;
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
        const guard = await requirePermission(req, "manage_import");
        if (guard) return guard;

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
