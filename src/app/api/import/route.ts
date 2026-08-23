import { NextRequest, NextResponse } from "next/server";
import { dbCreateBatch, dbListBatches } from "@/lib/supabase/import";
import { getCurrentUserId, requirePermission } from "@/lib/auth/role-guard";

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
// Body: { file_name?, file_size? }
// NOT: created_by SUNUCU-OTORİTER — oturum kullanıcısından alınır, body'den DEĞİL.
// Body'den okumak attribution sahteciliğine açıktı (audit/non-repudiation; orders
// POST + vendors D1 kalıbı). manage_import rol-gated olsa da damga güvenilmeli.
export async function POST(req: NextRequest) {
    try {
        const guard = await requirePermission(req, "manage_import");
        if (guard) return guard;

        const body = await req.json().catch(() => ({}));
        const batch = await dbCreateBatch({
            file_name: body.file_name,
            file_size: body.file_size,
            created_by: (await getCurrentUserId()) ?? undefined,
        });
        return NextResponse.json(batch, { status: 201 });
    } catch (err) {
        console.error("[POST /api/import]", err);
        return NextResponse.json({ error: "Batch oluşturulamadı." }, { status: 500 });
    }
}
