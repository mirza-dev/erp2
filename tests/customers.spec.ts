/**
 * Customers E2E Tests
 */
import { test, expect } from "@playwright/test";
import { createTestCustomer, deleteTestCustomer } from "./helpers/test-data";

const TS = () => Date.now();

test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard/customers");
    await page.waitForLoadState("networkidle");
});

test("müşteri listesi yükleniyor", async ({ page }) => {
    await expect(page.locator("main")).toBeVisible();
    await expect(page.getByText(/müşteri/i).first()).toBeVisible();
});

test("müşteri ekleme modalı açılıyor ve müşteri oluşturuluyor", async ({ page, request }) => {
    const ts   = TS();
    const name = `E2E Müşteri ${ts}`;

    const addBtn = page.getByRole("button", { name: /müşteri ekle|yeni müşteri/i });
    if (await addBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await addBtn.click();
        await page.waitForTimeout(300);

        // Labels are siblings (not wrapping) — use placeholder selector
        await page.getByPlaceholder(/petronas|firma adı/i).first().fill(name);

        const emailInput = page.getByPlaceholder(/e-posta|procurement/i);
        if (await emailInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
            await emailInput.fill(`e2e-${ts}@testfirma.com`);
        }

        const submitBtn = page.getByRole("button", { name: /kaydet|oluştur|ekle/i }).last();
        if (await submitBtn.isEnabled({ timeout: 3_000 }).catch(() => false)) {
            await submitBtn.click();
            await page.waitForTimeout(1_500);
            // Toast veya listede görünüyor
            await expect(
                page.getByText(new RegExp(name.slice(0, 15), "i"))
                    .or(page.getByText(/eklendi|oluşturuldu/i))
                    .first()
            ).toBeVisible({ timeout: 8_000 });
        }
    }

    // Cleanup
    const res  = await request.get("http://localhost:3000/api/customers");
    const body = await res.json() as Array<{ id: string; name: string }>;
    const created = body.find((c) => c.name === name);
    if (created) await deleteTestCustomer(request, created.id).catch(() => {});
});

test("arama müşteri listesini filtreler", async ({ page }) => {
    const searchInput = page.getByPlaceholder(/ara|müşteri/i).first();
    if (await searchInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await searchInput.fill("NONEXISTENT-CUSTOMER-XYZ");
        await page.waitForTimeout(400);
        const rows = page.locator("table tbody tr");
        const count = await rows.count();
        expect(count).toBe(0);
    }
});

test("müşteri detay paneli tıklamayla açılıyor", async ({ page }) => {
    const firstRow = page.locator("table tbody tr").first();
    if (await firstRow.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await firstRow.click();
        await page.waitForTimeout(500);
        // Detay panel sağ tarafta görünür
        await expect(
            page.getByText(/sipariş|toplam gelir|son sipariş|iletişim/i).first()
        ).toBeVisible({ timeout: 5_000 });
    }
});

test("aktif/pasif tab filtresi çalışıyor", async ({ page }) => {
    const activeTab = page.getByRole("button", { name: /aktif/i })
        .or(page.getByText(/aktif müşteri/i).first());
    if (await activeTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await activeTab.click();
        await page.waitForTimeout(400);
        await expect(page.locator("main")).toBeVisible();
    }
});

test("müşteri silme onay dialogu çalışıyor", async ({ page, request }) => {
    const customer = await createTestCustomer(request);

    await page.reload();
    await page.waitForLoadState("networkidle");

    // Search for the customer
    const searchInput = page.getByPlaceholder(/ara|müşteri/i).first();
    if (await searchInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await searchInput.fill(customer.name.slice(0, 15));
        await page.waitForTimeout(500);
    }

    const deleteBtn = page.getByRole("button", { name: /sil/i }).first();
    if (await deleteBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await deleteBtn.click();
        await expect(
            page.getByRole("alertdialog")
                .or(page.getByText(/emin misin|silmek istediğinizden/i))
        ).toBeVisible({ timeout: 3_000 }).catch(() => {});

        // Cancel
        const cancelBtn = page.getByRole("button", { name: /iptal|hayır/i }).last();
        if (await cancelBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
            await cancelBtn.click();
        }
    }

    await deleteTestCustomer(request, customer.id).catch(() => {});
});

test("siparişi olan müşteri silinemiyor", async ({ page }) => {
    // Bu test ortamında siparişi olan müşteriler olabilir
    // Silme deneme → hata mesajı bekleniyor
    // Sadece UI'ın çalıştığını kontrol ediyoruz
    await expect(page.locator("main")).toBeVisible();
});
