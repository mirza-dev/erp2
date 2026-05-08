import { NextResponse, type NextRequest } from "next/server";
import { dbListProducts, dbGetAllActiveProductIds } from "@/lib/supabase/products";
import {
    computeTargetStock,
    computeCoverageDays,
    computeUrgencyPct,
    computeUrgencyLevel,
    computeOrderDeadline,
    dateDaysFromToday,
} from "@/lib/stock-utils";
import { aiEnrichPurchaseSuggestions, isAIAvailable, type PurchaseSuggestionItem } from "@/lib/services/ai-service";
import {
    dbUpsertRecommendation,
    dbExpireSuggestedRecommendations,
    dbExpireAllSuggestedRecommendations,
    dbExpireStaleRecommendations,
    dbExpireRecommendationsForMissingEntities,
    dbExpireEntityRecommendations,
    dbGetActiveRecommendationsForEntities,
    dbUpdateRecommendationMetadata,
} from "@/lib/supabase/recommendations";
import type { AiRecommendationRow } from "@/lib/database.types";
import { handleApiError } from "@/lib/api-error";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";

type UrgencyLevel = "critical" | "high" | "moderate";

// G11: Method'a göre auth.
//   GET  → SADECE CRON_SECRET Bearer (Vercel Cron yolu).
//          Session-cookie'li GET kabul edilirse CSRF benzeri risk:
//          <img src="...purchase-copilot"> ile yan etki tetiklenebilir.
//   POST → CRON_SECRET Bearer VEYA authenticated session (UI yolu, manuel curl).
// Middleware ALWAYS_PUBLIC listesinde olduğu için route kendi auth'unu yapar.
function hasValidCronSecret(request: NextRequest | undefined): boolean {
    const secret = process.env.CRON_SECRET;
    if (!secret) return false;
    const authHeader = request?.headers?.get("authorization") ?? null;
    return authHeader === `Bearer ${secret}`;
}

async function hasAuthenticatedSession(): Promise<boolean> {
    try {
        const supabase = await createServerSupabaseClient();
        const { data: { user } } = await supabase.auth.getUser();
        return !!user;
    } catch {
        return false;
    }
}

async function checkAuth(request: NextRequest | undefined, method: "GET" | "POST"): Promise<boolean> {
    if (hasValidCronSecret(request)) return true;
    if (method === "GET") return false; // GET'te session kabul edilmez
    return await hasAuthenticatedSession();
}

/**
 * G11 diff-merge: rec metadata'sından deterministik urgencyLevel'ı oku.
 *
 * Plan'dan kasıtlı sapma: plan `aiUrgencyLevel` (AI'ın subjektif yorumu) okumayı
 * öneriyordu, biz `urgencyLevel` (coverage-based computeUrgencyLevel) okuyoruz.
 * Sebep: diff-merge'in amacı "stok state'i değişti mi?" — AI'ın yorumu LLM
 * non-determinism'i nedeniyle aynı state'te bile değişebilir; deterministik
 * karşılaştırma daha güvenilir bir "değişiklik sinyali" verir.
 *
 * Fallback: eski rec'lerde `urgencyLevel` field'ı yoksa `coverageDays` her zaman
 * stored — runtime'da computeUrgencyLevel ile yeniden türetilir.
 */
function readUrgencyLevelFromMeta(meta: Record<string, unknown> | null | undefined): UrgencyLevel | null {
    if (!meta) return null;
    const direct = meta.urgencyLevel;
    if (direct === "critical" || direct === "high" || direct === "moderate") return direct;
    // Backward-compat: eski rec'lerde urgencyLevel field'ı yoksa coverageDays + leadTimeDays'ten türet
    const lead = typeof meta.leadTimeDays === "number" ? meta.leadTimeDays : null;
    if (typeof meta.coverageDays === "number") return computeUrgencyLevel(meta.coverageDays, lead);
    if (meta.coverageDays === null) return computeUrgencyLevel(null);
    return null;
}

