import { NextRequest, NextResponse } from "next/server";
import { serviceListAlerts } from "@/lib/services/alert-service";
import type { AlertStatus, AlertSeverity, AlertType } from "@/lib/database.types";

// GET /api/alerts?status=open&severity=critical&type=stock_critical
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = req.nextUrl;
        // Perf Faz 5: UI liste görünümü dar kolon seti + explicit limit alır —
        // eski select("*") limitsiz ~479KB taşıyordu (ai_inputs_summary/ai_reason
        // listede hiç okunmuyor; OpenAlert + due_date/created_by alanları yeter).
        // Scan/dedup yolları dbListAlerts'i DEFAULT (tam satır) çağırmaya devam eder.
        const alerts = await serviceListAlerts({
            status:      (searchParams.get("status") as AlertStatus)   ?? undefined,
            severity:    (searchParams.get("severity") as AlertSeverity) ?? undefined,
            type:        (searchParams.get("type") as AlertType)        ?? undefined,
            entity_type: searchParams.get("entity_type") ?? undefined,
            entity_id:   searchParams.get("entity_id")   ?? undefined,
        }, {
            limit: 500,
            columns: "id,type,severity,status,title,description,source,ai_confidence,created_at,entity_type,entity_id,due_date,created_by,resolved_at",
        });
        return NextResponse.json(alerts);
    } catch (err) {
        console.error("[GET /api/alerts]", err);
        return NextResponse.json({ error: "Alertler alınamadı." }, { status: 500 });
    }
}
