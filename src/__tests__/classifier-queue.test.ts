/**
 * Faz 3a — ClassifierQueue pure helper behavior tests.
 *
 * Coverage:
 *   - chunkBy: empty, exact multiple, with remainder, size 0 fallback
 *   - documentTypeLabel/Icon: all 10 types
 *   - formatLanguage: known/unknown codes
 *   - confidenceColor: thresholds (>=0.8 success, >=0.5 warning, else danger)
 *   - classifierResultBadge: format, color matches confidence
 */
import { describe, it, expect } from "vitest";
import {
    chunkBy,
    documentTypeLabel,
    documentTypeIcon,
    formatLanguage,
    confidenceColor,
    classifierResultBadge,
    selectClassifyCandidates,
    type ConcurrencySelectableItem,
} from "@/components/import/ClassifierQueue";
import type { DocumentType } from "@/lib/database.types";

describe("chunkBy", () => {
    it("returns single empty chunk for empty array", () => {
        expect(chunkBy([], 3)).toEqual([]);
    });
    it("exact multiple of size", () => {
        expect(chunkBy([1, 2, 3, 4, 5, 6], 2)).toEqual([[1, 2], [3, 4], [5, 6]]);
    });
    it("with remainder", () => {
        expect(chunkBy([1, 2, 3, 4, 5], 3)).toEqual([[1, 2, 3], [4, 5]]);
    });
    it("size 0 returns single chunk with all items (fallback)", () => {
        expect(chunkBy([1, 2, 3], 0)).toEqual([[1, 2, 3]]);
    });
});

describe("documentTypeLabel + documentTypeIcon — all 10 types", () => {
    const types: DocumentType[] = [
        "product_catalog", "product_datasheet", "material_certificate",
        "compliance_doc", "test_report", "msds",
        "vendor_profile", "product_photo", "migration_excel", "unknown",
    ];
    it("every type returns a non-empty label", () => {
        for (const t of types) {
            expect(documentTypeLabel(t).length).toBeGreaterThan(0);
        }
    });
    it("every type returns a non-empty icon", () => {
        for (const t of types) {
            expect(documentTypeIcon(t).length).toBeGreaterThan(0);
        }
    });
    it("icons are distinct across types (no collision)", () => {
        const icons = types.map(documentTypeIcon);
        expect(new Set(icons).size).toBe(icons.length);
    });
});

describe("formatLanguage", () => {
    it("known codes (tr/en/de)", () => {
        expect(formatLanguage("tr")).toBe("Türkçe");
        expect(formatLanguage("en")).toBe("İngilizce");
        expect(formatLanguage("de")).toBe("Almanca");
    });
    it("unknown code → 'Bilinmiyor'", () => {
        expect(formatLanguage("unknown")).toBe("Bilinmiyor");
    });
    it("unrecognized code → passthrough", () => {
        expect(formatLanguage("xx")).toBe("xx");
    });
});

describe("confidenceColor + classifierResultBadge", () => {
    it("confidenceColor thresholds", () => {
        expect(confidenceColor(0.95)).toBe("var(--success-text)");
        expect(confidenceColor(0.8)).toBe("var(--success-text)");
        expect(confidenceColor(0.65)).toBe("var(--warning-text)");
        expect(confidenceColor(0.5)).toBe("var(--warning-text)");
        expect(confidenceColor(0.2)).toBe("var(--danger-text)");
    });

    it("classifierResultBadge formats label with % and matches confidence color", () => {
        const high = classifierResultBadge({
            document_type: "product_catalog", confidence: 0.92, language: "tr",
            summary: "ok", suggested_product_type_id: null,
        });
        expect(high.label).toContain("Ürün Kataloğu");
        expect(high.label).toContain("%92");
        expect(high.color).toBe("var(--success-text)");
        expect(high.background).toBe("var(--success-bg)");

        const low = classifierResultBadge({
            document_type: "unknown", confidence: 0.1, language: "unknown",
            summary: "", suggested_product_type_id: null,
        });
        expect(low.color).toBe("var(--danger-text)");
        expect(low.background).toBe("var(--danger-bg)");
    });
});

// ── selectClassifyCandidates — concurrency state machine (P3-010 follow-up) ──

function makeItem(id: string, overrides: Partial<ConcurrencySelectableItem> = {}): ConcurrencySelectableItem {
    return {
        id,
        started: false,
        status: "uploading",
        ...overrides,
    };
}

describe("selectClassifyCandidates", () => {
    it("returns empty when cap <= 0", () => {
        const queue = [makeItem("a")];
        expect(selectClassifyCandidates(queue, 0)).toEqual([]);
        expect(selectClassifyCandidates(queue, -1)).toEqual([]);
    });

    it("returns empty when queue is empty", () => {
        expect(selectClassifyCandidates([], 3)).toEqual([]);
    });

    it("returns up to `cap` uploading + !started items", () => {
        const queue = [makeItem("a"), makeItem("b"), makeItem("c"), makeItem("d"), makeItem("e")];
        const r = selectClassifyCandidates(queue, 3);
        expect(r.map(x => x.id)).toEqual(["a", "b", "c"]);
    });

    it("excludes items where started=true (duplicate fetch koruma)", () => {
        const queue = [
            makeItem("a", { started: true }),
            makeItem("b"),
            makeItem("c"),
        ];
        const r = selectClassifyCandidates(queue, 3);
        expect(r.map(x => x.id)).toEqual(["b", "c"]);
    });

    it("excludes non-uploading status (classified/error/classifying)", () => {
        const queue = [
            makeItem("a", { status: "classified" }),
            makeItem("b", { status: "error" }),
            makeItem("c", { status: "classifying" }),
            makeItem("d"),
        ];
        const r = selectClassifyCandidates(queue, 3);
        expect(r.map(x => x.id)).toEqual(["d"]);
    });

    it("counts classifying as in-flight; reduces available slots", () => {
        // 2 zaten classifying, cap=3 → 1 slot kalır
        const queue = [
            makeItem("a", { started: true, status: "classifying" }),
            makeItem("b", { started: true, status: "classifying" }),
            makeItem("c"),
            makeItem("d"),
            makeItem("e"),
        ];
        const r = selectClassifyCandidates(queue, 3);
        expect(r.map(x => x.id)).toEqual(["c"]);
    });

    it("returns empty when all slots are full (cap == in-flight)", () => {
        const queue = [
            makeItem("a", { started: true, status: "classifying" }),
            makeItem("b", { started: true, status: "classifying" }),
            makeItem("c", { started: true, status: "classifying" }),
            makeItem("d"),
        ];
        const r = selectClassifyCandidates(queue, 3);
        expect(r).toEqual([]);
    });

    it("strict slice — returns AT MOST cap items regardless of queue size (5 uploading, cap 3 → 3)", () => {
        const queue = Array.from({ length: 5 }, (_, i) => makeItem(`f${i}`));
        const r = selectClassifyCandidates(queue, 3);
        expect(r.length).toBe(3);
    });
});
