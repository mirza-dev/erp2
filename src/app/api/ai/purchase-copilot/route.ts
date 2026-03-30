import { NextResponse } from "next/server";
import { dbListProducts } from "@/lib/supabase/products";
import { computeTargetStock, computeCoverageDays, computeUrgencyPct } from "@/lib/stock-utils";
import { aiEnrichPurchaseSuggestions, isAIAvailable, type PurchaseSuggestionItem } from "@/lib/services/ai-service";
import {
    dbUpsertRecommendation,
    dbExpireSuggestedRecommendations,
    dbExpireStaleRecommendations,
    dbGetActiveRecommendationsForEntities,
} from "@/lib/supabase/recommendations";
import type { AiRecommendationRow } from "@/lib/database.types";
import { handleApiError } from "@/lib/api-error";

export async function POST() {
    // Expire suggested recommendations that were never acted on after 48 hours.
    // Runs before any DB read so stale rows don't block re-generation.
    try { await dbExpireStaleRecommendations(48); } catch { /* non-fatal */ }

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
    const activeProductIds = items.map(i => i.productId);

    // ── Load existing active recommendations ──────────────────────────────────
    // Products with an active rec (suggested/accepted/edited/rejected) skip AI
    // re-enrichment. Stability: the user sees the same suggestion on refresh.
    let existingRecMap = new Map<string, AiRecommendationRow>();
    try {
        const existingRecs = await dbGetActiveRecommendationsForEntities(
            "product",
            activeProductIds,
            "purchase_suggestion"
        );
        existingRecMap = new Map(existingRecs.map(r => [r.entity_id, r]));
    } catch {
        // Non-fatal: if we can't load existing, treat all as needing fresh AI
    }

    // Split: need fresh AI vs. reuse from DB
    const needsAiItems = items.filter(i => !existingRecMap.has(i.productId));
    const hasExistingItems = items.filter(i => existingRecMap.has(i.productId));

    // ── AI enrichment: only for products with no active recommendation ────────
    type EnrichmentEntry = {
        productId: string;
        whyNow: string;
        quantityRationale: string;
        urgencyLevel: "critical" | "high" | "moderate";
        confidence: number;
    };
    let freshEnrichments: EnrichmentEntry[] = [];

    if (aiAvailable && needsAiItems.length > 0) {
        try {
            const result = await aiEnrichPurchaseSuggestions(needsAiItems);
            freshEnrichments = result.enrichments;
        } catch {
            // AI error doesn't bring down the route
        }
    }

    const freshAiMap = new Map(freshEnrichments.map(e => [e.productId, e]));

    // Build merged AI map: fresh enrichments + content recovered from existing rec metadata
    const mergedAiMap = new Map<string, {
        aiWhyNow: string | null;
        aiQuantityRationale: string | null;
        aiUrgencyLevel: "critical" | "high" | "moderate" | null;
        aiConfidence: number | null;
    }>();

    for (const item of needsAiItems) {
        const ai = freshAiMap.get(item.productId);
        mergedAiMap.set(item.productId, {
            aiWhyNow: ai?.whyNow ?? null,
            aiQuantityRationale: ai?.quantityRationale ?? null,
            aiUrgencyLevel: ai?.urgencyLevel ?? null,
            aiConfidence: ai?.confidence ?? null,
        });
    }

    for (const item of hasExistingItems) {
        const rec = existingRecMap.get(item.productId)!;
        const meta = rec.metadata as Record<string, unknown> | null;
        mergedAiMap.set(item.productId, {
            aiWhyNow: (meta?.aiWhyNow as string) ?? null,
            aiQuantityRationale: (meta?.aiQuantityRationale as string) ?? null,
            aiUrgencyLevel: (meta?.aiUrgencyLevel as "critical" | "high" | "moderate") ?? null,
            aiConfidence: rec.confidence ?? null,
        });
    }

    const responseItems = items
        .map(item => {
            const ai = mergedAiMap.get(item.productId);
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
                aiWhyNow: ai?.aiWhyNow ?? null,
                aiQuantityRationale: ai?.aiQuantityRationale ?? null,
                aiUrgencyLevel: ai?.aiUrgencyLevel ?? null,
                aiConfidence: ai?.aiConfidence ?? null,
            };
        })
        .sort((a, b) => {
            if (a.coverageDays === null && b.coverageDays === null) return 0;
            if (a.coverageDays === null) return -1;
            if (b.coverageDays === null) return 1;
            return a.coverageDays - b.coverageDays;
        });

    // ── Persist recommendations ───────────────────────────────────────────────
    // Only upsert for products that needed fresh AI. Existing recs are returned as-is.
    const recommendations: Array<{ productId: string; recommendationId: string | null; status: string }> = [];

    try {
        // Expire suggestions for products no longer below min stock
        const expirePromise = activeProductIds.length > 0
            ? dbExpireSuggestedRecommendations("product", activeProductIds, "purchase_suggestion")
            : Promise.resolve(0);

        // Insert new recommendations only for products without an existing active rec
        const upsertPromises = needsAiItems.map(async item => {
            const ai = freshAiMap.get(item.productId);
            const urgencyPct = computeUrgencyPct(item.available, item.min);
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
                        urgencyPct,
                        aiWhyNow: ai?.whyNow ?? null,
                        aiQuantityRationale: ai?.quantityRationale ?? null,
                        aiUrgencyLevel: ai?.urgencyLevel ?? null,
                        coverageDays: item.coverageDays,
                        targetStock: item.targetStock,
                        formula: item.formula,
                    },
                });
                return { productId: item.productId, recommendationId: rec.id, status: rec.status };
            } catch {
                return { productId: item.productId, recommendationId: null, status: "error" };
            }
        });

        // Collect existing rec references (no DB write needed)
        const existingRefs = hasExistingItems.map(item => {
            const rec = existingRecMap.get(item.productId)!;
            return { productId: item.productId, recommendationId: rec.id, status: rec.status };
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
            needs_purchase: needsPurchase.length,
            raw_material: rawMaterialCount,
            finished: finishedCount,
        },
        items: responseItems,
        recommendations,
        generatedAt: new Date().toISOString(),
    });
}
