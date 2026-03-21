import { NextResponse } from "next/server";
import { ConfigError } from "@/lib/supabase/service";

/**
 * Central error handler for API routes.
 *
 * ConfigError (missing env var)  → HTTP 503 + code: "CONFIG_ERROR"
 *   — signals a deployment/config issue, not a bug. Check /api/health.
 *
 * Everything else               → HTTP 500
 *   — unexpected runtime or DB error.
 */
export function handleApiError(err: unknown, label: string): NextResponse {
    if (err instanceof ConfigError) {
        console.error(`[CONFIG_ERROR] ${label}`, err.message);
        return NextResponse.json(
            {
                error: "Sunucu yapılandırma hatası. Ortam değişkenlerini kontrol edin.",
                code: "CONFIG_ERROR",
            },
            { status: 503 }
        );
    }
    console.error(`[${label}]`, err);
    const msg = err instanceof Error ? err.message : "Beklenmeyen bir hata oluştu.";
    return NextResponse.json({ error: msg }, { status: 500 });
}
