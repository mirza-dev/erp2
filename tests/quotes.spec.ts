/**
 * Quotes E2E — liste · yeni form · detay · önizleme + CLAUDE.md'nin iki "elle smoke" borcu.
 *
 * (a) Teklif gönder → available_now düşer → Siparişler'de bekleyen sipariş → ikinci teklif
 *     aynı stoktan fazlası → kısmi + shortage → reddet → geri yükselir → kabul → Onaylı.
 * (b) /quotes/new inline Gönder (çift onay) — Kaydet-SONRA-Gönder alt vakası
 *     (skipUrlSync'in tam nötrlemediği navigasyon yolu).
 *
 * Kurallar: `if (isVisible)` sarmalayıcı YOK (2026-09-05 dersi: sessizce geçer). E-posta
 * kutusu her gönderimde KAPATILIR (yerelde RESEND_API_KEY dolu → gerçek gönderim olurdu) ve
 * cari e-postasız yaratılır. Stok iddiaları API'den (products GET), UI iddiaları ekrandan.
 */
import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { gotoApp } from "./helpers/nav";
import { BASE_URL } from "./helpers/base-url";
import {
    createTestCustomer, deleteTestCustomer,
    createTestProduct, deleteTestProduct,
    createTestQuote, deleteTestQuote,
} from "./helpers/test-data";

let customerId = ""; let customerName = "";
let productId = ""; let productSku = "";
const createdQuoteIds: string[] = [];

async function stock(request: APIRequestContext) {
    const res = await request.get(`${BASE_URL}/api/products/${productId}`);
    expect(res.ok(), `products GET ${res.status()}`).toBe(true);
    const p = await res.json() as { on_hand: number; reserved: number; available_now: number };
    return { on_hand: p.on_hand, reserved: p.reserved, available_now: p.available_now };
}

/** Detay sayfasındaki "Gönder" → onay diyaloğu (e-posta kutusu KAPATILIR) → Gönder. */
async function sendFromDetail(page: Page, quoteId: string) {
    await gotoApp(page, `/dashboard/quotes/${quoteId}`);
    await page.getByRole("button", { name: /^gönder$/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Müşteriye teklif belgesini e-posta ile gönder").uncheck();
    await dialog.getByRole("button", { name: /^gönder$/i }).click();
    await expect(page.getByText(/teklif gönderildi/i).first()).toBeVisible({ timeout: 20_000 });
}

test.beforeAll(async ({ request }) => {
    const c = await createTestCustomer(request, { email: undefined, address: "E2E Mah. Test Cad. No:1, İstanbul" });
    customerId = c.id; customerName = c.name;
    const p = await createTestProduct(request, { on_hand: 10, currency: "TRY" });
    productId = p.id; productSku = p.sku;
});

test.afterAll(async ({ request }) => {
    // Taslaklar silinir; gönderilmiş/kabul edilmiş olanlar reddedilerek rezervi bırakır
    // (kabul edilen teklifin siparişi soft-cancel ile serbest kalır).
    for (const id of createdQuoteIds) {
        const q = await request.get(`${BASE_URL}/api/quotes/${id}`).then(r => r.ok() ? r.json() : null).catch(() => null) as
            { status?: string; convertedOrderId?: string } | null;
        if (!q) continue;
        if (q.status === "draft") await deleteTestQuote(request, id).catch(() => {});
        else if (q.status === "sent") await request.patch(`${BASE_URL}/api/quotes/${id}`, { data: { transition: "rejected" } }).catch(() => {});
        else if (q.status === "accepted" && q.convertedOrderId) await request.delete(`${BASE_URL}/api/orders/${q.convertedOrderId}`).catch(() => {});
    }
    await deleteTestProduct(request, productId).catch(() => {});
    await deleteTestCustomer(request, customerId).catch(() => {});
});

// ── Liste ─────────────────────────────────────────────────────────────────────

test("teklif listesi: durum sekmeleri TAB rolüyle, arama sonucu daraltır", async ({ page }) => {
    await gotoApp(page, "/dashboard/quotes");
    await expect(page.getByRole("tab", { name: /^tümü/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /^taslak/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /yeni teklif/i })).toBeVisible();

    await page.getByLabel("Teklif ara").fill("E2E-YOK-XYZ-000");
    await expect.poll(async () => {
        const rows = await page.locator("table tbody tr").count();
        const empty = await page.getByText(/bulunamadı|teklif yok/i).first().isVisible().catch(() => false);
        return rows === 0 || empty;
    }, { timeout: 15_000 }).toBe(true);
});

// ── Yeni form + önizleme ──────────────────────────────────────────────────────

test("yeni teklif: cari + ürün autocomplete doldurur, Önizle belgeyi localStorage'dan basar", async ({ page }) => {
    await gotoApp(page, "/dashboard/quotes/new");

    const custInput = page.getByLabel("Müşteri firma adı");
    await custInput.fill(customerName);   // tam ad: aynı önekli eski test carileri öneri listesini doldurur
    await page.locator(".q-cust-opt", { hasText: customerName }).first().click();
    await expect(custInput).toHaveValue(customerName);

    const codeInput = page.getByLabel("Satır 1 ürün kodu");
    await codeInput.fill(productSku);
    await page.locator(".q-cust-opt", { hasText: productSku }).first().click();
    await expect(codeInput).toHaveValue(productSku);
    await expect(page.getByLabel("Satır 1 açıklama")).not.toHaveValue("");   // ürün adı otomatik doldu
    await page.getByLabel("Satır 1 adet").fill("2");

    await page.getByRole("button", { name: /önizle/i }).click();
    await page.waitForURL("**/dashboard/quotes/preview", { timeout: 15_000 });
    await expect(page.getByText(/TEKLİF FORMU/i).first()).toBeVisible();
    await expect(page.getByText(customerName).first()).toBeVisible();
    await expect(page.getByText(productSku).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /yazdır/i })).toBeVisible();
});

