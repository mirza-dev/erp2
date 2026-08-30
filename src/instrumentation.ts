import * as Sentry from "@sentry/nextjs";
import type { InstrumentationOnRequestError } from "next/dist/server/instrumentation/types";

/**
 * Sunucu/edge çalışma zamanı kancaları: Sentry init (`register`) + global hata
 * yakalayıcı (`onRequestError`).
 *
 * ── `register()` — 2026-08 Y2 DÜZELTMESİ ────────────────────────────────────
 * Bu dosyanın ilk hâli `register()` export ETMİYORDU; gerekçe olarak "Sentry
 * kök `sentry.{server,edge}.config.ts` üzerinden kuruluyor ve ÇALIŞIYOR"
 * yazıyordu. **Bu önerme yanlıştı.** `@sentry/nextjs` v10'da kök server/edge
 * config dosyaları otomatik YÜKLENMEZ — SDK'nın kendi kodu bunu söylüyor
 * (`config/webpack.js` `warnAboutDeprecatedConfigFiles`: "`Sentry.init` must be
 * called inside of an instrumentation file"). Yalnız `sentry.client.config.ts`
 * webpack tarafından istemci entry'sine enjekte edilir; sunucu/edge'in
 * karşılığı yoktur.
 *
 * Sonuç: sunucu Sentry'si hiç başlamıyordu ve `captureRequestError` no-op'tu.
 * Daha kötüsü, bu dosya `@sentry/` içerdiği için SDK'nın durumu bildiren build
 * uyarısı da BASTIRILIYORDU — tek otomatik sinyal kayboluyordu.
 *
 * Doğrusu: init'i runtime'a göre buradan yükle. Kök config dosyaları tek
 * kaynak olarak KALIR (DSN, environment, tracesSampleRate, `beforeSend` PII
 * scrub) — burada yalnız import ediliyorlar, mantık kopyalanmıyor.
 *
 * ── `onRequestError` ────────────────────────────────────────────────────────
 * `handleApiError` çağırmayan route'lar + RSC/sayfa render hataları hiçbir
 * route helper'ından geçmez; bu kanca onları yakalar.
 *
 * DİKKAT (2026-08 K2): kanca YALNIZ hata Next'in sınırına ULAŞIRSA çalışır.
 * Kendi `catch`'inde yanıt döndüren bir route hatayı yutar ve buraya HİÇ
 * düşmez. Bu yüzden 5xx döndüren her catch `handleApiError`/`captureRouteError`
 * çağırmak zorunda — `src/__tests__/gate/route-error-coverage.test.ts` kilitler.
 */
export async function register(): Promise<void> {
    if (process.env.NEXT_RUNTIME === "nodejs") {
        await import("../sentry.server.config");
    } else if (process.env.NEXT_RUNTIME === "edge") {
        await import("../sentry.edge.config");
    }
}
export const onRequestError: InstrumentationOnRequestError = async (
    error,
    errorRequest,
    errorContext,
) => {
    // 1) Mevcut davranış: Sentry'ye bildir. Telemetri kaydı başarısız olsa bile
    //    dış alarm katmanı çalışmaya devam etsin diye ÖNCE bu.
    try {
        Sentry.captureRequestError(error, errorRequest, errorContext);
    } catch {
        // Sentry init edilmemişse (DSN yok) sessiz geç — akış bozulmasın.
    }

    // 2) Yerel kayıt. `recordError` throw etmez; yine de import hatasına karşı
    //    sarmalanır — bu kanca hiçbir koşulda isteği etkilememeli.
    try {
        const { recordError } = await import("@/lib/telemetry/record");
        const { REQUEST_ID_HEADER } = await import("@/lib/telemetry/request-id");

        await recordError({
            error,
            endpoint: errorRequest.path,
            method: errorRequest.method,
            // `onRequestError` istek kapsamı DIŞINDA çalışır (`next/headers`
            // okunamaz) → başlıkları kendi taşıdığı nesneden alıyoruz.
            requestId: headerValue(errorRequest.headers, REQUEST_ID_HEADER),
            userAgent: headerValue(errorRequest.headers, "user-agent"),
            context: {
                routerKind: errorContext.routerKind,
                routePath: errorContext.routePath,
                routeType: errorContext.routeType,
            },
        });
    } catch {
        // Yutulur — bu kanca ERP akışının parçası değil.
    }
};

/** Next başlıkları `string | string[] | undefined` taşır; ilk değeri alır. */
function headerValue(
    headers: NodeJS.Dict<string | string[]>,
    name: string,
): string | null {
    const value = headers[name] ?? headers[name.toLowerCase()];
    if (Array.isArray(value)) return value[0] ?? null;
    return value ?? null;
}
