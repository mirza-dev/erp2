/**
 * Order risk scoring fixtures — 3 archetypes.
 * Extends the FIXTURE_ORDER pattern from ai-score-order.test.ts.
 *
 * Golden responses use the "CONFIDENCE: X\nRISK_LEVEL: y\nREASON: ..." format
 * that parseScoreResponse() parses.
 */

export interface OrderRiskFixtureOrder {
    id: string;
    order_number: string;
    customer_name: string;
    customer_country: string | null;
    currency: string;
    grand_total: number;
    commercial_status: string;
    notes: string | null;
    lines: Array<{
        product_name: string;
        quantity: number;
        unit_price: number;
        discount_pct: number;
    }>;
}

export interface OrderRiskExpected {
    risk_level: "low" | "medium" | "high";
    minConfidence: number;
    maxConfidence: number;
}

export interface OrderRiskScenario {
    label: string;
    order: OrderRiskFixtureOrder;
    goldenResponse: string;
    expected: OrderRiskExpected;
}

// ── LOW_RISK archetype ────────────────────────────────────────
// Known customer (SOCAR), USD, note present, normal qty, 0% discount
export const LOW_RISK_ORDER: OrderRiskFixtureOrder = {
    id: "order-low-risk",
    order_number: "ORD-2026-0050",
    customer_name: "SOCAR Turkey",
    customer_country: "TR",
    currency: "USD",
    grand_total: 45000,
    commercial_status: "approved",
    notes: "Rutin çeyrek sipariş — kapasiteye göre.",
    lines: [
        { product_name: "Küresel Vana DN25", quantity: 100, unit_price: 450, discount_pct: 0 },
    ],
};

export const LOW_RISK_GOLDEN =
    "CONFIDENCE: 0.92\nRISK_LEVEL: low\nREASON: Bilinen müşteri, standart sipariş miktarı ve açıklama mevcut.";

// ── MEDIUM_RISK archetype ─────────────────────────────────────
// New customer, country null, large amount (€250K), no notes
export const MEDIUM_RISK_ORDER: OrderRiskFixtureOrder = {
    id: "order-medium-risk",
    order_number: "ORD-2026-0099",
    customer_name: "Yeni Müşteri A.Ş.",
    customer_country: null,
    currency: "EUR",
    grand_total: 250000,
    commercial_status: "pending_approval",
    notes: null,
    lines: [
        { product_name: "Flanş DN200", quantity: 500, unit_price: 500, discount_pct: 0 },
    ],
};

export const MEDIUM_RISK_GOLDEN =
    "CONFIDENCE: 0.68\nRISK_LEVEL: medium\nREASON: Yeni müşteri, ülke bilgisi eksik ve büyük sipariş tutarı için not yok.";

// ── HIGH_RISK archetype ───────────────────────────────────────
// Unknown customer, CNY currency, 25% discount, extreme quantity
export const HIGH_RISK_ORDER: OrderRiskFixtureOrder = {
    id: "order-high-risk",
    order_number: "ORD-2026-0177",
    customer_name: "Bilinmeyen İthalatçı",
    customer_country: null,
    currency: "CNY",
    grand_total: 1200000,
    commercial_status: "draft",
    notes: null,
    lines: [
        { product_name: "Endüstriyel Vana DN500", quantity: 2000, unit_price: 600, discount_pct: 25 },
    ],
};

export const HIGH_RISK_GOLDEN =
    "CONFIDENCE: 0.55\nRISK_LEVEL: high\nREASON: Bilinmeyen müşteri, alışılmadık para birimi (CNY), yüksek iskonto ve olağandışı büyük sipariş.";

// ── Factory ───────────────────────────────────────────────────

/**
 * Creates an order fixture with sensible defaults, overridable for edge cases.
 * Mirrors the FIXTURE_ORDER structure in ai-score-order.test.ts.
 */
export function makeOrderFixture(
    overrides: Partial<OrderRiskFixtureOrder> = {},
): OrderRiskFixtureOrder {
    return {
        id: "order-fixture",
        order_number: "ORD-2026-0000",
        customer_name: "Test Müşteri",
        customer_country: "TR",
        currency: "USD",
        grand_total: 10000,
        commercial_status: "approved",
        notes: "Test sipariş",
        lines: [
            { product_name: "Test Ürün DN50", quantity: 10, unit_price: 1000, discount_pct: 0 },
        ],
        ...overrides,
    };
}

// ── Collected scenarios ───────────────────────────────────────

export const ALL_ORDER_RISK_SCENARIOS: OrderRiskScenario[] = [
    {
        label: "low risk — known customer, standard order",
        order: LOW_RISK_ORDER,
        goldenResponse: LOW_RISK_GOLDEN,
        expected: { risk_level: "low", minConfidence: 0.7, maxConfidence: 1.0 },
    },
    {
        label: "medium risk — new customer, large amount, no notes",
        order: MEDIUM_RISK_ORDER,
        goldenResponse: MEDIUM_RISK_GOLDEN,
        expected: { risk_level: "medium", minConfidence: 0.4, maxConfidence: 0.8 },
    },
    {
        label: "high risk — unknown customer, CNY, 25% discount",
        order: HIGH_RISK_ORDER,
        goldenResponse: HIGH_RISK_GOLDEN,
        expected: { risk_level: "high", minConfidence: 0.0, maxConfidence: 0.6 },
    },
];

export const ORDER_RISK_EXPECTED: Record<string, OrderRiskExpected> = {
    LOW_RISK: { risk_level: "low", minConfidence: 0.7, maxConfidence: 1.0 },
    MEDIUM_RISK: { risk_level: "medium", minConfidence: 0.4, maxConfidence: 0.8 },
    HIGH_RISK: { risk_level: "high", minConfidence: 0.0, maxConfidence: 0.6 },
};
