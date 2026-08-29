import { createServiceClient } from "./service";
import { orIlikeFilter } from "@/lib/list-query";
import type {
    DeveloperBugPriority,
    DeveloperBugRow,
    DeveloperBugStatus,
    SystemErrorGroupRow,
} from "@/lib/database.types";

/**
 * Bug takibi (Developer Console §11).
 *
 * Ayrım bilinçli: **error** sistemin otomatik ürettiği teknik olaydır ve
 * `system_error_groups`'ta yaşar; **bug** geliştiricinin takip ettiği
 * problemdir ve elle yönetilir. Bir bug sıfır, bir veya birden çok hata
 * grubuna bağlanabilir — "aynı kök nedenin üç ayrı belirtisi" hâli.
 */

// Sabitler/etiketler istemciyle paylaşıldığı için `telemetry/console-types.ts`'te.
// Buradan yeniden dışa vurulur — sunucu tarafı çağıranların import'u değişmesin.
import { BUG_STATUSES } from "@/lib/telemetry/console-types";

export {
    BUG_PRIORITIES,
    BUG_PRIORITY_LABELS,
    BUG_STATUSES,
    BUG_STATUS_LABELS,
    isBugPriority,
    isBugStatus,
} from "@/lib/telemetry/console-types";

/** Bug artık aktif takipte değil — closed_at bu durumlarda damgalanır. */
const TERMINAL_STATUSES: readonly DeveloperBugStatus[] = ["closed", "ignored", "fixed"] as const;

/**
 * PostgREST gömülü ilişki düzleştirici. İlişki, şema ipucuna göre tekil nesne
 * ya da dizi olarak gelir; tip katmanı `any[]` varsayar. Tek yerde çözülür ki
 * her çağıran aynı savunmayı tekrar yazmasın.
 */
function flattenRelation<T>(rows: unknown, key: string): T[] {
    if (!Array.isArray(rows)) return [];
    const out: T[] = [];
    for (const row of rows as Array<Record<string, unknown>>) {
        const rel = row?.[key];
        if (Array.isArray(rel)) out.push(...(rel as T[]));
        else if (rel) out.push(rel as T);
    }
    return out;
}

export interface BugWithErrors extends DeveloperBugRow {
    relatedErrors: SystemErrorGroupRow[];
}

export interface BugFilters {
    status?: DeveloperBugStatus | null;
    priority?: DeveloperBugPriority | null;
    search?: string | null;
    limit?: number;
}

export async function dbListBugs(filters: BugFilters = {}): Promise<DeveloperBugRow[]> {
    const supabase = createServiceClient();
    let query = supabase
        .from("developer_bugs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(Math.min(200, Math.max(1, filters.limit ?? 100)));

    if (filters.status) query = query.eq("status", filters.status);
    if (filters.priority) query = query.eq("priority", filters.priority);
    if (filters.search?.trim()) {
        query = query.or(orIlikeFilter(["title", "description", "developer_notes"], filters.search));
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []) as DeveloperBugRow[];
}

export async function dbGetBug(id: string): Promise<BugWithErrors | null> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("developer_bugs")
        .select("*")
        .eq("id", id)
        .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;

    return { ...(data as DeveloperBugRow), relatedErrors: await dbErrorsForBug(id) };
}

/** Bir bug'a bağlı hata grupları. */
export async function dbErrorsForBug(bugId: string): Promise<SystemErrorGroupRow[]> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("developer_bug_errors")
        .select("error_group_id, system_error_groups(*)")
        .eq("bug_id", bugId);
    if (error) throw new Error(error.message);

    // PostgREST gömülü ilişkiyi tekil nesne VEYA dizi olarak döndürebilir
    // (şema ipucuna göre); ikisi de karşılanır.
    return flattenRelation<SystemErrorGroupRow>(data, "system_error_groups");
}

/** Bir hata grubuna bağlı bug'lar — hata detayında "bu zaten takipte" göstergesi. */
export async function dbBugsForErrorGroup(groupId: string): Promise<DeveloperBugRow[]> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("developer_bug_errors")
        .select("bug_id, developer_bugs(*)")
        .eq("error_group_id", groupId);
    if (error) throw new Error(error.message);

    return flattenRelation<DeveloperBugRow>(data, "developer_bugs");
}

