/**
 * Türkçe etiketler for ai_inputs_summary JSONB fields stored on alert rows.
 * Stok uyarılarında (stock_critical / stock_risk): available, min, dailyUsage,
 * coverageDays, leadTimeDays, unit.
 * AI ops_summary metrikler: criticalStockCount, warningStockCount vb.
 */
export const AI_SUMMARY_LABELS: Record<string, string> = {
    available:          "Mevcut stok",
    min:                "Minimum stok eşiği",
    dailyUsage:         "Günlük kullanım",
    coverageDays:       "Stok karşılama (gün)",
    leadTimeDays:       "Tedarik süresi (gün)",
    unit:               "Birim",
    criticalStockCount: "Kritik stok sayısı",
    warningStockCount:  "Uyarı seviyesi ürün sayısı",
    atRiskCount:        "Risk altındaki ürün sayısı",
    pendingOrderCount:  "Onay bekleyen sipariş",
    approvedOrderCount: "Onaylı sipariş",
    highRiskOrderCount: "Yüksek riskli sipariş",
    openAlertCount:     "Açık uyarı sayısı",
};
