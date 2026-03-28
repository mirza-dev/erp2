/**
 * Ops summary fixtures — 3 metric scenarios.
 * Extends the FIXTURE_METRICS pattern from ai-ops-summary.test.ts.
 *
 * Golden responses are JSON.stringify({ summary, insights, anomalies }) format
 * matching what aiGenerateOpsSummary parses.
 */
import type { OpsSummaryInput } from "@/lib/services/ai-service";

export interface OpsScenarioExpected {
    minInsights: number;
    maxInsights: number;
    minAnomalies: number;
    maxAnomalies: number;
    minSummaryLength: number;
}

export interface OpsScenario {
    label: string;
    metrics: OpsSummaryInput;
    goldenResponse: string;
    expected: OpsScenarioExpected;
}

// ── CRISIS scenario ───────────────────────────────────────────
// criticalStock=10, highRisk=5, openAlert=15, 5 critical items
export const CRISIS_METRICS: OpsSummaryInput = {
    criticalStockCount: 10,
    warningStockCount: 8,
    topCriticalItems: [
        { name: "Gate Valve DN50", available: 1, min: 20, coverageDays: 0 },
        { name: "Ball Valve DN25", available: 0, min: 10, coverageDays: 0 },
        { name: "Check Valve DN100", available: 2, min: 15, coverageDays: 1 },
        { name: "Globe Valve DN80", available: 3, min: 12, coverageDays: 2 },
        { name: "Butterfly Valve DN200", available: 1, min: 8, coverageDays: 1 },
    ],
    pendingOrderCount: 25,
    approvedOrderCount: 5,
    highRiskOrderCount: 5,
    openAlertCount: 15,
};

export const CRISIS_GOLDEN = JSON.stringify({
    summary:
        "Kritik stok seviyesi kritik: 10 ürün tükenmek üzere, 15 açık uyarı bekliyor. Acil tedarik müdahalesi gerekiyor.",
    insights: [
        "Gate Valve DN50 ve Ball Valve DN25 sıfır stokta — acil sipariş verin.",
        "25 bekleyen sipariş varken sadece 5 onaylı: operasyonel darboğaz riski.",
        "5 yüksek riskli sipariş manuel inceleme bekliyor — gözden geçirin.",
        "15 açık uyarı varken sadece 5 onaylı sipariş — uyarı birikimi izleyin.",
    ],
    anomalies: [
        "Kritik stok oranı %30'u aşıyor — sistemik tedarik sorununa işaret ediyor.",
        "Bekleyen/onaylanan sipariş oranı çok yüksek (25:5) — onay süreci tıkanmış.",
    ],
});

// ── NORMAL scenario ───────────────────────────────────────────
// criticalStock=0, highRisk=0, openAlert=1, no critical items
export const NORMAL_METRICS: OpsSummaryInput = {
    criticalStockCount: 0,
    warningStockCount: 1,
    topCriticalItems: [],
    pendingOrderCount: 3,
    approvedOrderCount: 10,
    highRiskOrderCount: 0,
    openAlertCount: 1,
};

export const NORMAL_GOLDEN = JSON.stringify({
    summary: "Operasyonel durum normal, kritik bir aksiyon gerekmiyor.",
    insights: ["1 uyarı oluşan ürünü kontrol edin."],
    anomalies: [],
});

// ── MIXED scenario ────────────────────────────────────────────
// criticalStock=3, highRisk=2, openAlert=7 — matches ai-ops-summary.test.ts FIXTURE_METRICS
export const MIXED_METRICS: OpsSummaryInput = {
    criticalStockCount: 3,
    warningStockCount: 5,
    topCriticalItems: [
        { name: "Gate Valve DN50", available: 2, min: 10, coverageDays: 3 },
        { name: "Ball Valve DN25", available: 0, min: 5, coverageDays: 0 },
    ],
    pendingOrderCount: 12,
    approvedOrderCount: 8,
    highRiskOrderCount: 2,
    openAlertCount: 7,
};

export const MIXED_GOLDEN = JSON.stringify({
    summary:
        "3 kritik stok uyarısı ve 7 açık uyarı bulunuyor; durum yönetilebilir ancak takip gerektiriyor.",
    insights: [
        "Ball Valve DN25 sıfır stokta — hemen sipariş verin.",
        "2 yüksek riskli sipariş inceleme bekliyor.",
        "Gate Valve DN50 için 3 gün kapsam kaldı — tedarikçiyi arayın.",
    ],
    anomalies: ["Bekleyen sipariş sayısı (12) onaylananlardan (8) fazla."],
});

// ── Collected scenarios ───────────────────────────────────────

export const ALL_OPS_SCENARIOS: OpsScenario[] = [
    {
        label: "crisis — high critical stock and many alerts",
        metrics: CRISIS_METRICS,
        goldenResponse: CRISIS_GOLDEN,
        expected: {
            minInsights: 3,
            maxInsights: 5,
            minAnomalies: 1,
            maxAnomalies: 3,
            minSummaryLength: 20,
        },
    },
    {
        label: "normal — all metrics healthy",
        metrics: NORMAL_METRICS,
        goldenResponse: NORMAL_GOLDEN,
        expected: {
            minInsights: 0,
            maxInsights: 2,
            minAnomalies: 0,
            maxAnomalies: 0,
            minSummaryLength: 10,
        },
    },
    {
        label: "mixed — moderate issues",
        metrics: MIXED_METRICS,
        goldenResponse: MIXED_GOLDEN,
        expected: {
            minInsights: 1,
            maxInsights: 5,
            minAnomalies: 0,
            maxAnomalies: 2,
            minSummaryLength: 20,
        },
    },
];

export const OPS_SUMMARY_EXPECTED: Record<string, OpsScenarioExpected> = {
    CRISIS: {
        minInsights: 3,
        maxInsights: 5,
        minAnomalies: 1,
        maxAnomalies: 3,
        minSummaryLength: 20,
    },
    NORMAL: {
        minInsights: 0,
        maxInsights: 2,
        minAnomalies: 0,
        maxAnomalies: 0,
        minSummaryLength: 10,
    },
    MIXED: {
        minInsights: 1,
        maxInsights: 5,
        minAnomalies: 0,
        maxAnomalies: 2,
        minSummaryLength: 20,
    },
};
