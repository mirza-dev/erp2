import { NextResponse, type NextRequest } from "next/server";
import { dbListAllActiveProducts, dbGetAllActiveProductIds, dbGetQuotedQuantities } from "@/lib/supabase/products";
import {
    computeTargetStock,
    computeCoverageDays,
    computeUrgencyPct,
    computeUrgencyLevel,
    computeOrderDeadline,
    dateDaysFromToday,
} from "@/lib/stock-utils";
import { aiEnrichPurchaseSuggestions, isAIAvailable, type PurchaseSuggestionItem } from "@/lib/services/ai-service";
import { dbGetRecentRejectionsForProducts } from "@/lib/supabase/ai-feedback";
import {
    dbUpsertRecommendation,
    dbExpireSuggestedRecommendations,
    dbExpireAllSuggestedRecommendations,
    dbExpireStaleRecommendations,
    dbExpireRecommendationsForMissingEntities,
    dbGetActiveRecommendationsForEntities,
    dbListRecommendations,
    dbUpdateRecommendationMetadata,
    dbUpdateSuggestedRecommendation,
} from "@/lib/supabase/recommendations";
import { dbGetPOsByRecommendationIds, type LinkedPO } from "@/lib/supabase/purchase-orders";
import type { AiRecommendationRow } from "@/lib/database.types";
import { handleApiError } from "@/lib/api-error";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { guardAiRoute } from "@/lib/ai-route-limit";

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
    // Backward-compat: eski rec'lerde urgencyLevel field'ı yoksa coverageDays + leadTimeDays'ten türet.
    // Audit 8. tur Fix 2: urgencyPct varsa pctFallback olarak geçilir (severity uyumu).
    const lead = typeof meta.leadTimeDays === "number" ? meta.leadTimeDays : null;
    const pctFb = typeof meta.urgencyPct === "number" ? meta.urgencyPct : undefined;
    if (typeof meta.coverageDays === "number") return computeUrgencyLevel(meta.coverageDays, lead, pctFb);
    if (meta.coverageDays === null) return computeUrgencyLevel(null, lead, pctFb);
    return null;
}

