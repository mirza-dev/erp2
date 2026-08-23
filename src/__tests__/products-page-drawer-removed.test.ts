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
        // Faz B #7: tablo DataTable'a taşındı → başlıklar JSX <th> literal'i değil,
        // kolon tanımındaki `header:` alanı. Niyet aynı: bu 6 kolon listede olmalı.
        expect(SOURCE).toMatch(/header: "SKU"/);
        expect(SOURCE).toMatch(/header: "Ürün Adı"/);
        expect(SOURCE).toMatch(/header: "Stok"/);
        expect(SOURCE).toMatch(/header: "Satılabilir"/);
        expect(SOURCE).toMatch(/header: "Fiyat"/);
        expect(SOURCE).toMatch(/header: "Min stok"/);
    });

    it("eski Kapsam/Son Tarih/Sinyal kolonları kaldırılmış", () => {
        // Hem eski JSX <th> literal'i hem yeni kolon-tanımı formu kilitli.
        expect(SOURCE).not.toMatch(/>Kapsam</);
        expect(SOURCE).not.toMatch(/>Son Tarih</);
        expect(SOURCE).not.toMatch(/>Sinyal</);
        expect(SOURCE).not.toMatch(/header: "Kapsam"/);
        expect(SOURCE).not.toMatch(/header: "Son Tarih"/);
        expect(SOURCE).not.toMatch(/header: "Sinyal"/);
    });

    it("useRouter import edilmiş", () => {
        expect(SOURCE).toMatch(/from\s+"next\/navigation"/);
        expect(SOURCE).toMatch(/useRouter/);
    });
});
