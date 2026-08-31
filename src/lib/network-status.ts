/**
 * Ağ durumu — çevrimdışı algılama ve dürüst hata mesajı.
 *
 * 2026-08-31 denetimi (madde #10): `navigator.onLine` repoda HİÇ geçmiyordu.
 * Service worker yalnız TAM GEZİNMEDE `/offline`'ı döndürüyor — ama uygulama
 * ilk yüklemeden sonra bir SPA, yani gerçek hâl "sayfa açılmıyor" değil
 * "fetch reddedildi". Sonuç: ya genel bir hata toast'ı ya da sessiz yutma;
 * kullanıcı bayat sayılara bakıp çevrimdışı olduğunu bilmiyordu. Telefon
 * birincil kullanım aracı olduğu için bu ölçülebilir bir kayıptı.
 *
 * `describeNetworkError` SAF: DOM'suz test edilir (repo alışkanlığı).
 */

/**
 * `navigator.onLine`'ın ne söylediği ve söylemediği:
 *
 * `false` GÜVENİLİR — tarayıcı hiçbir ağ arayüzü görmüyorsa gerçekten çevrimdışıdır.
 * `true` GÜVENİLİR DEĞİL — Wi-Fi'ye bağlı ama internete çıkışı olmayan bir cihaz
 * (captive portal, ADSL kopuk) da `true` döner. Bu yüzden `true` "her şey yolunda"
 * anlamına gelmez; yalnızca `false` kesin bir sinyaldir.
 *
 * Tasarım sonucu: mutasyonlar `true` diye SERBEST BIRAKILMAZ, `false` diye
 * BLOKLANMAZ. Sinyal kullanıcıya gösterilir, karar kullanıcıya bırakılır.
 */
export function isBrowserOffline(): boolean {
    if (typeof navigator === "undefined") return false;
    return navigator.onLine === false;
}

/** Ağ kaynaklı `fetch` reddi mi? (TypeError — CORS/DNS/bağlantı kopması) */
export function isNetworkError(err: unknown): boolean {
    if (err instanceof TypeError) return true;
    if (err instanceof Error) return /network|fetch|load failed|bağlantı/i.test(err.message);
    return false;
}

/**
 * Hata için kullanıcıya gösterilecek metni seçer.
 *
 * @param err     Yakalanan hata.
 * @param offline Tarayıcı çevrimdışı mı (`isBrowserOffline()`).
 * @param fallback Ağ dışı hatalarda kullanılacak mesaj (çağıranın kendi metni).
 *
 * Neden ayrı bir mesaj: "Ürün kaydedilemedi." kullanıcıyı veride hata aramaya
 * iter; "İnternet bağlantısı yok" doğru yere bakmasını sağlar. İkisi farklı
 * eylem gerektirir.
 */
export function describeNetworkError(
    err: unknown,
    offline: boolean,
    fallback: string,
): string {
    if (offline) return "İnternet bağlantısı yok. Bağlantı gelince tekrar deneyin.";
    if (isNetworkError(err)) return "Sunucuya ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin.";
    return fallback;
}