// G11: Vercel Cron GET ile çağırır, UI POST ile çağırır → ikisini de destekle.
async function handler(request: NextRequest | undefined, method: "GET" | "POST") {
    if (!(await checkAuth(request, method))) {
        return NextResponse.json({ error: "Yetkisiz erişim." }, { status: 401 });
    }

    // Expire suggested recommendations that were never acted on after 48 hours.
    try { await dbExpireStaleRecommendations(48); } catch { /* non-fatal */ }

    let products: Awaited<ReturnType<typeof dbListProducts>>;
    try {
        products = await dbListProducts({ is_active: true, pageSize: 500 });
    } catch (err) {
        return handleApiError(err, "Satın alma önerileri toplanamadı.");
    }

    // Sprint C G1: orphan cleanup for deleted/deactivated products.
    try {
        const allActiveProductIds = await dbGetAllActiveProductIds();
        await dbExpireRecommendationsForMissingEntities("product", allActiveProductIds, "purchase_suggestion");
    } catch { /* non-fatal */ }

    const REORDER_DEADLINE_WINDOW_DAYS = 7;
    const needsPurchase = products.filter(p => {
        if (p.product_type === "manufactured") return false;
        if (p.available_now <= p.min_stock_level) return true;
        const promisable = p.promisable ?? p.available_now;
        const { orderDeadline } = computeOrderDeadline(promisable, p.daily_usage, p.lead_time_days);
        return !!(orderDeadline && dateDaysFromToday(orderDeadline) <= REORDER_DEADLINE_WINDOW_DAYS);
    });

    const manufacturedCount = needsPurchase.filter(p => p.product_type === "manufactured").length;
    const commercialCount = needsPurchase.filter(p => p.product_type === "commercial").length;

    const items: PurchaseSuggestionItem[] = needsPurchase.map(p => {
        const dailyUsage = p.daily_usage ?? null;
        const leadTimeDays = p.lead_time_days ?? null;
        // Math.max(1, ...) guard — reorder_qty=NULL && min_stock_level=0 senaryosunda
        // moq=0 olur ve Math.ceil(needed/0)=Infinity üretirdi (frontend page.tsx:226 ile aynı pattern)
        const moq = Math.max(1, p.reorder_qty ?? p.min_stock_level);
        const { target, formula, leadTimeDemand } = computeTargetStock(p.min_stock_level, dailyUsage, leadTimeDays);
        const needed = Math.max(0, target - p.available_now);
        const suggestQty = needed === 0 ? moq : Math.max(moq, Math.ceil(needed / moq) * moq);
        const coverageDays = computeCoverageDays(p.available_now, dailyUsage);

        return {
            productId: p.id,
            productName: p.name,
            sku: p.sku,
            productType: p.product_type as "manufactured" | "commercial",
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
            // G11 tek source-of-truth — AI bu seviyeyi echo eder, hesaplamaz
            urgencyLevel: computeUrgencyLevel(coverageDays, leadTimeDays),
        };
    });

    const aiAvailable = isAIAvailable();
    const activeProductIds = items.map(i => i.productId);

    // ── G11: Mevcut aktif rec'leri yükle ve sınıflandır ──────────────────────
    // suggestedRecMap → diff-merge target (status='suggested')
    // decidedRecMap   → frozen, drift hesaplanır (accepted/edited/rejected)
    const suggestedRecMap = new Map<string, AiRecommendationRow>();
    const decidedRecMap = new Map<string, AiRecommendationRow>();
    try {
        const existingRecs = await dbGetActiveRecommendationsForEntities(
            "product", activeProductIds, "purchase_suggestion"
        );
        for (const r of existingRecs) {
            if (r.status === "suggested") suggestedRecMap.set(r.entity_id, r);
            else decidedRecMap.set(r.entity_id, r);
        }
    } catch {
        // Non-fatal: if we can't load existing, treat all as needing fresh AI
    }

    // ── G11 diff-merge: 'suggested' rec'leri level karşılaştırmasıyla böl ────
    // levelSame → metadata in-place refresh, AI metni dokunulmaz
    // levelChanged → eski rec expire, AI yeniden çağrılır
    // noRec → fresh upsert, AI çağrılır
    const levelSameItems: PurchaseSuggestionItem[] = [];
    const levelChangedItems: PurchaseSuggestionItem[] = [];
    const noRecItems: PurchaseSuggestionItem[] = [];
    for (const item of items) {
        const suggestedRec = suggestedRecMap.get(item.productId);
        if (suggestedRec) {
            const meta = suggestedRec.metadata as Record<string, unknown> | null;
            const currentLevel = computeUrgencyLevel(item.coverageDays, item.leadTimeDays);
            const existingLevel = readUrgencyLevelFromMeta(meta);
            if (existingLevel === currentLevel) levelSameItems.push(item);
            else levelChangedItems.push(item);
            continue;
        }
        // Decided rec ise frozen kalır — AI flow'una düşmemeli
        if (decidedRecMap.has(item.productId)) continue;
        noRecItems.push(item);
    }

    // Level değişen rec'leri expire et — yeni rec için unique index temizlensin.
    // Yalnızca purchase_suggestion: aynı ürünün diğer rec türleri (varsa) korunur.
    await Promise.all(levelChangedItems.map(item =>
        dbExpireEntityRecommendations(item.productId, "product", "purchase_suggestion").catch(() => undefined)
    ));

    // Level-aynı rec'lerin metadata'sını sayısal alanlarla güncelle (best-effort)
    await Promise.all(levelSameItems.map(item => {
        const rec = suggestedRecMap.get(item.productId)!;
        return dbUpdateRecommendationMetadata(rec.id, {
            suggestQty: item.suggestQty,
            moq: item.moq,
            urgencyPct: computeUrgencyPct(item.available, item.min),
            urgencyLevel: computeUrgencyLevel(item.coverageDays, item.leadTimeDays),
            coverageDays: item.coverageDays,
            leadTimeDays: item.leadTimeDays,
            targetStock: item.targetStock,
            formula: item.formula,
        }).catch(() => undefined);
    }));

    // ── G11 decided drift detection ──────────────────────────────────────────
    type Drift = { suggestQty: number; urgencyLevel: UrgencyLevel };
    const driftMap = new Map<string, Drift>();
    for (const item of items) {
        const decided = decidedRecMap.get(item.productId);
        if (!decided) continue;
        const meta = decided.metadata as Record<string, unknown> | null;
        const frozenSuggestQty = (meta?.suggestQty as number | undefined) ?? null;
        const frozenLevel = readUrgencyLevelFromMeta(meta);
        const currentLevel = computeUrgencyLevel(item.coverageDays, item.leadTimeDays);
        if (frozenSuggestQty !== item.suggestQty || frozenLevel !== currentLevel) {
            driftMap.set(item.productId, {
                suggestQty: item.suggestQty,
                urgencyLevel: currentLevel,
            });
        }
    }

    // ── AI enrichment: only items needing fresh AI (no rec or level changed) ─
    const needsAiItems = [...noRecItems, ...levelChangedItems];
    type EnrichmentEntry = {
        productId: string;
        whyNow: string;
        quantityRationale: string;
        urgencyLevel: UrgencyLevel;
        confidence: number;
    };
    let freshEnrichments: EnrichmentEntry[] = [];
    // Sprint C G2: AI key var ama call fail → frontend banner sinyali
    let aiCallFailed = false;

    if (aiAvailable && needsAiItems.length > 0) {
        try {
            const result = await aiEnrichPurchaseSuggestions(needsAiItems);
            freshEnrichments = result.enrichments;
        } catch {
            aiCallFailed = true;
        }
    }

    const freshAiMap = new Map(freshEnrichments.map(e => [e.productId, e]));

    // mergedAiMap: AI fields per item — fresh enrichment OR rec metadata reuse
    const mergedAiMap = new Map<string, {
        aiWhyNow: string | null;
        aiQuantityRationale: string | null;
        aiUrgencyLevel: UrgencyLevel | null;
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

    for (const item of levelSameItems) {
        const rec = suggestedRecMap.get(item.productId)!;
        const meta = rec.metadata as Record<string, unknown> | null;
        mergedAiMap.set(item.productId, {
            aiWhyNow: (meta?.aiWhyNow as string) ?? null,
            aiQuantityRationale: (meta?.aiQuantityRationale as string) ?? null,
            aiUrgencyLevel: (meta?.aiUrgencyLevel as UrgencyLevel) ?? null,
            aiConfidence: rec.confidence ?? null,
        });
    }

    // Decided rec'lerden AI metnini çek (frozen — kullanıcı kararı sırasındaki AI yorumu)
    for (const item of items) {
        if (mergedAiMap.has(item.productId)) continue;
        const decided = decidedRecMap.get(item.productId);
        if (!decided) continue;
        const meta = decided.metadata as Record<string, unknown> | null;
        mergedAiMap.set(item.productId, {
            aiWhyNow: (meta?.aiWhyNow as string) ?? null,
            aiQuantityRationale: (meta?.aiQuantityRationale as string) ?? null,
            aiUrgencyLevel: (meta?.aiUrgencyLevel as UrgencyLevel) ?? null,
            aiConfidence: decided.confidence ?? null,
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

    // ── Persist + build response.recommendations ─────────────────────────────
    type RecRef = {
        productId: string;
        recommendationId: string | null;
        status: string;
        decidedAt: string | null;
        editedMetadata: Record<string, unknown> | null;
        currentDrift: Drift | null;
    };
    const recommendations: RecRef[] = [];

    try {
        // Tüm ürünler stok üstüne çıkıp activeProductIds=[] olursa
        // dbExpireSuggestedRecommendations no-op olur → orphan suggested'lar
        // 48h TTL'e kadar takılı kalmaz, tek seferde temizlensin.
        const expirePromise = activeProductIds.length > 0
            ? dbExpireSuggestedRecommendations("product", activeProductIds, "purchase_suggestion")
            : dbExpireAllSuggestedRecommendations("product", "purchase_suggestion");

        const upsertPromises = needsAiItems.map(async item => {
            const ai = freshAiMap.get(item.productId);
            const urgencyPct = computeUrgencyPct(item.available, item.min);
            const urgencyLevel = computeUrgencyLevel(item.coverageDays, item.leadTimeDays);
            // severity (DB sütunu) urgencyPct-based; urgencyLevel'dan bağımsız bir kavram
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
                        urgencyLevel,
                        aiWhyNow: ai?.whyNow ?? null,
                        aiQuantityRationale: ai?.quantityRationale ?? null,
                        aiUrgencyLevel: ai?.urgencyLevel ?? null,
                        coverageDays: item.coverageDays,
                        leadTimeDays: item.leadTimeDays,
                        targetStock: item.targetStock,
                        formula: item.formula,
                    },
                });
                return { productId: item.productId, recommendationId: rec.id, status: rec.status, decidedAt: rec.decided_at, editedMetadata: null, currentDrift: null } as RecRef;
            } catch {
                return { productId: item.productId, recommendationId: null, status: "error", decidedAt: null, editedMetadata: null, currentDrift: null } as RecRef;
            }
        });

        // Reuse: level-same suggested rec'leri (metadata in-place güncellendi)
        const levelSameRefs: RecRef[] = levelSameItems.map(item => {
            const rec = suggestedRecMap.get(item.productId)!;
            return {
                productId: item.productId,
                recommendationId: rec.id,
                status: rec.status,
                decidedAt: rec.decided_at,
                editedMetadata: rec.edited_metadata as Record<string, unknown> | null,
                currentDrift: null,
            };
        });

        // Decided rec'ler — frozen metadata + drift bilgisi
        const decidedRefs: RecRef[] = items
            .filter(item => decidedRecMap.has(item.productId))
            .map(item => {
                const rec = decidedRecMap.get(item.productId)!;
                return {
                    productId: item.productId,
                    recommendationId: rec.id,
                    status: rec.status,
                    decidedAt: rec.decided_at,
                    editedMetadata: rec.edited_metadata as Record<string, unknown> | null,
                    currentDrift: driftMap.get(item.productId) ?? null,
                };
            });

        const [, upsertResults] = await Promise.all([expirePromise, Promise.all(upsertPromises)]);
        recommendations.push(...upsertResults, ...levelSameRefs, ...decidedRefs);
    } catch {
        // Persistence errors must not affect the main response
    }

    return NextResponse.json({
        ai_available: aiAvailable,
        ai_call_failed: aiCallFailed,
        counts: {
            total_products: products.length,
            needs_purchase: needsPurchase.length,
            manufactured: manufacturedCount,
            commercial: commercialCount,
        },
        items: responseItems,
        recommendations,
        generatedAt: new Date().toISOString(),
    });
}

export const GET  = (req?: NextRequest) => handler(req, "GET");
export const POST = (req?: NextRequest) => handler(req, "POST");
