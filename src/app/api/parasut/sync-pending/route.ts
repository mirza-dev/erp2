import { NextRequest, NextResponse } from "next/server";
import { serviceSyncAllPending } from "@/lib/services/parasut-service";
import { handleApiError } from "@/lib/api-error";
import { requirePermission } from "@/lib/auth/role-guard";

// POST /api/parasut/sync-pending
// Kullanıcı-tetiklemeli toplu sync (Manuel Sync butonu). `sync-all` CRON-only
// (CRON_SECRET Bearer) olduğundan tarayıcıdan çağrılamaz — bu uç session +
// RBAC (manage_parasut) ile aynı işi authenticated kullanıcıya açar.
// Per-order `/api/parasut/sync` paterninin toplu aynası.
export async function POST(req: NextRequest) {
    try {
        const guard = await requirePermission(req, "manage_parasut");
        if (guard) return guard;

        const result = await serviceSyncAllPending();
        return NextResponse.json(result);
    } catch (err) {
        return handleApiError(err, "POST /api/parasut/sync-pending");
    }
}
