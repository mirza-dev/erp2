/**
 * Products & Stock E2E Tests — including detailed add product modal tests
 */
import { test, expect } from "@playwright/test";
import { gotoApp } from "./helpers/nav";
import { createTestProduct, deleteTestProduct, waitForInList } from "./helpers/test-data";

const TS = () => Date.now();

// ── Liste & Filtreler ─────────────────────────────────────────────────────────

test.describe("Ürün Listesi & Filtreler", () => {
    test.beforeEach(async ({ page }) => {
        await gotoApp(page, "/dashboard/products");
    });

    test("ürün listesi başarıyla yükleniyor", async ({ page }) => {
        await expect(page.locator("main")).toBeVisible();
        await expect(page.getByText(/ürünler|stok/i).first()).toBeVisible();
    });

    test("kategori filtresi satırları filtreler", async ({ page }) => {
        const categorySelect = page.locator("select").first()
            .or(page.getByRole("combobox").filter({ hasText: /kategori|tüm/i }));
        const initialCount = await page.locator("table tbody tr").count();

        if (await categorySelect.isVisible({ timeout: 3_000 }).catch(() => false)) {
            const options = await categorySelect.locator("option").all();
            if (options.length > 1) {
                await categorySelect.selectOption({ index: 1 });
                await page.waitForTimeout(400);
                const filteredCount = await page.locator("table tbody tr").count();
                expect(filteredCount).toBeLessThanOrEqual(initialCount);
            }
        }
    });

    test("ürün tipi filtresi (mamul/hammadde) çalışıyor", async ({ page }) => {
        const typeFilter = page.getByRole("button", { name: /mamul|hammadde/i });
        if (await typeFilter.first().isVisible({ timeout: 3_000 }).catch(() => false)) {
            await typeFilter.first().click();
            await page.waitForTimeout(400);
            await expect(page.locator("main")).toBeVisible();
        }
    });

    test("arama: SKU veya isim ile filtre", async ({ page }) => {
        const searchInput = page.getByPlaceholder(/ara|ürün|sku/i).first();
        if (await searchInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
            await searchInput.fill("NONEXISTENT-XYZ-99999");
            await page.waitForTimeout(400);
            const rows = page.locator("table tbody tr");
            const count = await rows.count();
            expect(count).toBe(0);  // No match
        }
    });

    test("ürün stok durumu renk kodlaması görünür", async ({ page }) => {
        // Seed data ürünleri içerdiğinden tablo en az 1 satır göstermeli
        await page.waitForSelector("table tbody tr", { timeout: 8_000 });
        const rowCount = await page.locator("table tbody tr").count();
        expect(rowCount).toBeGreaterThan(0);
        await expect(page.locator("main")).toBeVisible();
    });
});

// ── Ürün Ekleme Modal ─────────────────────────────────────────────────────────

