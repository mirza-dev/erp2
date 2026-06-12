import { NextRequest, NextResponse } from "next/server";
import { dbListAuditLog } from "@/lib/supabase/audit-log";
import { handleApiError } from "@/lib/api-error";
import {
    resolveAuthContext,
    requirePermissionFor,
    requireRoleFor,
} from "@/lib/auth/role-guard";
import type { Permission } from "@/lib/auth/permissions";

// Denetim K1 (2026-06): audit_log kayıtları tam before_state/after_state taşır
// (silinen müşterinin PII'si dahil) — guard'sız erişim RBAC'ı baypas eden yan
// kapıydı. Entity-bazlı yetki: bilinen entity tipi → ilgili view_* yetkisi;
// bilinmeyen tip → yalnız admin (fail-closed; yeni tip eklenince haritaya kayıt).
const ENTITY_PERM: Record<string, Permission> = {
    purchase_order: "view_purchase_orders",
};

// GET /api/audit-log?entity_type=purchase_order&entity_id=<uuid>
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const entityType = searchParams.get("entity_type");
        const entityId = searchParams.get("entity_id");

        if (!entityType || !entityId) {
            return NextResponse.json(
                { error: "entity_type ve entity_id parametreleri zorunludur." },
                { status: 400 },
            );
        }

        const ctx = await resolveAuthContext();
        if (!ctx.user) {
            return NextResponse.json({ error: "Kimlik doğrulama gerekiyor." }, { status: 401 });
        }
        const perm = ENTITY_PERM[entityType];
        const guard = perm
            ? requirePermissionFor(ctx, perm)
            : requireRoleFor(ctx, ["admin"]);
        if (guard) return guard;

        const entries = await dbListAuditLog(entityType, entityId);
        return NextResponse.json(entries);
    } catch (err) {
        return handleApiError(err, "GET /api/audit-log");
    }
}
