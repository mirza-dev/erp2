/**
 * RFQ (Tedarikçi Fiyat Talebi) E2E — liste · yeni talep formu · detay (sekmeler, gönder, fiyat girişi, karşılaştırma).
 *
 * Tedarikçiler E-POSTASIZ: "Gönder" e-postası olan tedarikçiye gerçek Resend çağrısı yapar;
 * e-postasız tedarikçide servis yalnız arşivler ("elle iletilmeli" uyarısı) → dış etki yok.
 */
import { test, expect } from "@playwright/test";
import { gotoApp } from "./helpers/nav";
import { BASE_URL } from "./helpers/base-url";
import {
    createTestProduct, deleteTestProduct, createTestVendor, deleteTestVendor,
    createTestRfq, cancelTestRfq, getJson,
} from "./helpers/test-data";

let productId = ""; let productSku = "";
let vendorId = ""; let vendorName = "";
const rfqIds: string[] = [];

test.beforeAll(async ({ request }) => {
    const p = await createTestProduct(request, { on_hand: 0 });
    productId = p.id; productSku = p.sku;
    const v = await createTestVendor(request);
    vendorId = v.id; vendorName = v.name;
});

test.afterAll(async ({ request }) => {
    for (const id of rfqIds) await cancelTestRfq(request, id).catch(() => {});
    await deleteTestVendor(request, vendorId).catch(() => {});
    await deleteTestProduct(request, productId).catch(() => {});
});

test("fiyat talepleri listesi: sekmeler tab rolüyle, arama, Yeni Fiyat Talebi bağlantısı", async ({ page, request }) => {
    const rfq = await createTestRfq(request, { productId, vendorIds: [vendorId] });
    rfqIds.push(rfq.id);
    await gotoApp(page, "/dashboard/purchase/rfqs");
    await expect(page.getByRole("heading", { level: 1, name: /fiyat talepleri/i })).toBeVisible();
    await expect(page.getByRole("tab").first()).toBeVisible();
    await expect(page.getByRole("link", { name: /yeni fiyat talebi/i })).toBeVisible();
    await expect(page.getByText(rfq.rfqNumber).first()).toBeVisible({ timeout: 15_000 });
    // getByLabel("Ara") alt-dize eşler → "K-ara-ra Bağlandı" sekmesine çarpar; rol+exact
    await page.getByRole("textbox", { name: "Ara", exact: true }).fill("E2E-YOK-XYZ-000");
    await expect(page.getByText(rfq.rfqNumber)).toBeHidden({ timeout: 15_000 });
});

test("yeni talep: başlık + kalem (ürün) + tedarikçi seç → Talep Oluştur → detaya düşer", async ({ page, request }) => {
    const title = `E2E RFQ UI ${Date.now()}`;
    await gotoApp(page, "/dashboard/purchase/rfqs/new");
    await page.getByLabel(/başlık/i).fill(title);
    // Form zaten bir boş kalemle açılır (`useState([{...emptyLine}])`) — "Kalem Ekle" ikinci boş satır yaratır ve doğrulama düşer
    await page.getByLabel("Kalem 1 ürün").selectOption(productId);
    await page.getByRole("checkbox", { name: vendorName }).check();
    await page.getByRole("button", { name: /talep oluştur/i }).click();
    await page.waitForURL(/\/dashboard\/purchase\/rfqs\/[0-9a-f-]{36}$/, { timeout: 20_000 });
    const id = new URL(page.url()).pathname.split("/").pop()!;
    rfqIds.push(id);
    await expect(page.getByText(title).first()).toBeVisible({ timeout: 15_000 });
    const { body: detail } = await getJson<{ status: string }>(request, `${BASE_URL}/api/rfqs/${id}`);
    expect(detail.status).toBe("draft");
});

test("detay: Gönder (e-postasız tedarikçi → yalnız arşiv) → sekmeler → Fiyat Gir → Karşılaştırma'da tutar", async ({ page, request }) => {
    test.setTimeout(120_000);
    const rfq = await createTestRfq(request, { productId, vendorIds: [vendorId] });
    rfqIds.push(rfq.id);
    await gotoApp(page, `/dashboard/purchase/rfqs/${rfq.id}`);
    await expect(page.getByText(rfq.rfqNumber).first()).toBeVisible();

    await page.getByRole("button", { name: /^gönder$/i }).click();
    await expect(page.getByText(/gönderildi/i).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: /karşılaştır & karar/i })).toBeVisible({ timeout: 15_000 });

    // Sekmeler TAB rolüyle (FilterChips)
    await expect(page.getByRole("tab", { name: "İstenen Kalemler", exact: true })).toBeVisible(); // Türkçe İ
    await expect(page.getByRole("tab", { name: /karşılaştırma/i })).toBeVisible();

    // Fiyat gir (tedarikçi paneli) → modal → kaydet
    await page.getByRole("button", { name: /fiyat gir/i }).first().click();
    const modal = page.getByRole("dialog");
    await expect(modal.getByText(/fiyat girişi/i)).toBeVisible();
    await modal.getByLabel(/birim fiyat/i).first().fill("42.5");
    await modal.getByRole("button", { name: /^kaydet$/i }).click();
    await expect(modal).toBeHidden({ timeout: 15_000 });

    // Karşılaştırma sekmesinde tutar görünür
    await page.getByRole("tab", { name: /karşılaştırma/i }).click();
    await expect(page.getByText(/42,50/).first()).toBeVisible({ timeout: 15_000 });
});
