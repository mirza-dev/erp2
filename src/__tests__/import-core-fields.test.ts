import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
    normalizeCoreProductFields,
    IMPORT_CORE_PRODUCT_FIELD_KEYS,
    coreFieldLabel,
} from "@/lib/import-center";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("normalizeCoreProductFields — whitelist + tip + finansal drop", () => {
    it("izinli string + number alanlar normalize edilir", () => {
        const out = normalizeCoreProductFields({
            category: "  Vana  ",
            material_quality: "A105",
            weight_kg: 12.5,
            lead_time_days: "21",
        });
        expect(out.category).toBe("Vana"); // trim
        expect(out.material_quality).toBe("A105");
        expect(out.weight_kg).toBe(12.5);
        expect(out.lead_time_days).toBe(21); // string→number
    });

    it("FİNANSAL alanlar (price/cost_price) drop edilir", () => {
        const out = normalizeCoreProductFields({ category: "Vana", price: 1000, cost_price: 800 });
        expect(out.category).toBe("Vana");
        expect(out.price).toBeUndefined();
        expect(out.cost_price).toBeUndefined();
    });

    it("bilinmeyen anahtarlar drop edilir", () => {
        const out = normalizeCoreProductFields({ category: "Vana", saçma_alan: "x", on_hand: 50 });
        expect(out.category).toBe("Vana");
        expect(out.saçma_alan).toBeUndefined();
        expect(out.on_hand).toBeUndefined(); // stok master-data akışında yok
    });

    it("boş/null/undefined değerler drop edilir (silme yok)", () => {
        const out = normalizeCoreProductFields({
            category: "", material_quality: null, origin_country: undefined, standards: "  ",
        });
        expect(Object.keys(out)).toHaveLength(0);
    });

    it("number alana geçersiz değer → drop (NaN yazılmaz)", () => {
        const out = normalizeCoreProductFields({ weight_kg: "abc", lead_time_days: "" });
        expect(out.weight_kg).toBeUndefined();
        expect(out.lead_time_days).toBeUndefined();
    });

    it("number alan virgüllü ondalık kabul eder (12,5 → 12.5)", () => {
        const out = normalizeCoreProductFields({ weight_kg: "12,5" });
        expect(out.weight_kg).toBe(12.5);
    });

    it("non-object girdi → boş obje", () => {
        expect(normalizeCoreProductFields(null)).toEqual({});
        expect(normalizeCoreProductFields("x")).toEqual({});
        expect(normalizeCoreProductFields(undefined)).toEqual({});
    });

    it("whitelist finansal alan içermez (güvenlik invariyantı)", () => {
        expect(IMPORT_CORE_PRODUCT_FIELD_KEYS.has("price")).toBe(false);
        expect(IMPORT_CORE_PRODUCT_FIELD_KEYS.has("cost_price")).toBe(false);
        expect(IMPORT_CORE_PRODUCT_FIELD_KEYS.has("on_hand")).toBe(false);
    });

    it("coreFieldLabel Türkçe etiket döndürür, bilinmeyende anahtarı verir", () => {
        expect(coreFieldLabel("category")).toBe("Kategori");
        expect(coreFieldLabel("material_quality")).toBe("Malzeme Kalitesi");
        expect(coreFieldLabel("bilinmeyen")).toBe("bilinmeyen");
    });
});

describe("parseExtractionResponse — core_fields (Faz A)", () => {
    const TYPES = [{
        id: "00000000-0000-4000-8000-000000000001",
        name: "Vana",
        fields: [{ field_key: "dn", label_tr: "DN", field_type: "number", unit: "mm", options: null }],
    }];

    it("core_fields çıkarılır + whitelist/finansal-drop uygulanır", async () => {
        const { parseExtractionResponse } = await import("@/lib/services/ai-service");
        const r = parseExtractionResponse(
            JSON.stringify({
                items: [{
                    line: 1, name: "Vana DN50", sku: "KV-50",
                    product_type_id: TYPES[0].id,
                    attributes: { dn: 50 },
                    core_fields: { category: "Vana", material_quality: "A105", price: 999, saçma: "x" },
                    confidence: 0.9,
                }],
            }),
            TYPES,
        );
        expect(r.items).toHaveLength(1);
        expect(r.items[0].core_fields.category).toBe("Vana");
        expect(r.items[0].core_fields.material_quality).toBe("A105");
        expect(r.items[0].core_fields.price).toBeUndefined(); // finansal drop
        expect(r.items[0].core_fields.saçma).toBeUndefined(); // whitelist drop
    });

    it("core_fields yoksa boş obje (eski davranış korunur)", async () => {
        const { parseExtractionResponse } = await import("@/lib/services/ai-service");
        const r = parseExtractionResponse(
            JSON.stringify({ items: [{ line: 1, name: "Vana", sku: "K1", product_type_id: TYPES[0].id, attributes: {}, confidence: 0.8 }] }),
            TYPES,
        );
        expect(r.items[0].core_fields).toEqual({});
    });
});

describe("migration 085 — extracted_core_fields", () => {
    it("ADD COLUMN extracted_core_fields jsonb default + ROLLBACK", () => {
        const sql = read("supabase/migrations/085_import_document_lines_core_fields.sql");
        expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS extracted_core_fields jsonb/i);
        expect(sql).toMatch(/DEFAULT '\{\}'/);
        expect(sql).toContain("import_document_lines");
        expect(sql.toUpperCase()).toContain("ROLLBACK");
    });
});

describe("ExtractionReview — core_fields gösterimi (source-regression)", () => {
    it("review satırında 'Genel bilgiler' + extracted_core_fields render edilir", () => {
        const src = read("src/components/import/ExtractionReview.tsx");
        expect(src).toContain("extracted_core_fields");
        expect(src).toContain("Genel bilgiler");
        expect(src).toContain("coreFieldLabel");
    });
});

describe("Faz D — ExtractionReview katalog görsel önizleme (source-regression)", () => {
    it("source_page olan satırda lazy preview-image + önizleme butonu render edilir", () => {
        const src = read("src/components/import/ExtractionReview.tsx");
        expect(src).toContain("previewLineId");
        expect(src).toContain("line.source_page != null");
        expect(src).toContain("/preview-image");
        expect(src).toContain("Katalog görseli");
    });
    it("apply özeti images_extracted sayacını gösterir", () => {
        const src = read("src/components/import/ExtractionReview.tsx");
        expect(src).toContain("images_extracted");
        expect(src).toContain("katalog görseli eklendi");
    });
});

describe("Null-SKU kapatma — ExtractionReview yeni-ürün SKU girişi (source-regression)", () => {
    it("new_product satırında düzenlenebilir SKU input + handleSkuChange render edilir", () => {
        const src = read("src/components/import/ExtractionReview.tsx");
        expect(src).toContain("handleSkuChange");
        expect(src).toContain("isNewProductLine ?");
        expect(src).toContain("SKU gir (zorunlu)");
        // SKU boşken zorunlu uyarısı (datasheet vermedi) gösterilir
        expect(src).toContain("yeni ürün açmak için SKU girin");
    });
    it("handleSkuChange match_action korur ve extracted_sku gönderir (satır new_product'tan düşmez)", () => {
        const src = read("src/components/import/ExtractionReview.tsx");
        expect(src).toContain("extracted_sku: next");
        expect(src).toMatch(/handleSkuChange[\s\S]*match_action: line\.match_action/);
    });
});