export interface CreateBugInput {
    title: string;
    description?: string | null;
    priority?: DeveloperBugPriority;
    status?: DeveloperBugStatus;
    developerNotes?: string | null;
    createdBy: string | null;
    assignedTo?: string | null;
    /** Hata detayından "Bug Oluştur" ile gelindiğinde otomatik bağlanır. */
    errorGroupIds?: string[];
}

export async function dbCreateBug(input: CreateBugInput): Promise<BugWithErrors> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("developer_bugs")
        .insert({
            title: input.title.trim(),
            description: input.description?.trim() || null,
            priority: input.priority ?? "medium",
            status: input.status ?? "open",
            developer_notes: input.developerNotes?.trim() || null,
            created_by: input.createdBy,
            assigned_to: input.assignedTo ?? null,
        })
        .select("*")
        .single();
    if (error) throw new Error(error.message);

    const bug = data as DeveloperBugRow;
    const ids = input.errorGroupIds ?? [];
    if (ids.length > 0) await dbLinkBugErrors(bug.id, ids);

    return { ...bug, relatedErrors: await dbErrorsForBug(bug.id) };
}

export interface UpdateBugPatch {
    title?: string;
    description?: string | null;
    status?: DeveloperBugStatus;
    priority?: DeveloperBugPriority;
    developerNotes?: string | null;
    assignedTo?: string | null;
}

export async function dbUpdateBug(id: string, patch: UpdateBugPatch): Promise<BugWithErrors | null> {
    const supabase = createServiceClient();
    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (patch.title !== undefined) payload.title = patch.title.trim();
    if (patch.description !== undefined) payload.description = patch.description?.trim() || null;
    if (patch.priority !== undefined) payload.priority = patch.priority;
    if (patch.developerNotes !== undefined) {
        payload.developer_notes = patch.developerNotes?.trim() || null;
    }
    if (patch.assignedTo !== undefined) payload.assigned_to = patch.assignedTo;
    if (patch.status !== undefined) {
        payload.status = patch.status;
        // Kapanış damgası duruma BAĞLI: tekrar açılırsa temizlenir, yoksa
        // "kapandı" tarihi yanlış kalırdı.
        payload.closed_at = TERMINAL_STATUSES.includes(patch.status)
            ? new Date().toISOString()
            : null;
    }

    const { data, error } = await supabase
        .from("developer_bugs")
        .update(payload)
        .eq("id", id)
        .select("*")
        .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;

    return { ...(data as DeveloperBugRow), relatedErrors: await dbErrorsForBug(id) };
}

/** Bağ kurma idempotent — aynı bağ iki kez eklenirse hata değil, no-op. */
export async function dbLinkBugErrors(bugId: string, errorGroupIds: string[]): Promise<void> {
    if (errorGroupIds.length === 0) return;
    const supabase = createServiceClient();
    const { error } = await supabase
        .from("developer_bug_errors")
        .upsert(
            errorGroupIds.map(id => ({ bug_id: bugId, error_group_id: id })),
            { onConflict: "bug_id,error_group_id", ignoreDuplicates: true },
        );
    if (error) throw new Error(error.message);
}

export async function dbUnlinkBugError(bugId: string, errorGroupId: string): Promise<void> {
    const supabase = createServiceClient();
    const { error } = await supabase
        .from("developer_bug_errors")
        .delete()
        .eq("bug_id", bugId)
        .eq("error_group_id", errorGroupId);
    if (error) throw new Error(error.message);
}

/** Genel bakış kartı: durum bazlı bug sayıları. */
export async function dbBugCounts(): Promise<Record<DeveloperBugStatus, number>> {
    const supabase = createServiceClient();
    const { data, error } = await supabase.from("developer_bugs").select("status").limit(5_000);
    if (error) throw new Error(error.message);

    const counts = Object.fromEntries(BUG_STATUSES.map(s => [s, 0])) as Record<DeveloperBugStatus, number>;
    for (const row of (data ?? []) as Array<{ status: DeveloperBugStatus }>) {
        if (row.status in counts) counts[row.status]++;
    }
    return counts;
}
