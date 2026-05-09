import { createServiceClient } from "./service";
import type {
    AiRecommendationRow,
    RecommendationType,
    RecommendationStatus,
    FeedbackType,
} from "@/lib/database.types";

export interface UpsertRecommendationInput {
    entity_type: string;
    entity_id: string;
    recommendation_type: RecommendationType;
    title: string;
    body?: string | null;
    confidence?: number | null;
    severity?: "critical" | "warning" | "info";
    model_version?: string | null;
    metadata?: Record<string, unknown> | null;
}

export interface ListRecommendationsFilter {
    entity_type?: string;
    entity_id?: string;
    recommendation_type?: RecommendationType;
    status?: RecommendationStatus;
    /**
     * Audit 7. tur Fix 3: birden fazla status'u tek sorguda filtrele.
     * `status` ile birlikte verilirse `status` ihmal edilir; sadece `statusIn`
     * uygulanır (`.in("status", [...])`). Büyük tabloda copilot route'unun
     * SELECT-then-JS-filter overhead'ini engeller.
     */
    statusIn?: RecommendationStatus[];
}

export interface UpdateRecommendationStatusOpts {
    editedMetadata?: Record<string, unknown>;
    feedbackNote?: string;
    actor?: string;
}

// Valid transitions from a given status
const VALID_TRANSITIONS: Partial<Record<RecommendationStatus, RecommendationStatus[]>> = {
    suggested: ["accepted", "edited", "rejected", "expired"],
    // "Kararı geri al" — user can undo any decision back to suggested
    accepted:  ["suggested"],
    edited:    ["suggested"],
    rejected:  ["suggested"],
};

// ── Queries ──────────────────────────────────────────────────

/**
 * Insert a new recommendation row. Only call this when there is no active
 * recommendation for the entity+type (i.e. after checking with
 * dbGetActiveRecommendationsForEntities). Does not overwrite existing rows.
 */
export async function dbUpsertRecommendation(
    input: UpsertRecommendationInput
): Promise<AiRecommendationRow> {
    const supabase = createServiceClient();

    // Guard: if a "suggested" row already exists, return it unchanged.
    // Callers should use dbGetActiveRecommendationsForEntities to check first;
    // this is a safety net to prevent silent overwrites.
    const { data: existing } = await supabase
        .from("ai_recommendations")
        .select("*")
        .eq("entity_type", input.entity_type)
        .eq("entity_id", input.entity_id)
        .eq("recommendation_type", input.recommendation_type)
        .eq("status", "suggested")
        .maybeSingle();

    if (existing) return existing;

    const { data, error } = await supabase
        .from("ai_recommendations")
        .insert({
            entity_type: input.entity_type,
            entity_id: input.entity_id,
            recommendation_type: input.recommendation_type,
            title: input.title,
            body: input.body ?? null,
            confidence: input.confidence ?? null,
            severity: input.severity ?? "info",
            model_version: input.model_version ?? null,
            metadata: input.metadata ?? null,
        })
        .select("*")
        .single();
    if (error || !data) throw new Error(error?.message ?? "Recommendation creation failed");
    return data;
}

export async function dbListRecommendations(
    filter: ListRecommendationsFilter = {}
): Promise<AiRecommendationRow[]> {
    const supabase = createServiceClient();
    let query = supabase
        .from("ai_recommendations")
        .select("*")
        .order("created_at", { ascending: false });

    if (filter.entity_type)        query = query.eq("entity_type", filter.entity_type);
    if (filter.entity_id)          query = query.eq("entity_id", filter.entity_id);
    if (filter.recommendation_type) query = query.eq("recommendation_type", filter.recommendation_type);
    if (filter.statusIn && filter.statusIn.length > 0) {
        query = query.in("status", filter.statusIn);
    } else if (filter.status) {
        query = query.eq("status", filter.status);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data ?? [];
}

export async function dbGetRecommendationById(id: string): Promise<AiRecommendationRow | null> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("ai_recommendations").select("*").eq("id", id).single();
    if (error || !data) return null;
    return data;
}

