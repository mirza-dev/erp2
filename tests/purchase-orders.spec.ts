/**
 * Purchase Orders E2E — liste · yeni PO formu · detay (Onayla → Mal Kabul bölgesi; iptal gerekçesi
 * zorunlu) · print sayfası (belge render + guard/redaksiyon sayfada).
 *
 * Tedarikçi e-postasız (PO "Gönder" e-posta yolu kullanılmıyor; "Onayla" ile ilerlenir).
 */
import { test, expect } from "@playwright/test";
import { gotoApp } from "./helpers/nav";
import { BASE_URL } from "./helpers/base-url";
import {
    createTestProduct, deleteTestProduct, createTestVendor, deleteTestVendor,
    createTestPurchaseOrder, cancelTestPurchaseOrder, getJson,
} from "./helpers/test-data";

let productId = ""; let productSku = "";
let vendorId = ""; let vendorName = "";
const poIds: string[] = [];

test.beforeAll(async ({ request }) => {
    const p = await createTestProduct(request, { on_hand: 3, cost_price: 40, currency: "TRY" });
    productId = p.id; productSku = p.sku;
    const v = await createTestVendor(request);
    vendorId = v.id; vendorName = v.name;
});

test.afterAll(async ({ request }) => {
    for (const id of poIds) await cancelTestPurchaseOrder(request, id).catch(() => {});
    await deleteTestVendor(request, vendorId).catch(() => {});
    await deleteTestProduct(request, productId).catch(() => {});
});

test("PO listesi: sekmeler tab rolüyle, arama PO numarasını bulur, satır detaya gider", async ({ page, request }) => {
    const po = await createTestPurchaseOrder(request, { vendorId, productId });
    poIds.push(po.id);
    await gotoApp(page, "/dashboard/purchase/orders");
    await expect(page.getByRole("tab").first()).toBeVisible();
    await expect(page.getByRole("link", { name: /yeni sipariş/i })).toBeVisible();
    await page.getByLabel("Sipariş ara").fill(po.poNumber);
    // Arama 350 ms debounce + `router.replace(?search=)`; yeni PO en üst satır olduğu için satır
    // debounce'tan ÖNCE de görünür — o anda tıklanırsa gecikmiş replace detay push'unu EZER
    // (tam koşumda ölçüldü: URL `?search=…`de kaldı). Önce aramanın URL'e yazılması beklenir.
    await page.waitForURL(/[?&]search=/, { timeout: 15_000 });
    const row = page.locator("table tbody tr", { hasText: po.poNumber });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.getByText(po.poNumber).click();
    await page.waitForURL(`**/dashboard/purchase/orders/${po.id}`, { timeout: 15_000 });
    await expect(page.getByText(po.poNumber).first()).toBeVisible();
});

test("yeni PO formu: tedarikçi + satır (ürün) → Sipariş Oluştur → detay + API'de taslak", async ({ page, request }) => {
    await gotoApp(page, "/dashboard/purchase/orders/new");
    await page.getByLabel("Tedarikçi", { exact: true }).selectOption(vendorId);
    await page.getByLabel("Beklenen tarih").fill(new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10));
    // Form bir boş satırla açılır — "Line 1 ürün" seçicisi.
    await page.getByLabel("Line 1 ürün").selectOption(productId);
    await page.getByRole("button", { name: /sipariş oluştur/i }).click();
    await page.waitForURL(/\/dashboard\/purchase\/orders\/[0-9a-f-]{36}$/, { timeout: 20_000 });
    const id = new URL(page.url()).pathname.split("/").pop()!;
    poIds.push(id);
    const { body: po } = await getJson<{ status: string; lines: Array<{ product_id: string }> }>(request, `${BASE_URL}/api/purchase-orders/${id}`);
    expect(po.status).toBe("draft");
    expect(po.lines.map(l => l.product_id)).toEqual([productId]);
    await expect(page.getByText(vendorName).first()).toBeVisible();
});

test("detay: Onayla → Onaylandı; Mal Kabul bölgesi açılır; iptal gerekçesiz kilitli, gerekçeyle iptal", async ({ page, request }) => {
    test.setTimeout(120_000);
    const po = await createTestPurchaseOrder(request, { vendorId, productId, quantity: 4 });
    poIds.push(po.id);
    await gotoApp(page, `/dashboard/purchase/orders/${po.id}`);

    await page.getByRole("button", { name: /^onayla$/i }).click();
    await expect(page.getByText("Onaylandı").first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: /^mal kabul$/i }).click();
    await expect(page.getByRole("region", { name: /mal kabul girişi/i })).toBeVisible();

    // İptal: gerekçe ZORUNLU (boş → hata toast'ı, modal açık kalır) → gerekçeyle iptal
    // Türkçe "İ": regex `i` bayrağı U+0130'ı ASCII i ile eşlemez → literal ad (exact)
    await page.getByRole("button", { name: "İptal Et", exact: true }).first().click();
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();
    // Gerekçe boşken onay butonu DEVRE DIŞI (`disabled={… || !cancelReason.trim()}`) — toast ikinci savunma,
    // UI'dan tetiklenemez; iddia butonun kilidine bağlanır.
    const confirmCancel = modal.getByRole("button", { name: "İptal Et", exact: true });
    await expect(confirmCancel).toBeDisabled();
    await modal.getByLabel("İptal gerekçesi").fill("E2E: sipariş iptal denemesi");
    await expect(confirmCancel).toBeEnabled();
    await confirmCancel.click();
    await expect(page.getByText("İptal", { exact: true }).first()).toBeVisible({ timeout: 15_000 });
    const { body: after } = await getJson<{ status: string; cancel_reason: string | null }>(request, `${BASE_URL}/api/purchase-orders/${po.id}`);
    expect(after.status).toBe("cancelled");
    expect(after.cancel_reason).toContain("E2E");
});

test("print sayfası: belge PO numarası + tedarikçi + satır SKU + Genel Toplam basar (admin: tutarlar görünür)", async ({ page, request }) => {
    const po = await createTestPurchaseOrder(request, { vendorId, productId, quantity: 2, unitPrice: 40 });
    poIds.push(po.id);
    await page.goto(`/dashboard/purchase/orders/${po.id}/print`, { waitUntil: "domcontentloaded" });
    const doc = page.locator("#po-document");
    await expect(doc).toBeVisible({ timeout: 30_000 });
    await expect(doc.getByText(po.poNumber).first()).toBeVisible();
    await expect(doc.getByText(vendorName).first()).toBeVisible();
    await expect(doc.getByText(productSku).first()).toBeVisible();
    await expect(doc.getByText(/genel toplam/i)).toBeVisible();
    // 2 × 40 = 80 + KDV → tutar basılır, redakte "—" değil (admin view_purchase_costs taşır)
    await expect(doc.getByText(/80,00/).first()).toBeVisible();
});
