/**
 * Purchase copilot fixtures — 4 product archetypes.
 * Extends the makePurchaseItem() pattern from ai-purchase-copilot.test.ts.
 *
 * Golden responses are JSON.stringify({ enrichments: [...] }) format
 * matching what aiEnrichPurchaseSuggestions returns.
 */
import type { PurchaseSuggestionItem, PurchaseEnrichment } from "@/lib/services/ai-service";

export interface PurchaseScenarioExpected {
    urgencyLevel: "critical" | "high" | "moderate";
    minConfidence: number;
    maxConfidence: number;
}

export interface PurchaseScenario {
    label: string;
    items: PurchaseSuggestionItem[];
    goldenResponse: string;
    expected: PurchaseScenarioExpected;
}

// ── Helper ────────────────────────────────────────────────────

function makePurchaseItem(overrides: Partial<PurchaseSuggestionItem> = {}): PurchaseSuggestionItem {
    return {
        productId: "p-fixture",
        productName: "Test Vana DN50",
        sku: "VLV-DN50",
        productType: "commercial",
        unit: "adet",
        available: 5,
        min: 20,
        dailyUsage: 3,
        coverageDays: 2,
        leadTimeDays: 14,
        suggestQty: 60,
        moq: 10,
        targetStock: 62,
        formula: "lead_time",
        leadTimeDemand: 42,
        preferredVendor: null,
        ...overrides,
    };
}

// ── CRITICAL archetype ────────────────────────────────────────
// coverageDays=2, leadTimeDays=14 — coverage < leadTime → critical
export const CRITICAL_PURCHASE_ITEM = makePurchaseItem({
    productId: "p-critical",
    productName: "Gate Valve DN50",
    sku: "GV-DN50-001",
    available: 6,
    dailyUsage: 3,
    coverageDays: 2,
    leadTimeDays: 14,
    suggestQty: 60,
});

export const CRITICAL_PURCHASE_GOLDEN = JSON.stringify({
    enrichments: [
        {
            productId: "p-critical",
            whyNow: "Mevcut stok 2 günde tükenecek; tedarik süresi 14 gün — şimdi sipariş verilmezse 12 günlük açık oluşur.",
            quantityRationale: "60 adet tedarik süresini ve emniyet stoğunu (20 adet) karşılar.",
            urgencyLevel: "critical",
            confidence: 0.88,
        } satisfies PurchaseEnrichment,
    ],
});

// ── HIGH_URGENCY archetype ────────────────────────────────────
// coverageDays=10, leadTimeDays=14 — within 7-14 day window → high
export const HIGH_URGENCY_PURCHASE_ITEM = makePurchaseItem({
    productId: "p-high",
    productName: "Ball Valve DN25",
    sku: "BV-DN25-002",
    available: 30,
    dailyUsage: 3,
    coverageDays: 10,
    leadTimeDays: 14,
    suggestQty: 40,
});

export const HIGH_URGENCY_PURCHASE_GOLDEN = JSON.stringify({
    enrichments: [
        {
            productId: "p-high",
            whyNow: "Stok 10 gün içinde minimum seviyenin altına düşecek; tedarik süresi 14 gün — bu hafta sipariş gerekli.",
            quantityRationale: "40 adet mevcut tedarik döngüsünü tamamlar.",
            urgencyLevel: "high",
            confidence: 0.75,
        } satisfies PurchaseEnrichment,
    ],
});

// ── MODERATE archetype ────────────────────────────────────────
// formula="fallback", dailyUsage=null — limited data → moderate
export const MODERATE_PURCHASE_ITEM = makePurchaseItem({
    productId: "p-moderate",
    productName: "Check Valve DN80",
    sku: "CV-DN80-003",
    available: 8,
    dailyUsage: null,
    coverageDays: null,
    leadTimeDays: 21,
    formula: "fallback",
    leadTimeDemand: null,
    suggestQty: 40,
});

export const MODERATE_PURCHASE_GOLDEN = JSON.stringify({
    enrichments: [
        {
            productId: "p-moderate",
            whyNow: "Günlük kullanım verisi olmadığından kesin tükenme tarihi hesaplanamıyor; stok minimum seviyenin altında.",
            quantityRationale: "40 adet emniyet stoğunun iki katına çıkarmak için önerildi (fallback formülü).",
            urgencyLevel: "moderate",
            confidence: 0.42,
        } satisfies PurchaseEnrichment,
    ],
});

