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
 * HİDRASYON (2026-09-05): artık BEKLENİYOR — bkz. `waitForHydration`.
 * Eskiden bu bekleme yalnız kabuğun BOYANDIĞINI kanıtlıyordu; React'in
 * olay dinleyicilerini bağlamış olmasını değil. Ölçüldü: `domcontentloaded`
 * anında `main` üzerinde HİÇ `__react*` anahtarı yok, ~2 sn sonra var.
 * O pencerede yapılan her etkileşim SESSİZCE kayboluyordu — dosya seçimi
 * native `change` olayını atıyor ama React'in `onChange`i henüz bağlı
 * olmadığı için sihirbaz idle'da kalıyordu.
 */
export async function gotoApp(page: Page, path: string, timeout = 45_000): Promise<void> {
    await page.goto(path, { waitUntil: "domcontentloaded", timeout });
    await expect(page.locator("main")).toBeVisible({ timeout });
    await waitForHydration(page, timeout);

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

/** Zaten açık bir sayfada kabuğun boyanmasını + hidrasyonu bekler (goto'suz). */
export async function waitForApp(page: Page, timeout = 30_000): Promise<void> {
    await expect(page.locator("main")).toBeVisible({ timeout });
    await waitForHydration(page, timeout);
}

/**
 * React'in hidrasyonunu DOĞRUDAN ölçer.
 *
 * React, sahiplendiği DOM düğümlerine `__reactFiber$…` / `__reactProps$…`
 * anahtarlarını hidrasyon sırasında yazar. Ölçüm (2026-09-05, bu depo):
 * `domcontentloaded` anında `main` üzerinde `[]`, ~2 sn sonra iki anahtar;
 * dosya input'unda ayrıca `__reactEvents$…`. Yani bu, "kabuk boyandı" ile
 * "olay dinleyicileri bağlandı" arasındaki farkın gözlenebilir hâli.
 *
 * Neden bu sinyal: 2026-09-05 baseline koşumunda 8 test "flaky" çıktı ve
 * dördü tek bir kalıptı — `setInputFiles` hidrasyondan ÖNCE çalışınca native
 * `change` olayı boşa gidiyor, sihirbaz idle'da kalıyor, test 30 sn bekleyip
 * düşüyor, retry'da (sayfa artık hızlı) geçiyordu. Timeout büyütmek çözmez:
 * 2026-08-30'da 15→30 sn denendi, yarış sürdü. Doğru düzeltme beklemeyi
 * SÜREYE değil OLAYA bağlamak.
 *
 * İfade STRING olarak veriliyor: fonksiyon olarak geçilirse derleyicinin
 * `keepNames` sarmalayıcısı tarayıcıda tanımsız `__name`e dönüşebiliyor.
 */
export async function waitForHydration(page: Page, timeout = 20_000): Promise<void> {
    await page.waitForFunction(
        "(() => { const el = document.querySelector('main');" +
        " return !!el && Object.keys(el).some(k => k.startsWith('__react')); })()",
        undefined,
        { timeout, polling: 50 },
    );
}
