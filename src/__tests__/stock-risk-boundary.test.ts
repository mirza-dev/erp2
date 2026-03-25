/**
 * Boundary layer tests: deterministic (critical/warning) vs AI risk (advisory).
 * Validates the "firewall" separating alert-service domain from AI advisory domain.
 *
 * domain-rules.md §6.3: "AI, deterministic kuralları değiştirmez"
 * ai-strategy.md §5.4: AI risk ile gerçek kritik durum karışmamalı
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
    CRITICAL_PRODUCT,
    AI_RISK_PRODUCT,
    HEALTHY_PRODUCT,
    ALL_THREE,
} from "./fixtures/stock-risk-fixtures";

// ─── DB query mock ────────────────────────────────────────────────────────────

const mockDbListProducts = vi.fn();

vi.mock("@/lib/supabase/products", () => ({
    dbListProducts: (...args: unknown[]) => mockDbListProducts(...args),
}));

// ─── AI service mock ──────────────────────────────────────────────────────────

const mockAiAssessStockRisk = vi.fn();
const mockIsAIAvailable = vi.fn();

vi.mock("@/lib/services/ai-service", () => ({
    aiAssessStockRisk: (...args: unknown[]) => mockAiAssessStockRisk(...args),
    isAIAvailable: () => mockIsAIAvailable(),
}));

import { POST } from "@/app/api/ai/stock-risk/route";
import { computeStockRiskLevel, getStatusBadge } from "@/lib/stock-utils";

beforeEach(() => {
    mockDbListProducts.mockReset();
    mockAiAssessStockRisk.mockReset();
    mockIsAIAvailable.mockReset();
});

// ─── Block 1: Firewall — deterministik bölge AI risk alamaz ──────────────────

describe("Firewall — deterministik bölge ürünleri AI risk alamaz", () => {
    it("kritik ürün (available ≤ min) → computeStockRiskLevel 'none' döner", () => {
        // available=8, min=10 → inside critical zone
        const result = computeStockRiskLevel(8, 10, 5, 14);
        expect(result.riskLevel).toBe("none");
    });

    it("warning ürün (available ≤ ceil(min*1.5)) → 'none' döner", () => {
        // available=14, min=10 → warning zone (14 ≤ 15)
        const result = computeStockRiskLevel(14, 10, 5, 14);
        expect(result.riskLevel).toBe("none");
    });

    it("warning sınırında (available === ceil(min*1.5)) → 'none' döner", () => {
        // ceil(10 * 1.5) = 15
        const result = computeStockRiskLevel(15, 10, 5, 14);
        expect(result.riskLevel).toBe("none");
    });

    it("warning sınırı hemen üstü (available = 16) → risk hesaplamasına girer", () => {
        // available=16 > 15 (threshold), dailyUsage=3, coverageDays=round(16/3)=5, leadTimeDays=14
        // 5 < 14 → coverage_risk
        const result = computeStockRiskLevel(16, 10, 3, 14);
        expect(result.riskLevel).toBe("coverage_risk");
    });

    it("sıfır stok (available === 0) → 'none' döner", () => {
        const result = computeStockRiskLevel(0, 10, 5, 14);
        expect(result.riskLevel).toBe("none");
    });
});

// ─── Block 2: Firewall — route deterministik ürünleri items'tan hariç tutar ──

describe("Firewall — route deterministik ürünleri AI items'tan hariç tutar", () => {
    beforeEach(() => {
        mockIsAIAvailable.mockReturnValue(false);
        mockDbListProducts.mockResolvedValue(ALL_THREE);
    });

    it("sadece AI_RISK_PRODUCT items'ta görünür", async () => {
        const res = await POST();
        const body = await res.json();
        const ids = body.items.map((i: { productId: string }) => i.productId);
        expect(ids).toContain(AI_RISK_PRODUCT.id);
    });

    it("CRITICAL_PRODUCT items'ta asla yok", async () => {
        const res = await POST();
        const body = await res.json();
        const found = body.items.find((i: { productId: string }) => i.productId === CRITICAL_PRODUCT.id);
        expect(found).toBeUndefined();
    });

    it("HEALTHY_PRODUCT items'ta asla yok (risk yok)", async () => {
        const res = await POST();
        const body = await res.json();
        const found = body.items.find((i: { productId: string }) => i.productId === HEALTHY_PRODUCT.id);
        expect(found).toBeUndefined();
    });

    it("counts.critical CRITICAL_PRODUCT'u içerir", async () => {
        const res = await POST();
        const body = await res.json();
        expect(body.counts.critical).toBe(1);
    });

    it("counts.at_risk sadece AI_RISK_PRODUCT'u sayar", async () => {
        const res = await POST();
        const body = await res.json();
        expect(body.counts.at_risk).toBe(1);
    });

    it("items[0].riskLevel deterministik seviye ('coverage_risk'), 'critical' veya 'warning' değil", async () => {
        const res = await POST();
        const body = await res.json();
        expect(body.items[0].riskLevel).toBe("coverage_risk");
        expect(body.items[0].riskLevel).not.toBe("critical");
        expect(body.items[0].riskLevel).not.toBe("warning");
    });
});

// ─── Block 3: AI advisory only — AI alanları deterministik üzerine eklenir ───

describe("AI advisory only — AI alanları deterministik üzerine eklenir, değiştirmez", () => {
    it("deterministicReason at-risk item'da AI'den bağımsız olarak dolu", async () => {
        mockIsAIAvailable.mockReturnValue(false);
        mockDbListProducts.mockResolvedValue([AI_RISK_PRODUCT]);
        const res = await POST();
        const body = await res.json();
        expect(typeof body.items[0].deterministicReason).toBe("string");
        expect(body.items[0].deterministicReason.length).toBeGreaterThan(0);
    });

    it("AI unavailable → aiExplanation null ama deterministicReason duruyor", async () => {
        mockIsAIAvailable.mockReturnValue(false);
        mockDbListProducts.mockResolvedValue([AI_RISK_PRODUCT]);
        const res = await POST();
        const body = await res.json();
        expect(body.items[0].aiExplanation).toBeNull();
        expect(body.items[0].deterministicReason.length).toBeGreaterThan(0);
    });

    it("AI available → aiExplanation deterministicReason yanında dolu", async () => {
        mockIsAIAvailable.mockReturnValue(true);
        mockDbListProducts.mockResolvedValue([AI_RISK_PRODUCT]);
        mockAiAssessStockRisk.mockResolvedValue({
            assessments: [{
                productId: AI_RISK_PRODUCT.id,
                explanation: "Stok tükenme süresi tedarik süresinden kısa.",
                recommendation: "Hemen sipariş verin.",
                confidence: 0.9,
            }],
            generatedAt: new Date().toISOString(),
        });
        const res = await POST();
        const body = await res.json();
        expect(body.items[0].aiExplanation).toBe("Stok tükenme süresi tedarik süresinden kısa.");
        expect(body.items[0].deterministicReason.length).toBeGreaterThan(0);
    });

    it("AI olsa bile riskLevel deterministik hesaplamadan geliyor", async () => {
        mockIsAIAvailable.mockReturnValue(true);
        mockDbListProducts.mockResolvedValue([AI_RISK_PRODUCT]);
        mockAiAssessStockRisk.mockResolvedValue({
            assessments: [{
                productId: AI_RISK_PRODUCT.id,
                explanation: "AI explanation",
                recommendation: "AI recommendation",
                confidence: 0.9,
            }],
            generatedAt: new Date().toISOString(),
        });
        const res = await POST();
        const body = await res.json();
        expect(body.items[0].riskLevel).toBe("coverage_risk");
    });
});

// ─── Block 4: AI unavailable — kanonik fixture'larla graceful degradation ─────

describe("AI unavailable — kanonik fixture'larla graceful degradation", () => {
    beforeEach(() => {
        mockIsAIAvailable.mockReturnValue(false);
        mockDbListProducts.mockResolvedValue(ALL_THREE);
    });

    it("HTTP 200 döner (AI olmadan da çalışır)", async () => {
        const res = await POST();
        expect(res.status).toBe(200);
    });

    it("items sadece deterministik alanlarla dolu (AI alanları null)", async () => {
        const res = await POST();
        const body = await res.json();
        expect(body.items[0].aiExplanation).toBeNull();
        expect(body.items[0].aiRecommendation).toBeNull();
        expect(body.items[0].aiConfidence).toBeNull();
    });

    it("counts doğru: critical=1, at_risk=1, total=3", async () => {
        const res = await POST();
        const body = await res.json();
        expect(body.counts.total_products).toBe(3);
        expect(body.counts.critical).toBe(1);
        expect(body.counts.at_risk).toBe(1);
    });

    it("AI servisi hiç çağrılmaz", async () => {
        await POST();
        expect(mockAiAssessStockRisk).not.toHaveBeenCalled();
    });
});

// ─── Block 5: getStatusBadge — UI badge ayrımı ────────────────────────────────

describe("getStatusBadge — UI badge ayrımı", () => {
    it("available === 0 → 'Tükendi' (danger)", () => {
        const b = getStatusBadge(0, 10);
        expect(b.label).toBe("Tükendi");
        expect(b.cls).toBe("badge-danger");
    });

    it("available ≤ min → 'Kritik' (danger)", () => {
        const b = getStatusBadge(8, 10);
        expect(b.label).toBe("Kritik");
        expect(b.cls).toBe("badge-danger");
    });

    it("available === min → 'Kritik', 'Tükendi' değil", () => {
        const b = getStatusBadge(10, 10);
        expect(b.label).toBe("Kritik");
        expect(b.label).not.toBe("Tükendi");
    });

    it("available ≤ min*2 → 'Düşük' (warning)", () => {
        const b = getStatusBadge(18, 10);
        expect(b.label).toBe("Düşük");
        expect(b.cls).toBe("badge-warning");
    });

    it("available > min*2 ve risk=true → 'Riskli' (info)", () => {
        const b = getStatusBadge(22, 10, true);
        expect(b.label).toBe("Riskli");
        expect(b.cls).toBe("badge-info");
    });

    it("available > min*2 ve risk=false → 'Hazır' (success)", () => {
        const b = getStatusBadge(22, 10, false);
        expect(b.label).toBe("Hazır");
        expect(b.cls).toBe("badge-success");
    });

    it("Öncelik: Kritik > Riskli — risk=true olsa bile available ≤ min → 'Kritik'", () => {
        const b = getStatusBadge(8, 10, true);
        expect(b.label).toBe("Kritik");
    });

    it("Öncelik: Düşük > Riskli — risk=true olsa bile available ≤ min*2 → 'Düşük'", () => {
        const b = getStatusBadge(18, 10, true);
        expect(b.label).toBe("Düşük");
    });

    it("risk=undefined → 'Hazır' (falsy risk, 'Riskli' değil)", () => {
        const b = getStatusBadge(22, 10);
        expect(b.label).toBe("Hazır");
    });
});

// ─── Block 6: Data contract — route response shape ────────────────────────────

describe("Data contract — route response shape", () => {
    beforeEach(() => {
        mockIsAIAvailable.mockReturnValue(false);
        mockDbListProducts.mockResolvedValue(ALL_THREE);
    });

    it("response üst düzey anahtarları: ai_available, counts, items, generatedAt", async () => {
        const res = await POST();
        const body = await res.json();
        expect(Object.keys(body).sort()).toEqual(
            ["ai_available", "counts", "generatedAt", "items"]
        );
    });

    it("counts anahtarları: total_products, critical, warning, at_risk", async () => {
        const res = await POST();
        const body = await res.json();
        expect(Object.keys(body.counts).sort()).toEqual(
            ["at_risk", "critical", "total_products", "warning"]
        );
    });

    it("her item 9 alan taşır", async () => {
        const res = await POST();
        const body = await res.json();
        const expectedKeys = [
            "aiConfidence", "aiExplanation", "aiRecommendation",
            "coverageDays", "dailyUsage", "deterministicReason",
            "leadTimeDays", "productId", "riskLevel",
        ];
        expect(Object.keys(body.items[0]).sort()).toEqual(expectedKeys);
    });

    it("coverageDays ve leadTimeDays number tipinde (string değil)", async () => {
        const res = await POST();
        const body = await res.json();
        const item = body.items[0];
        expect(typeof item.coverageDays).toBe("number");
        expect(typeof item.leadTimeDays).toBe("number");
    });
});
