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
    it("exact SKU match → +60 (Review 3b 2.tur: UNIQUE anchor)", () => {
        const { score, reasons } = scoreProductMatch(PROD, { sku: "KV-DB-DN100" });
        expect(score).toBe(60);
        expect(reasons).toContain("sku_exact");
    });

    it("case-insensitive SKU", () => {
        const { score } = scoreProductMatch(PROD, { sku: "kv-db-dn100" });
        expect(score).toBe(60);
    });

    it("SKU-only → 60 = pending (en az pending, AI halüsinasyon koruması)", () => {
        const { score } = scoreProductMatch(PROD, { sku: "KV-DB-DN100" });
        expect(decideMatchAction(score)).toBe("pending");
    });

    it("high-sim name → +45 (Review 3b weight bump)", () => {
        const { score, reasons } = scoreProductMatch(PROD, { name: "Vana DN100 PN16" });
        expect(score).toBe(45);
        expect(reasons).toContain("name_high");
    });

    it("partial name (similarity 0.4-0.8) → +15 (Review 3b weight bump)", () => {
        // "Vana DN100" vs "Vana DN100 PN16" trigram ~0.61 → partial range
        const { score, reasons } = scoreProductMatch(PROD, { name: "Vana DN100" });
        expect(reasons).toContain("name_partial");
        expect(score).toBe(15);
    });

    it("DN grup match → +20 (per-group, attr_dn reason)", () => {
        const { score, reasons } = scoreProductMatch(PROD, { attributes: { dn: 100 } });
        expect(score).toBe(20);
        expect(reasons).toContain("attr_dn");
    });

    it("DN + PN gruplarının ikisi de match → +40 (per-group sum)", () => {
        const { score, reasons } = scoreProductMatch(PROD, { attributes: { dn: 100, pn_class: "PN16" } });
        expect(score).toBe(40);
        expect(reasons).toContain("attr_dn");
        expect(reasons).toContain("attr_pn");
    });

    it("name + DN + PN (plan tarifi: SKU yok) → 85 auto-match", () => {
        // 45 (name_high) + 20 (dn) + 20 (pn) = 85 → matched threshold
        const { score } = scoreProductMatch(PROD, {
            name: "Vana DN100 PN16",
            attributes: { dn: 100, pn_class: "PN16" },
        });
        expect(score).toBe(85);
    });

    it("SKU + name (sertifika senaryosu) → 105 clamp 100 matched", () => {
        // 60 (sku) + 45 (name_high) = 105 → clamp 100 → matched
        // Review 3b 2.tur P2: cert flow için SKU+name = auto-match güçlü
        const { score } = scoreProductMatch(PROD, {
            sku: "KV-DB-DN100",
            name: "Vana DN100 PN16",
        });
        expect(score).toBe(100);
        expect(decideMatchAction(score)).toBe("matched");
    });

    it("SKU + name + 1 attr → clamp 100", () => {
        const { score } = scoreProductMatch(PROD, {
            sku: "KV-DB-DN100",
            name: "Vana DN100 PN16",
            attributes: { dn: 100 },
        });
        // 40 + 45 + 20 = 105 → clamp 100
        expect(score).toBe(100);
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

// ── Review 3b 6.tur P2: type-aware matching ──

const VANA = "00000000-0000-4000-8000-000000000001";
const CONTA = "00000000-0000-4000-8000-000000000002";

const PROD_TYPED: MatchableProduct = {
    id: "p-vana", sku: "KV-DB-DN100", name: "Vana DN100 PN16",
    product_type_id: VANA, attributes: { dn: 100 },
};

describe("scoreProductMatch — type-aware (Review 3b 6.tur)", () => {
    it("aynı tip → +20 bonus + type_match reason", () => {
        const { score, reasons } = scoreProductMatch(PROD_TYPED, { product_type_id: VANA });
        expect(score).toBe(20);
        expect(reasons).toContain("type_match");
    });

    it("farklı tip → -20 penalty + type_mismatch reason", () => {
        // name_partial 15 + dn 20 - 20 = 15
        const { score, reasons } = scoreProductMatch(PROD_TYPED, {
            product_type_id: CONTA, name: "Vana DN100", attributes: { dn: 100 },
        });
        expect(score).toBe(15);
        expect(reasons).toContain("type_mismatch");
    });

    it("input.product_type_id null → tip katmanı atlanır (eski davranış korunur)", () => {
        const { score, reasons } = scoreProductMatch(PROD_TYPED, { attributes: { dn: 100 } });
        expect(score).toBe(20);
        expect(reasons).not.toContain("type_match");
        expect(reasons).not.toContain("type_mismatch");
    });

    it("product.product_type_id null → tip katmanı atlanır", () => {
        const untypedProd: MatchableProduct = { ...PROD_TYPED, product_type_id: null };
        const { score, reasons } = scoreProductMatch(untypedProd, {
            product_type_id: VANA, attributes: { dn: 100 },
        });
        expect(score).toBe(20);
        expect(reasons).not.toContain("type_match");
        expect(reasons).not.toContain("type_mismatch");
    });

    it("0 floor: name_partial 15 + type_mismatch -20 = -5 → 0 (negatif olmaz)", () => {
        const { score } = scoreProductMatch(PROD_TYPED, {
            product_type_id: CONTA, name: "Vana DN100",
        });
        expect(score).toBe(0);
    });

    it("SKU + name + type_mismatch sınırda matched (60+45-20=85)", () => {
        const { score } = scoreProductMatch(PROD_TYPED, {
            product_type_id: CONTA, sku: "KV-DB-DN100", name: "Vana DN100 PN16",
        });
        expect(score).toBe(85);
        expect(decideMatchAction(score)).toBe("matched");
    });
});

describe("rankProductCandidates — multi-type sıralama (vana vs conta)", () => {
    it("vana satırı + (vana, conta) → vana top, conta drop", () => {
        const products: MatchableProduct[] = [
            { id: "p-vana", sku: "V-50", name: "Vana DN50",
              product_type_id: VANA, attributes: { dn: 50 } },
            { id: "p-conta", sku: "C-50", name: "Conta DN50",
              product_type_id: CONTA, attributes: { dn: 50 } },
        ];
        const r = rankProductCandidates(products,
            { name: "Vana DN50", attributes: { dn: 50 }, product_type_id: VANA }, 3);
        expect(r[0].id).toBe("p-vana");
        // Vana: name_high 45 + dn 20 + type_match 20 = 85
        expect(r[0].score).toBe(85);
        // Conta: name ~0.35 sim (partial threshold altında, +0) + dn 20 - type_mismatch 20 = 0
        // → score 0 olduğu için rankProductCandidates filter eder (eski davranış)
        expect(r.find(c => c.id === "p-conta")).toBeUndefined();
    });

    it("vana satırı + (vana SKU eksik, conta SKU eksik aynı name) → vana top, conta penalty", () => {
        // Hem vana hem conta DN50 isimlerde "DN50" var, name benzer
        const products: MatchableProduct[] = [
            { id: "p-vana", sku: "V-50", name: "Vana DN50 PN16",
              product_type_id: VANA, attributes: { dn: 50, pn_class: "PN16" } },
            { id: "p-conta", sku: "C-50", name: "Vana DN50 PN16",  // AI confusion: aynı name
              product_type_id: CONTA, attributes: { dn: 50, pn_class: "PN16" } },
        ];
        const r = rankProductCandidates(products,
            { name: "Vana DN50 PN16", attributes: { dn: 50, pn_class: "PN16" }, product_type_id: VANA }, 3);
        expect(r[0].id).toBe("p-vana");
        // Vana: name_high 45 + dn 20 + pn 20 + type_match 20 = 105 → clamp 100
        expect(r[0].score).toBe(100);
        // Conta: 45 + 20 + 20 - 20 = 65 → pending (NOT matched, kullanıcı override edebilir)
        expect(r[1]?.id).toBe("p-conta");
        expect(r[1]?.score).toBe(65);
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
