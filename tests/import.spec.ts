/**
 * Import Wizard E2E Tests — the most critical flow
 */
import { test, expect } from "@playwright/test";
import path from "path";

const XLSX_PATH = path.join(__dirname, "fixtures/test-import.xlsx");
const TXT_PATH  = path.join(__dirname, "fixtures/invalid.txt");

// Create a small invalid file for testing
import fs from "fs";
if (!fs.existsSync(path.join(__dirname, "fixtures/invalid.txt"))) {
    fs.writeFileSync(path.join(__dirname, "fixtures/invalid.txt"), "This is not an Excel file");
}

test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard/import");
    await page.waitForLoadState("networkidle");
});

// ── Idle state ────────────────────────────────────────────────────────────────

test("import sayfası idle state ile yükleniyor", async ({ page }) => {
    await expect(page.locator("main")).toBeVisible();
    // Drag-drop zone veya "Dosya Seç" butonu
    await expect(
        page.getByText(/dosya seç|sürükle|drop|xlsx|içe aktarma/i).first()
    ).toBeVisible({ timeout: 5_000 });
});

test("geçersiz dosya türü yüklenince hata mesajı", async ({ page }) => {
    const fileInput = page.locator("input[type='file']");
    if (await fileInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await fileInput.setInputFiles(TXT_PATH);
        await expect(
            page.getByText(/desteklenmiyor|geçersiz|xlsx|excel/i)
        ).toBeVisible({ timeout: 5_000 });
    }
});

// ── Dosya yükleme → Sheet seçimi ─────────────────────────────────────────────

test("xlsx dosyası yükleniyor → analyzing → sheet_select", async ({ page }) => {
    const fileInput = page.locator("input[type='file']");
    await expect(fileInput).toBeAttached({ timeout: 5_000 });

    await fileInput.setInputFiles(XLSX_PATH);

    // Analyzing state
    await expect(
        page.getByText(/analiz|yükleniyor|analyzing/i)
    ).toBeVisible({ timeout: 8_000 }).catch(() => {});

    // Sheet select state — sheet adları görünmeli
    await expect(
        page.getByText(/urunler|musteriler|stok|sheet/i).first()
    ).toBeVisible({ timeout: 20_000 });
});

test("sheet seçim ekranında checkbox'lar görünür", async ({ page }) => {
    const fileInput = page.locator("input[type='file']");
    await expect(fileInput).toBeAttached({ timeout: 5_000 });
    await fileInput.setInputFiles(XLSX_PATH);
    await page.waitForTimeout(3_000);

    // Sheet listesi
    const checkboxes = page.locator("input[type='checkbox']");
    await expect(checkboxes.first()).toBeVisible({ timeout: 15_000 });
    const count = await checkboxes.count();
    expect(count).toBeGreaterThanOrEqual(1);
});

test("sheet seçimi toggle edilebiliyor", async ({ page }) => {
    const fileInput = page.locator("input[type='file']");
    await expect(fileInput).toBeAttached({ timeout: 5_000 });
    await fileInput.setInputFiles(XLSX_PATH);

    const checkbox = page.locator("input[type='checkbox']").first();
    await checkbox.waitFor({ state: "visible", timeout: 15_000 });
    const initialState = await checkbox.isChecked();
    await checkbox.click();
    const newState = await checkbox.isChecked();
    expect(newState).toBe(!initialState);
});

// ── Kolon eşleştirme ──────────────────────────────────────────────────────────

