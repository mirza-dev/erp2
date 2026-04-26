import { NextRequest, NextResponse } from "next/server";
import { dbListSyncLogs } from "@/lib/supabase/sync-log";

// GET /api/parasut/logs?entity_type=sales_order&step=invoice&error_kind=validation&status=error&limit=50
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = req.nextUrl;
        const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10) || 50, 500);
        const logs = await dbListSyncLogs({
            entityType: searchParams.get("entity_type") ?? undefined,
            step:       searchParams.get("step") ?? undefined,
            errorKind:  searchParams.get("error_kind") ?? undefined,
            status:     searchParams.get("status") ?? undefined,
            limit,
        });
        return NextResponse.json(logs);
    } catch (err) {
        console.error("[GET /api/parasut/logs]", err);
        return NextResponse.json({ error: "Loglar alınamadı." }, { status: 500 });
    }
}