// ── Smoke (a): gönder → rezervasyon zinciri ───────────────────────────────────

test("smoke (a): gönder → stok rezerve → bekleyen sipariş → fazlası kısmi → reddet geri → kabul Onaylı", async ({ page, request }) => {
    test.setTimeout(180_000);
    expect(await stock(request)).toEqual({ on_hand: 10, reserved: 0, available_now: 10 });

    // 1) Birinci teklif: 6 adet → gönder → tam rezerv
    const q1 = await createTestQuote(request, { customerId, customerName, productId, productSku, quantity: 6 });
    createdQuoteIds.push(q1.id);
    await sendFromDetail(page, q1.id);
    await expect(page.getByText(/stok rezerve edildi \(bekleyen sipariş\)/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Gönderildi").first()).toBeVisible();
    await expect.poll(() => stock(request).then(s => s.available_now), { timeout: 15_000 }).toBe(4);
    expect(await stock(request)).toEqual({ on_hand: 10, reserved: 6, available_now: 4 });

    // 2) Siparişler → Bekleyen sekmesinde bağlı sipariş
    await gotoApp(page, "/dashboard/orders?tab=pending_approval");
    const pendingRow = page.locator("table tbody tr", { hasText: customerName }).first();
    await expect(pendingRow).toBeVisible({ timeout: 15_000 });
    await expect(pendingRow.getByText("Bekliyor")).toBeVisible();

    // 3) İkinci teklif: 6 adet, stok 4 → kısmi + shortage (teklif yine gönderilir)
    const q2 = await createTestQuote(request, { customerId, customerName, productId, productSku, quantity: 6 });
    createdQuoteIds.push(q2.id);
    await sendFromDetail(page, q2.id);
    await expect(page.getByText(/kısmen rezerve edildi \(2 birim yetersiz\)/i)).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => stock(request).then(s => s.available_now), { timeout: 15_000 }).toBe(0);

    // 4) Reddet → bağlı sipariş iptal → rezerv geri
    await page.getByRole("button", { name: /^reddet$/i }).click();
    await page.getByRole("dialog").getByRole("button", { name: /evet, reddet/i }).click();
    await expect(page.getByText("Reddedildi").first()).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => stock(request).then(s => s.available_now), { timeout: 15_000 }).toBe(4);

    // 5) Kabul → bağlı bekleyen sipariş ONAYLI olur, rezerv korunur
    await gotoApp(page, `/dashboard/quotes/${q1.id}`);
    await page.getByRole("button", { name: /kabul et ve siparişe dönüştür/i }).click();
    await page.getByRole("dialog").getByRole("button", { name: /kabul et ve dönüştür/i }).click();
    // Kabul sonrası sayfa bağlı siparişe YÖNLENİR (`router.push`); "sipariş oluşturuldu" toast'ı 3 sn'lik
    // ve geçici (tam koşumda yük altında kaçırıldı) → iddia kalıcı yüzeylere bağlanır: sipariş detayı + API + teklif rozeti
    await page.waitForURL(/\/dashboard\/orders\/[0-9a-f-]{36}$/, { timeout: 20_000 });
    await expect(page.getByText("Onaylı", { exact: true }).first()).toBeVisible({ timeout: 15_000 });
    const detail = await request.get(`${BASE_URL}/api/quotes/${q1.id}`).then(r => r.json()) as { status: string; convertedOrderId?: string };
    expect(detail.status).toBe("accepted");
    expect(detail.convertedOrderId, "kabul edilen teklifin bağlı siparişi olmalı").toBeTruthy();
    const order = await request.get(`${BASE_URL}/api/orders/${detail.convertedOrderId}`).then(r => r.json()) as { commercial_status: string };
    expect(order.commercial_status).toBe("approved");
    expect(await stock(request)).toEqual({ on_hand: 10, reserved: 6, available_now: 4 });
    await gotoApp(page, `/dashboard/quotes/${q1.id}`);
    await expect(page.getByText("Kabul Edildi").first()).toBeVisible({ timeout: 15_000 });

    await gotoApp(page, `/dashboard/orders/${detail.convertedOrderId}`);
    await expect(page.getByText("Onaylı").first()).toBeVisible({ timeout: 15_000 });
});