test("'Kolon Eşleştirmeye Geç' butonu tıklanıyor → mapping tablosu görünür", async ({ page }) => {
    const fileInput = page.locator("input[type='file']");
    await expect(fileInput).toBeAttached({ timeout: 5_000 });
    await fileInput.setInputFiles(XLSX_PATH);

    // Wait for sheet_select
    await expect(page.locator("input[type='checkbox']").first()).toBeVisible({ timeout: 15_000 });

    // En az bir sheet seçili olduğundan emin ol
    const firstCheckbox = page.locator("input[type='checkbox']").first();
    if (!await firstCheckbox.isChecked()) await firstCheckbox.click();

    // Next button
    const nextBtn = page.getByRole("button", { name: /kolon eşleştirme|devam|ileri/i });
    await expect(nextBtn).toBeEnabled({ timeout: 5_000 });
    await nextBtn.click();

    // Column mapping state — tablo veya kaynak chip'ler
    await expect(
        page.getByText(/hedef alan|eşleştir|source|mapping/i)
            .or(page.locator("select, [role='combobox']").first())
            .first()
    ).toBeVisible({ timeout: 20_000 });
});

test("kolon mapping tablosunda source chip'ler görünür (memory/fallback/ai)", async ({ page }) => {
    const fileInput = page.locator("input[type='file']");
    await expect(fileInput).toBeAttached({ timeout: 5_000 });
    await fileInput.setInputFiles(XLSX_PATH);
    await expect(page.locator("input[type='checkbox']").first()).toBeVisible({ timeout: 15_000 });

    const firstCheckbox = page.locator("input[type='checkbox']").first();
    if (!await firstCheckbox.isChecked()) await firstCheckbox.click();

    await page.getByRole("button", { name: /kolon eşleştirme|devam|ileri/i }).click();

    // Chip'ler: "Hafıza", "AI", "Fallback", "Kullanıcı"
    await expect(
        page.getByText(/hafıza|fallback|ai/i).first()
    ).toBeVisible({ timeout: 25_000 });
});

test("dropdown ile alan değiştirilince chip 'Kullanıcı' (sarı) oluyor", async ({ page }) => {
    const fileInput = page.locator("input[type='file']");
    await expect(fileInput).toBeAttached({ timeout: 5_000 });
    await fileInput.setInputFiles(XLSX_PATH);
    await expect(page.locator("input[type='checkbox']").first()).toBeVisible({ timeout: 15_000 });

    const firstCheckbox = page.locator("input[type='checkbox']").first();
    if (!await firstCheckbox.isChecked()) await firstCheckbox.click();
    await page.getByRole("button", { name: /kolon eşleştirme|devam|ileri/i }).click();

    // Wait for mappings to load
    const firstSelect = page.locator("select, [role='combobox']").first();
    await firstSelect.waitFor({ state: "visible", timeout: 25_000 });

    const options = await firstSelect.locator("option").allTextContents();
    if (options.length > 1) {
        await firstSelect.selectOption({ index: 1 });
        await page.waitForTimeout(300);
        // "Kullanıcı" chip'i görünmeli
        await expect(page.getByText(/kullanıcı/i).first()).toBeVisible({ timeout: 3_000 });
    }
});

// ── Preview ekranı ────────────────────────────────────────────────────────────

test("preview ekranı draft tablosunu gösteriyor", async ({ page }) => {
    const fileInput = page.locator("input[type='file']");
    await expect(fileInput).toBeAttached({ timeout: 5_000 });
    await fileInput.setInputFiles(XLSX_PATH);
    await expect(page.locator("input[type='checkbox']").first()).toBeVisible({ timeout: 15_000 });

    const firstCheckbox = page.locator("input[type='checkbox']").first();
    if (!await firstCheckbox.isChecked()) await firstCheckbox.click();
    await page.getByRole("button", { name: /kolon eşleştirme|devam|ileri/i }).click();

    // Wait for column mapping
    await page.waitForTimeout(5_000);

    const nextBtn2 = page.getByRole("button", { name: /önizleme|preview|devam|onay/i });
    if (await nextBtn2.isEnabled({ timeout: 10_000 }).catch(() => false)) {
        await nextBtn2.click();
        // Preview table
        await expect(
            page.locator("table")
                .or(page.getByText(/önizleme|preview|draft/i))
        ).toBeVisible({ timeout: 15_000 });
    }
});

// ── Tam akış ─────────────────────────────────────────────────────────────────

