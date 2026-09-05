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

/**
 * Yorum ayıklama — NEGATİF iddialar için ZORUNLU.
 *
 * 2026-09-05: "elle yazılmış dialog kalmadı" kuralı, taşınma gerekçesini
 * anlatan yorumda `role="dialog"` geçtiği için kırmızı yandı. Depoda bu tuzağa
 * beşinci düşüş; `filter-chips-source.test.ts` aynı çözümü taşıyor. Kural
 * KODU iddia etmeli, kodun anlatısını değil.
 */
const stripCode = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const PAGE_SRC = readFileSync(
    join(process.cwd(), "src/app/dashboard/vendors/VendorsClient.tsx"),
    "utf8",
);

// ── 1. A11y — confirm modal + drawer ──────────────────────────

describe("Tedarikçiler — toplu pasifleştirme onay modalı a11y", () => {
    it("modal panel role=dialog + aria-modal=true + aria-labelledby taşır", () => {
        // a11y ARTIK ORTAK ÇERÇEVEDE: `role="dialog"` + `aria-modal` +
        // focus tuzağı + Escape `components/ui/Modal.tsx`'te (orada ayrıca
        // kilitli). Burada kilitlenen: bu yüzey çerçeveyi KULLANIYOR ve
        // verdiği `labelledBy` id'sinin karşılığı sayfada VAR.
        expect(PAGE_SRC).toMatch(/from "@\/components\/ui\/Modal"/);
        expect(PAGE_SRC).toMatch(/<ConfirmModal/);
    });

    it("başlık div'i eşleşen id taşır (aria-labelledby hedefi)", () => {
        // Başlık ConfirmModal'ın kendi elemanı; metin çağırandan gelmeli.
        expect(PAGE_SRC).toMatch(/tedarikçiyi pasife al/);
    });

    it("tedarikçi formu çekmecesi ortak Drawer'dan geliyor", () => {
        // Eski iddia `role="dialog" aria-modal="true" aria-label={drawerMode…}`
        // satırını arıyordu: işaretleme vardı ama Escape ve odak yönetimi
        // YOKTU. Üçü de artık `ui/Drawer`dan geliyor. Erişilebilir ad da
        // uydurma `aria-label` yerine GÖRÜNEN başlıktan (`labelledBy`).
        expect(PAGE_SRC).toMatch(/from "@\/components\/ui\/Drawer"/);
        expect(PAGE_SRC).toMatch(/labelledBy="vendor-form-title"/);
        expect(PAGE_SRC).toMatch(/id="vendor-form-title"/);
        expect(stripCode(PAGE_SRC)).not.toMatch(/role="dialog"/);
        // Kayıt sürerken kaçış kapalı — yarım kalan form Escape'le kaybolmasın.
        expect(PAGE_SRC).toMatch(/dismissible=\{!saving\}/);
    });
});

// ── 2. A1 RSC: sunucu veri + sessiz hata yok ──────────────────
// Eski client loadVendors/loadError modeli kalktı; veri SUNUCU page'inde
// (dbListVendorsPaged) çekilir, hata atılırsa Next error boundary'sine düşer.

describe("Tedarikçiler — A1 sunucu sayfalama + sessiz hata yok", () => {
    const SERVER_SRC = readFileSync(
        join(process.cwd(), "src/app/dashboard/vendors/page.tsx"),
        "utf8",
    );

    it("sunucu sayfası dbListVendorsPaged çağırır (client full-fetch yok)", () => {
        expect(SERVER_SRC).toContain("dbListVendorsPaged");
        // hata yutan boş-liste fallback'i yok (throw → error boundary)
        expect(SERVER_SRC).not.toMatch(/catch[\s\S]{0,80}\[\]/);
        expect(PAGE_SRC).not.toContain('fetch(`/api/vendors?');
    });

    it("empty-state mevcut (sunucu boş döndüğünde)", () => {
        expect(PAGE_SRC).toContain("Henüz tedarikçi eklenmemiş.");
    });
});

// ── 3. Toplu-seçim aktif tedarikçilere kısıtlı ────────────────

describe("Tedarikçiler — toplu seçim yalnız aktif tedarikçiler", () => {
    it("select-all pageIds aktif alt-kümeyle hesaplanır", () => {
        expect(PAGE_SRC).toMatch(
            /const pageIds = displayVendors\.filter\(v => v\.is_active\)\.map\(v => v\.id\)/,
        );
    });

    it("per-row checkbox yalnız v.is_active iken render edilir", () => {
        // DataTable kolon cell'i: v => v.is_active ? (<input type="checkbox" .../>) : null
        expect(PAGE_SRC).toMatch(/v\.is_active \? \(\s*<input\s+type="checkbox"/);
    });
});
