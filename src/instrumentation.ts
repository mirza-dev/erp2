import * as Sentry from "@sentry/nextjs";
import type { InstrumentationOnRequestError } from "next/dist/server/instrumentation/types";

/**
 * Sunucu hatalarının GLOBAL kancası (Developer Console §21).
 *
 * Neden gerekli: `handleApiError` 148 route'un 115'ini kapsıyor, ama kalan 33'ü
 * (alerts, import, parasut, inventory, calendar-notes…) kendi try/catch'ini
 * yazıp hatayı yutuyor — oralara merkezi bir kanca olmadan ULAŞILAMAZ. Ayrıca
 * RSC/sayfa render hataları hiçbir route helper'ından geçmez. Next.js'in
 * `onRequestError` kancası ikisini de yakalar.
 *
 * `register()` BİLİNÇLİ OLARAK EXPORT EDİLMEZ: Sentry bu projede kök
 * `sentry.{server,client,edge}.config.ts` üzerinden kuruluyor ve çalışıyor.
 * Buraya bir `register()` koymak o kurulumu üstlenmek/ikiye bölmek olurdu.
 * Bu dosya yalnız hata kancasını ekler; Sentry'nin kendi raporlaması
 * `captureRequestError` ile AYNEN korunur ve önce çalışır.
 */
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
