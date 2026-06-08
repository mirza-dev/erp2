import { NextRequest, NextResponse } from "next/server";
import { serviceListAlerts } from "@/lib/services/alert-service";
import { enrichAlertsWithDueMeta } from "@/lib/services/alert-due-dates";
import type { AlertStatus, AlertSeverity, AlertType } from "@/lib/database.types";

// GET /api/alerts/calendar — /api/alerts ile aynı liste, her alert'e
// due_date/due_label/order_code (order-entity alertleri için) eklenmiş hâli.
// Takvim görünümü tek zengin fetch alır; mevcut /api/alerts sözleşmesine dokunulmaz.
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = req.nextUrl;
        const alerts = await serviceListAlerts({
            status:      (searchParams.get("status") as AlertStatus)     ?? undefined,
            severity:    (searchParams.get("severity") as AlertSeverity) ?? undefined,
            type:        (searchParams.get("type") as AlertType)         ?? undefined,
            entity_type: searchParams.get("entity_type") ?? undefined,
            entity_id:   searchParams.get("entity_id")   ?? undefined,
        });
        const enriched = await enrichAlertsWithDueMeta(alerts);
        return NextResponse.json(enriched);
    } catch (err) {
        console.error("[GET /api/alerts/calendar]", err);
        return NextResponse.json({ error: "Alertler alınamadı." }, { status: 500 });
    }
}
