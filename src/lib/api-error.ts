import { NextResponse } from "next/server";
import { ConfigError } from "@/lib/supabase/service";

/**
 * Central error handler for API routes.
 *
 * ConfigError (missing env var)  → HTTP 503 + code: "CONFIG_ERROR"
 *   — signals a deployment/config issue, not a bug. Check /api/health.
 *
 * Numeric overflow (DB)          → HTTP 400 + generic message
 *
 * Everything else               → HTTP 500
 *   — unexpected runtime or DB error.
 *   — In production: generic message (internal details logged only).
 *   — In development: full error message returned.
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

    // DB numeric overflow — 400 (validation, not server error)
    if (err instanceof Error && err.message.includes("numeric field overflow")) {
        console.error(`[${label}] numeric overflow`, err.message);
        return NextResponse.json({ error: "Sayısal değer çok büyük." }, { status: 400 });
    }

    const internalMsg = err instanceof Error ? err.message : String(err);
    console.error(`[${label}]`, internalMsg);

    // Production: iç hata mesajı sızmasın
    const isProduction = process.env.NODE_ENV === "production";
    const clientMsg = isProduction ? "Beklenmeyen bir hata oluştu." : internalMsg;

    return NextResponse.json({ error: clientMsg }, { status: 500 });
}

/**
 * JSON parse hatalarını 400 olarak yakalar.
 * Tüm POST/PATCH route'larda `await req.json()` yerine kullan.
 *
 * @example
 * const parsed = await safeParseJson(req);
 * if (!parsed.ok) return parsed.response;
 * const body = parsed.data as MyType;
 */
export async function safeParseJson(
    request: Request
): Promise<{ ok: true; data: unknown } | { ok: false; response: NextResponse }> {
    let data: unknown;
    try {
        data = await request.json();
    } catch {
        return {
            ok: false,
            response: NextResponse.json({ error: "Geçersiz JSON." }, { status: 400 }),
        };
    }
    if (data === null || data === undefined) {
        return {
            ok: false,
            response: NextResponse.json({ error: "Boş istek gövdesi." }, { status: 400 }),
        };
    }
    return { ok: true, data };
}

/**
 * String alanlarında boyut sınırı kontrolü.
 * Nesnenin tüm string değerlerini maxLength ile karşılaştırır.
 * İhlal varsa Türkçe hata mesajı döner, yoksa null.
 */
const MAX_STRING_LENGTH = 10_000;

export function validateStringLengths(
    obj: Record<string, unknown>,
    maxLength = MAX_STRING_LENGTH
): string | null {
    for (const [key, val] of Object.entries(obj)) {
        if (typeof val === "string" && val.length > maxLength) {
            return `${key} alanı çok uzun (maksimum ${maxLength} karakter).`;
        }
    }
    return null;
}
