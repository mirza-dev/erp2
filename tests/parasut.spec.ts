/**
 * Paraşüt Integration E2E Tests
 */
import { test, expect } from "@playwright/test";
import { gotoApp } from "./helpers/nav";

test.beforeEach(async ({ page }) => {
    await gotoApp(page, "/dashboard/parasut");
});

test("paraşüt sayfası yükleniyor", async ({ page }) => {
    await expect(page.locator("main")).toBeVisible();
    await expect(page.getByText(/paraşüt|muhasebe/i).first()).toBeVisible();
});

test("bağlantı durumu görüntüleniyor", async ({ page }) => {
    await expect(
        page.getByText(/bağlı|bağlantı|connected|aktif|pasif/i).first()
    ).toBeVisible({ timeout: 8_000 });
});

test("sync log tablosu render ediliyor", async ({ page }) => {
    await expect(
        page.locator("table")
            .or(page.getByText(/log|sync|senkronizasyon|henüz/i))
            .first()
    ).toBeVisible({ timeout: 8_000 });
});

test("istatistik kartları görünür", async ({ page }) => {
    await expect(
        page.getByText(/senkronize|bekleyen|başarısız|toplam/i).first()
    ).toBeVisible({ timeout: 8_000 });
});