// ── NULL_FIELDS archetype ─────────────────────────────────────
// dailyUsage/leadTimeDays/vendor all null — very limited data
export const NULL_FIELDS_PURCHASE_ITEM = makePurchaseItem({
    productId: "p-null",
    productName: "Globe Valve DN150",
    sku: "GLV-DN150-004",
    available: 2,
    dailyUsage: null,
    coverageDays: null,
    leadTimeDays: null,
    formula: "fallback",
    leadTimeDemand: null,
    preferredVendor: null,
    suggestQty: 40,
});

export const NULL_FIELDS_PURCHASE_GOLDEN = JSON.stringify({
    enrichments: [
        {
            productId: "p-null",
            whyNow: "Kullanım ve tedarik süresi verisi mevcut değil; stok kritik seviyenin altında ve tedarikçi bilgisi de eksik.",
            quantityRationale: "Tedarikçi ve tedarik süresi netleşene kadar emniyet stoğu iki katı kadar (40 adet) alınması önerildi.",
            urgencyLevel: "moderate",
            confidence: 0.35,
        } satisfies PurchaseEnrichment,
    ],
});

// ── Golden for all 4 items together ──────────────────────────

export const ALL_FOUR_PURCHASE_GOLDEN = JSON.stringify({
    enrichments: [
        {
            productId: "p-critical",
            whyNow: "Mevcut stok 2 günde tükenecek; tedarik süresi 14 gün.",
            quantityRationale: "60 adet tedarik süresini ve emniyet stoğunu karşılar.",
            urgencyLevel: "critical",
            confidence: 0.88,
        },
        {
            productId: "p-high",
            whyNow: "Stok 10 gün içinde minimum seviyenin altına düşecek.",
            quantityRationale: "40 adet mevcut tedarik döngüsünü tamamlar.",
            urgencyLevel: "high",
            confidence: 0.75,
        },
        {
            productId: "p-moderate",
            whyNow: "Günlük kullanım verisi olmadığından kesin tükenme tarihi hesaplanamıyor.",
            quantityRationale: "40 adet emniyet stoğunun iki katı için önerildi.",
            urgencyLevel: "moderate",
            confidence: 0.42,
        },
        {
            productId: "p-null",
            whyNow: "Kullanım ve tedarik süresi verisi mevcut değil.",
            quantityRationale: "Emniyet stoğu iki katı kadar (40 adet) alınması önerildi.",
            urgencyLevel: "moderate",
            confidence: 0.35,
        },
    ],
});

// ── Collected scenarios ───────────────────────────────────────

export const ALL_PURCHASE_SCENARIOS: PurchaseScenario[] = [
    {
        label: "critical — coverageDays < leadTimeDays",
        items: [CRITICAL_PURCHASE_ITEM],
        goldenResponse: CRITICAL_PURCHASE_GOLDEN,
        expected: { urgencyLevel: "critical", minConfidence: 0.75, maxConfidence: 1.0 },
    },
    {
        label: "high — coverageDays 7-14",
        items: [HIGH_URGENCY_PURCHASE_ITEM],
        goldenResponse: HIGH_URGENCY_PURCHASE_GOLDEN,
        expected: { urgencyLevel: "high", minConfidence: 0.5, maxConfidence: 1.0 },
    },
    {
        label: "moderate — fallback formula, no dailyUsage",
        items: [MODERATE_PURCHASE_ITEM],
        goldenResponse: MODERATE_PURCHASE_GOLDEN,
        expected: { urgencyLevel: "moderate", minConfidence: 0.3, maxConfidence: 0.5 },
    },
    {
        label: "moderate — all null fields",
        items: [NULL_FIELDS_PURCHASE_ITEM],
        goldenResponse: NULL_FIELDS_PURCHASE_GOLDEN,
        expected: { urgencyLevel: "moderate", minConfidence: 0.0, maxConfidence: 0.5 },
    },
];

export const PURCHASE_EXPECTED: Record<string, PurchaseScenarioExpected> = {
    CRITICAL: { urgencyLevel: "critical", minConfidence: 0.75, maxConfidence: 1.0 },
    HIGH: { urgencyLevel: "high", minConfidence: 0.5, maxConfidence: 1.0 },
    MODERATE: { urgencyLevel: "moderate", minConfidence: 0.3, maxConfidence: 0.5 },
    NULL_FIELDS: { urgencyLevel: "moderate", minConfidence: 0.0, maxConfidence: 0.5 },
};
