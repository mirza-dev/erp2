import { NextResponse } from "next/server";
import { dbListProducts } from "@/lib/supabase/products";
import { computeStockRiskLevel, type StockRiskLevel } from "@/lib/stock-utils";
import { aiAssessStockRisk, isAIAvailable, type StockRiskItem } from "@/lib/services/ai-service";
import { handleApiError } from "@/lib/api-error";

interface StockRiskResponseItem {
    productId: string;
    riskLevel: StockRiskLevel;
    coverageDays: number | null;
    leadTimeDays: number | null;
    dailyUsage: number | null;
    deterministicReason: string;
    aiExplanation: string | null;
    aiRecommendation: string | null;
    aiConfidence: number | null;
}

export async function POST() {
    let products: Awaited<ReturnType<typeof dbListProducts>>;
    try {
        products = await dbListProducts({ is_active: true, pageSize: 500 });
    } catch (err) {
        return handleApiError(err, "Stok risk verisi toplanamadı.");
    }

    const criticalCount = products.filter(p => p.available_now <= p.min_stock_level).length;
    const warningCount = products.filter(p =>
        p.available_now > p.min_stock_level &&
        p.available_now <= Math.ceil(p.min_stock_level * 1.5)
    ).length;

    const riskComputations = products.map(p => ({
        product: p,
        computation: computeStockRiskLevel(
            p.available_now,
            p.min_stock_level,
            p.daily_usage,
            p.lead_time_days,
        ),
    }));

    const atRisk = riskComputations.filter(r => r.computation.riskLevel !== "none");

    let aiAvailable = isAIAvailable();
    let aiAssessments: Array<{ productId: string; explanation: string; recommendation: string; confidence: number }> = [];

    if (aiAvailable && atRisk.length > 0) {
        try {
            const riskItems: StockRiskItem[] = atRisk.map(r => ({
                productId: r.product.id,
                productName: r.product.name,
                sku: r.product.sku,
                available: r.product.available_now,
                min: r.product.min_stock_level,
                dailyUsage: r.product.daily_usage ?? 0,
                coverageDays: r.computation.coverageDays ?? 0,
                leadTimeDays: r.product.lead_time_days ?? null,
                riskLevel: r.computation.riskLevel as "coverage_risk" | "approaching_critical",
                deterministicReason: r.computation.reason,
            }));
            const result = await aiAssessStockRisk(riskItems);
            aiAssessments = result.assessments;
        } catch {
            // AI error doesn't bring down the route
            aiAvailable = false;
        }
    }

    const aiMap = new Map(aiAssessments.map(a => [a.productId, a]));

    const items: StockRiskResponseItem[] = atRisk.map(r => {
        const ai = aiMap.get(r.product.id);
        return {
            productId: r.product.id,
            riskLevel: r.computation.riskLevel,
            coverageDays: r.computation.coverageDays,
            leadTimeDays: r.computation.leadTimeDays,
            dailyUsage: r.computation.dailyUsage,
            deterministicReason: r.computation.reason,
            aiExplanation: ai?.explanation ?? null,
            aiRecommendation: ai?.recommendation ?? null,
            aiConfidence: ai?.confidence ?? null,
        };
    });

    return NextResponse.json({
        ai_available: aiAvailable,
        counts: {
            total_products: products.length,
            critical: criticalCount,
            warning: warningCount,
            at_risk: atRisk.length,
        },
        items,
        generatedAt: new Date().toISOString(),
    });
}