// ── Smoke (b): yeni sayfada inline Gönder, Kaydet-sonra-Gönder ────────────────

test("smoke (b): /quotes/new — Kaydet, sonra inline Gönder (1/2 → 2/2) → detaya düşer, URL/durum tutarlı", async ({ page, request }) => {
    test.setTimeout(120_000);
    const before = await stock(request);

    await gotoApp(page, "/dashboard/quotes/new");
    await page.getByLabel("Müşteri firma adı").fill(customerName);
    await page.locator(".q-cust-opt", { hasText: customerName }).first().click();
    await page.getByLabel("Satır 1 ürün kodu").fill(productSku);
    await page.locator(".q-cust-opt", { hasText: productSku }).first().click();
    await page.getByLabel("Satır 1 adet").fill("1");

    // Kaydet: URL teklif id'sine geçer ama sayfa /new bileşeninde kalır (skipUrlSync yolu).
    await page.getByRole("button", { name: /^kaydet$/i }).click();
    await page.waitForURL(/\/dashboard\/quotes\/[0-9a-f-]{36}$/, { timeout: 20_000 });
    const savedId = new URL(page.url()).pathname.split("/").pop()!;
    createdQuoteIds.push(savedId);

    // Sonra inline Gönder: 1/2 (e-posta kutusu kapat) → Devam Et → 2/2 Evet, Gönder
    await page.getByRole("button", { name: /^gönder$/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(/teklifi gönder \(1\/2\)/i)).toBeVisible();
    await dialog.getByLabel("Müşteriye teklif belgesini e-posta ile gönder").uncheck();
    await dialog.getByRole("button", { name: /devam et/i }).click();
    await expect(dialog.getByText(/son onay \(2\/2\)/i)).toBeVisible();
    await dialog.getByRole("button", { name: /evet, gönder/i }).click();

    // Detaya push: aynı id, durum Gönderildi, stok 1 düştü — desync yok.
    await page.waitForURL(`**/dashboard/quotes/${savedId}`, { timeout: 30_000 });
    await expect(page.getByText("Gönderildi").first()).toBeVisible({ timeout: 20_000 });
    const q = await request.get(`${BASE_URL}/api/quotes/${savedId}`).then(r => r.json()) as { status: string; quoteNumber: string };
    expect(q.status).toBe("sent");
    await expect(page.getByText(q.quoteNumber).first()).toBeVisible();
    await expect.poll(() => stock(request).then(s => s.available_now), { timeout: 15_000 }).toBe(before.available_now - 1);
});
