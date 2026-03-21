import { NextRequest, NextResponse } from "next/server";
import { dbListSyncLogs } from "@/lib/supabase/sync-log";

// GET /api/parasut/logs?entity_type=sales_order&limit=50
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = req.nextUrl;
        const entityType = searchParams.get("entity_type") ?? undefined;
        const limit = parseInt(searchParams.get("limit") ?? "50", 10);
        const logs = await dbListSyncLogs(entityType, limit);
        return NextResponse.json(logs);
    } catch (err) {
        console.error("[GET /api/parasut/logs]", err);
        return NextResponse.json({ error: "Loglar alınamadı." }, { status: 500 });
    }
}