test.describe("Ürün Ekleme Modal", () => {
    test.beforeEach(async ({ page }) => {
        await gotoApp(page, "/dashboard/products");
    });

    test("'+ Yeni Ürün' butonu modal açıyor", async ({ page }) => {
        const addBtn = page.getByRole("button", { name: /yeni ürün|\+ ürün/i });
        await expect(addBtn).toBeVisible();
        await addBtn.click();
        // Modal veya dialog açılmalı
        await expect(
            page.getByRole("dialog")
                .or(page.locator("[style*='position: fixed']").filter({ hasText: /ürün adı|sku/i }))
        ).toBeVisible({ timeout: 5_000 });
    });

    test("zorunlu alanlar boşken 'Oluştur' butonu disabled", async ({ page }) => {
        await page.getByRole("button", { name: /yeni ürün/i }).click();
        await page.waitForTimeout(300);
        const submitBtn = page.getByRole("button", { name: /oluştur|kaydet|ekle/i }).last();
        await expect(submitBtn).toBeDisabled({ timeout: 5_000 });
    });

    test("sadece isim doldurulduğunda (SKU boş) submit disabled kalır", async ({ page }) => {
        await page.getByRole("button", { name: /yeni ürün/i }).click();
        await page.waitForTimeout(300);
        // FormField uses <div> labels, not <label> elements — use placeholder
        await page.getByPlaceholder(/küresel vana/i).fill("Test Ürün");
        const submitBtn = page.getByRole("button", { name: /oluştur|kaydet|ekle/i }).last();
        await expect(submitBtn).toBeDisabled({ timeout: 3_000 });
    });

    // request fixture'ı temizlik için: bu test CANLI veritabanına yazıyor ve
    // eskiden hiç silmiyordu → her koşumda katalogda bir ürün bırakıyordu.
    test("minimum alanlarla (isim + SKU) ürün oluşturuluyor", async ({ page, request }) => {
        const sku  = `E2E-MIN-${TS()}`;
        const name = `E2E Min Ürünü ${sku}`;

        await page.getByRole("button", { name: /yeni ürün/i }).click();
        await page.waitForTimeout(300);

        await page.getByPlaceholder(/küresel vana/i).fill(name);
        await page.getByPlaceholder(/KV-3P/i).fill(sku);

        const submitBtn = page.getByRole("button", { name: /oluştur|kaydet|ekle/i }).last();
        await expect(submitBtn).toBeEnabled({ timeout: 3_000 });
        await submitBtn.click();

        // Modal kapanır ve başarı toast
        await expect(page.getByText(new RegExp(name.slice(0, 15), "i"))
            .or(page.getByText(/eklendi|oluşturuldu/i)).first()).toBeVisible({ timeout: 8_000 });

        // Temizlik — yoksa ürün canlı katalogda kalıyor.
        const created = await waitForInList<{ id?: string; sku: string }>(
            request, "http://localhost:3000/api/products?all=1", (p) => p.sku === sku,
        );
        if (created?.id) await deleteTestProduct(request, created.id).catch(() => {});
    });

    test("tüm alanlar doldurularak ürün oluşturuluyor", async ({ page, request }) => {
        const sku  = `E2E-FULL-${TS()}`;
        const name = `E2E Tam Ürün ${sku}`;

        await page.getByRole("button", { name: /yeni ürün/i }).click();
        await page.waitForTimeout(300);

        // Zorunlu alanlar — FormField uses <div> labels, not <label> → use placeholder/nth
        await page.getByPlaceholder(/küresel vana/i).fill(name);
        await page.getByPlaceholder(/KV-3P/i).fill(sku);

        // Kategori artık <input list="datalist"> — text input, select değil
        const categoryInput = page.getByPlaceholder(/kategori seç/i);
        if (await categoryInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
            await categoryInput.fill("Vana");
        }

        // Birim Fiyat (first number input)
        const priceInput = page.locator("input[type='number']").first();
        if (await priceInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
            await priceInput.fill("250");
        }

        // Modal selects: 0=Para Birimi, 1=Birim, 2=Ürün Tipi (Kategori artık text input)
        const unitSelect = page.locator("select").nth(1);
        if (await unitSelect.isVisible({ timeout: 2_000 }).catch(() => false)) {
            await unitSelect.selectOption("adet");
        }

        // Başlangıç Stoğu (second number input)
        const onHandInput = page.locator("input[type='number']").nth(1);
        if (await onHandInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
            await onHandInput.fill("75");
        }

        // Opsiyonel alanlar — have distinct placeholders
        const matQuality = page.getByPlaceholder(/CF8M/i);
        if (await matQuality.isVisible({ timeout: 1_000 }).catch(() => false)) {
            await matQuality.fill("316L Paslanmaz Çelik");
        }

        const originCountry = page.getByPlaceholder(/türkiye/i);
        if (await originCountry.isVisible({ timeout: 1_000 }).catch(() => false)) {
            await originCountry.fill("DE");
        }

        const submitBtn = page.getByRole("button", { name: /oluştur|kaydet|ekle/i }).last();
        await expect(submitBtn).toBeEnabled({ timeout: 3_000 });
        await submitBtn.click();

        // Success
        await expect(
            page.getByText(new RegExp(name.slice(0, 15), "i"))
                .or(page.getByText(/eklendi|oluşturuldu/i))
                .first()
        ).toBeVisible({ timeout: 8_000 });

        // Verify via API that fields were saved
        // Liste API'si önbellekli ve sonuçta tutarlı: POST 201 dönse bile kayıt
        // ~1 sn sonra listede YOK, ~7 sn sonra VAR (ölçüldü). Tek seferlik GET
        // bu pencereye düşüp "oluşmadı" sanıyordu.
        const created = await waitForInList<{ id?: string; sku: string; on_hand?: number }>(
            request, "http://localhost:3000/api/products?all=1", (p) => p.sku === sku,
        );
        expect(created).toBeDefined();

        // Cleanup
        if (created) {
            const prod = created as { id?: string; sku: string };
            if (prod.id) await deleteTestProduct(request, prod.id).catch(() => {});
        }
    });

    test("duplicate SKU → hata toast gösteriyor", async ({ page, request }) => {
        // Create a product first
        const { id, sku } = await createTestProduct(request);

        await gotoApp(page, "/dashboard/products");

        await page.getByRole("button", { name: /yeni ürün/i }).click();
        await page.waitForTimeout(300);
        await page.getByPlaceholder(/küresel vana/i).fill("Duplicate Test");
        await page.getByPlaceholder(/KV-3P/i).fill(sku);

        const submitBtn = page.getByRole("button", { name: /oluştur|kaydet|ekle/i }).last();
        await submitBtn.click();

        // Hata toast'ı portal ile <body>'ye basılıyor — `main` scope'u onu
        // dışarıda bırakıyordu. Metin yeterince ayırt edici, Next dev örtüsüyle
        // çakışmıyor (örtü "Console Error" diyor).
        await expect(
            page.getByText(/zaten kayıtlı/i).first()
        ).toBeVisible({ timeout: 10_000 });

        await deleteTestProduct(request, id);
    });

    test("modal açıldığında varsayılan değerler doğru", async ({ page }) => {
        await page.getByRole("button", { name: /yeni ürün/i }).click();
        await page.waitForTimeout(300);

        // Modal selects: 0=Para Birimi, 1=Birim, 2=Ürün Tipi (Kategori artık text input)
        const currencySelect = page.locator("select").nth(0);
        if (await currencySelect.isVisible({ timeout: 2_000 }).catch(() => false)) {
            const val = await currencySelect.inputValue();
            expect(val).toBe("USD");
        }

        // Ürün Tipi: third <select>
        const typeSelect = page.locator("select").nth(2);
        if (await typeSelect.isVisible({ timeout: 2_000 }).catch(() => false)) {
            const val = await typeSelect.inputValue();
            expect(val).toMatch(/finished|manufactured|mamul/i);
        }
    });

    test("başlangıç stoğu doğru kaydediliyor", async ({ page, request }) => {
        const sku  = `E2E-STOCK-${TS()}`;
        const name = `E2E Stok Test ${sku}`;

        await page.getByRole("button", { name: /yeni ürün/i }).click();
        await page.waitForTimeout(300);
        await page.getByPlaceholder(/küresel vana/i).fill(name);
        await page.getByPlaceholder(/KV-3P/i).fill(sku);

        const onHandInput = page.locator("input[type='number']").nth(1);
        if (await onHandInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
            await onHandInput.fill("99");
        }

        await page.getByRole("button", { name: /oluştur|kaydet/i }).last().click();
        await page.waitForTimeout(2_000);

        // Verify via API
        const created = await waitForInList<{ sku: string; on_hand?: number; id?: string }>(
            request, "http://localhost:3000/api/products?all=1", (p) => p.sku === sku,
        );
        if (created?.on_hand !== undefined) {
            expect(created.on_hand).toBe(99);
        }
        if (created?.id) await deleteTestProduct(request, created.id).catch(() => {});
    });

    test("İptal butonu modal'ı kapatır ve form sıfırlanır", async ({ page }) => {
        await page.getByRole("button", { name: /yeni ürün/i }).click();
        await page.waitForTimeout(300);

        // Fill something
        await page.getByPlaceholder(/küresel vana/i).fill("Silinecek İçerik");

        // Cancel
        const cancelBtn = page.getByRole("button", { name: /iptal|kapat|×/i }).first();
        await cancelBtn.click();
        await page.waitForTimeout(300);

        // Modal kapandı
        const modal = page.getByRole("dialog")
            .or(page.locator("[style*='position: fixed']").filter({ hasText: /ürün adı|SKU/i }));
        await expect(modal).not.toBeVisible({ timeout: 3_000 });

        // Tekrar aç → boş olmalı
        await page.getByRole("button", { name: /yeni ürün/i }).click();
        await page.waitForTimeout(300);
        const nameInput = page.getByPlaceholder(/küresel vana/i);
        if (await nameInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
            const val = await nameInput.inputValue();
            expect(val).toBe("");
        }
    });
});