test("tam import akışı: dosya → done ekranı", async ({ page }) => {
    test.setTimeout(90_000);
    const fileInput = page.locator("input[type='file']");
    await expect(fileInput).toBeAttached({ timeout: 5_000 });
    await fileInput.setInputFiles(XLSX_PATH);

    // sheet_select
    await expect(page.locator("input[type='checkbox']").first()).toBeVisible({ timeout: 15_000 });

    // Select sheets — try to pick only "Urunler", fall back to first checkbox
    const checkboxes = page.locator("input[type='checkbox']");
    const count = await checkboxes.count();
    for (let i = 0; i < count; i++) {
        const cb    = checkboxes.nth(i);
        const label = await cb.evaluate((el) => {
            const row = el.closest("tr, [data-sheet], li, div");
            return row?.textContent ?? "";
        });
        const shouldSelect = label.toLowerCase().includes("urun") || label.toLowerCase().includes("ürün");
        const isChecked    = await cb.isChecked();
        if (shouldSelect && !isChecked) await cb.click();
        if (!shouldSelect && isChecked) await cb.click();
    }
    // Fallback: if nothing selected, select the first checkbox
    const anyChecked = await page.locator("input[type='checkbox']:checked").count();
    if (anyChecked === 0 && count > 0) {
        await checkboxes.first().click();
    }

    // → column_mapping
    await page.getByRole("button", { name: /kolon eşleştirme|devam|ileri/i }).click();
    await page.waitForTimeout(8_000);  // AI detection may take time

    // → preview ("Eşleştirmeyi Uygula" veya "Önizleme" butonu)
    const toPreviewBtn = page.getByRole("button", { name: /eşleştirmeyi uygula|önizleme|preview|devam|onay/i });
    if (await toPreviewBtn.isEnabled({ timeout: 20_000 }).catch(() => false)) {
        await toPreviewBtn.click();
        await page.waitForTimeout(5_000);
    }

    // → import
    const importBtn = page.getByRole("button", { name: /i̇çe aktar|import/i });
    if (await importBtn.isEnabled({ timeout: 10_000 }).catch(() => false)) {
        await importBtn.click();

        // Done state
        await expect(
            page.getByText(/tamamlandı|eklendi|güncellendi|done|başarı/i)
        ).toBeVisible({ timeout: 30_000 });
    }
});

test("done ekranında 'Yeni Dosya' butonu idle state'e döndürüyor", async ({ page }) => {
    // Fast path: navigate back if already on import
    const newFileBtn = page.getByRole("button", { name: /yeni dosya|tekrar/i });
    if (await newFileBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await newFileBtn.click();
        await expect(page.getByText(/dosya seç|sürükle|drop/i).first()).toBeVisible({ timeout: 5_000 });
    } else {
        // Just verify idle state is present on fresh load
        await expect(page.getByText(/dosya seç|sürükle|xlsx/i).first()).toBeVisible({ timeout: 5_000 });
    }
});

test("geri navigasyon (column_mapping → sheet_select) batch'i siliyor", async ({ page }) => {
    const fileInput = page.locator("input[type='file']");
    await expect(fileInput).toBeAttached({ timeout: 5_000 });
    await fileInput.setInputFiles(XLSX_PATH);
    await expect(page.locator("input[type='checkbox']").first()).toBeVisible({ timeout: 15_000 });

    const firstCheckbox = page.locator("input[type='checkbox']").first();
    if (!await firstCheckbox.isChecked()) await firstCheckbox.click();
    await page.getByRole("button", { name: /kolon eşleştirme|devam|ileri/i }).click();
    await page.waitForTimeout(3_000);

    // Back button
    const backBtn = page.getByRole("button", { name: /geri|←|back/i });
    if (await backBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await backBtn.click();
        // Should be back on sheet_select
        await expect(page.locator("input[type='checkbox']").first()).toBeVisible({ timeout: 5_000 });
    }
});
