import { NextRequest, NextResponse } from "next/server";
import { serviceListAlerts } from "@/lib/services/alert-service";
import { dbListAlertsForCalendar } from "@/lib/supabase/alerts";
import { enrichAlertsWithDueMeta } from "@/lib/services/alert-due-dates";
import type { AlertStatus, AlertSeverity, AlertType } from "@/lib/database.types";
import { resolveAuthContext, requirePermissionFor } from "@/lib/auth/role-guard";

// GET /api/alerts/calendar — takvim için zengin liste: her alert'e
// due_date/due_label/order_code (order-entity alertleri için) eklenir.
// Parametresiz çağrı (takvim sayfası) sınırlı pencere kullanır: tüm AKTİF
// uyarılar + son 6 ayın kapanmışları — limitsiz select Supabase'in 1000 satır
// tavanında SESSİZCE kesiliyordu. Query filtreli çağrılar eski sözleşmeyi korur.
export async function GET(req: NextRequest) {
    // Denetim Y1 (2026-06): view_alerts şartı — demo-dostu varyant (kullanıcı
    // kararı): anonim→viewer fallback'i bilinçli korunur ki demo gezintisi
    // (viewer'da view_alerts var) çalışsın; yetkisiz GERÇEK roller engellenir.
    const authCtx = await resolveAuthContext();
    const permGuard = requirePermissionFor(authCtx, "view_alerts");
    if (permGuard) return permGuard;

    try {
        const { searchParams } = req.nextUrl;
        const hasFilter =
            searchParams.has("status") || searchParams.has("severity") ||
            searchParams.has("type") || searchParams.has("entity_type") ||
            searchParams.has("entity_id");

        const alerts = hasFilter
            ? await serviceListAlerts({
                status:      (searchParams.get("status") as AlertStatus)     ?? undefined,
                severity:    (searchParams.get("severity") as AlertSeverity) ?? undefined,
                type:        (searchParams.get("type") as AlertType)         ?? undefined,
                entity_type: searchParams.get("entity_type") ?? undefined,
                entity_id:   searchParams.get("entity_id")   ?? undefined,
            })
            : await dbListAlertsForCalendar();
        const enriched = await enrichAlertsWithDueMeta(alerts);
        return NextResponse.json(enriched);
    } catch (err) {
        console.error("[GET /api/alerts/calendar]", err);
        return NextResponse.json({ error: "Alertler alınamadı." }, { status: 500 });
    }
}