/**
 * Transition a recommendation to a new status.
 * Only suggested → accepted|edited|rejected|expired is valid.
 * Creates an ai_feedback row for every non-expire transition.
 */
export async function dbUpdateRecommendationStatus(
    id: string,
    status: RecommendationStatus,
    opts: UpdateRecommendationStatusOpts = {}
): Promise<AiRecommendationRow> {
    const supabase = createServiceClient();

    const current = await dbGetRecommendationById(id);
    if (!current) throw new Error(`Recommendation ${id} not found`);

    const allowedNext = VALID_TRANSITIONS[current.status] ?? [];
    if (!allowedNext.includes(status)) {
        throw new Error(`Invalid status transition: ${current.status} → ${status}`);
    }

    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { status, decided_at: now };

    if (status === "edited" && opts.editedMetadata) {
        updates.edited_metadata = opts.editedMetadata;
    }
    if (status === "expired") {
        updates.expired_at = now;
        updates.decided_at = null;
    }
    // "Kararı geri al" — undo reverts to undecided state
    if (status === "suggested") {
        updates.decided_at = null;
        updates.edited_metadata = null;
    }

    const { data, error } = await supabase
        .from("ai_recommendations")
        .update(updates)
        .eq("id", id)
        .select("*")
        .single();
    if (error || !data) throw new Error(error?.message ?? "Recommendation status update failed");

    // Record feedback — skip for system actions (expire) and undos (suggested)
    if (status !== "expired" && status !== "suggested") {
        const feedbackType = status as FeedbackType;
        await supabase.from("ai_feedback").insert({
            recommendation_id: id,
            feedback_type: feedbackType,
            feedback_note: opts.feedbackNote ?? null,
            edited_values: opts.editedMetadata ?? null,
            actor: opts.actor ?? null,
        });
    }

    return data;
}

/**
 * Fetch the most-recent active recommendation (suggested | accepted | edited | rejected)
 * per entity_id for a set of entity IDs. Used to skip AI re-enrichment and re-upsert
 * for entities that already have a decision on record.
 */
export async function dbGetActiveRecommendationsForEntities(
    entityType: string,
    entityIds: string[],
    recommendationType: RecommendationType
): Promise<AiRecommendationRow[]> {
    if (entityIds.length === 0) return [];
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("ai_recommendations")
        .select("*")
        .eq("entity_type", entityType)
        .eq("recommendation_type", recommendationType)
        .in("entity_id", entityIds)
        .in("status", ["suggested", "accepted", "edited", "rejected"])
        .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    // One row per entity_id — keep most recent.
    // accepted/edited/rejected are treated as "active" only for 7 days after
    // the decision (decided_at). Older decided rows are treated as stale so
    // the caller regenerates a fresh suggestion for the entity.
    const DECIDED_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const seen = new Set<string>();
    return (data ?? []).filter(r => {
        if (seen.has(r.entity_id)) return false;
        seen.add(r.entity_id);
        if (r.status === "suggested") return true;
        // accepted / edited / rejected: check decision age
        const pivot = r.decided_at ?? r.created_at;
        return now - new Date(pivot).getTime() < DECIDED_MAX_AGE_MS;
    });
}

/**
 * Expire "suggested" recommendations that were created more than
 * `olderThanHours` hours ago and have not yet been acted on.
 *
 * `recommendationType` opsiyonel:
 *   - omit → tüm rec türlerinde stale 'suggested'lar expire edilir (global TTL)
 *   - belirtildi → yalnızca o tipin stale 'suggested'ları (purchase cron'unun
 *     diğer rec tiplerini etkilememesi için scope dar tutulur)
 *
 * Call at the start of every copilot route run so stale suggestions
 * don't block re-generation indefinitely.
 */
export async function dbExpireStaleRecommendations(
    olderThanHours = 48,
    recommendationType?: RecommendationType,
): Promise<number> {
    const supabase = createServiceClient();
    const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();
    let query = supabase
        .from("ai_recommendations")
        .update({ status: "expired", expired_at: now })
        .eq("status", "suggested")
        .lt("created_at", cutoff);
    if (recommendationType) query = query.eq("recommendation_type", recommendationType);
    const { data, error } = await query.select("id");
    if (error) throw new Error(error.message);
    return data?.length ?? 0;
}