// G11: Vercel Cron GET ile çağırır, UI POST ile çağırır → ikisini de destekle.
async function handler(request: NextRequest | undefined, method: "GET" | "POST") {
    if (!(await checkAuth(request, method))) {
        return NextResponse.json({ error: "Yetkisiz erişim." }, { status: 401 });
    }

    // Route-level AI rate limit (2026-05-26) — Anthropic fatura amplifikasyonu koruması.
    // checkAuth'tan sonra çalışır → cron isteği zaten Bearer ile doğrulandı, manuel curl
    // ile yapay yük üretmek isteyen kullanıcı 10/dk limitine takılır.
    // Limit 10/dk seçildi: sayfa açılışı 1 fetch + auto-reload signature değişimi 1-2
    // + kullanıcının manuel "↻ Yenile" denemeleri toplamı pratikte 5'i aşıyordu (UI
    // "AI önerisi oluşturulamadı" yanlış mesajı tetikliyordu).
    // Middleware-level Redis rate limit şu an pasif (Docker network sorunu); guard burada.
    if (request) {
        const limited = guardAiRoute(request, "purchase-copilot", 10);
        if (limited) return limited;
    }

    // 48 saat TTL — sadece purchase_suggestion (audit 3. tur Fix 4):
    // tip filtresi olmadan helper diğer rec tiplerini de etkilerdi.
    try { await dbExpireStaleRecommendations(48, "purchase_suggestion"); } catch { /* non-fatal */ }

    // Audit 3. tur Fix 2: dbListAllActiveProducts pagination'sız tüm aktif
    // ürünleri çeker. Önceki dbListProducts({pageSize:500}) 501. ürün için
    // hem öneri üretmiyor hem cleanup'ta orphan sayıp valid rec'leri expire
    // edebiliyordu.
    let products: Awaited<ReturnType<typeof dbListAllActiveProducts>>;
    let quotedMap: Map<string, number>;
    try {
        // Audit 3. tur Fix 1: quoted miktarları çekip promisable hesapla.
        // /api/products route'uyla aynı semantik: draft+pending_approval
        // siparişlerdeki açık quote'lar promisable'dan düşülür.
        [products, quotedMap] = await Promise.all([
            dbListAllActiveProducts(),
            dbGetQuotedQuantities(),
        ]);
    } catch (err) {
        return handleApiError(err, "Satın alma önerileri toplanamadı.");
    }

    // Sprint C G1: orphan cleanup for deleted/deactivated products.
    try {
        const allActiveProductIds = await dbGetAllActiveProductIds();
        await dbExpireRecommendationsForMissingEntities("product", allActiveProductIds, "purchase_suggestion");
    } catch { /* non-fatal */ }

    const REORDER_DEADLINE_WINDOW_DAYS = 7;
    // Audit 3-4. tur Fix 1: promisable = available_now - quoted (UI ile aynı).
    // Domain'in tek hesabı; alert/satınalma servisleriyle uyumlu.
    const promisableMap = new Map<string, number>();
    for (const p of products) {
        promisableMap.set(p.id, p.available_now - (quotedMap.get(p.id) ?? 0));
    }
    const needsPurchase = products.filter(p => {
        if (p.product_type === "manufactured") return false;
        const promisable = promisableMap.get(p.id) ?? p.available_now;
        // Audit 4. tur Bulgu 1: ilk eşik available_now değil promisable olmalı.
        // available_now=50, quoted=40, min=20 → promisable=10 < min=20 → öneri.
        if (promisable <= p.min_stock_level) return true;
        const { orderDeadline } = computeOrderDeadline(promisable, p.daily_usage, p.lead_time_days);
        return !!(orderDeadline && dateDaysFromToday(orderDeadline) <= REORDER_DEADLINE_WINDOW_DAYS);
    });

    const manufacturedCount = needsPurchase.filter(p => p.product_type === "manufactured").length;
    const commercialCount = needsPurchase.filter(p => p.product_type === "commercial").length;

    const items: PurchaseSuggestionItem[] = needsPurchase.map(p => {
        const dailyUsage = p.daily_usage ?? null;
        const leadTimeDays = p.lead_time_days ?? null;
        // Audit 4. tur Bulgu 2 + 8. tur Fix 1: tüm satın alma hesapları
        // promisable üzerinden ve over-quoted (negatif) durumda 0'a clamp.
        // Frontend `pickStock` paterniyle birebir — UI ↔ backend suggestQty eşit.
        const promisable = promisableMap.get(p.id) ?? p.available_now;
        const stock = Math.max(0, promisable);
        // Math.max(1, ...) guard — reorder_qty=NULL && min_stock_level=0 senaryosunda
        // moq=0 olur ve Math.ceil(needed/0)=Infinity üretirdi (frontend page.tsx:226 ile aynı pattern)
        const moq = Math.max(1, p.reorder_qty ?? p.min_stock_level);
        const { target, formula, leadTimeDemand } = computeTargetStock(p.min_stock_level, dailyUsage, leadTimeDays);
        const needed = Math.max(0, target - stock);
        const suggestQty = needed === 0 ? moq : Math.max(moq, Math.ceil(needed / moq) * moq);
        const coverageDays = computeCoverageDays(stock, dailyUsage);

        return {
            productId: p.id,
            productName: p.name,
            sku: p.sku,
            productType: p.product_type as "manufactured" | "commercial",
            unit: p.unit,
            // available alanı UI'da "Stok" olarak gösterilir — promisable (satılabilir) yansıtılır.
            // Audit 9. tur Fix 4: clamped stok (max(0, promisable)) — over-quoted durumda
            // AI prompt ve fallback body negatif değer görmesin (UI ile aynı görünüm).
            available: stock,
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
            // G11 tek source-of-truth — AI bu seviyeyi echo eder, hesaplamaz.
            // Audit 8. tur Fix 2: coverageDays null ise pctFallback ile severity uyumlu.
            urgencyLevel: computeUrgencyLevel(
                coverageDays,
                leadTimeDays,
                computeUrgencyPct(stock, p.min_stock_level),
            ),
        };
    });

    const aiAvailable = isAIAvailable();
    const activeProductIds = items.map(i => i.productId);

    // ── G11: Mevcut aktif rec'leri yükle ve sınıflandır ──────────────────────
    // suggestedRecMap → diff-merge target (status='suggested')
    // decidedRecMap   → frozen, drift hesaplanır (accepted/edited/rejected)
    //
    // Audit 6. tur Fix 1: decided rec'ler items dışındaki ürünler için de yüklenir.
    // Senaryo: kullanıcı öneriyi kabul etti → stok 5→200 → ürün artık needsPurchase
    // değil → eski sürümde decided rec response'tan kayıp + drift rozeti kayıp.
    // Yeni: tüm aktif decided rec'leri ayrıca yükle ve drift hesapla.
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

    // Out-of-scope decided rec'ler — sadece accepted/edited/rejected çek;
    // 7-günlük decided window SQL-side uygulanır.
    // Audit 7. tur Fix 3: statusIn → SQL filter (in("status", [...]))
    // Audit 9. tur Fix 2 + 10. tur Fix 1: decidedAfter → SQL filter
    //   .or(decided_at.gte.X, decided_at.is.null) — legacy NULL kayıtlar dahil;
    //   JS-side 7-gün filter sadece NULL kayıtlar için created_at üzerinden uygulanır.
    //   Eskiden tüm decided rec'ler çekiliyor, JS-side 7-gün filter uygulanıyordu;
    //   decided rec'ler TTL'siz olduğu için zamanla büyüyen tabloda gereksiz I/O.
    try {
        const cutoffMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
        const cutoff = new Date(cutoffMs).toISOString();
        const allDecidedRecs = await dbListRecommendations({
            entity_type: "product",
            recommendation_type: "purchase_suggestion",
            statusIn: ["accepted", "edited", "rejected"],
            decidedAfter: cutoff,
        });
        const seen = new Set<string>([
            ...suggestedRecMap.keys(),
            ...decidedRecMap.keys(),
        ]);
        for (const r of allDecidedRecs) {
            if (seen.has(r.entity_id)) continue;
            // Audit 10. tur Fix 1: legacy decided_at=NULL durumunda created_at ile
            // 7-gün cutoff fallback. SQL `.or(...)` NULL'ları çekti; JS-side
            // 7-günlük stale filter created_at üzerinden uygulanır.
            if (r.decided_at === null) {
                const createdMs = new Date(r.created_at).getTime();
                if (createdMs < cutoffMs) continue;
            }
            decidedRecMap.set(r.entity_id, r);
            seen.add(r.entity_id);
        }
    } catch {
        // Non-fatal: out-of-scope drift göremesek bile ana akış devam eder
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
            // Audit 8. tur Fix 2: item.urgencyLevel zaten pctFallback dahil hesaplandı —
            // tek source-of-truth, level karşılaştırması da onu kullansın.
            const currentLevel = item.urgencyLevel;
            const existingLevel = readUrgencyLevelFromMeta(meta);
            // Audit 11. tur Fix 1: aiPending=true (önceki cron'da AI fail) → level
            // aynı olsa bile fresh AI denenir. Aksi halde geçici AI hatasında eski
            // boş AI metni level değişene kadar (saatler/günler) kalıcı olabilir.
            const aiPending = meta?.aiPending === true;
            if (existingLevel === currentLevel && !aiPending) levelSameItems.push(item);
            else levelChangedItems.push(item);
            continue;
        }
        // Decided rec ise frozen kalır — AI flow'una düşmemeli
        if (decidedRecMap.has(item.productId)) continue;
        noRecItems.push(item);
    }

    // Audit 3. tur Fix 5: levelChanged için "expire+upsert" dansı kaldırıldı.
    // Eskiden: dbExpireEntityRecommendations sessiz fail'de upsert dedupe'a
    // düşüyordu; yeni AI içeriği DB'ye yazılmıyor, her cron'da AI tekrar
    // çağrılıyordu. Yeni akış: AI sonrası dbUpdateSuggestedRecommendation
    // ile rec body/confidence/severity/metadata atomik tek UPDATE'le yenilenir
    // (rec ID stable kalır, UI reference'ı bozulmaz).

    // Level-aynı rec'lerin metadata'sını sayısal alanlarla güncelle (best-effort).
    // Audit 12. tur: dbUpdateRecommendationMetadata UPDATE'i status=suggested guard'ı
    // ile çalışır — kullanıcı eşzamanlı kabul/red ederse decided rec'in frozen
    // metadata'sı korunur (yarış kapatıldı).
    await Promise.all(levelSameItems.map(item => {
        const rec = suggestedRecMap.get(item.productId)!;
        return dbUpdateRecommendationMetadata(rec.id, {
            suggestQty: item.suggestQty,
            moq: item.moq,
            urgencyPct: computeUrgencyPct(item.available, item.min),
            // Audit 8. tur Fix 2: item.urgencyLevel pctFallback dahil zaten hesaplandı
            urgencyLevel: item.urgencyLevel,
            coverageDays: item.coverageDays,
            leadTimeDays: item.leadTimeDays,
            targetStock: item.targetStock,
            formula: item.formula,
        }).catch(() => undefined);
    }));

    // ── G11 decided drift detection ──────────────────────────────────────────
    // Audit 6. tur Fix 1: drift hesabı items dışı decided rec'leri de kapsar.
    // Stok düzelmiş ürün (needsPurchase=false) için de "Stok değişti" sinyali
    // verilebilir — örn. accepted iken stok 5→200, kullanıcı görmeli.
    type Drift = { suggestQty: number; urgencyLevel: UrgencyLevel };
    const driftMap = new Map<string, Drift>();
    const itemMap = new Map(items.map(i => [i.productId, i]));
    const productMap = new Map(products.map(p => [p.id, p]));

    for (const [productId, decided] of decidedRecMap) {
        // Önce items içinde varsa onun hazır hesaplarını kullan
        const item = itemMap.get(productId);
        let currentSuggestQty: number;
        let currentLevel: UrgencyLevel;

        if (item) {
            currentSuggestQty = item.suggestQty;
            // Audit 8. tur Fix 2: item.urgencyLevel pctFallback dahil hesaplandı
            currentLevel = item.urgencyLevel;
        } else {
            // Out-of-scope: ürünün güncel state'inden hesapla
            const p = productMap.get(productId);
            if (!p) continue; // ürün silinmiş — orphan cleanup ele alır
            const dailyUsage = p.daily_usage ?? null;
            const leadTimeDays = p.lead_time_days ?? null;
            const promisable = p.available_now - (quotedMap.get(p.id) ?? 0);
            const stock = Math.max(0, promisable);
            const moq = Math.max(1, p.reorder_qty ?? p.min_stock_level);
            const { target } = computeTargetStock(p.min_stock_level, dailyUsage, leadTimeDays);
            const needed = Math.max(0, target - stock);
            currentSuggestQty = needed === 0 ? moq : Math.max(moq, Math.ceil(needed / moq) * moq);
            const coverageDays = computeCoverageDays(stock, dailyUsage);
            // Audit 8. tur Fix 2: out-of-scope için pctFallback geçilir (severity uyumlu)
            currentLevel = computeUrgencyLevel(
                coverageDays,
                leadTimeDays,
                computeUrgencyPct(stock, p.min_stock_level),
            );
        }

        const meta = decided.metadata as Record<string, unknown> | null;
        const frozenSuggestQty = (meta?.suggestQty as number | undefined) ?? null;
        const frozenLevel = readUrgencyLevelFromMeta(meta);
        if (frozenSuggestQty !== currentSuggestQty || frozenLevel !== currentLevel) {
            driftMap.set(productId, {
                suggestQty: currentSuggestQty,
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
        // Faz 8: Bulk-fetch recent rejection notes per product (max 3, 90-day window).
        // Sanitize edilmiş notlar item'lara enjekte edilir; empty array → alan
        // yazılmaz (token tasarrufu). RPC fail non-fatal — AI çağrısı rejection
        // olmadan devam eder (graceful degradation, mevcut pattern).
        let rejMap: Map<string, string[]> = new Map();
        try {
            rejMap = await dbGetRecentRejectionsForProducts(
                needsAiItems.map(i => i.productId),
                3,
            );
        } catch (err) {
            console.error("[purchase-copilot] rejection fetch failed (non-fatal):", err);
        }
        for (const item of needsAiItems) {
            const notes = rejMap.get(item.productId);
            if (notes && notes.length > 0) {
                item.recentRejections = notes;
            }
        }

        try {
            const result = await aiEnrichPurchaseSuggestions(needsAiItems);
            freshEnrichments = result.enrichments;
            // Audit 3. tur Fix 3: servis catch içinde graceful return ediyor
            // (throw etmiyor). hadError flag'i "AI çağrıldı ama içerik üretilemedi"
            // sinyali — UI banner'ı bu üzerinden gösterilir.
            if (result.hadError) aiCallFailed = true;
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

    // ── responseItems oluşturma ─────────────────────────────────────────────
    // items dizisindeki ürünler (needsPurchase) + out-of-scope decided ürünler
    // (Audit 7. tur Fix 2): UI tarafı `aiMap` üzerinden AI metnine erişiyor;
    // out-of-scope decided ürünler items'da olmadığı için drawer/AI rozeti
    // bilgisi gösterilemiyordu. Frozen metadata'dan items'a benzer entry üret.
    const inScopeIds = new Set(items.map(i => i.productId));
    const outOfScopeDecidedItems = Array.from(decidedRecMap.entries())
        .filter(([productId]) => !inScopeIds.has(productId))
        // Audit 8. tur Fix 4: silinmiş ürün decided rec items'a girmesin.
        // Orphan cleanup henüz tetiklenmediyse UI'da "—" placeholder görünmesini engeller.
        .filter(([productId]) => productMap.has(productId))
        .map(([productId, decided]) => {
            const p = productMap.get(productId);
            const meta = decided.metadata as Record<string, unknown> | null;
            // Frozen değerler (decided rec metadata'sından — kullanıcı kararı sırasındaki snapshot)
            const frozenSuggestQty = (meta?.suggestQty as number | undefined) ?? null;
            const frozenCoverageDays = typeof meta?.coverageDays === "number" ? meta.coverageDays as number : null;
            const frozenLeadTimeDays = typeof meta?.leadTimeDays === "number" ? meta.leadTimeDays as number : null;
            const frozenTargetStock = (meta?.targetStock as number | undefined) ?? null;
            const frozenFormula = (meta?.formula === "lead_time" || meta?.formula === "fallback") ? meta.formula : "fallback";
            const frozenMoq = (meta?.moq as number | undefined) ?? null;
            const frozenUrgencyPct = (meta?.urgencyPct as number | undefined) ?? null;
            // Güncel state (drift bilgisi için kullanılan değerler)
            const promisable = p ? p.available_now - (quotedMap.get(p.id) ?? 0) : 0;
            const stock = Math.max(0, promisable);

            return {
                productId,
                productName: p?.name ?? "—",
                sku: p?.sku ?? "—",
                productType: (p?.product_type ?? "commercial") as "manufactured" | "commercial",
                unit: p?.unit ?? "adet",
                // available: out-of-scope için "güncel satılabilir stok" (UI ne göstermeli — frozen değil current)
                available: stock,
                min: p?.min_stock_level ?? 0,
                dailyUsage: p?.daily_usage ?? null,
                coverageDays: p ? computeCoverageDays(stock, p.daily_usage ?? null) : frozenCoverageDays,
                leadTimeDays: p?.lead_time_days ?? frozenLeadTimeDays,
                // suggestQty/target frozen — kullanıcı kararı sırasındaki değer
                suggestQty: frozenSuggestQty ?? 0,
                moq: frozenMoq ?? 1,
                targetStock: frozenTargetStock ?? 0,
                formula: frozenFormula as "lead_time" | "fallback",
                leadTimeDemand: null,
                preferredVendor: p?.preferred_vendor ?? null,
                urgencyPct: frozenUrgencyPct ?? 0,
                aiWhyNow: typeof meta?.aiWhyNow === "string" ? meta.aiWhyNow : null,
                aiQuantityRationale: typeof meta?.aiQuantityRationale === "string" ? meta.aiQuantityRationale : null,
                aiUrgencyLevel: (meta?.aiUrgencyLevel === "critical" || meta?.aiUrgencyLevel === "high" || meta?.aiUrgencyLevel === "moderate")
                    ? meta.aiUrgencyLevel as UrgencyLevel
                    : null,
                aiConfidence: decided.confidence ?? null,
            };
        });

    const responseItems = [
        ...items.map(item => {
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
        }),
        ...outOfScopeDecidedItems,
    ].sort((a, b) => {
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
        // Audit 11. tur Fix 2: decided rec'lerin metadata'sında dondurulmuş
        // suggestQty (kararı verilen miktar). UI accepted/rejected ürünlerde
        // her render'da güncel computeSuggestion yerine bu değeri gösterir;
        // backend "frozen" niyeti UI'a aktarılır. Suggested rec'lerde null.
        frozenSuggestQty: number | null;
        // Faz 6 M2: bu rec'e bağlı PO'lar (junction üzerinden reverse lookup).
        linkedPOs: LinkedPO[];
    };
    const recommendations: RecRef[] = [];

    // Faz 6: junction reverse lookup — tüm aktif rec ID'leri için PO bağlantısı.
    let linkedPOMap = new Map<string, LinkedPO[]>();
    try {
        const allRecIds = [
            ...Array.from(suggestedRecMap.values()).map(r => r.id),
            ...Array.from(decidedRecMap.values()).map(r => r.id),
        ];
        if (allRecIds.length > 0) {
            linkedPOMap = await dbGetPOsByRecommendationIds(allRecIds);
        }
    } catch {
        // non-fatal — reverse link eksik kalır ama ana akış etkilenmez
    }

    try {
        // Tüm ürünler stok üstüne çıkıp activeProductIds=[] olursa
        // dbExpireSuggestedRecommendations no-op olur → orphan suggested'lar
        // 48h TTL'e kadar takılı kalmaz, tek seferde temizlensin.
        const expirePromise = activeProductIds.length > 0
            ? dbExpireSuggestedRecommendations("product", activeProductIds, "purchase_suggestion")
            : dbExpireAllSuggestedRecommendations("product", "purchase_suggestion");

        // Helper: AI sonrası metadata patch'i (insert ve update'te aynı şekil).
        // Audit 6. tur Fix 4: AI fail/empty ise eski metadata'daki AI metnine fallback
        // (level değişimi metadata refresh demek; AI elde edilemediyse boş null
        // overwrite'tan iyidir — eski AI yorumu kullanıcıya gösterilmeye devam).
        const buildAiMetadata = (
            item: PurchaseSuggestionItem,
            fallbackMeta?: Record<string, unknown> | null,
        ) => {
            const ai = freshAiMap.get(item.productId);
            const fb = fallbackMeta ?? {};
            const fbWhyNow = typeof fb.aiWhyNow === "string" ? fb.aiWhyNow : null;
            const fbQuantityRationale = typeof fb.aiQuantityRationale === "string" ? fb.aiQuantityRationale : null;
            const fbUrgencyLevel = (fb.aiUrgencyLevel === "critical" || fb.aiUrgencyLevel === "high" || fb.aiUrgencyLevel === "moderate")
                ? fb.aiUrgencyLevel
                : null;

            const aiWhyNow = ai?.whyNow ?? fbWhyNow;
            const aiQuantityRationale = ai?.quantityRationale ?? fbQuantityRationale;
            const aiUrgencyLevel = ai?.urgencyLevel ?? fbUrgencyLevel;

            const urgencyPct = computeUrgencyPct(item.available, item.min);
            // Audit 8. tur Fix 2: item.urgencyLevel zaten pctFallback dahil — tek source
            const urgencyLevel = item.urgencyLevel;
            const severity: "critical" | "warning" | "info" = urgencyPct >= 80 ? "critical" : urgencyPct >= 50 ? "warning" : "info";
            // Audit 11. tur Fix 1: AI fail (freshAiMap'te yok) → aiPending=true,
            // sonraki cron'da diff-merge level aynı olsa bile levelChanged'a düşer.
            // AI başarılı (ai mevcut) → aiPending=false; JS-merge eski true'yu temizler.
            const aiPending = !ai;
            return {
                ai,
                aiWhyNow,
                urgencyPct,
                urgencyLevel,
                severity,
                body: aiWhyNow ?? `Stok ${item.available}/${item.min}. Önerilen: ${item.suggestQty} ${item.unit}.`,
                metadata: {
                    suggestQty: item.suggestQty,
                    moq: item.moq,
                    urgencyPct,
                    urgencyLevel,
                    aiWhyNow,
                    aiQuantityRationale,
                    aiUrgencyLevel,
                    aiPending,
                    coverageDays: item.coverageDays,
                    leadTimeDays: item.leadTimeDays,
                    targetStock: item.targetStock,
                    formula: item.formula,
                },
            };
        };

        // noRecItems → fresh upsert (insert)
        const upsertPromises = noRecItems.map(async item => {
            const m = buildAiMetadata(item);
            try {
                const rec = await dbUpsertRecommendation({
                    entity_type: "product",
                    entity_id: item.productId,
                    recommendation_type: "purchase_suggestion",
                    title: `${item.productName} — Satın alma önerisi`,
                    body: m.body,
                    confidence: m.ai?.confidence ?? null,
                    severity: m.severity,
                    model_version: aiAvailable ? "purchase-copilot-v1" : null,
                    metadata: m.metadata,
                });
                return { productId: item.productId, recommendationId: rec.id, status: rec.status, decidedAt: rec.decided_at, editedMetadata: null, currentDrift: null, frozenSuggestQty: null, linkedPOs: linkedPOMap.get(rec.id) ?? [] } as RecRef;
            } catch {
                return { productId: item.productId, recommendationId: null, status: "error", decidedAt: null, editedMetadata: null, currentDrift: null, frozenSuggestQty: null, linkedPOs: [] } as RecRef;
            }
        });

        // Audit 3. tur Fix 5: levelChangedItems → mevcut 'suggested' rec'i
        // in-place UPDATE et (expire+upsert dansını eler). Tek atomik UPDATE
        // ile body/severity/confidence/metadata yenilenir; rec ID stable kalır.
        // Audit 6. tur Fix 4: AI fail durumunda eski metadata'yı fallback olarak geçir.
        const levelChangedPromises = levelChangedItems.map(async item => {
            const rec = suggestedRecMap.get(item.productId)!;
            const fallbackMeta = rec.metadata as Record<string, unknown> | null;
            const m = buildAiMetadata(item, fallbackMeta);
            try {
                const updated = await dbUpdateSuggestedRecommendation(rec.id, {
                    body: m.body,
                    confidence: m.ai?.confidence ?? null,
                    severity: m.severity,
                    model_version: aiAvailable ? "purchase-copilot-v1" : null,
                    metadata: m.metadata,
                });
                return { productId: item.productId, recommendationId: updated.id, status: updated.status, decidedAt: updated.decided_at, editedMetadata: null, currentDrift: null, frozenSuggestQty: null, linkedPOs: linkedPOMap.get(updated.id) ?? [] } as RecRef;
            } catch (err) {
                console.error("[purchase-copilot] levelChanged update failed", item.productId, err);
                return { productId: item.productId, recommendationId: null, status: "error", decidedAt: null, editedMetadata: null, currentDrift: null, frozenSuggestQty: null, linkedPOs: [] } as RecRef;
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
                frozenSuggestQty: null,
                linkedPOs: linkedPOMap.get(rec.id) ?? [],
            };
        });

        // Decided rec'ler — frozen metadata + drift bilgisi.
        // Audit 6. tur Fix 1: items'a bağımlı değil — decidedRecMap tüm aktif
        // decided rec'leri içeriyor (out-of-scope dahil), her biri response'a girer.
        // Audit 8. tur Fix 4: silinmiş ürün decided rec response'a girmesin
        // (orphan cleanup henüz tetiklenmediyse UI'da ölü kayıt görünmemeli).
        // Audit 11. tur Fix 2: frozenSuggestQty meta.suggestQty'den çekilir →
        // UI accepted/rejected satırlarda kararı verilen miktarı gösterir.
        const decidedRefs: RecRef[] = Array.from(decidedRecMap.entries())
            .filter(([productId]) => productMap.has(productId))
            .map(([productId, rec]) => {
                const meta = rec.metadata as Record<string, unknown> | null;
                const frozen = typeof meta?.suggestQty === "number" ? (meta.suggestQty as number) : null;
                return {
                    productId,
                    recommendationId: rec.id,
                    status: rec.status,
                    decidedAt: rec.decided_at,
                    editedMetadata: rec.edited_metadata as Record<string, unknown> | null,
                    currentDrift: driftMap.get(productId) ?? null,
                    frozenSuggestQty: frozen,
                    linkedPOs: linkedPOMap.get(rec.id) ?? [],
                };
            });

        const [, upsertResults, levelChangedResults] = await Promise.all([
            expirePromise,
            Promise.all(upsertPromises),
            Promise.all(levelChangedPromises),
        ]);
        recommendations.push(...upsertResults, ...levelChangedResults, ...levelSameRefs, ...decidedRefs);
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
