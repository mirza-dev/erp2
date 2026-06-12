import { NextRequest, NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/auth/cron-guard";
import { serviceGenerateAiAlerts } from "@/lib/services/alert-service";
import { handleApiError } from "@/lib/api-error";
import { createServiceClient } from "@/lib/supabase/service";

export async function POST(req?: NextRequest) {
    // Denetim D4 (2026-06): route-içi CRON_SECRET (derinlemesine savunma —
    // proxy CRON_PATHS tek hat olmasın). `req` opsiyonel: unit testler POST()
    // ile çağırır (stock-risk guardAiRoute kalıbı); prod'da Next her zaman geçirir.
    if (req) {
        const guard = requireCronSecret(req);
        if (guard) return guard;
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
