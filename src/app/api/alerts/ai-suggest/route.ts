import { NextRequest, NextResponse } from "next/server";
import { serviceGenerateAiAlerts } from "@/lib/services/alert-service";
import { handleApiError } from "@/lib/api-error";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveAuthContext, requirePermissionFor } from "@/lib/auth/role-guard";

/**
 * POST /api/alerts/ai-suggest
 *
 * Auth: CRON_SECRET Bearer token (zamanlanmış koşu) **VEYA** oturum + `view_alerts`
 * (Uyarılar sayfasındaki "AI Öner" butonu).
 *
 * 2026-08-24 — ÖNCEDEN YALNIZ CRON'DU ve bu, AI yüzeyini fiilen ölü bırakıyordu:
 * uç hem `proxy.ts` CRON_PATHS'te hem route içinde `requireCronSecret` ile
 * korunuyordu, tarayıcı Bearer token göndermediği için "AI Öner" her tıkta 401
 * alıyor, UI da bunu "AI kullanılamıyor" durumuna çeviriyordu. Kardeş uç
 * `/api/alerts/scan` bilinçli olarak çift kimlikli yapılmıştı ("Tara" butonu
 * çalışsın diye); bu uç aynı muameleyi hiç görmemişti.
 *
 * Scan'den bir tık sıkı: yalnız oturum değil `view_alerts` de aranır — bu çağrı
 * dış API'ye para harcar ve alert yazar.
 */
export async function POST(req?: NextRequest) {
    // `req` opsiyonel: unit testler POST() ile çağırır (stock-risk guardAiRoute
    // kalıbı); prod'da Next her zaman geçirir.
    if (req) {
        const secret = process.env.CRON_SECRET;
        const hasCronSecret = !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
        if (!hasCronSecret) {
            const ctx = await resolveAuthContext();
            if (!ctx.user) {
                return NextResponse.json({ error: "Yetkisiz erişim." }, { status: 401 });
            }
            const guard = requirePermissionFor(ctx, "view_alerts");
            if (guard) return guard;
        }
    }

    const supabase = createServiceClient();

    // Advisory lock: only one AI generation at a time
    const { data: locked } = await supabase.rpc("try_acquire_ai_suggest_lock");
    if (!locked) {
        return NextResponse.json(
            { error: "AI analiz zaten devam ediyor." },
            { status: 409 }
        );
    }

    try {
        const result = await serviceGenerateAiAlerts();
        return NextResponse.json(result);
    } catch (err) {
        return handleApiError(err, "AI öneri oluşturulamadı.");
    } finally {
        try { await supabase.rpc("release_ai_suggest_lock"); } catch { /* ignore */ }
    }
}
