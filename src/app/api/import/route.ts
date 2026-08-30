import { NextRequest, NextResponse } from "next/server";
import { dbCreateBatch, dbListBatches } from "@/lib/supabase/import";
import { getCurrentUserId, requirePermission } from "@/lib/auth/role-guard";
import { handleApiError } from "@/lib/api-error";

// GET /api/import — batch listesi
export async function GET(req: NextRequest) {
    try {
        const guard = await requirePermission(req, "view_import");
        if (guard) return guard;
        const batches = await dbListBatches();
        return NextResponse.json(batches);
    } catch (err) {
        return handleApiError(err, "GET /api/import", { clientMessage: "Batch listesi alınamadı." });
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
        return handleApiError(err, "POST /api/import", { clientMessage: "Batch oluşturulamadı." });
    }
}
