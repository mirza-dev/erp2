import { Page, APIRequestContext } from "@playwright/test";
import { waitForApp } from "./nav";
import { BASE_URL } from "./base-url";

/**
 * Helpers to create / delete test data via the app's REST API.
 * Uses the page's auth cookies so no separate auth is needed.
 */

const BASE = BASE_URL;

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

// ── Vendors (2026-09-16, A1 kapsama) ────────────────────────────────────────
// E-POSTASIZ yaratılır: RFQ "Gönder" e-postası olan tedarikçiye GERÇEK Resend çağrısı
// yapar (yerelde RESEND_API_KEY dolu). E-postası olmayan tedarikçi için servis yalnız
// arşivler + "elle iletilmeli" uyarısı üretir — dış dünyaya sıfır etki.

export async function createTestVendor(
    request: APIRequestContext,
    overrides: Record<string, unknown> = {},
): Promise<{ id: string; name: string }> {
    const ts = Date.now();
    const name = `Test Tedarikçi ${ts}`;
    const res = await request.post(`${BASE}/api/vendors`, {
        data: { name, contact_person: "E2E Kişi", currency: "TRY", lead_time_days: 7, ...overrides },
    });
    if (!res.ok()) throw new Error(`createTestVendor failed: ${res.status()} ${await res.text()}`);
    const body = await res.json();
    return { id: body.id ?? body.vendor?.id, name };
}

/** Tedarikçi silme = pasife alma (aktif PO varsa 409 — temizlikte yutulur). */
export async function deleteTestVendor(request: APIRequestContext, id: string): Promise<void> {
    await request.delete(`${BASE}/api/vendors/${id}`);
}

// ── Quotes ──────────────────────────────────────────────────────────────────
// Gönderilebilir taslak: cari id + adres + ürüne bağlı satır (validateQuoteForSend şartları).

export async function createTestQuote(
    request: APIRequestContext,
    input: { customerId: string; customerName: string; productId: string; productSku: string; quantity: number; unitPrice?: number },
): Promise<{ id: string; quoteNumber: string }> {
    const unitPrice = input.unitPrice ?? 100;
    const subtotal = input.quantity * unitPrice;
    const res = await request.post(`${BASE}/api/quotes`, {
        data: {
            customer_id: input.customerId,
            customer_name: input.customerName,
            customer_address: "E2E Mah. Test Cad. No:1, İstanbul",
            currency: "TRY",
            vat_rate: 20,
            subtotal,
            vat_total: subtotal * 0.2,
            grand_total: subtotal * 1.2,
            discount_amount: 0,
            lines: [{
                position: 1,
                product_id: input.productId,
                product_code: input.productSku,
                description: "E2E teklif kalemi",
                quantity: input.quantity,
                unit_price: unitPrice,
                line_total: subtotal,
            }],
        },
    });
    if (!res.ok()) throw new Error(`createTestQuote failed: ${res.status()} ${await res.text()}`);
    const body = await res.json();
    return { id: body.id, quoteNumber: body.quoteNumber ?? body.quote_number };
}

/** Yalnız TASLAK silinebilir (409 aksi hâlde); gönderilmiş teklifler reddedilerek kapatılır. */
export async function deleteTestQuote(request: APIRequestContext, id: string): Promise<void> {
    await request.delete(`${BASE}/api/quotes/${id}`);
}

// ── Purchase orders ─────────────────────────────────────────────────────────

export async function createTestPurchaseOrder(
    request: APIRequestContext,
    input: { vendorId: string; productId: string; quantity?: number; unitPrice?: number },
): Promise<{ id: string; poNumber: string }> {
    const res = await request.post(`${BASE}/api/purchase-orders`, {
        data: {
            vendor_id: input.vendorId,
            currency: "TRY",
            expected_date: new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10),
            lines: [{ product_id: input.productId, quantity: input.quantity ?? 5, unit_price: input.unitPrice ?? 40, discount_pct: 0 }],
        },
    });
    if (!res.ok()) throw new Error(`createTestPurchaseOrder failed: ${res.status()} ${await res.text()}`);
    const body = await res.json();
    const po = body.po ?? body;
    return { id: po.id, poNumber: po.po_number };
}

/** Temizlik: admin iptali (gerekçe zorunlu); tamamlanmış PO iptal edilemez → yutulur. */
export async function cancelTestPurchaseOrder(request: APIRequestContext, id: string): Promise<void> {
    await request.post(`${BASE}/api/purchase-orders/${id}/cancel`, { data: { reason: "E2E temizlik" } });
}

// ── RFQs ────────────────────────────────────────────────────────────────────

export async function createTestRfq(
    request: APIRequestContext,
    input: { productId: string; vendorIds: string[]; title?: string },
): Promise<{ id: string; rfqNumber: string }> {
    const res = await request.post(`${BASE}/api/rfqs`, {
        data: {
            title: input.title ?? `E2E Fiyat Talebi ${Date.now()}`,
            currency: "TRY",
            lines: [{ product_id: input.productId, quantity: 10, unit: "adet" }],
            vendor_ids: input.vendorIds,
        },
    });
    if (!res.ok()) throw new Error(`createTestRfq failed: ${res.status()} ${await res.text()}`);
    const body = await res.json();
    const rfq = body.rfq ?? body;
    return { id: rfq.id, rfqNumber: rfq.rfq_number };
}

export async function cancelTestRfq(request: APIRequestContext, id: string): Promise<void> {
    await request.post(`${BASE}/api/rfqs/${id}/cancel`, { data: { reason: "E2E temizlik" } });
}

// ── JSON GET (yeniden denemeli) ─────────────────────────────────────────────
/**
 * Dev sunucusu (Turbopack) bir rotayı derlerken/HMR anında bağlantıyı sıfırlayabiliyor
 * (2026-09-16 ölçümü: navigasyonun hemen ardından `GET /api/purchase-orders/<id>` → ECONNRESET).
 * Bu bir ürün kusuru değil, dev sunucusunun yaşam döngüsü; iddia yeniden denenir, sonuç
 * sonra değerlendirilir. 2xx dışı yanıt yeniden denenmez — o gerçek bir sonuçtur.
 */
export async function getJson<T>(request: APIRequestContext, url: string, tries = 3): Promise<{ status: number; body: T }> {
    let lastErr: unknown;
    for (let i = 0; i < tries; i++) {
        try {
            const res = await request.get(url);
            return { status: res.status(), body: (await res.json()) as T };
        } catch (err) {
            lastErr = err;
            await new Promise(r => setTimeout(r, 500 * (i + 1)));
        }
    }
    throw lastErr;
}
