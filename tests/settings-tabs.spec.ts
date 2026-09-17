/**
 * Ayarlar alt rotaları E2E (2026-09-16, A1 kapsama):
 *  - /settings/note-templates → yönlendirme (?tab=not-sablonlari) + Not Şablonları sekmesi içeriği
 *  - /settings/email-deliveries → liste + filtreler + Yenile (admin, view_settings)
 * (settings/users kasıtlı DIŞARIDA: onboarding.spec'i paralel oturum yazıyor.)
 */
import { test, expect } from "@playwright/test";
import { gotoApp } from "./helpers/nav";

test("note-templates eski rotası Ayarlar sekmesine yönlendirir ve sekme içeriği gelir", async ({ page }) => {
    await gotoApp(page, "/dashboard/settings/note-templates");
    await expect(page).toHaveURL(/\/dashboard\/settings\?tab=not-sablonlari/, { timeout: 15_000 });
    await expect(page.getByRole("button", { name: /yeni şablon/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/pasifleri göster/i)).toBeVisible();
});

test("Not Şablonları: Yeni Şablon modalı açılır, kategori seçici var, Escape kapatır", async ({ page }) => {
    await gotoApp(page, "/dashboard/settings?tab=not-sablonlari");
    await page.getByRole("button", { name: /yeni şablon/i }).click();
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();
    await expect(modal.getByLabel("Şablon kategorisi")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(modal).toBeHidden();
});

test("E-posta Teslimatları: başlık, filtre kontrolleri, Yenile; liste ya satır ya boş mesaj", async ({ page }) => {
    await gotoApp(page, "/dashboard/settings/email-deliveries");
    await expect(page.getByRole("heading", { level: 1, name: /e-posta teslimatları/i })).toBeVisible();
    await expect(page.getByLabel("Teslimat durumu")).toBeVisible();
    await expect(page.getByLabel("Bildirim türü")).toBeVisible();
    await expect(page.getByLabel("Alıcı ara")).toBeVisible();
    await page.getByRole("button", { name: /yenile/i }).click();
    const table = page.locator("table tbody tr").first().or(page.getByText(/teslimat kaydı bulunamadı/i));
    await expect(table.first()).toBeVisible({ timeout: 15_000 });
    // Filtre: olmayan alıcı → boş
    await page.getByLabel("Alıcı ara").fill("e2e-yok@ornek.invalid");
    await expect(page.getByText(/teslimat kaydı bulunamadı/i)).toBeVisible({ timeout: 15_000 });
});
