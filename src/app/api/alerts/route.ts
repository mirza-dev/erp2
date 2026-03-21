import { NextRequest, NextResponse } from "next/server";
import { serviceListAlerts } from "@/lib/services/alert-service";
import type { AlertStatus, AlertSeverity, AlertType } from "@/lib/database.types";

// GET /api/alerts?status=open&severity=critical&type=stock_critical
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = req.nextUrl;
        const alerts = await serviceListAlerts({
            status:      (searchParams.get("status") as AlertStatus)   ?? undefined,
            severity:    (searchParams.get("severity") as AlertSeverity) ?? undefined,
            type:        (searchParams.get("type") as AlertType)        ?? undefined,
            entity_type: searchParams.get("entity_type") ?? undefined,
            entity_id:   searchParams.get("entity_id")   ?? undefined,
        });
        return NextResponse.json(alerts);
    } catch (err) {
        console.error("[GET /api/alerts]", err);
        return NextResponse.json({ error: "Alertler alınamadı." }, { status: 500 });
    }
}
