/**
 * Stock Aging Report E2E Tests
 *
 * Faz 3d Review aging (2026-05-23):
 * - Tab button'larına `data-testid="aging-report-tab-{key}"`,
 *   eşik referansı div'ine `data-testid="aging-threshold-hint"` eklendi.
 * - Tablo hücrelerinde `{daysWaiting} gün` rendering var (seed'e bağlı 45 olabilir)
 *   → `/45 gün/i` strict mode çakışıyordu; eşik referansı testid ile scope'landı.
 * - "Mamul" label'ı gerçek UI'da "İmalat Eskimesi"; tutarsızlık düzeltildi.
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

test("iki rapor tab'ı görünür — İmalat, Ticari", async ({ page }) => {
    await expect(page.getByTestId("aging-report-tab-manufactured")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId("aging-report-tab-commercial")).toBeVisible({ timeout: 5_000 });
});

test("İmalat tab'ı açıkken özet kartlar görünür", async ({ page }) => {
    await expect(page.getByText(/bağlanan sermaye/i).first()).toBeVisible({ timeout: 8_000 });
    // Exact matching: "Durgun + Ölü SKU" label'ı parent container'lardan ayırt eder
    await expect(page.getByText("Durgun + Ölü SKU", { exact: true })).toBeVisible({ timeout: 5_000 });
});

test("İmalat tab'ına geçiş çalışıyor", async ({ page }) => {
    // Tab button'a testid ile scope'lu locator (label "İmalat Eskimesi" ile çakışma riski yok)
    await page.getByTestId("aging-report-tab-manufactured").click();
    await page.waitForTimeout(300);
    // Eşik referansı — testid ile scope'lu (tablo hücreleri "X gün" ile çakışma yok)
    const thresholdHint = page.getByTestId("aging-threshold-hint");
    await expect(thresholdHint).toBeVisible({ timeout: 5_000 });
    await expect(thresholdHint).toContainText(/45 gün/i);
});

test("İmalat tab'ında eşik referansı doğru", async ({ page }) => {
    // İlk tab İmalat — eşik referansı 45 gün metnini içermeli
    const thresholdHint = page.getByTestId("aging-threshold-hint");
    await expect(thresholdHint).toBeVisible({ timeout: 5_000 });
    await expect(thresholdHint).toContainText(/45 gün/i);
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
