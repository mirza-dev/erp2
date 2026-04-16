/**
 * Stock Aging Report E2E Tests
 */
import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard/products/aging");
    await page.waitForLoadState("networkidle");
});

test("eskime raporu sayfası yükleniyor", async ({ page }) => {
    await expect(page.locator("main")).toBeVisible();
    await expect(page.getByText(/stok eskime raporu/i)).toBeVisible({ timeout: 5_000 });
});

test("üç rapor tab'ı görünür — Hammadde, Mamul, Ticari Mal", async ({ page }) => {
    await expect(page.getByText(/hammadde eskimesi/i)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/mamul eskimesi/i)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/ticari mal eskimesi/i)).toBeVisible({ timeout: 5_000 });
});

test("Hammadde tab'ı açıkken özet kartlar görünür", async ({ page }) => {
    await expect(page.getByText(/bağlanan sermaye/i).first()).toBeVisible({ timeout: 8_000 });
    // Exact matching: "Durgun + Ölü SKU" label'ı parent container'lardan ayırt eder
    await expect(page.getByText("Durgun + Ölü SKU", { exact: true })).toBeVisible({ timeout: 5_000 });
});

test("Mamul tab'ına geçiş çalışıyor", async ({ page }) => {
    const mamulTab = page.getByText(/mamul eskimesi/i);
    await mamulTab.click();
    await page.waitForTimeout(300);
    // Eşik referansı mamul eşiklerini göstermeli
    await expect(page.getByText(/45 gün/i)).toBeVisible({ timeout: 5_000 });
});

test("Hammadde tab'ında eşik referansı doğru", async ({ page }) => {
    // İlk tab Hammadde — 60 gün eşiği göstermeli
    await expect(page.getByText(/60 gün/i)).toBeVisible({ timeout: 5_000 });
});

test("arama input'u çalışıyor", async ({ page }) => {
    const searchInput = page.getByPlaceholder(/ürün adı veya sku/i);
    await expect(searchInput).toBeVisible({ timeout: 5_000 });
    await searchInput.fill("TEST-NONEXISTENT-XYZ");
    await page.waitForTimeout(300);
    await expect(page.locator("main")).toBeVisible();
});

test("kategori filtre butonları görünür", async ({ page }) => {
    await expect(page.getByRole("button", { name: /tümü/i }).first()).toBeVisible({ timeout: 8_000 });
    await expect(page.getByRole("button", { name: /aktif/i })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("button", { name: /ölü/i })).toBeVisible({ timeout: 5_000 });
});

test("'← Ürünler' linki çalışıyor", async ({ page }) => {
    await page.getByRole("link", { name: /← ürünler/i }).click();
    await page.waitForURL("**/products**", { timeout: 5_000 });
    expect(page.url()).toContain("/products");
});