/**
 * Expire all "suggested" recommendations for the given entity+type
 * whose entity_id is NOT in the provided list.
 * Used when the purchase copilot regenerates — products no longer
 * below min stock should have their suggestions expired.
 *
 * Aktif liste boşsa no-op döner (defensive: aksi halde `.not(...in)` clause
 * tüm rec'leri expire ederdi). "Tüm aktif suggested'ları expire et" senaryosu
 * için `dbExpireAllSuggestedRecommendations` kullan.
 */
export async function dbExpireSuggestedRecommendations(
    entityType: string,
    activeEntityIds: string[],
    recommendationType: RecommendationType
): Promise<number> {
    if (activeEntityIds.length === 0) return 0;
    const supabase = createServiceClient();
    const now = new Date().toISOString();
    const { data, error } = await supabase
        .from("ai_recommendations")
        .update({ status: "expired", expired_at: now })
        .eq("entity_type", entityType)
        .eq("recommendation_type", recommendationType)
        .eq("status", "suggested")
        .not("entity_id", "in", `("${activeEntityIds.join('","')}")`)
        .select("id");
    if (error) throw new Error(error.message);
    return data?.length ?? 0;
}

/**
 * G11: Belirli (entity_type, recommendation_type) için TÜM aktif 'suggested'
 * rec'leri expire eder. `dbExpireSuggestedRecommendations` boş aktif listesinde
 * no-op olduğundan, bütün ürünler stok üstüne çıkıp `needsPurchase=[]` olduğunda
 * orphan suggested'ları temizlemek için kullanılır.
 */
export async function dbExpireAllSuggestedRecommendations(
    entityType: string,
    recommendationType: RecommendationType,
): Promise<number> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("ai_recommendations")
        .update({ status: "expired", expired_at: new Date().toISOString() })
        .eq("entity_type", entityType)
        .eq("recommendation_type", recommendationType)
        .eq("status", "suggested")
        .select("id");
    if (error) throw new Error(error.message);
    return data?.length ?? 0;
}

/**
 * Sprint C G1: Expire all ACTIVE recommendations (including user decisions)
 * whose entity_id is no longer in the active entity list — i.e. the entity
 * was deleted or deactivated.
 *
 * Different from `dbExpireSuggestedRecommendations`:
 *   - That one only touches "suggested" rows (system state).
 *   - This one also expires "accepted"/"edited"/"rejected" rows because the
 *     entity itself no longer exists; keeping the decision causes ghost
 *     suggestions to reappear if the entity is reactivated.
 *
 * Safety: empty `validEntityIds` → no-op (returns 0). Caller must pass the
 * full active set; otherwise valid recs would be wiped.
 */
export async function dbExpireRecommendationsForMissingEntities(
    entityType: string,
    validEntityIds: string[],
    recommendationType: RecommendationType
): Promise<number> {
    if (validEntityIds.length === 0) return 0;
    const supabase = createServiceClient();
    const now = new Date().toISOString();
    const { data, error } = await supabase
        .from("ai_recommendations")
        .update({ status: "expired", expired_at: now })
        .eq("entity_type", entityType)
        .eq("recommendation_type", recommendationType)
        .in("status", ["suggested", "accepted", "edited", "rejected"])
        .not("entity_id", "in", `("${validEntityIds.join('","')}")`)
        .select("id");
    if (error) throw new Error(error.message);
    return data?.length ?? 0;
}

/**
 * G11 diff-merge: mevcut bir rec'in metadata'sındaki belirli alanları
 * günceller (suggestQty, urgencyPct, coverageDays, targetStock, formula).
 * AI metni (aiWhyNow, aiQuantityRationale, aiUrgencyLevel) korunur.
 *
 * GET → JS-merge → UPDATE — JSONB tüm key'leri overwrite etmesin diye.
 * Best-effort: rec yoksa veya update fail olursa sessizce çıkar.
 */
