import { NextResponse } from "next/server";
import { dbListProducts } from "@/lib/supabase/products";
import { dbListAlerts } from "@/lib/supabase/alerts";
import { dbListOrders } from "@/lib/supabase/orders";
import { computeCoverageDays } from "@/lib/stock-utils";
import { aiGenerateOpsSummary, type OpsSummaryInput } from "@/lib/services/ai-service";
import { handleApiError } from "@/lib/api-error";

async function gatherMetrics(): Promise<OpsSummaryInput> {
    const [products, alerts, pendingOrders, approvedOrders] = await Promise.all([
        dbListProducts({ is_active: true, pageSize: 500 }),
        dbListAlerts({ status: "open" }),
        dbListOrders({ commercial_status: "pending_approval", pageSize: 200 }),
        dbListOrders({ commercial_status: "approved", pageSize: 200 }),
    ]);

    const critical = products.filter(p => p.available_now <= p.min_stock_level);
    const warning = products.filter(p =>
        p.available_now > p.min_stock_level &&
        p.available_now <= Math.ceil(p.min_stock_level * 1.5)
    );

    const topCritical = critical
        .map(p => ({
            name: p.name,
            available: p.available_now,
            min: p.min_stock_level,
            coverageDays: computeCoverageDays(p.available_now, p.daily_usage),
        }))
        .sort((a, b) => (a.coverageDays ?? 999) - (b.coverageDays ?? 999))
        .slice(0, 5);

    const highRiskOrderCount = [...pendingOrders, ...approvedOrders]
        .filter(o => o.ai_risk_level === "high")
        .length;

    return {
        criticalStockCount: critical.length,
        warningStockCount: warning.length,
        topCriticalItems: topCritical,
        pendingOrderCount: pendingOrders.length,
        approvedOrderCount: approvedOrders.length,
        highRiskOrderCount,
        openAlertCount: alerts.length,
    };
}

export async function POST() {
    try {
        const metrics = await gatherMetrics();
        const result = await aiGenerateOpsSummary(metrics);
        return NextResponse.json(result);
    } catch (err) {
        return handleApiError(err, "AI özet oluşturulamadı.");
    }
}
