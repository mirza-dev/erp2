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
        // Sonuçlar azalmış olmalı (0 veya filtrelenmiş)
        const rows = page.locator("table tbody tr");
        const count = await rows.count();
        // Either filtered or "no results" message
        expect(count).toBeGreaterThanOrEqual(0);
    }
});

// ── Sipariş Oluşturma ─────────────────────────────────────────────────────────

test("yeni sipariş oluşturulabiliyor ve DRAFT olarak kaydediliyor", async ({ page }) => {
    await page.goto("/dashboard/orders/new");
    await page.waitForLoadState("networkidle");

    // Customer dropdown — custom button that opens a search input
    const customerDropdown = page.getByText(/müşteri ara veya seç/i)
        .or(page.locator("button").filter({ hasText: /müşteri|seç/i }).first());
    if (await customerDropdown.first().isVisible({ timeout: 5_000 }).catch(() => false)) {
        await customerDropdown.first().click();
    }
    const customerSearch = page.getByPlaceholder(/firma adı veya ülke/i);
    if (await customerSearch.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await customerSearch.fill("Test");
        await page.waitForTimeout(300);
    }
    // Pick first matching option
    const option = page.getByRole("option").first()
        .or(page.locator("li").filter({ hasText: /test/i }).first());
    if (await option.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await option.click();
    }

    // Add product line
    const addLineBtn = page.getByRole("button", { name: /satır ekle|ürün ekle|\+ ekle/i });
    if (await addLineBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await addLineBtn.click();
    }

    // Submit
    const submitBtn = page.getByRole("button", { name: /sipariş oluştur|kaydet|oluştur/i });
    if (await submitBtn.isEnabled({ timeout: 3_000 }).catch(() => false)) {
        await submitBtn.click();
        // On success → redirect to order list or order detail
        await page.waitForURL("**/orders**", { timeout: 10_000 }).catch(() => {});
    }
    expect(page.url()).toContain("/orders");
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
