import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId, getCurrentUserPermissions, requirePermission } from "@/lib/auth/role-guard";
import { serviceConfirmBatch } from "@/lib/services/import-service";
import { revalidateTag } from "next/cache";
import { handleApiError } from "@/lib/api-error";

// POST /api/import/[batchId]/confirm
// Tüm confirmed/pending draftları gerçek entity'lere merge eder (domain-rules §9.2)
export async function POST(
    _req: NextRequest,
    { params }: { params: Promise<{ batchId: string }> }
) {
    try {
        const { batchId } = await params;

        const guard = await requirePermission(_req, "manage_import");
        if (guard) return guard;
        // Faz C — opsiyonel overwrite flag (varsayılan fill-empty). Geçersiz/eksik
        // body güvenli: yalnız body.overwrite === true ise üzerine yazar.
        let overwrite = false;
        try {
            const body = await _req.json();
            overwrite = body?.overwrite === true;
        } catch { /* body yok → fill-empty */ }
        const [actorUserId, permissions] = await Promise.all([
            getCurrentUserId(_req),
            getCurrentUserPermissions(_req),
        ]);
        const result = await serviceConfirmBatch(batchId, { actorUserId, permissions, overwrite });
        revalidateTag("products", "max");
        return NextResponse.json(result);
    } catch (err) {
        return handleApiError(err, "POST /api/import/[batchId]/confirm", {
            clientMessage: err instanceof Error ? err.message : "Batch onaylanamadı.",
        });
    }
}
