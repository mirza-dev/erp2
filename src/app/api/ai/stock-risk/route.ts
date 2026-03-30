import { NextResponse } from "next/server";
import { dbListProducts } from "@/lib/supabase/products";
import { computeStockRiskLevel, type StockRiskLevel } from "@/lib/stock-utils";
import { aiAssessStockRisk, isAIAvailable, type StockRiskItem } from "@/lib/services/ai-service";
import {
    dbUpsertRecommendation,
    dbExpireSuggestedRecommendations,
    dbExpireStaleRecommendations,
    dbGetActiveRecommendationsForEntities,
} from "@/lib/supabase/recommendations";
import type { AiRecommendationRow } from "@/lib/database.types";
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
    // Expire suggested recommendations not acted on after 48 hours.
    try { await dbExpireStaleRecommendations(48); } catch { /* non-fatal */ }

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
    const atRiskIds = atRisk.map(r => r.product.id);

    const aiAvailable = isAIAvailable();

    // ── Load existing active recommendations ──────────────────────────────────
    // Products with an active rec skip AI re-enrichment (stability on refresh).
    let existingRecMap = new Map<string, AiRecommendationRow>();
    try {
        if (atRiskIds.length > 0) {
            const existingRecs = await dbGetActiveRecommendationsForEntities(
                "product",
                atRiskIds,
                "stock_risk"
            );
            existingRecMap = new Map(existingRecs.map(r => [r.entity_id, r]));
        }
    } catch {
        // Non-fatal: if we can't load existing, treat all as needing fresh AI
    }

    // Split: need fresh AI vs. reuse from DB
    const needsAiItems = atRisk.filter(r => !existingRecMap.has(r.product.id));
    const hasExistingItems = atRisk.filter(r => existingRecMap.has(r.product.id));

    // ── AI enrichment: only for products with no active recommendation ────────
    type AssessmentEntry = {
        productId: string;
        explanation: string;
        recommendation: string;
        confidence: number;
    };
    let freshAssessments: AssessmentEntry[] = [];

    if (aiAvailable && needsAiItems.length > 0) {
        try {
            const riskItems: StockRiskItem[] = needsAiItems.map(r => ({
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
            freshAssessments = result.assessments;
        } catch {
            // AI error doesn't bring down the route
        }
    }

    const freshAiMap = new Map(freshAssessments.map(a => [a.productId, a]));

    // Build merged AI map: fresh enrichments + content recovered from existing rec metadata
    const mergedAiMap = new Map<string, {
        aiExplanation: string | null;
        aiRecommendation: string | null;
        aiConfidence: number | null;
    }>();

    for (const r of needsAiItems) {
        const ai = freshAiMap.get(r.product.id);
        mergedAiMap.set(r.product.id, {
            aiExplanation: ai?.explanation ?? null,
            aiRecommendation: ai?.recommendation ?? null,
            aiConfidence: ai?.confidence ?? null,
        });
    }

    for (const r of hasExistingItems) {
        const rec = existingRecMap.get(r.product.id)!;
        const meta = rec.metadata as Record<string, unknown> | null;
        mergedAiMap.set(r.product.id, {
            aiExplanation: (meta?.aiExplanation as string) ?? null,
            aiRecommendation: (meta?.aiRecommendation as string) ?? null,
            aiConfidence: rec.confidence ?? null,
        });
    }

    const items: StockRiskResponseItem[] = atRisk.map(r => {
        const ai = mergedAiMap.get(r.product.id);
        return {
            productId: r.product.id,
            riskLevel: r.computation.riskLevel,
            coverageDays: r.computation.coverageDays,
            leadTimeDays: r.computation.leadTimeDays,
            dailyUsage: r.computation.dailyUsage,
            deterministicReason: r.computation.reason,
            aiExplanation: ai?.aiExplanation ?? null,
            aiRecommendation: ai?.aiRecommendation ?? null,
            aiConfidence: ai?.aiConfidence ?? null,
        };
    });

    const excludedNoUsage = products.filter(p =>
        p.available_now > Math.ceil(p.min_stock_level * 1.5) &&
        (!p.daily_usage || p.daily_usage <= 0)
    ).length;

    // ── Persist recommendations ───────────────────────────────────────────────
    const recommendations: Array<{ productId: string; recommendationId: string | null; status: string; decidedAt: string | null }> = [];

    try {
        // Expire suggestions for products no longer at risk
        const expirePromise = atRiskIds.length > 0
            ? dbExpireSuggestedRecommendations("product", atRiskIds, "stock_risk")
            : Promise.resolve(0);

        // Insert new recommendations only for products without an existing active rec
        const upsertPromises = needsAiItems.map(async r => {
            const ai = freshAiMap.get(r.product.id);
            const severity = r.computation.riskLevel === "coverage_risk" ? "critical" : "warning";
            try {
                const rec = await dbUpsertRecommendation({
                    entity_type: "product",
                    entity_id: r.product.id,
                    recommendation_type: "stock_risk",
                    title: `${r.product.name} — Stok risk uyarısı`,
                    body: ai?.explanation ?? r.computation.reason,
                    confidence: ai?.confidence ?? null,
                    severity,
                    model_version: aiAvailable ? "stock-risk-v1" : null,
                    metadata: {
                        riskLevel: r.computation.riskLevel,
                        coverageDays: r.computation.coverageDays,
                        leadTimeDays: r.computation.leadTimeDays,
                        deterministicReason: r.computation.reason,
                        aiExplanation: ai?.explanation ?? null,
                        aiRecommendation: ai?.recommendation ?? null,
                    },
                });
                return { productId: r.product.id, recommendationId: rec.id, status: rec.status, decidedAt: rec.decided_at };
            } catch {
                return { productId: r.product.id, recommendationId: null, status: "error", decidedAt: null };
            }
        });

        // Collect existing rec references (no DB write needed)
        const existingRefs = hasExistingItems.map(r => {
            const rec = existingRecMap.get(r.product.id)!;
            return { productId: r.product.id, recommendationId: rec.id, status: rec.status, decidedAt: rec.decided_at };
        });

        const [, upsertResults] = await Promise.all([expirePromise, Promise.all(upsertPromises)]);
        recommendations.push(...upsertResults, ...existingRefs);
    } catch {
        // Persistence errors must not affect the main response
    }

    return NextResponse.json({
        ai_available: aiAvailable,
        counts: {
            total_products: products.length,
            critical: criticalCount,
            warning: warningCount,
            at_risk: atRisk.length,
            excluded_no_usage: excludedNoUsage,
        },
        items,
        recommendations,
        generatedAt: new Date().toISOString(),
    });
}
