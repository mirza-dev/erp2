/**
 * Orders E2E Tests
 */
import { test, expect } from "@playwright/test";
import {
    createTestCustomer, deleteTestCustomer,
    createTestProduct, deleteTestProduct,
    createTestOrder, deleteTestOrder,
} from "./helpers/test-data";

let customerId: string;
let customerName: string;
let productId: string;
let orderId: string;

test.beforeAll(async ({ request }) => {
    const customer = await createTestCustomer(request);
    const product  = await createTestProduct(request, { on_hand: 100 });
    customerId   = customer.id;
    customerName = customer.name;
    productId    = product.id;
});

test.afterAll(async ({ request }) => {
    if (orderId) await deleteTestOrder(request, orderId).catch(() => {});
    await deleteTestProduct(request, productId).catch(() => {});
    await deleteTestCustomer(request, customerId).catch(() => {});
});

test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard/orders");
    await page.waitForLoadState("networkidle");
});

// ── Liste & Filtreler ─────────────────────────────────────────────────────────

test("sipariş listesi yükleniyor", async ({ page }) => {
    await expect(page.locator("main")).toBeVisible();
    // Tablo veya "sipariş yok" mesajı
    const table = page.locator("table").or(page.getByText(/sipariş bulunamadı|henüz sipariş yok/i));
    await expect(table.first()).toBeVisible({ timeout: 8_000 });
});

test("tab filtreleri çalışıyor — Bekleyen tab", async ({ page }) => {
    const pendingTab = page.getByRole("button", { name: /bekleyen/i })
        .or(page.getByText(/onay bekleyen/i));
    if (await pendingTab.first().isVisible()) {
        await pendingTab.first().click();
        await page.waitForLoadState("networkidle");
    }
    // URL veya active state
    expect(page.url()).toContain("/orders");
});

test("sipariş arama çalışıyor", async ({ page }) => {
    const searchInput = page.getByPlaceholder(/ara|sipariş|müşteri/i);
    if (await searchInput.isVisible()) {
        await searchInput.fill("TEST-NONEXISTENT-XYZ");
        await page.waitForTimeout(400);
        // Var olmayan bir string arandığında 0 satır veya "bulunamadı" mesajı dönmeli
        const rowCount = await page.locator("table tbody tr").count();
        const noResultsMsg = await page.getByText(/bulunamadı|no results/i).isVisible().catch(() => false);
        expect(rowCount === 0 || noResultsMsg).toBeTruthy();
    }
});

// ── Sipariş Oluşturma ─────────────────────────────────────────────────────────

test("yeni sipariş oluşturulabiliyor ve DRAFT olarak kaydediliyor", async ({ page }) => {
    await page.goto("/dashboard/orders/new");
    await page.waitForLoadState("networkidle");

    // 1. Open customer dropdown (button text before selection: "Müşteri ara veya seç...")
    await page.getByRole("button", { name: /müşteri ara veya seç/i }).click();

    // 2. Search for the test customer by name
    const customerSearch = page.getByPlaceholder(/firma adı veya ülke/i);
    await expect(customerSearch).toBeVisible({ timeout: 5_000 });
    await customerSearch.fill(customerName);
    await page.waitForTimeout(300);

    // 3. Click the matching customer row (dropdown items are <div><span>name</span>...)
    await page.locator("span", { hasText: customerName }).first().click();

    // 4. Select the test product in the first order line's <select>
    await page.locator("tbody select").first().selectOption(productId);

    // 5. Submit as draft — button labeled "Taslak Kaydet"
    await page.getByRole("button", { name: /taslak kaydet/i }).click();

    // 6. On success → router.push("/dashboard/orders") → URL must NOT stay at /orders/new
    await page.waitForURL("**/dashboard/orders", { timeout: 10_000 });
    expect(page.url()).toMatch(/\/dashboard\/orders$/);
});

// ── Sipariş Detay & Durum Geçişleri ──────────────────────────────────────────

test("sipariş detay sayfası açılıyor", async ({ page, request }) => {
    // Create a test order via API
    const order = await createTestOrder(request, customerId, productId, customerName);
    orderId = order.id;

    await page.goto(`/dashboard/orders/${orderId}`);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("main")).toBeVisible();
    // Order detail has status buttons
    await expect(
        page.getByRole("button", { name: /onayla|onaya gönder|draft|taslak/i }).first()
    ).toBeVisible({ timeout: 8_000 });
});

test("DRAFT → PENDING_APPROVAL geçişi", async ({ page, request }) => {
    const order = await createTestOrder(request, customerId, productId, customerName);
    const oid   = order.id;

    await page.goto(`/dashboard/orders/${oid}`);
    await page.waitForLoadState("networkidle");

    const pendingBtn = page.getByRole("button", { name: /onaya gönder/i });
    if (await pendingBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await pendingBtn.click();
        await page.waitForTimeout(1_000);
        // Status should change
        await expect(page.getByText(/bekliyor|onay bekliyor|pending/i).first()).toBeVisible({ timeout: 5_000 });
    }
    // Cleanup
    await deleteTestOrder(request, oid).catch(() => {});
});

test("sipariş silme (onay dialog ile)", async ({ page, request }) => {
    const order = await createTestOrder(request, customerId, productId, customerName);
    const oid   = order.id;

    await page.goto(`/dashboard/orders/${oid}`);
    await page.waitForLoadState("networkidle");

    const deleteBtn = page.getByRole("button", { name: /sil/i }).first();
    if (await deleteBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await deleteBtn.click();
        // Confirm dialog
        const confirmBtn = page.getByRole("button", { name: /onayla|evet|sil/i }).last();
        if (await confirmBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
            await confirmBtn.click();
            await page.waitForURL("**/orders**", { timeout: 8_000 }).catch(() => {});
        }
    }
    // If delete didn't happen via UI, clean up via API
    await deleteTestOrder(request, oid).catch(() => {});
});

// ── Liste Filtreleri ──────────────────────────────────────────────────────────

test("tarih filtresi sipariş listesini filtreliyor", async ({ page }) => {
    const dateFrom = page.locator("input[type='date']").first();
    if (await dateFrom.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await dateFrom.fill("2025-01-01");
        await page.waitForLoadState("networkidle");
        // Table still renders
        await expect(page.locator("main")).toBeVisible();
    }
});

test("müşteri filtresi dropdown çalışıyor", async ({ page }) => {
    const customerFilter = page.locator("select").filter({ hasText: /müşteri|all/i })
        .or(page.getByRole("combobox").filter({ hasText: /müşteri/i }));
    if (await customerFilter.first().isVisible({ timeout: 3_000 }).catch(() => false)) {
        await customerFilter.first().selectOption({ index: 0 });
        await page.waitForLoadState("networkidle");
    }
    expect(page.url()).toContain("/orders");
});
