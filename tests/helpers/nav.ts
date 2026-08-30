import { Page, expect } from "@playwright/test";

/**
 * Sayfaya gider ve uygulama kabuğu boyanana kadar bekler.
 *
 * `waitForLoadState("networkidle")` yerine geçer. Playwright'ın kendi belgesi
 * networkidle'ı önermiyor ve bu projede somut olarak kırılgandı: dev sunucusu
 * (Next 16 + Turbopack) bir rotayı İLK KEZ derlerken navigasyon 30 sn'yi aşıp
 * test timeout'una düşüyordu — aynı test yeniden denemede 5,3 sn'de geçiyor.
 * networkidle "500 ms boyunca sıfır istek" demek; soğuk derleme, HMR ve arka
 * plan yoklamaları bu pencereyi kapatıyor ve bekleme testin ne beklediğiyle
 * ilgisiz bir şeye bağlanıyor.
 *
 * Yerine iki deterministik koşul: DOM hazır + `main` görünür. Veriye bağlı
 * iddialar zaten kendi `timeout`'larıyla yeniden deniyor.
 *
 * DİKKAT — hidrasyon: bu bekleme kabuğun BOYANDIĞINI kanıtlar, React'in
 * hidrasyonu bittiğini DEĞİL. Sayfa açılır açılmaz kontrollü bir input'a
 * `fill` yapan testler yarışa girebilir: hidrasyondan önce yazılan değer
 * React'in `value` prop'u tarafından geri alınır ve etkileşim sessizce
 * kaybolur. Böyle bir adımı `expect(async () => { …fill…; …iddia… }).toPass()`
 * içine al (örnek: `production.spec` tarih seçimi). Eski `networkidle`
 * beklemesi bunu tesadüfen örtüyordu.
 */
export async function gotoApp(page: Page, path: string, timeout = 45_000): Promise<void> {
    await page.goto(path, { waitUntil: "domcontentloaded", timeout });
    await expect(page.locator("main")).toBeVisible({ timeout });

    // Oturum düştüyse ERKEN ve AÇIK patla. Giriş sayfasının da `main`'i var;
    // bu kontrol olmadan test, gerçek iddiasında "element bulunamadı" diye
    // ölüyor ve kök sebep (oturumun iptal edilmiş olması) görünmez kalıyor.
    // 2026-08-30'da tam olarak bu yüzden 56 test aynı anda kırılmıştı.
    if (path.startsWith("/dashboard") && new URL(page.url()).pathname.startsWith("/login")) {
        throw new Error(
            `Oturum kaybı: ${path} istendi ama giriş sayfasına düşüldü.\n` +
            "storageState geçersiz — muhtemelen bir test oturumu iptal etti " +
            "(bkz. playwright.config.ts proje sırası ve /api/auth/logout scope'u).",
        );
    }
}

/** Zaten açık bir sayfada kabuğun boyanmasını bekler (goto'suz). */
export async function waitForApp(page: Page, timeout = 30_000): Promise<void> {
    await expect(page.locator("main")).toBeVisible({ timeout });
}
