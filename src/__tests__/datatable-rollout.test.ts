/**
 * Faz B kapanışı — kalan ham `<table>` yüzeyleri (2026-08-24).
 *
 * Liste tarafı 7/7 dönüşmüştü ama dört yüzey kendi tablosunu tutuyordu.
 * Bu turda üçü DataTable'a taşındı; biri BİLİNÇLİ olarak dışarıda bırakıldı.
 *
 * Kazanç yalnız görsel tutarlılık değil: DOM-mutasyonlu hover
 * (`e.currentTarget.style.background`) ortadan kalkıyor — DataTable'da hover
 * CSS'te (`.erp-data-table tbody tr:hover`), seçim `rowStyle`'da.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");

const STOCK_GRID = read("src/components/dashboard/StockDataGrid.tsx");
const AGING = read("src/app/dashboard/products/aging/page.tsx");
const TYPE_DETAIL = read("src/app/dashboard/settings/product-types/[id]/page.tsx");
const SUPPLIER_PANEL = read("src/components/products/SupplierPricesPanel.tsx");

describe("StockDataGrid", () => {
    it("DataTable kullanır, kendi thead/thStyle'ını taşımaz", () => {
        expect(STOCK_GRID).toContain("<DataTable");
        expect(STOCK_GRID).not.toMatch(/<thead>/);
        expect(STOCK_GRID).not.toMatch(/const thStyle/);
    });

    it("seçili satır vurgusu rowStyle ile (DOM mutasyonu değil)", () => {
        expect(STOCK_GRID).toMatch(/rowStyle=\{p => \(p\.id === selectedId/);
        expect(STOCK_GRID).not.toMatch(/const (applyHover|removeHover|applySelected)\s*=/);
        expect(STOCK_GRID).not.toMatch(/td\.style\.background/);
    });

    it("satır tıklaması seçimi TOGGLE eder (mevcut davranış korundu)", () => {
        expect(STOCK_GRID).toMatch(/setSelectedId\(prev => \(prev === p\.id \? null : p\.id\)\)/);
    });

    it("yükleme iskeleti ve 'Tümünü gör' linki korundu", () => {
        expect(STOCK_GRID).toMatch(/animation: "pulse 1\.5s ease-in-out infinite"/);
        expect(STOCK_GRID).toMatch(/Tümünü gör \(\{filtered\.length\}\)/);
        expect(STOCK_GRID).toMatch(/footer=\{viewAllFooter\}/);
    });

    it("satır bazlı renk hücre içeriğinde (cellStyle kolona statiktir)", () => {
        expect(STOCK_GRID).toMatch(/color: getAvailClass\(p\.available_now, p\.minStockLevel\)/);
    });
});

describe("Eskime Raporu (products/aging)", () => {
    it("DataTable kullanır, ham tablo ve hover mutasyonu kalmadı", () => {
        expect(AGING).toContain("<DataTable");
        expect(AGING).not.toMatch(/<table style=/);
        expect(AGING).not.toMatch(/onMouseEnter=\{e => \(e\.currentTarget\.style\.background/);
    });

    it("rapor tipine göre değişen kolon etiketleri korundu", () => {
        expect(AGING).toMatch(/key: "date5", header: col5Label/);
        expect(AGING).toMatch(/key: "date6", header: col6Label/);
    });

    it("uppercase başlık stili headerStyle ile veriliyor", () => {
        expect(AGING).toMatch(/textTransform: "uppercase"/);
        expect(AGING).toMatch(/headerStyle: AGING_TH/);
    });

    it("finansal maskeleme korundu (RBAC)", () => {
        expect(AGING).toMatch(/maskCurrency\(row\.boundCapital \?\? 0, row\.currency, canViewPurchaseCosts\)/);
    });
});

describe("Teknik Şablon detayı (product-types/[id])", () => {
    it("alan tablosu DataTable'a taşındı, yerel stiller silindi", () => {
        expect(TYPE_DETAIL).toContain("<DataTable");
        expect(TYPE_DETAIL).not.toMatch(/const thStyle/);
        expect(TYPE_DETAIL).not.toMatch(/const tdStyle/);
    });

    it("pasif alan soluk (liste sayfasındaki rowStyle kalıbı)", () => {
        expect(TYPE_DETAIL).toMatch(/rowStyle=\{f => \(f\.is_active \? \{\} : \{ opacity: 0\.55 \}\)\}/);
    });

    it("boş durum colSpan yerine emptyMessage ile", () => {
        expect(TYPE_DETAIL).toMatch(/emptyMessage="Henüz teknik alan yok\."/);
        expect(TYPE_DETAIL).not.toMatch(/colSpan=\{5\}/);
    });

    it("sıra taşıma butonları ve erişilebilir adları korundu", () => {
        expect(TYPE_DETAIL).toMatch(/aria-label=\{`\$\{field\.label_tr\} yukarı taşı`\}/);
        expect(TYPE_DETAIL).toMatch(/aria-label=\{`\$\{field\.label_tr\} aşağı taşı`\}/);
        // activeIndex satır bazlı → cell içinde hesaplanmalı.
        expect(TYPE_DETAIL).toMatch(/const activeIndex = activeFields\.findIndex/);
    });
});

describe("SupplierPricesPanel — BİLİNÇLİ olarak dönüştürülmedi", () => {
    /**
     * Ürün detay kartının içinde kompakt bir alt-panel: 12px yazı, 5px/8px
     * padding. DataTable sayfa-seviyesi listeler için tasarlandı (13px,
     * 10px/14px) — buraya uygulamak paneli şişirir, tutarlılık kazancı da
     * getirmez çünkü bu bir liste değil kart detayı.
     */
    it("kendi kompakt tablosunu korur", () => {
        expect(SUPPLIER_PANEL).toMatch(/<table style=/);
        expect(SUPPLIER_PANEL).toMatch(/fontSize: "12px"/);
        expect(SUPPLIER_PANEL).not.toContain("<DataTable");
    });

    it("küçük kalır — sayfa listesi haline gelmesin", () => {
        expect(SUPPLIER_PANEL.split("\n").length).toBeLessThan(120);
    });
});
