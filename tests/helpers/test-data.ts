import { Page, APIRequestContext } from "@playwright/test";
import { waitForApp } from "./nav";

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
    // Liste API'si sonuçta tutarlı — kayıt görünür olana kadar bekle, aksi hâlde
    // hemen ardından okuyan test "oluşmadı" sanıyor (bkz. waitForInList).
    await waitForInList<{ sku?: string }>(request, `${BASE}/api/products?all=1`, p => p.sku === sku);
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
    await waitForInList<{ name?: string }>(request, `${BASE}/api/customers`, c => c.name === name);
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

/**
 * Bir kaydın liste API'sinde GÖRÜNÜR olmasını bekler.
 *
 * `/api/products` ve `/api/customers` `unstable_cache` ile önbelleklenmiş
 * (`tags: ["products"]`, `revalidate: 30`). Mutasyon `revalidateTag` çağırıyor
 * ama geçersizleştirme ANINDA değil: ölçüldü — yeni ürün POST'tan ~1 sn sonra
 * listede YOK, ~7 sn sonra VAR (2026-08-30). Yani API sonuçta tutarlı.
 *
 * Tek seferlik GET yapan testler bu pencereye düşüp "kayıt oluşmadı" sanıyordu.
 * Bu yardımcı görünene kadar yeniden sorar.
 */
export async function waitForInList<T>(
    request: APIRequestContext,
    url: string,
    match: (row: T) => boolean,
    timeoutMs = 20_000,
): Promise<T | undefined> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const res = await request.get(url);
        if (res.ok()) {
            const body = await res.json();
            const rows = (Array.isArray(body) ? body : body?.rows ?? []) as T[];
            const hit = rows.find(match);
            if (hit) return hit;
        }
        if (Date.now() > deadline) return undefined;
        await new Promise(r => setTimeout(r, 750));
    }
}

// ── Wait helpers ─────────────────────────────────────────────────────────────

/**
 * Uygulama kabuğunun boyanmasını bekler.
 *
 * Eskiden `networkidle` bekliyordu; o bekleme dev sunucusunun soğuk derlemesi
 * ve arka plan yoklamaları yüzünden hiç dolmayabiliyordu (bkz. `helpers/nav.ts`).
 * `.catch()` ile yutulduğu için de sessizce hiçbir şey beklemiyordu.
 */
export async function waitForDataLoad(page: Page): Promise<void> {
    await waitForApp(page);
}
