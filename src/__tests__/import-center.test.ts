import { describe, expect, it } from "vitest";
import {
    EXCEL_IMPORT_TEMPLATE_VERSION,
    detectSheetEntityType,
    defaultFieldApprovals,
    getExcelTemplateDefinition,
    mapHeaderToField,
    riskFlagsForFields,
    suggestSkuFromName,
} from "@/lib/import-center";

describe("import-center helpers", () => {
    it("sheet adından ürün, müşteri, tedarikçi ve stok entity tiplerini algılar", () => {
        expect(detectSheetEntityType("Urunler", ["SKU", "Ürün Adı"])?.entityType).toBe("product");
        expect(detectSheetEntityType("Musteriler", ["E-posta", "Müşteri Adı"])?.entityType).toBe("customer");
        expect(detectSheetEntityType("Tedarikciler", ["Tedarikçi", "E-posta"])?.entityType).toBe("vendor");
        expect(detectSheetEntityType("Stok_Sayimi", ["SKU", "Sayılan Miktar"])?.entityType).toBe("stock");
    });

    it("belirsiz sheet adında kolon sinyallerinden öneri üretir", () => {
        expect(detectSheetEntityType("Sayfa1", ["SKU", "Ürün Adı", "Birim"])?.entityType).toBe("product");
        expect(detectSheetEntityType("Data", ["Firma", "E-posta", "Müşteri Kodu"])?.entityType).toBe("customer");
        expect(detectSheetEntityType("Liste", ["SKU", "Yön", "Miktar"])?.entityType).toBe("stock");
    });

    it("alias sözlüğü kolonları doğru ERP alanına map eder ve bilinmeyen kolonu skip bırakır", () => {
        expect(mapHeaderToField("Ürün Kodu", "product")).toBe("sku");
        expect(mapHeaderToField("Müşteri E-posta", "customer")).toBe("email");
        expect(mapHeaderToField("MOQ", "product")).toBe("moq");
        expect(mapHeaderToField("Bilinmeyen Kolon", "product")).toBeNull();
    });

    it("finansal alanlar default skip onayı ve risk flag üretir", () => {
        const data = { sku: "P-1", name: "Vana", price: 10, cost_price: 5 };
        expect(defaultFieldApprovals(data)).toMatchObject({
            sku: "apply",
            name: "apply",
            price: "skip",
            cost_price: "skip",
        });
        expect(riskFlagsForFields(data)).toContain("financial:price");
        expect(riskFlagsForFields(data)).toContain("financial:cost_price");
    });

    it("SKU yoksa sistem önerisi deterministik ve geçici olmayan temiz format üretir", () => {
        expect(suggestSkuFromName("Sürgülü Vana A105 Gövde", 7)).toBe("SURG-VANA-A105-GOVD-007");
    });

    it("her şablon template_version ve örnek satır taşır", () => {
        for (const kind of ["product", "customer", "vendor", "stock_count", "stock_movement", "vendor_product_relation"] as const) {
            const template = getExcelTemplateDefinition(kind);
            expect(EXCEL_IMPORT_TEMPLATE_VERSION).toMatch(/^2026-/);
            expect(template.columns.length).toBeGreaterThan(2);
            expect(template.columns.some(column => column.required)).toBe(true);
            expect(template.columns.every(column => column.example !== undefined)).toBe(true);
        }
    });
});
