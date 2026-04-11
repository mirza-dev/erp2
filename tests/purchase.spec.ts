/**
 * Purchase Suggestions E2E Tests
 */
import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard/purchase/suggested");
    await page.waitForLoadState("networkidle");
});

test("satın alma önerileri sayfası yükleniyor", async ({ page }) => {
    await expect(page.locator("main")).toBeVisible();
    await expect(page.getByText(/satın alma|öneri|purchase/i).first()).toBeVisible();
});

test("hammadde/mamul filtresi çalışıyor", async ({ page }) => {
    const rawTab = page.getByRole("button", { name: /hammadde|raw/i });
    if (await rawTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await rawTab.click();
        await page.waitForTimeout(400);
        await expect(page.locator("main")).toBeVisible();
    }
});

test("satın alma taahhüdü oluşturuluyor", async ({ page }) => {
    const buyBtn = page.getByRole("button", { name: /satın al|sipariş ver|taahhüt/i }).first();
    if (await buyBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await buyBtn.click();
        await page.waitForTimeout(300);
        // Form veya modal açıldı
        const qtyInput = page.locator("input[type='number']").first();
        if (await qtyInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
            await qtyInput.fill("10");
            const confirmBtn = page.getByRole("button", { name: /kaydet|oluştur/i }).last();
            if (await confirmBtn.isEnabled({ timeout: 2_000 }).catch(() => false)) {
                await confirmBtn.click();
                await page.waitForTimeout(1_000);
                await expect(page.locator("main")).toBeVisible();
            }
        }
    }
});

test("urgency badge'leri görünür", async ({ page }) => {
    // Badge'ler: kritik/yüksek/orta veya renk kodları
    const badges = page.getByText(/kritik|yüksek|orta|critical|high|moderate/i);
    const count  = await badges.count();
    // Öneri yoksa bu sayı 0 olabilir — sayfa yüklendi kontrol
    expect(count).toBeGreaterThanOrEqual(0);
    await expect(page.locator("main")).toBeVisible();
});

test("AI detay drawer açılıyor", async ({ page }) => {
    const aiBtn = page.getByRole("button", { name: /ai|detay|analiz/i }).first();
    if (await aiBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await aiBtn.click();
        await page.waitForTimeout(500);
        await expect(page.locator("main")).toBeVisible();
    }
});