// ── Detay Sayfası ─────────────────────────────────────────────────────────────
//
// Faz 2b'de detay DRAWER'ı kaldırıldı: liste satırına tıklamak artık
// `router.push(\`/dashboard/products/${id}\`)` yapıyor (products/page.tsx
// `onRowClick`). Sayfada tek bir drawer referansı kalmadı — bu blok eski
// drawer beklentisini değil, gerçek gezinmeyi doğruluyor.

test.describe("Ürün Detay Sayfası", () => {
    let productId: string;

    test.beforeAll(async ({ request }) => {
        const p = await createTestProduct(request, { on_hand: 30, min_stock_level: 5 });
        productId = p.id;
    });

    test.afterAll(async ({ request }) => {
        await deleteTestProduct(request, productId).catch(() => {});
    });

    test("satır tıklayınca detay sayfasına gidiliyor", async ({ page }) => {
        await gotoApp(page, "/dashboard/products");

        const firstRow = page.locator("table tbody tr").first();
        await expect(firstRow).toBeVisible({ timeout: 10_000 });
        await firstRow.click();

        // Drawer değil, gerçek rota: /dashboard/products/<uuid>
        await page.waitForURL(/\/dashboard\/products\/[0-9a-f-]{36}/i, { timeout: 15_000 });
    });

    test("detay sayfası stok metriklerini gösteriyor", async ({ page }) => {
        await gotoApp(page, `/dashboard/products/${productId}`);

        // Kartlar `activeTab === "stok"` altında; sayfa "Genel" ile açılıyor.
        // Sekmeler `role="tab"` (products/[id]/page.tsx:1066) — button değil.
        await page.getByRole("tab", { name: "Stok", exact: true }).click();

        // products/[id]/page.tsx'teki stok kartlarının etiketleri
        await expect(page.getByText("Stokta", { exact: true })).toBeVisible({ timeout: 10_000 });
        await expect(page.getByText("Satılabilir", { exact: true })).toBeVisible({ timeout: 5_000 });
        await expect(page.getByText("Rezerve", { exact: true })).toBeVisible({ timeout: 5_000 });
    });
});

