/**
 * Vendors E2E — liste/arama · yeni tedarikçi (Drawer) · detay paneli · pasife al / pasifleri göster.
 * Sarmalayıcı yok: her adım ya görünür ya test düşer.
 */
import { test, expect } from "@playwright/test";
import { gotoApp } from "./helpers/nav";
import { BASE_URL } from "./helpers/base-url";
import { createTestVendor, deleteTestVendor } from "./helpers/test-data";

let vendorId = ""; let vendorName = "";
const uiCreated: string[] = [];

test.beforeAll(async ({ request }) => {
    const v = await createTestVendor(request);
    vendorId = v.id; vendorName = v.name;
});

test.afterAll(async ({ request }) => {
    await deleteTestVendor(request, vendorId).catch(() => {});
    for (const id of uiCreated) await deleteTestVendor(request, id).catch(() => {});
});

test("tedarikçi listesi yükleniyor ve arama daraltıyor", async ({ page }) => {
    await gotoApp(page, "/dashboard/vendors");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator("table tbody tr", { hasText: vendorName })).toBeVisible({ timeout: 15_000 });

    await page.getByLabel("Tedarikçi ara").fill(vendorName);
    await expect.poll(async () => page.locator("table tbody tr").count(), { timeout: 15_000 }).toBe(1);
    await page.getByLabel("Tedarikçi ara").fill("E2E-YOK-XYZ-000");
    await expect.poll(async () => {
        const rows = await page.locator("table tbody tr").count();
        const empty = await page.getByText(/bulunamadı|tedarikçi yok/i).first().isVisible().catch(() => false);
        return rows === 0 || empty;
    }, { timeout: 15_000 }).toBe(true);
});

test("Yeni Tedarikçi çekmecesi: form doldur → kaydet → listede", async ({ page, request }) => {
    const name = `E2E Drawer Tedarikçi ${Date.now()}`;
    await gotoApp(page, "/dashboard/vendors");
    await page.getByRole("button", { name: /yeni tedarikçi/i }).click();
    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible();
    await drawer.getByLabel(/tedarikçi adı/i).fill(name);
    await drawer.getByLabel("İletişim Kişisi", { exact: true }).fill("E2E Kişi"); // Türkçe İ: regex `i` bayrağı eşlemez
    await drawer.getByRole("button", { name: /^ekle$/i }).click();
    await expect(drawer).toBeHidden({ timeout: 15_000 });
    await expect(page.locator("table tbody tr", { hasText: name })).toBeVisible({ timeout: 15_000 });

    const list = await request.get(`${BASE_URL}/api/vendors`).then(r => r.json()) as Array<{ id: string; name: string }>;
    const created = list.find(v => v.name === name);
    expect(created, "API listesinde de olmalı").toBeTruthy();
    uiCreated.push(created!.id);
});

test("satıra tıklayınca detay paneli açılır (PO/alım istatistikleri) ve Escape kapatır", async ({ page }) => {
    await gotoApp(page, "/dashboard/vendors");
    await page.getByLabel("Tedarikçi ara").fill(vendorName);
    await page.waitForURL(/[?&]search=/, { timeout: 15_000 }); // debounce'lu arama URL'e yazılsın, sonra tıkla
    const row = page.locator("table tbody tr", { hasText: vendorName });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.getByText(vendorName).click();
    const panel = page.getByRole("dialog");
    await expect(panel).toBeVisible();
    await expect(panel.getByText(vendorName).first()).toBeVisible();
    await expect(panel.getByText(/satın alma siparişi/i)).toBeVisible({ timeout: 15_000 });
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
});

test("Pasife al → satır aktif listeden düşer, 'Pasifleri göster' ile geri görünür", async ({ page, request }) => {
    const v = await createTestVendor(request);
    uiCreated.push(v.id);
    await gotoApp(page, "/dashboard/vendors");
    await page.getByLabel("Tedarikçi ara").fill(v.name);
    await page.waitForURL(/[?&]search=/, { timeout: 15_000 });
    const row = page.locator("table tbody tr", { hasText: v.name });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.getByRole("button", { name: /pasife al/i }).click();
    await expect(row).toBeHidden({ timeout: 15_000 });

    // Checkbox URL-durumlu (onChange → navigate → RSC turu): `check()` durumu ANINDA doğrular ve düşer → click + bekleyen iddia
    const showAll = page.getByLabel(/pasifleri göster/i);
    await showAll.click();
    await expect(showAll).toBeChecked({ timeout: 15_000 });
    await expect(page.locator("table tbody tr", { hasText: v.name })).toBeVisible({ timeout: 15_000 });
});
