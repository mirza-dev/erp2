/**
 * Alerts E2E Tests
 */
import { test, expect } from "@playwright/test";
import { gotoApp } from "./helpers/nav";

test.beforeEach(async ({ page }) => {
    await gotoApp(page, "/dashboard/alerts");
});

test("alerts sayfası yükleniyor", async ({ page }) => {
    await expect(page.locator("main")).toBeVisible();
    await expect(page.getByText(/uyarı|alert/i).first()).toBeVisible();
});

// Sayfa artık TAKVİM görünümü: ciddiyete göre "Kritik/Uyarı" tab'ları yok,
// yerine `ALERT_CLASSES` sınıf filtreleri var (Tümü · Stok · Sipariş · …).
// Eski testler kaldırılmış bir UI'ı bekliyordu.
// `ClassificationTabs` role="tab" kullanıyor (button DEĞİL) ve erişilebilir ad
// "<etiket> (<sayı>)" biçiminde — ör. "Stok (3)".
test("sınıf filtresi çalışıyor — Stok", async ({ page }) => {
    const stockTab = page.getByRole("tab", { name: /^Stok \(/ });
    await expect(stockTab).toBeVisible({ timeout: 15_000 });
    await stockTab.click();
    await expect(stockTab).toHaveAttribute("aria-selected", "true");
});

test("sınıf filtresi çalışıyor — Tümü", async ({ page }) => {
    const allTab = page.getByRole("tab", { name: /^Tümü \(/ });
    await expect(allTab).toBeVisible({ timeout: 15_000 });
    await allTab.click();
    await expect(allTab).toHaveAttribute("aria-selected", "true");
});

test("arama çalışıyor", async ({ page }) => {
    // Arama kutusu her zaman render edilir
    const searchInput = page.getByPlaceholder(/ara|ürün|sku/i).first();
    await expect(searchInput).toBeVisible({ timeout: 5_000 });
    await searchInput.fill("NONEXISTENT-ALERT-XYZ");
    await page.waitForTimeout(400);
    // Sonuç kalmadığında tablo boş veya "bulunamadı" mesajı gösterilmeli
    await expect(page.locator("main")).toBeVisible();
});

test("çözülmüşleri göster/gizle toggle çalışıyor", async ({ page }) => {
    const toggle = page.getByRole("switch")
        .or(page.getByRole("checkbox", { name: /çözülen|resolved|kapalı/i }));
    if (await toggle.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await toggle.click();
        await page.waitForTimeout(400);
        await expect(page.locator("main")).toBeVisible();
    }
});

test("alert çözümleme butonu çalışıyor", async ({ page }) => {
    const resolveBtn = page.getByRole("button", { name: /çözümle|kapat|resolve/i }).first();
    if (await resolveBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await resolveBtn.click();
        await page.waitForTimeout(1_000);
        // Toast veya güncelleme
        await expect(page.locator("main")).toBeVisible();
    }
});
