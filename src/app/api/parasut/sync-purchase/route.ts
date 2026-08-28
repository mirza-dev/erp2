import { NextRequest, NextResponse } from "next/server";
import { serviceSyncPurchaseOrderToParasut } from "@/lib/services/parasut-purchase-service";
import { safeParseJson } from "@/lib/api-error";
import { requirePermission } from "@/lib/auth/role-guard";

// POST /api/parasut/sync-purchase — tek PO'yu Paraşüt'e alış faturası olarak gönder.
// Satıştaki /api/parasut/sync'in alış ikizi; aynı RBAC (manage_parasut).
// Body: { po_id: string }
export async function POST(req: NextRequest) {
    try {
        const guard = await requirePermission(req, "manage_parasut");
        if (guard) return guard;

        const parsed = await safeParseJson(req);
        if (!parsed.ok) return parsed.response;
        const { po_id } = parsed.data as { po_id?: string };
        if (!po_id) {
            return NextResponse.json({ error: "'po_id' zorunludur." }, { status: 400 });
        }

        const result = await serviceSyncPurchaseOrderToParasut(po_id);
        if (!result.success) {
            return NextResponse.json({ error: result.error, skipped: result.skipped, reason: result.reason }, { status: 400 });
        }
        return NextResponse.json(result);
    } catch (err) {
        console.error("[POST /api/parasut/sync-purchase]", err);
        return NextResponse.json({ error: "Alış faturası senkronu başarısız." }, { status: 500 });
    }
}
