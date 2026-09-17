/**
 * Onboarding E2E (2026-09-17) — kurulum rehberi 8 adım · Sistem Durumu sekmesi ·
 * davet modu UI'si (yerelde Resend yok → devre dışı + gerekçe) · boş-durum CTA.
 *
 * E2E hesabı admin'dir (global-setup). Yerel Supabase'de veri seed'li olduğu
 * için "gerçek boş liste" CTA'sı burada ölçülemez; onun davranışı
 * `datatable-empty-action.test.tsx` (RTL) ile kilitli. Burada yalnız sayfaların
 * ayakta olduğu ve onboarding yüzeylerinin GERÇEK tarayıcıda render edildiği
 * doğrulanır — hiçbir yazma yapılmaz.
 */
import { test, expect } from "@playwright/test";
import { gotoApp } from "./helpers/nav";

test("Veri Aktarım Merkezi — kurulum rehberi 8 adım, 'Firma bilgileri' ilk sırada", async ({ page }) => {
    await gotoApp(page, "/dashboard/import");
    const panel = page.getByRole("region", { name: "Kurulum durumu" });
    await expect(panel).toBeVisible({ timeout: 15_000 });
    // Başlık sayacı "n/8 adım tamam" — sayı veriden gelir, 8 sabit.
    await expect(panel.getByText(/\d+\/8 adım tamam/)).toBeVisible({ timeout: 10_000 });
    // Katlanmışsa aç (tamamsa varsayılan kapalı).
    const header = panel.getByRole("button", { name: /Kurulum Durumu/ });
    if ((await header.getAttribute("aria-expanded")) === "false") await header.click();
    await expect(panel.getByText("1. Firma bilgileri")).toBeVisible();
    await expect(panel.getByText("7. Kullanıcılar")).toBeVisible();
    await expect(panel.getByText("8. İlk teklif veya sipariş")).toBeVisible();
});

test("Ayarlar › Sistem Durumu sekmesi admin'e görünür ve üç sınıfı çizer", async ({ page }) => {
    await gotoApp(page, "/dashboard/settings?tab=sistem");
    await expect(page.locator("main")).toBeVisible();
    await expect(page.getByRole("region", { name: "Zorunlu" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("region", { name: "Sessizce kapanan özellikler" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Doğru değer gerektirenler" })).toBeVisible();
    // Env DEĞERİ sızmaz: yalnız adlar. Yerel anon anahtarı sayfada geçmemeli.
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
    if (anon.length > 20) await expect(page.locator("main")).not.toContainText(anon);
    await expect(page.locator("main")).toContainText("RESEND_API_KEY");
});

test("Kullanıcılar — davet modu: e-posta yapılandırılmamışsa devre dışı + gerekçe, parola modu çalışır", async ({ page }) => {
    await gotoApp(page, "/dashboard/settings/users");
    await page.getByRole("button", { name: /kullanıcı ekle|yeni kullanıcı/i }).click();
    const invite = page.getByRole("radio", { name: /Davet e-postası gönder/ });
    const pwd = page.getByRole("radio", { name: /Parolayı ben belirleyeyim/ });
    await expect(invite).toBeVisible({ timeout: 10_000 });
    // Yerel env'de RESEND yok → davet kapalı, gerekçe + Sistem Durumu bağlantısı.
    if (await invite.isDisabled()) {
        await expect(page.getByRole("note")).toContainText(/yapılandırılmamış/);
        await expect(page.getByRole("link", { name: /Sistem Durumu/ })).toHaveAttribute("href", "/dashboard/settings?tab=sistem");
        await expect(pwd).toBeChecked();
        await expect(page.getByLabel(/Şifre \(min\./)).toBeVisible();
        await expect(page.getByRole("button", { name: "Oluştur" })).toBeVisible();
    } else {
        // E-posta yapılandırılmış bir ortamda davet varsayılan ve parola alanı gizli.
        await expect(invite).toBeChecked();
        await expect(page.getByLabel(/Şifre \(min\./)).toHaveCount(0);
        await expect(page.getByRole("button", { name: "Davet gönder" })).toBeVisible();
    }
});

test("Pano — kurulum bandı ya 'Sıradaki:' adımına bağlanır ya da (8/8) hiç yoktur", async ({ page }) => {
    await gotoApp(page, "/dashboard");
    // `isVisible()` BEKLEMEZ (anında döner) — bant veriyle gelir; önce gelmesini bekle,
    // gelmezse (8/8) diğer dala düş. 2026-09-17: ilk yazım isVisible ile yarışıp yanlış dala düşmüştü.
    const banner = page.getByText(/Kurulum \d+\/\d+/);
    const bannerShown = await banner.waitFor({ state: "visible", timeout: 30_000 }).then(() => true, () => false);
    if (bannerShown) {
        await expect(page.getByRole("link", { name: /Sıradaki adım:/ })).toBeVisible();
        // Sidebar'da aynı adlı link var → bandın kendi linki `main` içinde aranır.
        await expect(page.getByRole("main").getByRole("link", { name: /Veri Aktarım Merkezi/ })).toBeVisible();
    } else {
        // Bant yoksa sebebi kurulumun bitmiş olmasıdır — rehber 8/8 demeli.
        await gotoApp(page, "/dashboard/import");
        await expect(page.getByText(/8\/8 adım tamam/)).toBeVisible({ timeout: 10_000 });
    }
});
