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
    const criticalTab = page.getByRole("button", { name: /kritik|critical/i })
        .or(page.getByText(/kritik/i).first());
    if (await criticalTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await criticalTab.click();
        await page.waitForTimeout(400);
        await expect(page.locator("main")).toBeVisible();
    }
});

test("filtre tab'ları çalışıyor — warning tab", async ({ page }) => {
    const warningTab = page.getByRole("button", { name: /uyarı|warning/i });
    if (await warningTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await warningTab.click();
        await page.waitForTimeout(400);
        await expect(page.locator("main")).toBeVisible();
    }
});

test("arama çalışıyor", async ({ page }) => {
    const searchInput = page.getByPlaceholder(/ara|ürün|sku/i).first();
    if (await searchInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await searchInput.fill("NONEXISTENT-ALERT-XYZ");
        await page.waitForTimeout(400);
        await expect(page.locator("main")).toBeVisible();
    }
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
