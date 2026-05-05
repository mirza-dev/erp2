/**
 * Settings sayfası ve diğer formlar için ortak validation helper'ları.
 */

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(s: string): boolean {
    return EMAIL_RE.test(s.trim());
}

/**
 * Türkiye için: 10 haneli (kurumsal vergi numarası) veya 11 haneli (TC kimlik).
 * Boşluk/harf vs. ayıklanır, sadece rakam sayılır.
 */
export function isValidTaxNumber(s: string): boolean {
    const digits = s.replace(/\D/g, "");
    return digits.length === 10 || digits.length === 11;
}

/**
 * URL doğrulama — başında protokol yoksa https varsay.
 */
export function isValidUrl(s: string): boolean {
    const trimmed = s.trim();
    if (!trimmed) return false;
    try {
        const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
        return !!url.hostname && url.hostname.includes(".");
    } catch {
        return false;
    }
}
