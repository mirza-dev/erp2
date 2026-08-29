/**
 * Request / correlation ID (Developer Console §13).
 *
 * Bu projede hiç yoktu — bir hata ile o hataya yol açan isteğin logları
 * arasında bağ kurmanın yolu yoktu. Şimdi zincir şöyle:
 *
 *   proxy.ts  → her istekte ID üretir, İSTEK başlığına yazar (handler görsün)
 *               ve YANIT başlığına basar (tarayıcı/kullanıcı görsün)
 *   handler   → hiçbir şey yapmaz; imzası değişmez
 *   record.ts → `readRequestId()` ile aynı ID'yi okur ve kayda işler
 *
 * Kritik tasarım kararı: ID'yi route imzalarına parametre olarak GEÇİRMİYORUZ.
 * 148 route'un hiçbirine dokunulmaması şartı (§21) ancak başlık üzerinden
 * taşımakla sağlanır.
 */

export const REQUEST_ID_HEADER = "x-request-id";

/** 16 hex karakter — kısa, kopyalanabilir, çakışma olasılığı ihmal edilebilir. */
export function newRequestId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    }
    // Insecure/eski context fallback — utils.ts:47'deki aynı gerekçe.
    return Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
}

/** Dışarıdan gelen ID'yi kabul etmeden önce biçim doğrulaması (enjeksiyon kapısı). */
export function isValidRequestId(value: string | null | undefined): boolean {
    return typeof value === "string" && /^[a-zA-Z0-9_-]{8,64}$/.test(value);
}

/**
 * Geçerli isteğin ID'si. `next/headers` yalnız istek kapsamında çalışır ve
 * modül seviyesinde import edilirse test ortamını kırar → dinamik import +
 * try/catch. Bulunamazsa null; telemetri yine yazılır, yalnız korelasyon olmaz.
 */
export async function readRequestId(): Promise<string | null> {
    try {
        const { headers } = await import("next/headers");
        const value = (await headers()).get(REQUEST_ID_HEADER);
        return isValidRequestId(value) ? value : null;
    } catch {
        return null;
    }
}

/** Aynı kaynaktan istek başlıklarından tek bir alan okur (User-Agent vb.). */
export async function readRequestHeader(name: string): Promise<string | null> {
    try {
        const { headers } = await import("next/headers");
        return (await headers()).get(name);
    } catch {
        return null;
    }
}
