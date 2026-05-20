/**
 * Faz 3b — product-matcher pure helper tests.
 */
import { describe, it, expect } from "vitest";
import {
    scoreProductMatch,
    rankProductCandidates,
    trigramSimilarity,
    decideMatchAction,
    type MatchableProduct,
} from "@/lib/services/product-matcher";

const PROD: MatchableProduct = {
    id: "p-1",
    sku: "KV-DB-DN100",
    name: "Vana DN100 PN16",
    attributes: { dn: 100, pn_class: "PN16" },
};

describe("trigramSimilarity", () => {
    it("identical strings → 1", () => {
        expect(trigramSimilarity("Vana DN50", "Vana DN50")).toBe(1);
    });
    it("totally different strings → low", () => {
        expect(trigramSimilarity("Vana", "XYZ123")).toBeLessThan(0.2);
    });
    it("case + whitespace insensitive", () => {
        expect(trigramSimilarity("Vana DN50", "  vana dn50  ")).toBe(1);
    });
    it("empty input → 0", () => {
        expect(trigramSimilarity("", "Vana")).toBe(0);
        expect(trigramSimilarity("Vana", "")).toBe(0);
    });
});

describe("scoreProductMatch", () => {
    it("exact SKU match → +40", () => {
        const { score, reasons } = scoreProductMatch(PROD, { sku: "KV-DB-DN100" });
        expect(score).toBe(40);
        expect(reasons).toContain("sku_exact");
    });

    it("case-insensitive SKU", () => {
        const { score } = scoreProductMatch(PROD, { sku: "kv-db-dn100" });
        expect(score).toBe(40);
    });

    it("high-sim name → +30", () => {
        const { score, reasons } = scoreProductMatch(PROD, { name: "Vana DN100 PN16" });
        expect(score).toBe(30);
        expect(reasons).toContain("name_high");
    });

    it("partial name (similarity 0.4-0.8) → +10", () => {
        // "Vana DN100" vs "Vana DN100 PN16" trigram ~0.61 → partial range
        const { score, reasons } = scoreProductMatch(PROD, { name: "Vana DN100" });
        expect(reasons).toContain("name_partial");
        expect(score).toBe(10);
    });

    it("attribute (dn + class) match → +20", () => {
        const { score, reasons } = scoreProductMatch(PROD, { attributes: { dn: 100 } });
        expect(score).toBe(20);
        expect(reasons).toContain("attr_match");
    });

    it("SKU + name + attr → max 100 clamped", () => {
        const { score } = scoreProductMatch(PROD, {
            sku: "KV-DB-DN100",
            name: "Vana DN100 PN16",
            attributes: { dn: 100 },
        });
        // 40 + 30 + 20 = 90
        expect(score).toBe(90);
    });

    it("no match at all → 0", () => {
        const { score, reasons } = scoreProductMatch(PROD, { sku: "XYZ-999", name: "Bambaşka" });
        expect(score).toBe(0);
        expect(reasons).toEqual([]);
    });

    it("score never exceeds 100", () => {
        const fakeProd = { ...PROD, attributes: { dn: 100, pn_class: "PN16" } };
        const { score } = scoreProductMatch(fakeProd, {
            sku: PROD.sku, name: PROD.name, attributes: { dn: 100, pn_class: "PN16" },
        });
        expect(score).toBeLessThanOrEqual(100);
    });
});

describe("rankProductCandidates", () => {
    const PRODUCTS: MatchableProduct[] = [
        { id: "p-1", sku: "KV-DB-DN100", name: "Vana DN100 PN16", attributes: {} },
        { id: "p-2", sku: "KV-DB-DN50", name: "Vana DN50 PN16", attributes: {} },
        { id: "p-3", sku: "CT-SS-DN50", name: "Conta SS DN50", attributes: {} },
        { id: "p-4", sku: "BE-SC-M16", name: "Bağlantı Elemanı M16", attributes: {} },
    ];

    it("returns top-N sorted by score DESC", () => {
        const r = rankProductCandidates(PRODUCTS, { sku: "KV-DB-DN100", name: "Vana DN100 PN16" }, 3);
        expect(r.length).toBeGreaterThan(0);
        expect(r[0].id).toBe("p-1");
        expect(r[0].score).toBeGreaterThanOrEqual(r[r.length - 1].score);
    });

    it("respects limit", () => {
        const r = rankProductCandidates(PRODUCTS, { name: "Vana" }, 2);
        expect(r.length).toBeLessThanOrEqual(2);
    });

    it("filters out zero-score products", () => {
        const r = rankProductCandidates(PRODUCTS, { sku: "XYZ-NO-MATCH", name: "Nothing here" }, 5);
        expect(r.length).toBe(0);
    });
});

describe("decideMatchAction", () => {
    it("score >= 85 → matched", () => {
        expect(decideMatchAction(85)).toBe("matched");
        expect(decideMatchAction(100)).toBe("matched");
    });
    it("60 <= score < 85 → pending (review_required)", () => {
        expect(decideMatchAction(60)).toBe("pending");
        expect(decideMatchAction(84)).toBe("pending");
    });
    it("score < 60 → new_product", () => {
        expect(decideMatchAction(59)).toBe("new_product");
        expect(decideMatchAction(0)).toBe("new_product");
    });
});
