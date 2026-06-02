// Saf string-uzunluğu doğrulama — `api-error.ts`'ten ayrıldı (request-ip.ts
// precedent'i). api-error.ts next/server import eder + birçok testte mock'lanır;
// validation helper'ları bu saf modülden import ederek mock kırılganlığından kaçınır.
// `api-error.ts` geriye uyumluluk için bunu re-export eder.

export const MAX_STRING_LENGTH = 10_000;

/**
 * Gövdedeki tüm string alanların uzunluğunu (nested array/object dahil, recursive)
 * doğrular. İhlal varsa Türkçe hata mesajı, yoksa null döner.
 */
export function validateStringLengths(
    obj: Record<string, unknown>,
    maxLength = MAX_STRING_LENGTH
): string | null {
    for (const [key, val] of Object.entries(obj)) {
        if (typeof val === "string" && val.length > maxLength) {
            return `${key} alanı çok uzun (maksimum ${maxLength} karakter).`;
        }
        if (Array.isArray(val)) {
            for (let i = 0; i < val.length; i++) {
                if (val[i] !== null && typeof val[i] === "object") {
                    const nestedErr = validateStringLengths(val[i] as Record<string, unknown>, maxLength);
                    if (nestedErr) return `${key}[${i}].${nestedErr}`;
                }
            }
        }
    }
    return null;
}
