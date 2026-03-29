/**
 * Eval fixtures for aiAssessStockRisk.
 * These are independent of stock-risk-fixtures.ts — they use StockRiskItem[]
 * directly and do not share ProductRow fixtures.
 */

import type { StockRiskItem } from "@/lib/services/ai-service";

export interface StockRiskEvalScenario {
    label: string;
    items: StockRiskItem[];
    goldenResponse: string;
    expected: {
        count: number;
        minConfidence: number;
        maxConfidence: number;
    };
}

// ── Scenario 1: Two products with full data (dailyUsage + leadTimeDays) ───────

const MULTI_PRODUCT_ITEMS: StockRiskItem[] = [
    {
        productId: "prod-mp-001",
        productName: "Küresel Vana DN25",
        sku: "KV-DN25",
        available: 22,
        min: 10,
        dailyUsage: 3,
        coverageDays: 7,
        leadTimeDays: 14,
        riskLevel: "coverage_risk",
        deterministicReason: "Mevcut stok 7 gün, tedarik süresi 14 gün",
    },
    {
        productId: "prod-mp-002",
        productName: "Flanşlı Vana DN50",
        sku: "FV-DN50",
        available: 18,
        min: 10,
        dailyUsage: 2,
        coverageDays: 9,
        leadTimeDays: 12,
        riskLevel: "approaching_critical",
        deterministicReason: "Stok min × 1.5 sınırına yaklaşıyor",
    },
];

export const MULTI_PRODUCT_RISK_GOLDEN = JSON.stringify({
    assessments: [
        {
            productId: "prod-mp-001",
            explanation: "7 günlük stok kapasitesi 14 günlük tedarik süresinin yarısı kadardır. Acil sipariş verilmezse stok tükenebilir.",
            recommendation: "Bugün tedarikçiyi arayın ve minimum 42 adetlik sipariş verin.",
            confidence: 0.85,
        },
        {
            productId: "prod-mp-002",
            explanation: "9 günlük stok kapasitesi 12 günlük tedarik süresinin altında kalmaktadır. Risk artmaktadır.",
            recommendation: "Bu hafta içinde 24 adetlik sipariş açın.",
            confidence: 0.80,
        },
    ],
});

// ── Scenario 2: Single product, leadTimeDays null ──────────────────────────

const SINGLE_APPROACHING_ITEMS: StockRiskItem[] = [
    {
        productId: "prod-sa-001",
        productName: "Çekvalf DN32",
        sku: "CV-DN32",
        available: 15,
        min: 10,
        dailyUsage: 1.5,
        coverageDays: 10,
        leadTimeDays: null,
        riskLevel: "approaching_critical",
        deterministicReason: "Min × 1.5 eşiğine yaklaşıyor",
    },
];

export const SINGLE_APPROACHING_CRITICAL_GOLDEN = JSON.stringify({
    assessments: [
        {
            productId: "prod-sa-001",
            explanation: "Stok kritik eşiğin 1.5 katına yaklaşmaktadır; tedarik süresi bilinmiyor.",
            recommendation: "Tedarikçiden teslimat süresi öğrenin ve stok durumunu izleyin.",
            confidence: 0.60,
        },
    ],
});

// ── Scenario 3: Single product, both dailyUsage and leadTimeDays null ────────

const NO_DATA_ITEMS: StockRiskItem[] = [
    {
        productId: "prod-nd-001",
        productName: "Baskı Regülatörü G1/2",
        sku: "BR-G12",
        available: 20,
        min: 10,
        dailyUsage: 0,
        coverageDays: 0,
        leadTimeDays: null,
        riskLevel: "approaching_critical",
        deterministicReason: "Günlük kullanım ve tedarik süresi verisi yok",
    },
];

export const NO_DATA_RISK_GOLDEN = JSON.stringify({
    assessments: [
        {
            productId: "prod-nd-001",
            explanation: "Günlük kullanım ve tedarik süresi verisi olmadığından risk tam olarak ölçülemiyor.",
            recommendation: "Geçmiş satış verilerini girin ve tedarikçiden teslimat süresi alın.",
            confidence: 0.40,
        },
    ],
});

// ── All scenarios ─────────────────────────────────────────────────────────────

export const ALL_STOCK_RISK_EVAL_SCENARIOS: StockRiskEvalScenario[] = [
    {
        label: "MULTI_PRODUCT_RISK",
        items: MULTI_PRODUCT_ITEMS,
        goldenResponse: MULTI_PRODUCT_RISK_GOLDEN,
        expected: { count: 2, minConfidence: 0.75, maxConfidence: 0.90 },
    },
    {
        label: "SINGLE_APPROACHING_CRITICAL",
        items: SINGLE_APPROACHING_ITEMS,
        goldenResponse: SINGLE_APPROACHING_CRITICAL_GOLDEN,
        expected: { count: 1, minConfidence: 0.50, maxConfidence: 0.70 },
    },
    {
        label: "NO_DATA_RISK",
        items: NO_DATA_ITEMS,
        goldenResponse: NO_DATA_RISK_GOLDEN,
        expected: { count: 1, minConfidence: 0.30, maxConfidence: 0.50 },
    },
];
