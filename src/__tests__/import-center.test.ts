import { describe, expect, it } from "vitest";
import {
    EXCEL_IMPORT_TEMPLATE_VERSION,
    detectSheetEntityType,
    defaultFieldApprovals,
    getExcelTemplateDefinition,
    mapHeaderToField,
    riskFlagsForFields,
    suggestSkuFromName,
    buildProductTypeTemplateColumns,
    collectTypeAttributesFromRow,
    PRODUCT_TYPE_TEMPLATE_COLUMN,
} from "@/lib/import-center";
import type { ProductTypeFieldRow } from "@/lib/database.types";

// Faz B test fixture — minimal ProductTypeFieldRow (collect/template yalnız
// field_key/field_type/options/label_tr/required kullanır; gerisi cast).
function field(partial: Partial<ProductTypeFieldRow> & { field_key: string; field_type: ProductTypeFieldRow["field_type"] }): ProductTypeFieldRow {
    return {
        id: `f-${partial.field_key}`, product_type_id: "t-1",
        label_tr: partial.field_key, label_en: null, unit: null, options: null,
        required: false, is_active: true, placeholder: null, help_text: null,
        sort_order: 0, created_at: "", updated_at: "", ...partial,
    };
}

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

describe("Faz B — buildProductTypeTemplateColumns", () => {
    const fields = [
        field({ field_key: "dn", field_type: "number", label_tr: "DN", unit: "mm", required: true }),
        field({ field_key: "pn_class", field_type: "select", label_tr: "PN", options: ["PN16", "PN25"] }),
    ];

    it("sabit kimlik kolonları + tip kolonu + teknik field kolonları üretir", () => {
        const cols = buildProductTypeTemplateColumns("Vana", fields);
        const keys = cols.map(c => c.field);
        expect(keys).toContain("sku");
        expect(keys).toContain("name");
        expect(keys).toContain("unit");
        expect(keys).toContain(PRODUCT_TYPE_TEMPLATE_COLUMN); // urun_tipi
        expect(keys).toContain("dn");
        expect(keys).toContain("pn_class");
    });

    it("tip kolonu örneği tip adıyla önceden doldurulur + required", () => {
        const cols = buildProductTypeTemplateColumns("Vana", fields);
        const typeCol = cols.find(c => c.field === PRODUCT_TYPE_TEMPLATE_COLUMN)!;
        expect(typeCol.example).toBe("Vana");
        expect(typeCol.required).toBe(true);
    });

    it("teknik kolonlar isAttribute=true; sabitler false", () => {
        const cols = buildProductTypeTemplateColumns("Vana", fields);
        expect(cols.find(c => c.field === "dn")!.isAttribute).toBe(true);
        expect(cols.find(c => c.field === "sku")!.isAttribute).toBe(false);
    });

    it("select kolonu seçenekleri not'a yazılır", () => {
        const cols = buildProductTypeTemplateColumns("Vana", fields);
        expect(cols.find(c => c.field === "pn_class")!.note).toContain("PN16");
    });
});

describe("Faz B — collectTypeAttributesFromRow", () => {
    const fields = [
        field({ field_key: "dn", field_type: "number" }),
        field({ field_key: "pn_class", field_type: "select", options: ["PN16"] }),
        field({ field_key: "onayli", field_type: "boolean" }),
        field({ field_key: "sektorler", field_type: "multiselect" }),
        field({ field_key: "govde", field_type: "text" }),
    ];

    it("number string→sayı, select/text trim, boolean parse, multiselect virgül→array", () => {
        const out = collectTypeAttributesFromRow(
            { dn: "50", pn_class: " PN16 ", onayli: "evet", sektorler: "petrol, gaz", govde: " A105 " },
            fields,
        );
        expect(out.dn).toBe(50);
        expect(out.pn_class).toBe("PN16");
        expect(out.onayli).toBe(true);
        expect(out.sektorler).toEqual(["petrol", "gaz"]);
        expect(out.govde).toBe("A105");
    });

    it("boş/null/geçersiz değerler drop edilir (silme yok)", () => {
        const out = collectTypeAttributesFromRow(
            { dn: "abc", pn_class: "", onayli: "", sektorler: "", govde: null },
            fields,
        );
        expect(Object.keys(out)).toHaveLength(0);
    });

    it("tipin field_key'i olmayan kolonlar dahil edilmez", () => {
        const out = collectTypeAttributesFromRow({ price: 1000, rastgele: "x", dn: 50 }, fields);
        expect(out).toEqual({ dn: 50 });
    });
});
