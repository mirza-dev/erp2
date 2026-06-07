import { describe, it, expect } from "vitest";
import {
    IMPORT_STEPS,
    IMPORT_DATA_TARGETS,
    IMPORT_TRUST_NOTES,
    buildOperationTargets,
    getActiveTemplateLinks,
    getTargetForOperation,
} from "@/lib/import-guide";
import {
    getActiveAiImportOperations,
    getAiImportOperation,
    type AiImportOperationScope,
} from "@/lib/ai-import-operations";
import { EXCEL_IMPORT_TEMPLATES } from "@/lib/import-center";

describe("import-guide — IMPORT_STEPS", () => {
    it("tam 3 adım, sıralı numara + başlık + açıklama", () => {
        expect(IMPORT_STEPS).toHaveLength(3);
        expect(IMPORT_STEPS.map(s => s.n)).toEqual([1, 2, 3]);
        for (const s of IMPORT_STEPS) {
            expect(s.title.length).toBeGreaterThan(0);
            expect(s.desc.length).toBeGreaterThan(0);
        }
    });

    it("3. adım onay vurgusu içerir (onaysız kayıt yazılmaz)", () => {
        expect(IMPORT_STEPS[2].desc.toLowerCase()).toContain("onay");
    });
});

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

describe("import-guide — buildOperationTargets", () => {
    it("her aktif işlem bir satır olur; safetyNote/evidenceHint/hedef taşınır", () => {
        const rows = buildOperationTargets();
        const active = getActiveAiImportOperations();
        expect(rows).toHaveLength(active.length);
        for (const row of rows) {
            const op = active.find(o => o.id === row.id)!;
            expect(op).toBeDefined();
            expect(row.safetyNote).toBe(op.safetyNote);
            expect(row.evidenceHint).toBe(op.evidenceHint);
            expect(row.target).toBe(IMPORT_DATA_TARGETS[op.scope]);
        }
    });

    it("bilinmeyen scope yok — hiçbir satırın hedefi undefined olamaz", () => {
        for (const row of buildOperationTargets()) {
            expect(row.target).toBeDefined();
        }
    });
});

describe("import-guide — getTargetForOperation", () => {
    it("işlemin scope'una karşılık gelen hedefi döndürür", () => {
        const op = getAiImportOperation("product_documents");
        expect(getTargetForOperation(op)).toBe(IMPORT_DATA_TARGETS.product_document);
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
