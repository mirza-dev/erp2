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

    // Supabase/Postgres hataları `Error` DEĞİL düz nesnedir ({message, details,
    // hint, code}) → String(err) "[object Object]" verir ve gerçek neden kaybolur.
    // Mesajı + SQLSTATE kodunu çıkar; kod (ör. 22P02/42883/P0001) hassas değildir,
    // teşhis için prod yanıtına da konur (mesaj prod'da gizli kalır).
    const { msg: internalMsg, code: pgCode } = describeError(err);
    console.error(`[${label}]`, pgCode ? `[${pgCode}]` : "", internalMsg);

    // Production: iç hata mesajı sızmasın (yalnız güvenli SQLSTATE kodu)
    const isProduction = process.env.NODE_ENV === "production";
    const clientMsg = isProduction ? "Beklenmeyen bir hata oluştu." : internalMsg;

    return NextResponse.json(
        pgCode ? { error: clientMsg, code: pgCode } : { error: clientMsg },
        { status: 500 },
    );
}

/**
 * Hata nesnesinden okunur mesaj + (varsa) SQLSTATE kodu çıkarır.
 * Error → message; Supabase PostgrestError gibi düz nesne → message|details|hint
 * birleşimi + code; aksi halde String(err).
 */
function describeError(err: unknown): { msg: string; code?: string } {
    if (err instanceof Error) return { msg: err.message };
    if (err && typeof err === "object") {
        const e = err as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
        const parts = [e.message, e.details, e.hint]
            .filter((p): p is string => typeof p === "string" && p.length > 0);
        const code = typeof e.code === "string" && e.code.length > 0 ? e.code : undefined;
        return { msg: parts.length > 0 ? parts.join(" | ") : JSON.stringify(err), code };
    }
    return { msg: String(err) };
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
 * String alanlarında boyut sınırı kontrolü — saf implementasyon
 * `@/lib/validation/string-lengths`'e taşındı (request-ip.ts precedent'i).
 * Geriye uyumluluk için buradan re-export edilir.
 */
export { validateStringLengths, MAX_STRING_LENGTH } from "@/lib/validation/string-lengths";
