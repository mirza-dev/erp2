/**
 * Ayarlar → Teknik Şablonlar (product-types) E2E — liste · Yeni Şablon modalı · [id] detay
 * (başlık düzenle, Alan Ekle modalı, düzenlemede field_key salt-okunur).
 */
import { test, expect } from "@playwright/test";
import { gotoApp } from "./helpers/nav";
import { BASE_URL } from "./helpers/base-url";

const createdTypeIds: string[] = [];

test.afterAll(async ({ request }) => {
    for (const id of createdTypeIds) await request.delete(`${BASE_URL}/api/product-types/${id}`).catch(() => {});
});

test("teknik şablon listesi: başlık, 'Şablonsuz Ürün' metriği, satırlar detaya bağlı", async ({ page }) => {
    await gotoApp(page, "/dashboard/settings/product-types");
    await expect(page.getByRole("heading", { level: 1, name: /teknik şablonlar/i })).toBeVisible();
    await expect(page.getByText(/şablonsuz ürün/i).first()).toBeVisible({ timeout: 15_000 });
    // Migration 057 sekiz tip tohumlar → en az bir satır ve detay bağlantısı
    const firstLink = page.locator('a[href^="/dashboard/settings/product-types/"]').first();
    await expect(firstLink).toBeVisible({ timeout: 15_000 });
});

test("Yeni Şablon modalı → oluştur → listede + [id] detayda Alan Ekle modalı çalışır", async ({ page, request }) => {
    test.setTimeout(120_000);
    const name = `E2E Şablon ${Date.now()}`;
    await gotoApp(page, "/dashboard/settings/product-types");
    await page.getByRole("button", { name: /yeni şablon/i }).click();
    const modal = page.getByRole("dialog", { name: /yeni teknik şablon/i });
    await expect(modal).toBeVisible();
    await modal.getByLabel("Şablon adı").fill(name);
    await modal.getByRole("button", { name: /^oluştur$/i }).click();
    await expect(modal).toBeHidden({ timeout: 15_000 });
    await expect(page.getByText(name).first()).toBeVisible({ timeout: 15_000 });

    const list = await request.get(`${BASE_URL}/api/product-types`).then(r => r.json()) as Array<{ id: string; name: string }> | { rows?: Array<{ id: string; name: string }> };
    const rows = Array.isArray(list) ? list : (list.rows ?? []);
    const created = rows.find(t => t.name === name);
    expect(created, "API'de şablon olmalı").toBeTruthy();
    createdTypeIds.push(created!.id);

    // Detay: alan ekle
    await gotoApp(page, `/dashboard/settings/product-types/${created!.id}`);
    await expect(page.getByLabel("Şablon adı")).toHaveValue(name, { timeout: 15_000 });
    await page.getByRole("button", { name: /alan ekle/i }).click();
    const fieldModal = page.getByRole("dialog");
    await expect(fieldModal).toBeVisible();
    await fieldModal.getByLabel("Türkçe etiket").fill("Basınç Sınıfı");
    await fieldModal.getByLabel("Teknik anahtar", { exact: true }).fill("basinc_sinifi");
    await fieldModal.getByRole("button", { name: /^ekle$/i }).click();
    await expect(page.getByText(/teknik alan eklendi/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("basinc_sinifi").first()).toBeVisible({ timeout: 15_000 });

    // Düzenlemede anahtar salt-okunur (field_key değişimi reddedilir — Ayarlar Blok 2 kararı)
    await page.getByRole("button", { name: "Basınç Sınıfı düzenle" }).click();
    const editModal = page.getByRole("dialog");
    await expect(editModal).toBeVisible();
    const keyRo = editModal.getByLabel("Teknik anahtar (değiştirilemez)");
    await expect(keyRo).toHaveValue("basinc_sinifi");
    await expect(keyRo).toHaveAttribute("readonly", "");
    await editModal.getByRole("button", { name: "İptal", exact: true }).click(); // Türkçe İ: regex `i` bayrağı eşlemez
});
