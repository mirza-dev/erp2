import { describe, expect, it } from "vitest";
import {
    AI_IMPORT_OPERATIONS,
    DEFAULT_AI_IMPORT_OPERATION,
    getActiveAiImportOperations,
    getAiImportOperation,
    getPlannedAiImportOperations,
    isAiImportOperationType,
} from "@/lib/ai-import-operations";

describe("ai-import-operations", () => {
    it("has a valid default operation", () => {
        expect(isAiImportOperationType(DEFAULT_AI_IMPORT_OPERATION)).toBe(true);
        expect(getAiImportOperation(undefined).id).toBe(DEFAULT_AI_IMPORT_OPERATION);
    });

    it("separates active operations from planned operations", () => {
        const active = getActiveAiImportOperations();
        const planned = getPlannedAiImportOperations();

        expect(active.length).toBeGreaterThan(0);
        expect(active.every(op => op.status === "active")).toBe(true);
        expect(active.some(op => op.phase === 1)).toBe(true);
        expect(active.some(op => op.phase === 2)).toBe(true);
        expect(planned.every(op => op.status === "planned")).toBe(true);
    });

    it("keeps phase-2 stock/vendor operations active and financially safe", () => {
        const phase2 = getActiveAiImportOperations().filter(op => op.phase === 2);
        expect(phase2.map(op => op.id)).toEqual(expect.arrayContaining([
            "stock_count",
            "stock_movement",
            "customer_upsert",
            "vendor_upsert",
            "vendor_product_relation",
        ]));
        for (const op of phase2.filter(op => op.scope === "stock" || op.scope === "vendor")) {
            expect(`${op.safetyNote} ${op.promptContext}`.toLowerCase()).toMatch(/fiyat|maliyet|cost|price/);
        }
    });

    it("keeps price/cost safety language in product operations", () => {
        const productOps = AI_IMPORT_OPERATIONS.filter(op => op.scope === "product");
        expect(productOps.length).toBeGreaterThan(0);
        for (const op of productOps) {
            expect(`${op.safetyNote} ${op.promptContext}`.toLowerCase()).toMatch(/fiyat|maliyet/);
        }
    });
});
