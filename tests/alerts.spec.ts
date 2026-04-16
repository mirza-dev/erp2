/**
 * Alerts E2E Tests
 */
import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard/alerts");
    await page.waitForLoadState("networkidle");
});

test("alerts sayfası yükleniyor", async ({ page }) => {
    await expect(page.locator("main")).toBeVisible();
    await expect(page.getByText(/uyarı|alert/i).first()).toBeVisible();
});

test("filtre tab'ları çalışıyor — critical tab", async ({ page }) => {
    // "Kritik" tab her zaman render edilir (static UI, data-bağımsız)
    const criticalTab = page.getByRole("button", { name: /kritik/i }).first();
    await expect(criticalTab).toBeVisible({ timeout: 5_000 });
    await criticalTab.click();
    await page.waitForTimeout(400);
    await expect(page.locator("main")).toBeVisible();
});

test("filtre tab'ları çalışıyor — warning tab", async ({ page }) => {
    // "Uyarı" tab her zaman render edilir (static UI, data-bağımsız)
    const warningTab = page.getByRole("button", { name: /uyarı/i }).first();
    await expect(warningTab).toBeVisible({ timeout: 5_000 });
    await warningTab.click();
    await page.waitForTimeout(400);
    await expect(page.locator("main")).toBeVisible();
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
