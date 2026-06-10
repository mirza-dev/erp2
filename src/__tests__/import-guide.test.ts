import { describe, it, expect } from "vitest";
import {
    IMPORT_DATA_TARGETS,
    IMPORT_TRUST_NOTES,
    getActiveTemplateLinks,
    getTargetForOperation,
} from "@/lib/import-guide";
import {
    getActiveAiImportOperations,
    getAiImportOperation,
    type AiImportOperationScope,
} from "@/lib/ai-import-operations";
import { EXCEL_IMPORT_TEMPLATES } from "@/lib/import-center";

// 2026-06-10 sadeleştirme: IMPORT_STEPS + buildOperationTargets, tüketicileri
// ImportGuide.tsx ile birlikte kaldırıldı (dosya-önce hub). Kalan exportlar
// hub şablon satırı + güven satırı + ExtractionReview hedef özeti tarafından
// tüketilmeye devam eder ve burada kilitlenir.

describe("import-guide — IMPORT_DATA_TARGETS", () => {
    it("ai-import-operations'taki HER scope kapsanır (eksik hedef yok)", () => {
        const scopes = new Set<AiImportOperationScope>(getActiveAiImportOperations().map(op => op.scope));
        for (const scope of scopes) {
            expect(IMPORT_DATA_TARGETS[scope]).toBeDefined();
            expect(IMPORT_DATA_TARGETS[scope].module.length).toBeGreaterThan(0);
            expect(IMPORT_DATA_TARGETS[scope].action.length).toBeGreaterThan(0);
        }
    });

    it("product/customer/vendor hedefleri doğru modüle yönlenir", () => {
        expect(IMPORT_DATA_TARGETS.product.href).toBe("/dashboard/products");
        expect(IMPORT_DATA_TARGETS.customer.href).toBe("/dashboard/customers");
        expect(IMPORT_DATA_TARGETS.vendor.href).toBe("/dashboard/vendors");
    });

    it("Faz D: product_document hedefi görsel→kapak (primary) bilgisi içerir", () => {
        expect(IMPORT_DATA_TARGETS.product_document.action.toLowerCase()).toContain("kapak");
        expect(IMPORT_DATA_TARGETS.product_document.action.toLowerCase()).toContain("primary");
    });
});

describe("import-guide — getTargetForOperation", () => {
    it("işlemin scope'una karşılık gelen hedefi döndürür", () => {
        const op = getAiImportOperation("product_documents");
        expect(getTargetForOperation(op)).toBe(IMPORT_DATA_TARGETS.product_document);
    });

    it("her aktif işlem için hedef tanımlı (ExtractionReview özeti undefined göremez)", () => {
        for (const op of getActiveAiImportOperations()) {
            const target = getTargetForOperation(op);
            expect(target).toBeDefined();
            expect(target.module.length).toBeGreaterThan(0);
            expect(target.action.length).toBeGreaterThan(0);
        }
    });
});

describe("import-guide — getActiveTemplateLinks", () => {
    it("tüm Excel şablonlarını listeler, href doğru /api/import/templates işaret eder", () => {
        const links = getActiveTemplateLinks();
        expect(links).toHaveLength(Object.keys(EXCEL_IMPORT_TEMPLATES).length);
        for (const link of links) {
            expect(link.href).toBe(`/api/import/templates?kind=${link.kind}`);
            expect(link.columnCount).toBeGreaterThan(0);
            expect(link.requiredCount).toBeGreaterThanOrEqual(1);
        }
    });

    it("requiredCount şablonun zorunlu sütun sayısıyla eşleşir", () => {
        const productLink = getActiveTemplateLinks().find(l => l.kind === "product")!;
        const expected = EXCEL_IMPORT_TEMPLATES.product.columns.filter(c => c.required).length;
        expect(productLink.requiredCount).toBe(expected);
    });
});

describe("import-guide — IMPORT_TRUST_NOTES", () => {
    it("onay + finansal güvenlik maddelerini içerir", () => {
        const joined = IMPORT_TRUST_NOTES.join(" ").toLowerCase();
        expect(IMPORT_TRUST_NOTES.length).toBeGreaterThanOrEqual(5);
        expect(joined).toContain("onay");
        expect(joined).toMatch(/fiyat|maliyet/);
        expect(joined).toMatch(/silmez|sıfırlamaz/);
    });
});
