/**
 * Golden responses aggregator + universal failure variants.
 * Re-exports all fixture goldens from one location for easy import in eval-runner.
 */

// ── Re-exports: Import fixtures ───────────────────────────────
export {
    COMPLETE_CUSTOMER_GOLDEN,
    PARTIAL_CUSTOMER_GOLDEN,
    UNMAPPED_COLUMNS_GOLDEN,
    TURKISH_UNICODE_GOLDEN,
    EMPTY_VALUES_GOLDEN,
    FULL_PRODUCT_GOLDEN,
    PRICE_VARIANTS_GOLDEN,
    MINIMAL_PRODUCT_GOLDEN,
    ZERO_PRICE_GOLDEN,
    STANDARD_ORDER_GOLDEN,
    MINIMAL_ORDER_GOLDEN,
    MIXED_CASE_ORDER_GOLDEN,
} from "./import-fixtures";

// ── Re-exports: Order risk fixtures ──────────────────────────
export {
    LOW_RISK_GOLDEN,
    MEDIUM_RISK_GOLDEN,
    HIGH_RISK_GOLDEN,
} from "./order-risk-fixtures";

// ── Re-exports: Ops summary fixtures ─────────────────────────
export {
    CRISIS_GOLDEN,
    NORMAL_GOLDEN,
    MIXED_GOLDEN,
} from "./ops-summary-fixtures";

// ── Re-exports: Purchase fixtures ────────────────────────────
export {
    CRITICAL_PURCHASE_GOLDEN,
    HIGH_URGENCY_PURCHASE_GOLDEN,
    MODERATE_PURCHASE_GOLDEN,
    NULL_FIELDS_PURCHASE_GOLDEN,
    ALL_FOUR_PURCHASE_GOLDEN,
} from "./purchase-fixtures";

// ── Re-exports: Stock risk eval fixtures ──────────────────────
export { ALL_STOCK_RISK_EVAL_SCENARIOS } from "./stock-risk-eval-fixtures";

// ── Universal failure variants ────────────────────────────────
// These simulate degraded / error conditions common to all AI capabilities.
// Use these in eval tests to verify graceful degradation.

/** Plain text refusal — model says it cannot process the request. */
export const UNIVERSAL_GARBLED = "I cannot process this request at this time.";

/** Empty JSON object — model returns {} with no fields. */
export const UNIVERSAL_EMPTY_JSON = "{}";

/** Malformed JSON — cannot be parsed by JSON.parse. */
export const UNIVERSAL_MALFORMED_JSON = "{items: [broken}";

/** HTML error page — upstream gateway returned an error. */
export const UNIVERSAL_HTML = "<html><body>Error 503</body></html>";

/** Completely empty string — model returned nothing. */
export const UNIVERSAL_EMPTY = "";

/** Array of all universal failure variants for parametric tests. */
export const ALL_UNIVERSAL_FAILURES: Array<{ label: string; response: string }> = [
    { label: "garbled text", response: UNIVERSAL_GARBLED },
    { label: "empty JSON object", response: UNIVERSAL_EMPTY_JSON },
    { label: "malformed JSON", response: UNIVERSAL_MALFORMED_JSON },
    { label: "HTML error page", response: UNIVERSAL_HTML },
    { label: "empty string", response: UNIVERSAL_EMPTY },
];