export async function dbUpdateRecommendationMetadata(
    id: string,
    metadataPatch: Record<string, unknown>,
): Promise<void> {
    const supabase = createServiceClient();
    const current = await dbGetRecommendationById(id);
    if (!current) return;
    const merged = {
        ...((current.metadata as Record<string, unknown> | null) ?? {}),
        ...metadataPatch,
    };
    await supabase
        .from("ai_recommendations")
        .update({ metadata: merged })
        .eq("id", id);
}

/**
 * Immediately expire active recommendations for a single entity.
 *
 * Status kapsamı `recommendationType`'a göre değişir:
 *   - omit (silme akışı) → tüm tipler + tüm aktif statüler (suggested/accepted/edited/rejected).
 *     Ürün silindi/deaktif edildi: kullanıcı kararları dahil her şey expire edilir.
 *   - belirtildi (G11 diff-merge: level değişimi) → o tipte SADECE 'suggested' expire edilir.
 *     Defansif: aynı entity için (invariant kırılırsa) bir decided rec varsa
 *     yanlışlıkla expire edilmez. "Decided rec frozen" kuralı korunur.
 *
 * Hata durumu: error throw edilir. Caller'lar best-effort cleanup için kendi
 * try/catch'lerini kullanmalı; sessiz fail önceki sürümde yeni AI içeriğinin
 * silent dedupe'a düşmesine yol açıyordu (audit 3. tur Fix 5).
 */
export async function dbExpireEntityRecommendations(
    entityId: string,
    entityType: string,
    recommendationType?: RecommendationType,
): Promise<number> {
    const supabase = createServiceClient();
    let query = supabase
        .from("ai_recommendations")
        .update({ status: "expired", expired_at: new Date().toISOString() })
        .eq("entity_id", entityId)
        .eq("entity_type", entityType);
    if (recommendationType) {
        query = query
            .eq("recommendation_type", recommendationType)
            .eq("status", "suggested");
    } else {
        query = query.in("status", ["suggested", "accepted", "edited", "rejected"]);
    }
    const { data, error } = await query.select("id");
    if (error) throw new Error(error.message);
    return data?.length ?? 0;
}

/**
 * G11 audit 3. tur Fix 5: mevcut bir 'suggested' rec'in tüm dynamic alanlarını
 * (body, confidence, severity, model_version, metadata) atomik olarak günceller.
 *
 * Level-değişim akışında "expire eski + insert yeni" dansının çift çağrı +
 * silent fail problemini çözer: tek UPDATE'le hem yeni AI metni hem yeni
 * metadata hem severity/confidence yazılır. Rec ID stable kalır → UI'nın
 * recommendationId reference'ı bozulmaz.
 *
 * Sadece status='suggested' rec'leri günceller (decided dokunulmaz, defansif).
 */
export async function dbUpdateSuggestedRecommendation(
    id: string,
    patch: {
        body?: string | null;
        confidence?: number | null;
        severity?: "critical" | "warning" | "info";
        model_version?: string | null;
        metadata?: Record<string, unknown>;
    },
): Promise<AiRecommendationRow> {
    const supabase = createServiceClient();
    const updates: Record<string, unknown> = {};
    if (patch.body !== undefined) updates.body = patch.body;
    if (patch.confidence !== undefined) updates.confidence = patch.confidence;
    if (patch.severity !== undefined) updates.severity = patch.severity;
    if (patch.model_version !== undefined) updates.model_version = patch.model_version;
    if (patch.metadata !== undefined) {
        // Metadata mevcut ile JS-merge: caller'ın geçtiği key'ler overwrite,
        // diğerleri korunur (JSONB tüm key'leri replace etmesin).
        const current = await dbGetRecommendationById(id);
        const existing = (current?.metadata as Record<string, unknown> | null) ?? {};
        updates.metadata = { ...existing, ...patch.metadata };
    }
    const { data, error } = await supabase
        .from("ai_recommendations")
        .update(updates)
        .eq("id", id)
        .eq("status", "suggested")
        .select("*")
        .single();
    if (error || !data) throw new Error(error?.message ?? `Recommendation ${id} update failed (no suggested row?)`);
    return data;
}