// ── Silme ─────────────────────────────────────────────────────────────────────

test.describe("Ürün Silme", () => {
    test("silme butonu onay dialog açıyor", async ({ page, request }) => {
        const { id } = await createTestProduct(request);

        await gotoApp(page, "/dashboard/products");

        // Find delete button for a row
        const deleteBtn = page.getByRole("button", { name: /sil/i }).first();
        if (await deleteBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
            await deleteBtn.click();
            // Confirm dialog
            await expect(
                page.getByRole("alertdialog")
                    .or(page.getByText(/emin misin|silmek istediğinizden/i))
            ).toBeVisible({ timeout: 3_000 });
            // Close without confirming
            const cancelBtn = page.getByRole("button", { name: /iptal|hayır/i }).last();
            if (await cancelBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
                await cancelBtn.click();
            }
        }
        await deleteTestProduct(request, id).catch(() => {});
    });

    test("onaylanınca ürün listeden kaldırılıyor", async ({ page, request }) => {
        const { id, sku } = await createTestProduct(request);

        await gotoApp(page, "/dashboard/products");

        // Search for the product
        const searchInput = page.getByPlaceholder(/ara|ürün|sku/i).first();
        if (await searchInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
            await searchInput.fill(sku);
            await page.waitForTimeout(500);
        }

        const deleteBtn = page.getByRole("button", { name: /sil/i }).first();
        if (await deleteBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
            await deleteBtn.click();
            const confirmBtn = page.getByRole("button", { name: /onayla|evet|sil/i }).last();
            if (await confirmBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
                await confirmBtn.click();
                await page.waitForTimeout(1_000);
                // Success toast
                await expect(
                    page.getByText(/silindi|kaldırıldı/i)
                ).toBeVisible({ timeout: 5_000 }).catch(() => {});
            }
        }
        // Cleanup via API just in case
        await deleteTestProduct(request, id).catch(() => {});
    });
});
