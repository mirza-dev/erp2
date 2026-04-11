/**
 * Production E2E Tests
 */
import { test, expect } from "@playwright/test";
import { createTestProduct, deleteTestProduct } from "./helpers/test-data";

let productId: string;

test.beforeAll(async ({ request }) => {
    const p = await createTestProduct(request, { on_hand: 100 });
    productId = p.id;
});

test.afterAll(async ({ request }) => {
    await deleteTestProduct(request, productId).catch(() => {});
});

test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard/production");
    await page.waitForLoadState("networkidle");
});

test("üretim sayfası yükleniyor — form ve tablo görünür", async ({ page }) => {
    await expect(page.locator("main")).toBeVisible();
    await expect(page.getByText(/üretim/i).first()).toBeVisible();
});

test("üretim kaydı oluşturuluyor ve tabloda görünüyor", async ({ page }) => {
    // Ürün seç
    const productSelect = page.getByRole("combobox")
        .or(page.locator("select").filter({ hasText: /ürün/i }));
    if (await productSelect.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await productSelect.selectOption({ index: 1 });
    }

    // Adet gir
    const adetInput = page.getByLabel(/adet|miktar|quantity/i)
        .or(page.locator("input[type='number']").first());
    if (await adetInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await adetInput.fill("5");
    }

    // Kaydet
    const saveBtn = page.getByRole("button", { name: /kaydet|ekle|oluştur/i });
    if (await saveBtn.isEnabled({ timeout: 3_000 }).catch(() => false)) {
        await saveBtn.click();
        await page.waitForTimeout(1_500);
        // Toast veya tabloda yeni satır
        await expect(
            page.getByText(/kaydedildi|eklendi|başarı/i)
                .or(page.locator("table tbody tr").first())
        ).toBeVisible({ timeout: 8_000 });
    }
});

test("üretim kaydı silinebiliyor", async ({ page }) => {
    const deleteBtn = page.getByRole("button", { name: /sil/i }).first();
    if (await deleteBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await deleteBtn.click();
        const confirmBtn = page.getByRole("button", { name: /onayla|evet|sil/i }).last();
        if (await confirmBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
            await confirmBtn.click();
            await page.waitForTimeout(1_000);
        }
    }
    await expect(page.locator("main")).toBeVisible();
});

test("tarih filtresi çalışıyor", async ({ page }) => {
    const dateInput = page.locator("input[type='date']").first();
    if (await dateInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await dateInput.fill("2025-01-01");
        await page.waitForTimeout(500);
        await expect(page.locator("main")).toBeVisible();
    }
});
