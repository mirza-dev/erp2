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
    if (filter.status)             query = query.eq("status", filter.status);

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
 * Expire all "suggested" recommendations that were created more than
 * `olderThanHours` hours ago and have not yet been acted on.
 * Call at the start of every copilot route run so stale suggestions
 * don't block re-generation indefinitely.
 */
export async function dbExpireStaleRecommendations(
    olderThanHours = 48
): Promise<number> {
    const supabase = createServiceClient();
    const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();
    const { data, error } = await supabase
        .from("ai_recommendations")
        .update({ status: "expired", expired_at: now })
        .eq("status", "suggested")
        .lt("created_at", cutoff)
        .select("id");
    if (error) throw new Error(error.message);
    return data?.length ?? 0;
}

/**
 * Expire all "suggested" recommendations for the given entity+type
 * whose entity_id is NOT in the provided list.
 * Used when the purchase copilot regenerates — products no longer
 * below min stock should have their suggestions expired.
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
 * Immediately expire all active recommendations for a single entity.
 * Called on product delete or deactivate so the purchase-suggested page
 * never shows ghost recommendations before the next copilot run.
 */
export async function dbExpireEntityRecommendations(
    entityId: string,
    entityType: string,
): Promise<void> {
    const supabase = createServiceClient();
    await supabase
        .from("ai_recommendations")
        .update({ status: "expired", expired_at: new Date().toISOString() })
        .eq("entity_id", entityId)
        .eq("entity_type", entityType)
        .in("status", ["suggested", "accepted", "edited", "rejected"]);
    // error not thrown — best-effort; lazy cleanup via copilot route is the backup
}
