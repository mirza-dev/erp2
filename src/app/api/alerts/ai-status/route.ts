import { NextRequest, NextResponse } from "next/server";
import { dbGetLastAiRunAt } from "@/lib/supabase/ai-runs";
import { isAIAvailable } from "@/lib/services/ai-service";
import { handleApiError } from "@/lib/api-error";
import { resolveAuthContext, requirePermissionFor } from "@/lib/auth/role-guard";

/**
 * GET /api/alerts/ai-status
 *
 * Uyarılar sayfasının AI sekmesi için hafif durum ucu: AI yapılandırılmış mı ve
 * son BAŞARILI analiz ne zaman koştu.
 *
 * 2026-08-24: AI bulgu üretimi iki aydır hiç koşmamıştı (`alert_findings` son
 * koşu 2026-06-24) ve kullanıcı bunu hiçbir ekrandan göremiyordu — boş bir sekme
 * "AI bir şey bulamadı" gibi görünüyordu. Bu uç o boşluğu kapatır; aynı değer
 * sayfanın "24 saatten eskiyse bir kez tetikle" kararının da girdisidir.
 */
export async function GET(req: NextRequest) {
    try {
        const ctx = await resolveAuthContext();
        const guard = requirePermissionFor(ctx, "view_alerts");
        if (guard) return guard;
        void req;

        return NextResponse.json({
            aiAvailable: isAIAvailable(),
            lastRunAt: await dbGetLastAiRunAt("alert_findings"),
        });
    } catch (err) {
        return handleApiError(err, "GET /api/alerts/ai-status");
    }
}
