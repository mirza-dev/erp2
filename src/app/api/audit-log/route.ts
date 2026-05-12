import { NextRequest, NextResponse } from "next/server";
import { dbListAuditLog } from "@/lib/supabase/audit-log";
import { handleApiError } from "@/lib/api-error";

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

        const entries = await dbListAuditLog(entityType, entityId);
        return NextResponse.json(entries);
    } catch (err) {
        return handleApiError(err, "GET /api/audit-log");
    }
}
