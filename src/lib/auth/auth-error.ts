/**
 * Giriş hatalarını "kimlik bilgisi yanlış" ile "sunucuya ulaşılamadı" arasında ayırır.
 *
 * GEREKÇE: `login/page.tsx` her `signInWithPassword` hatasını tek mesaja
 * indiriyordu ("E-posta veya şifre hatalı."). Supabase projesi erişilemez
 * olduğunda (DNS yok / ağ kesik / servis kapalı) kullanıcı DOĞRU şifresiyle bile
 * bu mesajı görüyordu. 2026-08-24'te tam olarak bu yaşandı: proje host'u
 * `ENOTFOUND` dönüyordu, ekran şifreyi suçluyordu.
 *
 * SINIFLANDIRMA — `@supabase/auth-js` kaynağından doğrulandı:
 *  - `lib/fetch.js`: ağ/DNS/offline → `new AuthRetryableFetchError(msg, 0)`
 *    (status 0) · sunucu tarafı geçici arıza → aynı sınıf, `error.status` (5xx)
 *  - `isAuthRetryableFetchError` = `error.name === "AuthRetryableFetchError"`
 *  - Geçersiz kimlik bilgisi → `AuthApiError`, `status: 400`
 *
 * Kütüphanenin kendi helper'ı import EDİLMEZ: yalnız transitive
 * `@supabase/auth-js` paketinden gelir, doğrudan bağımlılık kurmak kırılgan olur.
 * Bunun yerine aynı iki sinyal (name + status) burada okunur.
 *
 * `status` yoksa `false` döner — bilinmeyen bir hata şeklinde kullanıcıya
 * "bağlantını kontrol et" demek, şifresi gerçekten yanlışken yanıltıcı olur.
 * Gerçek auth-js hataları her zaman status taşır, bu yüzden pratikte fark etmez.
 */
export function isBackendUnreachable(
    err: { status?: number; name?: string } | null | undefined,
): boolean {
    if (!err) return false;
    if (err.name === "AuthRetryableFetchError") return true;
    return err.status === 0 || (typeof err.status === "number" && err.status >= 500);
}
