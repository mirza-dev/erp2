/**
 * Canonical 3-product fixtures for stock-risk boundary tests.
 * All use min_stock_level: 10.
 *
 * Thresholds (min=10):
 *   critical ≤ 10
 *   warning  ≤ ceil(10 * 1.5) = 15
 *   UI "Düşük" ≤ 10 * 2 = 20  (intentionally wider than backend warning)
 */
import type { ProductWithStock } from "@/lib/database.types";
import type { StockRiskLevel } from "@/lib/stock-utils";

// ── CRITICAL_PRODUCT ──────────────────────────────────────────
// available (8) ≤ min (10) → deterministic critical zone
// computeStockRiskLevel → "none"  (alert-service owns this)
// getStatusBadge(8, 10, false) → "Kritik" / badge-danger
// Must NOT appear in route items

export const CRITICAL_PRODUCT: ProductWithStock = {
    id: "fix-critical",
    name: "Critical Fixture Product",
    sku: "FIX-CRIT",
    category: "Vana",
    unit: "adet",
    price: 100,
    currency: "USD",
    on_hand: 8,
    reserved: 0,
    available_now: 8,
    min_stock_level: 10,
    is_active: true,
    product_type: "manufactured",
    warehouse: null,
    reorder_qty: null,
    preferred_vendor: null,
    daily_usage: 5,
    lead_time_days: 14,
    product_family: null,
    sub_category: null,
    sector_compatibility: null,
    cost_price: null,
    weight_kg: null,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
};

// ── AI_RISK_PRODUCT ───────────────────────────────────────────
// available (22) > warning threshold (15) → passes deterministic firewall
// available (22) > UI "Düşük" threshold (20) → badge can reach "Riskli"
// coverageDays = round(22/3) = 7; leadTimeDays = 14 → 7 < 14 → coverage_risk
// computeStockRiskLevel → "coverage_risk"
// getStatusBadge(22, 10, true) → "Riskli" / badge-info
// Must appear in route items with riskLevel="coverage_risk"

export const AI_RISK_PRODUCT: ProductWithStock = {
    id: "fix-ai-risk",
    name: "AI Risk Fixture Product",
    sku: "FIX-RISK",
    category: "Vana",
    unit: "adet",
    price: 100,
    currency: "USD",
    on_hand: 22,
    reserved: 0,
    available_now: 22,
    min_stock_level: 10,
    is_active: true,
    product_type: "manufactured",
    warehouse: null,
    reorder_qty: null,
    preferred_vendor: null,
    daily_usage: 3,
    lead_time_days: 14,
    product_family: null,
    sub_category: null,
    sector_compatibility: null,
    cost_price: null,
    weight_kg: null,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
};

// ── HEALTHY_PRODUCT ───────────────────────────────────────────
// available (200) >> thresholds → no risk at all
// coverageDays = round(200/5) = 40; leadTimeDays = 14 → 40 ≥ 14 → none; 40 > 30 → none
// computeStockRiskLevel → "none"
// getStatusBadge(200, 10, false) → "Hazır" / badge-success
// Must NOT appear in route items

export const HEALTHY_PRODUCT: ProductWithStock = {
    id: "fix-healthy",
    name: "Healthy Fixture Product",
    sku: "FIX-OK",
    category: "Vana",
    unit: "adet",
    price: 100,
    currency: "USD",
    on_hand: 200,
    reserved: 0,
    available_now: 200,
    min_stock_level: 10,
    is_active: true,
    product_type: "manufactured",
    warehouse: null,
    reorder_qty: null,
    preferred_vendor: null,
    daily_usage: 5,
    lead_time_days: 14,
    product_family: null,
    sub_category: null,
    sector_compatibility: null,
    cost_price: null,
    weight_kg: null,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
};

export const ALL_THREE: ProductWithStock[] = [CRITICAL_PRODUCT, AI_RISK_PRODUCT, HEALTHY_PRODUCT];

export const EXPECTED = {
    CRITICAL: {
        riskLevel: "none" as StockRiskLevel,
        badgeLabel: "Kritik",
        badgeCls: "badge-danger",
    },
    AI_RISK: {
        riskLevel: "coverage_risk" as StockRiskLevel,
        badgeLabel: "Riskli",
        badgeCls: "badge-info",
    },
    HEALTHY: {
        riskLevel: "none" as StockRiskLevel,
        badgeLabel: "Hazır",
        badgeCls: "badge-success",
    },
};
