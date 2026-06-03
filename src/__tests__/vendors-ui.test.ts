/**
 * Tedarikçiler sayfası — final ürün UI source-regex testleri.
 *
 * Bu tur 3 düzeltmeyi kilitler (route/servis davranışı `vendors.test.ts`'te):
 *   1. [a11y] Bulk-deactivate confirm modal role=dialog/aria-modal/aria-labelledby
 *      + başlık id; drawer aria-modal="true".
 *   2. [loadError] Yükleme hatasında görünür role=alert banner + "Yeniden dene";
 *      empty-state ve Pagination loadError'a gate'lenir.
 *   3. [toplu-seçim] per-row checkbox + select-all yalnız aktif tedarikçiler
 *      (zaten-pasif satır seçilip 409 "zaten pasif" gürültüsü üretmesin).
 *
 * Kaynak okuma yöntemi (purchase-orders-ui.test.ts aynası): JSX davranışı
 * jsdom render etmeden source-regex ile kilitlenir. Mevcut `vendors.test.ts`
 * (route/servis) bu dosyadan bağımsız, dokunulmaz.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PAGE_SRC = readFileSync(
    join(process.cwd(), "src/app/dashboard/vendors/page.tsx"),
    "utf8",
);

// ── 1. A11y — confirm modal + drawer ──────────────────────────

describe("Tedarikçiler — toplu pasifleştirme onay modalı a11y", () => {
    it("modal panel role=dialog + aria-modal=true + aria-labelledby taşır", () => {
        expect(PAGE_SRC).toMatch(/role="dialog"/);
        expect(PAGE_SRC).toMatch(/aria-modal="true"/);
        expect(PAGE_SRC).toMatch(/aria-labelledby="bulk-deactivate-title"/);
    });

    it("başlık div'i eşleşen id taşır (aria-labelledby hedefi)", () => {
        expect(PAGE_SRC).toMatch(/id="bulk-deactivate-title"/);
    });

    it("drawer panel aria-modal=true taşır (role=dialog + aria-label korunur)", () => {
        // drawer satırı: role="dialog" aria-modal="true" aria-label={...}
        expect(PAGE_SRC).toMatch(
            /role="dialog"\s+aria-modal="true"\s+aria-label=\{drawerMode === "create"/,
        );
    });
});

// ── 2. Yükleme hatası — loadError banner ──────────────────────

describe("Tedarikçiler — görünür yükleme hatası (loadError)", () => {
    it("loadError state tanımlı ve loadVendors başında sıfırlanır, catch'te set edilir", () => {
        expect(PAGE_SRC).toMatch(/const \[loadError, setLoadError\] = useState\(false\)/);
        expect(PAGE_SRC).toMatch(/setLoadError\(false\)/);
        expect(PAGE_SRC).toMatch(/setLoadError\(true\)/);
    });

    it("loadError true iken role=alert banner + 'Yeniden dene' butonu (loadVendors refetch)", () => {
        expect(PAGE_SRC).toMatch(/\) : loadError \? \(/);
        expect(PAGE_SRC).toMatch(/role="alert"/);
        expect(PAGE_SRC).toMatch(/Tedarikçiler yüklenemedi\. Lütfen tekrar deneyin\./);
        expect(PAGE_SRC).toMatch(/Yeniden dene/);
        expect(PAGE_SRC).toMatch(/onClick=\{\(\) => void loadVendors\(\)\}/);
    });

    it("empty-state ve Pagination loadError'dan sonra gelir (yanıltıcı 'hiç yok' gizlenir)", () => {
        // loadError dalı, "Henüz tedarikçi eklenmemiş" empty-state'inden ÖNCE gelmeli.
        const loadErrorIdx = PAGE_SRC.indexOf(") : loadError ? (");
        const emptyIdx = PAGE_SRC.indexOf("Henüz tedarikçi eklenmemiş.");
        expect(loadErrorIdx).toBeGreaterThan(-1);
        expect(emptyIdx).toBeGreaterThan(loadErrorIdx);
        // Pagination loadError ile de gate'lenir.
        expect(PAGE_SRC).toMatch(/!loading && !loadError && filtered\.length > 0/);
    });
});

// ── 3. Toplu-seçim aktif tedarikçilere kısıtlı ────────────────

describe("Tedarikçiler — toplu seçim yalnız aktif tedarikçiler", () => {
    it("select-all pageIds aktif alt-kümeyle hesaplanır", () => {
        expect(PAGE_SRC).toMatch(
            /const pageIds = pagedItems\.filter\(v => v\.is_active\)\.map\(v => v\.id\)/,
        );
    });

    it("per-row checkbox yalnız v.is_active iken render edilir", () => {
        expect(PAGE_SRC).toMatch(/\{v\.is_active && \(\s*<input\s+type="checkbox"/);
    });
});
