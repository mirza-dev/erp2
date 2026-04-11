import { Page, APIRequestContext } from "@playwright/test";

/**
 * Helpers to create / delete test data via the app's REST API.
 * Uses the page's auth cookies so no separate auth is needed.
 */

const BASE = "http://localhost:3000";

// ── Products ─────────────────────────────────────────────────────────────���──

export async function createTestProduct(
    request: APIRequestContext,
    overrides: Record<string, unknown> = {}
): Promise<{ id: string; sku: string }> {
    const sku = `TEST-${Date.now()}`;
    const res = await request.post(`${BASE}/api/products`, {
        data: {
            name: `Test Ürünü ${sku}`,
            sku,
            unit: "adet",
            price: 100,
            currency: "USD",
            on_hand: 50,
            min_stock_level: 10,
            ...overrides,
        },
    });
    if (!res.ok()) throw new Error(`createTestProduct failed: ${res.status()} ${await res.text()}`);
    const body = await res.json();
    return { id: body.id, sku };
}

export async function deleteTestProduct(
    request: APIRequestContext,
    id: string
): Promise<void> {
    await request.delete(`${BASE}/api/products/${id}`);
}

// ── Customers ───────────────────────────────────────────────────────────────

export async function createTestCustomer(
    request: APIRequestContext,
    overrides: Record<string, unknown> = {}
): Promise<{ id: string; name: string }> {
    const ts   = Date.now();
    const name = `Test Müşterisi ${ts}`;
    const res  = await request.post(`${BASE}/api/customers`, {
        data: {
            name,
            email: `test-${ts}@testfirma.com`,
            country: "TR",
            currency: "USD",
            ...overrides,
        },
    });
    if (!res.ok()) throw new Error(`createTestCustomer failed: ${res.status()} ${await res.text()}`);
    const body = await res.json();
    return { id: body.id, name };
}

export async function deleteTestCustomer(
    request: APIRequestContext,
    id: string
): Promise<void> {
    await request.delete(`${BASE}/api/customers/${id}`);
}

// ── Orders ──────────────────────────────────────────────────────────────────

export async function createTestOrder(
    request: APIRequestContext,
    customerId: string,
    productId: string,
    customerName: string = "Test Müşterisi",
    overrides: Record<string, unknown> = {}
): Promise<{ id: string }> {
    const res = await request.post(`${BASE}/api/orders`, {
        data: {
            customer_id: customerId,
            customer_name: customerName,
            currency: "USD",
            commercial_status: "draft",
            subtotal: 100,
            vat_total: 20,
            grand_total: 120,
            lines: [{
                product_id: productId,
                product_name: "Test Ürünü",
                product_sku: "TEST-SKU",
                unit: "adet",
                quantity: 1,
                unit_price: 100,
                discount_pct: 0,
                line_total: 100,
            }],
            ...overrides,
        },
    });
    if (!res.ok()) throw new Error(`createTestOrder failed: ${res.status()} ${await res.text()}`);
    const body = await res.json();
    return { id: body.id ?? body.order?.id };
}

export async function deleteTestOrder(
    request: APIRequestContext,
    id: string
): Promise<void> {
    await request.delete(`${BASE}/api/orders/${id}`);
}

// ── Wait helpers ─────────────────────────────────────────────────────────────

/** Wait for the page's data-context loading spinner to disappear */
export async function waitForDataLoad(page: Page): Promise<void> {
    // The app shows a spinner while loading=true; wait for it to vanish
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {
        // networkidle can time out on slow machines — ignore and proceed
    });
}
