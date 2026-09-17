/**
 * Developer Console E2E (2026-09-16, A1 kapsama) — E2E hesabı `INTERNAL_OPERATOR_EMAILS`'te
 * (yoksa proxy 7 rotayı da kapatır; bu spec o durumda AÇIKÇA düşer, sessizce geçmez).
 *  - 7 sayfa başlıklarıyla yüklenir
 *  - Hatalar: filtre URL'e yazılır (A4 sözleşmesi: parametre YOKSA varsayılan, VARSA o değer;
 *    "Tüm durumlar" `?status=` boş değer olarak yazılır)
 *  - Kayıtlar: `?sources=` çoklu seçim
 */
import { test, expect } from "@playwright/test";
import { gotoApp } from "./helpers/nav";

const PAGES: Array<[string, RegExp]> = [
    ["/dashboard/developer", /developer console/i],
    ["/dashboard/developer/errors", /hatalar/i],
    ["/dashboard/developer/logs", /kayıtlar/i],
    ["/dashboard/developer/bugs", /bug/i],
    ["/dashboard/developer/performance", /performans/i],
    ["/dashboard/developer/diagnostics", /tanılama/i],
];

for (const [path, title] of PAGES) {
    test(`${path} yüklenir ve h1 başlığı '${title.source}'`, async ({ page }) => {
        await gotoApp(page, path);
        await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible({ timeout: 15_000 });
    });
}

test("Hatalar: durum filtresi URL'e yazılır; 'Tüm durumlar' boş `status=` olarak kalır; yenilemede korunur", async ({ page }) => {
    await gotoApp(page, "/dashboard/developer/errors");
    const status = page.getByLabel("Durum filtresi");
    await expect(status).toBeVisible();
    // Varsayılan (open) URL'e YAZILMAZ
    expect(new URL(page.url()).searchParams.has("status")).toBe(false);
    const options = await status.locator("option").evaluateAll(os => os.map(o => (o as HTMLOptionElement).value));
    const nonDefault = options.find(v => v !== "open" && v !== "");
    expect(nonDefault, "en az bir varsayılan-dışı durum seçeneği olmalı").toBeTruthy();
    await status.selectOption(nonDefault!);
    await expect(page).toHaveURL(new RegExp(`status=${nonDefault}`), { timeout: 10_000 });
    // "Tüm durumlar" = boş değer → `status=` (sentinel yok)
    await status.selectOption("");
    await expect(page).toHaveURL(/[?&]status=(&|$)/, { timeout: 10_000 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByLabel("Durum filtresi")).toHaveValue("", { timeout: 15_000 });
});

test("Kayıtlar: kaynak düğmeleri aria-pressed ile çoklu seçim, seçim `?sources=` olarak URL'e yazılır", async ({ page }) => {
    await gotoApp(page, "/dashboard/developer/logs");
    const pressed = page.locator("button[aria-pressed]");
    await expect(pressed.first()).toBeVisible({ timeout: 15_000 });
    const count = await pressed.count();
    expect(count).toBeGreaterThanOrEqual(2);
    const first = pressed.first();
    const wasPressed = (await first.getAttribute("aria-pressed")) === "true";
    await first.click();
    await expect(first).toHaveAttribute("aria-pressed", wasPressed ? "false" : "true");
    await expect(page).toHaveURL(/sources=/, { timeout: 10_000 });
});
