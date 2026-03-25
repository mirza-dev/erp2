import { NextResponse } from "next/server";
import { dbListProducts } from "@/lib/supabase/products";
import { computeTargetStock, computeCoverageDays, computeUrgencyPct } from "@/lib/stock-utils";
import { aiEnrichPurchaseSuggestions, isAIAvailable, type PurchaseSuggestionItem } from "@/lib/services/ai-service";
import { dbUpsertRecommendation, dbExpireSuggestedRecommendations } from "@/lib/supabase/recommendations";
import { handleApiError } from "@/lib/api-error";

export async function POST() {
    let products: Awaited<ReturnType<typeof dbListProducts>>;
    try {
        products = await dbListProducts({ is_active: true, pageSize: 500 });
    } catch (err) {
        return handleApiError(err, "Satın alma önerileri toplanamadı.");
    }

    const needsPurchase = products.filter(p => p.available_now <= p.min_stock_level);

    const rawMaterialCount = needsPurchase.filter(p => p.product_type === "raw_material").length;
    const finishedCount = needsPurchase.filter(p => p.product_type === "finished").length;

    const items: PurchaseSuggestionItem[] = needsPurchase.map(p => {
        const dailyUsage = p.daily_usage ?? null;
        const leadTimeDays = p.lead_time_days ?? null;
        const moq = p.reorder_qty ?? p.min_stock_level;
        const { target, formula, leadTimeDemand } = computeTargetStock(p.min_stock_level, dailyUsage, leadTimeDays);
        const needed = Math.max(0, target - p.available_now);
        const suggestQty = needed === 0 ? moq : Math.max(moq, Math.ceil(needed / moq) * moq);
        const coverageDays = computeCoverageDays(p.available_now, dailyUsage);

        return {
            productId: p.id,
            productName: p.name,
            sku: p.sku,
            productType: p.product_type as "raw_material" | "finished",
            unit: p.unit,
            available: p.available_now,
            min: p.min_stock_level,
            dailyUsage,
            coverageDays,
            leadTimeDays,
            suggestQty,
            moq,
            targetStock: target,
            formula,
            leadTimeDemand,
            preferredVendor: p.preferred_vendor ?? null,
        };
    });

    const aiAvailable = isAIAvailable();
    let enrichments: Array<{
        productId: string;
        whyNow: string;
        quantityRationale: string;
        urgencyLevel: "critical" | "high" | "moderate";
        confidence: number;
    }> = [];

    if (aiAvailable && items.length > 0) {
        try {
            const result = await aiEnrichPurchaseSuggestions(items);
            enrichments = result.enrichments;
        } catch {
            // AI error doesn't bring down the route
        }
    }

    const aiMap = new Map(enrichments.map(e => [e.productId, e]));

    const responseItems = items
        .map(item => {
            const ai = aiMap.get(item.productId);
            const urgencyPct = computeUrgencyPct(item.available, item.min);
            return {
                productId: item.productId,
                productName: item.productName,
                sku: item.sku,
                productType: item.productType,
                unit: item.unit,
                available: item.available,
                min: item.min,
                dailyUsage: item.dailyUsage,
                coverageDays: item.coverageDays,
                leadTimeDays: item.leadTimeDays,
                suggestQty: item.suggestQty,
                moq: item.moq,
                targetStock: item.targetStock,
                formula: item.formula,
                leadTimeDemand: item.leadTimeDemand,
                preferredVendor: item.preferredVendor,
                urgencyPct,
                aiWhyNow: ai?.whyNow ?? null,
                aiQuantityRationale: ai?.quantityRationale ?? null,
                aiUrgencyLevel: ai?.urgencyLevel ?? null,
                aiConfidence: ai?.confidence ?? null,
            };
        })
        .sort((a, b) => {
            if (a.coverageDays === null && b.coverageDays === null) return 0;
            if (a.coverageDays === null) return -1;
            if (b.coverageDays === null) return 1;
            return a.coverageDays - b.coverageDays;
        });

    // ── Persist recommendations (non-blocking) ────────────────────────────────
    const recommendations: Array<{ productId: string; recommendationId: string | null; status: string }> = [];

    try {
        const activeProductIds = responseItems.map(i => i.productId);

        // Expire suggestions for products that no longer need purchase
        if (activeProductIds.length > 0) {
            await dbExpireSuggestedRecommendations("product", activeProductIds, "purchase_suggestion");
        }

        // Upsert a recommendation for each item
        for (const item of responseItems) {
            const ai = aiMap.get(item.productId);
            const urgencyPct = item.urgencyPct;
            const severity = urgencyPct >= 80 ? "critical" : urgencyPct >= 50 ? "warning" : "info";
            try {
                const rec = await dbUpsertRecommendation({
                    entity_type: "product",
                    entity_id: item.productId,
                    recommendation_type: "purchase_suggestion",
                    title: `${item.productName} — Satın alma önerisi`,
                    body: ai?.whyNow ?? `Stok ${item.available}/${item.min}. Önerilen: ${item.suggestQty} ${item.unit}.`,
                    confidence: ai?.confidence ?? null,
                    severity,
                    model_version: aiAvailable ? "purchase-copilot-v1" : null,
                    metadata: {
                        suggestQty: item.suggestQty,
                        moq: item.moq,
                        urgencyPct: item.urgencyPct,
                        aiWhyNow: ai?.whyNow ?? null,
                        aiQuantityRationale: ai?.quantityRationale ?? null,
                        aiUrgencyLevel: ai?.urgencyLevel ?? null,
                        coverageDays: item.coverageDays,
                        targetStock: item.targetStock,
                        formula: item.formula,
                    },
                });
                recommendations.push({ productId: item.productId, recommendationId: rec.id, status: rec.status });
            } catch {
                recommendations.push({ productId: item.productId, recommendationId: null, status: "error" });
            }
        }
    } catch {
        // Persistence errors must not affect the main response
    }

    return NextResponse.json({
        ai_available: aiAvailable,
        counts: {
            total_products: products.length,
            needs_purchase: needsPurchase.length,
            raw_material: rawMaterialCount,
            finished: finishedCount,
        },
        items: responseItems,
        recommendations,
        generatedAt: new Date().toISOString(),
    });
}
