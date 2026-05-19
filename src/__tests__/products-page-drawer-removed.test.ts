/**
 * Faz 2b — drawer + 7+ kolon liste kaldırıldı, satır click router.push paterni.
 *
 * Bu testler regresyon kilidi olarak çalışır — gelecekte drawer geri girerse veya
 * tıklama drawer'a yönlenirse fail eder.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const SOURCE = fs.readFileSync(
    path.join(process.cwd(), "src/app/dashboard/products/page.tsx"),
    "utf8",
);

describe("Faz 2b — products list page (drawer removed)", () => {
    it("AIDetailDrawer kullanılmıyor", () => {
        expect(SOURCE).not.toMatch(/AIDetailDrawer/);
    });

    it("drawerEditForm/drawerSaving/drawerEditMode state'leri kaldırılmış", () => {
        expect(SOURCE).not.toMatch(/drawerEditForm/);
        expect(SOURCE).not.toMatch(/drawerSaving/);
        expect(SOURCE).not.toMatch(/drawerEditMode/);
    });

    it("handleDrawerSave fonksiyonu yok", () => {
        expect(SOURCE).not.toMatch(/handleDrawerSave/);
    });

    it("selectedProductId state'i kaldırılmış (artık router.push paterni)", () => {
        expect(SOURCE).not.toMatch(/setSelectedProductId/);
        expect(SOURCE).not.toMatch(/selectedProductId/);
    });

    it("satır tıklaması router.push(/dashboard/products/${id}) yapıyor", () => {
        expect(SOURCE).toMatch(/router\.push\(\s*`\/dashboard\/products\/\$\{product\.id\}`/);
    });

    it("tablo başlıkları: SKU/Ürün Adı/Stok/Satılabilir/Fiyat/Min stok (6 kolon)", () => {
        expect(SOURCE).toMatch(/>SKU</);
        expect(SOURCE).toMatch(/>Ürün Adı</);
        expect(SOURCE).toMatch(/>Stok</);
        expect(SOURCE).toMatch(/>Satılabilir</);
        expect(SOURCE).toMatch(/>Fiyat</);
        expect(SOURCE).toMatch(/>Min stok</);
    });

    it("eski Kapsam/Son Tarih/Sinyal kolonları kaldırılmış", () => {
        // Header literals removed
        expect(SOURCE).not.toMatch(/>Kapsam</);
        expect(SOURCE).not.toMatch(/>Son Tarih</);
        expect(SOURCE).not.toMatch(/>Sinyal</);
    });

    it("useRouter import edilmiş", () => {
        expect(SOURCE).toMatch(/from\s+"next\/navigation"/);
        expect(SOURCE).toMatch(/useRouter/);
    });
});
