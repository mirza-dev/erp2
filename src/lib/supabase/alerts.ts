import { createServiceClient } from "./service";
import type { AlertRow, AlertType, AlertSeverity, AlertStatus } from "@/lib/database.types";

export interface CreateAlertInput {
    type: AlertType;
    severity: AlertSeverity;
    title: string;
    description?: string;
    entity_type?: string;
    entity_id?: string;
    ai_inputs_summary?: Record<string, unknown>;
    source?: "system" | "ai" | "ui";
    ai_confidence?: number;
    ai_reason?: string;
    ai_model_version?: string;
    /** 090 — kullanıcı notu hatırlatma tarihi ("YYYY-MM-DD"). */
    due_date?: string | null;
    /** 090 — oluşturan kullanıcının görünen adı (snapshot). */
    created_by?: string | null;
}

export interface ListAlertsFilter {
    status?: AlertStatus;
    severity?: AlertSeverity;
    type?: AlertType;
    entity_type?: string;
    entity_id?: string;
}

// ── Queries ──────────────────────────────────────────────────

/**
 * Liste sorgusu daraltma seçenekleri (perf Faz 5). DEFAULT DAVRANIŞ DEĞİŞMEZ:
 * opts verilmezse select("*") + limitsiz kalır — alert-service scan/dedup ve
 * ops-summary tam satır okur, kırılmasın. Yalnız GET /api/alerts route'u
 * (tek tüketicisi UI liste görünümü) kolon+limit geçer: ai_inputs_summary /
 * ai_reason gibi büyük alanlar listede okunmuyor; ~479KB → ~80KB.
 */
export interface ListAlertsOptions {
    limit?: number;
    columns?: string;
}

export async function dbListAlerts(
    filter: ListAlertsFilter = {},
    opts: ListAlertsOptions = {},
): Promise<AlertRow[]> {
    const supabase = createServiceClient();
    let query = supabase
        .from("alerts")
        .select(opts.columns ?? "*")
        .order("created_at", { ascending: false });

    if (filter.status)      query = query.eq("status", filter.status);
    if (filter.severity)    query = query.eq("severity", filter.severity);
    if (filter.type)        query = query.eq("type", filter.type);
    if (filter.entity_type) query = query.eq("entity_type", filter.entity_type);
    if (filter.entity_id)   query = query.eq("entity_id", filter.entity_id);
    if (opts.limit)         query = query.limit(opts.limit);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as AlertRow[];
}

/**
 * Aktif (open + acknowledged) uyarı ADEDİ (head+count — satır taşımaz).
 * Tanım data-context/Uyarılar sayfası istatistiğiyle birebir: ack'lenen uyarı
 * görülmüştür ama koşul sürer; sayaçtan düşmez. /api/dashboard/counters için.
 */
export async function dbCountActiveAlerts(): Promise<number> {
    const supabase = createServiceClient();
    const { count, error } = await supabase
        .from("alerts")
        .select("id", { count: "exact", head: true })
        .in("status", ["open", "acknowledged"]);
    if (error) throw new Error(error.message);
    return count ?? 0;
}

/**
 * Takvim görünümü için sınırları açık liste:
 *  - TÜM aktif (open|acknowledged) uyarılar — yaşına bakılmaz, asla kesilmez
 *  - kapanmış (resolved|dismissed) uyarılardan son `monthsBack` aydakiler
 *
 * Gerekçe: limitsiz `select *` Supabase'in varsayılan 1000 satır tavanında
 * SESSİZCE kesiliyordu; eski geçmiş ve (en kötüsü) tavana takılan aktif
 * uyarılar görünmez olabiliyordu. Pencereli iki sorgu + yüksek explicit limit
 * ile kesilme görünür/kontrollü hale gelir.
 */
export async function dbListAlertsForCalendar(monthsBack = 6): Promise<AlertRow[]> {
    const supabase = createServiceClient();
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - monthsBack);

    const [active, closed] = await Promise.all([
        supabase
            .from("alerts")
            .select("*")
            .in("status", ["open", "acknowledged"])
            .order("created_at", { ascending: false })
            .limit(5000),
        supabase
            .from("alerts")
            .select("*")
            .in("status", ["resolved", "dismissed"])
            .gte("created_at", cutoff.toISOString())
            .order("created_at", { ascending: false })
            .limit(5000),
    ]);
    if (active.error) throw new Error(active.error.message);
    if (closed.error) throw new Error(closed.error.message);

    return [...(active.data ?? []), ...(closed.data ?? [])]
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

export async function dbGetAlertById(id: string): Promise<AlertRow | null> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("alerts").select("*").eq("id", id).single();
    if (error || !data) return null;
    return data;
}

/**
 * Check if an active (open OR acknowledged) alert already exists for this entity.
 * Acknowledged alerts are still active — user has seen them but condition persists.
 * Both statuses block new alert creation (deduplicate).
 */
export async function dbOpenAlertExists(type: AlertType, entityId: string): Promise<boolean> {
    const supabase = createServiceClient();
    const { count } = await supabase
        .from("alerts")
        .select("*", { count: "exact", head: true })
        .eq("type", type)
        .eq("entity_id", entityId)
        .in("status", ["open", "acknowledged"]);
    return (count ?? 0) > 0;
}

/**
 * Creates an alert. Returns null if a duplicate active alert exists
 * (unique index idx_alerts_active_dedup blocks it — error code 23505).
 */
export async function dbCreateAlert(input: CreateAlertInput): Promise<AlertRow | null> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("alerts")
        .insert({
            type: input.type,
            severity: input.severity,
            title: input.title,
            description: input.description ?? null,
            entity_type: input.entity_type ?? null,
            entity_id: input.entity_id ?? null,
            ai_inputs_summary: input.ai_inputs_summary ?? null,
            status: "open",
            source: input.source ?? "system",
            ai_confidence: input.ai_confidence ?? null,
            ai_reason: input.ai_reason ?? null,
            ai_model_version: input.ai_model_version ?? null,
            due_date: input.due_date ?? null,
            created_by: input.created_by ?? null,
        })
        .select("*")
        .single();
    if (error) {
        // 23505 = unique_violation — duplicate active alert, safe to ignore
        if (error.code === "23505") return null;
        throw new Error(error.message);
    }
    return data;
}

export async function dbUpdateAlertStatus(
    id: string,
    status: AlertStatus,
    reason?: string
): Promise<AlertRow> {
    const supabase = createServiceClient();
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { status };

    if (status === "acknowledged") updates.acknowledged_at = now;
    if (status === "resolved")     { updates.resolved_at = now; if (reason) updates.resolution_reason = reason; }
    if (status === "dismissed") {
        updates.dismissed_at = now;
        if (reason) updates.resolution_reason = reason;
        // Sprint A G8: severity'yi yoksay zamanında yakala (24h dedup + escalation bypass için).
        const { data: cur } = await supabase
            .from("alerts").select("severity").eq("id", id).maybeSingle();
        if (cur?.severity) updates.dismissed_severity = cur.severity;
    }

    const { data, error } = await supabase
        .from("alerts").update(updates).eq("id", id).select("*").single();
    if (error || !data) throw new Error(error?.message ?? "Alert update failed");
    return data;
}

/**
 * Dismiss all active (open OR acknowledged) alerts from a given source (e.g. "ai").
 * Acknowledged AI alerts are still active and should be replaced on regeneration.
 */
export async function dbDismissAlertsBySource(source: "system" | "ai" | "ui"): Promise<number> {
    const supabase = createServiceClient();
    const now = new Date().toISOString();
    const { data, error } = await supabase
        .from("alerts")
        .update({ status: "dismissed", dismissed_at: now, resolution_reason: "replaced_by_new_generation" })
        .eq("source", source)
        .in("status", ["open", "acknowledged"])
        .select("id");
    if (error) throw new Error(error.message);
    return data?.length ?? 0;
}

/**
 * Resolve all active (open OR acknowledged) alerts of a given type for an entity.
 * Acknowledged alerts represent a condition the user has seen but not yet resolved;
 * when the underlying condition clears, they must be auto-resolved too.
 */
export async function dbResolveAlertsForEntity(
    type: AlertType,
    entityId: string,
    reason = "stock_recovered"
): Promise<number> {
    const supabase = createServiceClient();
    const now = new Date().toISOString();
    const { data, error } = await supabase
        .from("alerts")
        .update({ status: "resolved", resolved_at: now, resolution_reason: reason })
        .eq("type", type)
        .eq("entity_id", entityId)
        .in("status", ["open", "acknowledged"])
        .select("id");
    if (error) throw new Error(error.message);
    return data?.length ?? 0;
}

/**
 * Aktif (open|acknowledged) bir alert'in içeriğini yerinde günceller.
 * order_deadline gibi metni dinamik (gün sayısı) alertlerde resolve+create
 * churn'ü yerine kullanılır: created_at/status değişmez, takvimde yeni
 * "çözüldü" kopyaları birikmez. Güncellenen satır sayısını döner (0 = aktif yok).
 */
export async function dbUpdateActiveAlertContent(
    type: AlertType,
    entityId: string,
    content: { title: string; description: string },
): Promise<number> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("alerts")
        .update({ title: content.title, description: content.description })
        .eq("type", type)
        .eq("entity_id", entityId)
        .in("status", ["open", "acknowledged"])
        .select("id");
    if (error) throw new Error(error.message);
    return data?.length ?? 0;
}

// ── Batch operations (N+1 optimization) ─────────────────────────

/**
 * Fetch all active (open + acknowledged) alerts in one query.
 * Used by serviceScanStockAlerts to build an in-memory dedup Set
 * instead of querying dbOpenAlertExists per product.
 */
export async function dbListActiveAlerts(): Promise<AlertRow[]> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("alerts")
        .select("*")
        .in("status", ["open", "acknowledged"]);
    if (error) throw new Error(error.message);
    return data ?? [];
}

/**
 * Sprint A G8: Son N saatte yoksaylanan (status='dismissed' AND dismissed_at >= now-Nh)
 * alert'leri getirir. Scan'de "yoksaydığı uyarıyı 5 dk sonra geri verme" davranışını
 * kapatmak için kullanılır.
 *
 * Sadece dedup hedef tipler döner (stock_critical, stock_risk, order_deadline, order_shortage)
 * — purchase_recommended (AI) bu kuraldan muaf, AI'ın kendi mantığı var.
 */
export async function dbListRecentlyDismissed(hoursBack = 24): Promise<AlertRow[]> {
    const supabase = createServiceClient();
    const cutoff = new Date(Date.now() - hoursBack * 3600 * 1000).toISOString();
    const { data, error } = await supabase
        .from("alerts")
        .select("*")
        .eq("status", "dismissed")
        .gte("dismissed_at", cutoff)
        .in("type", ["stock_critical", "stock_risk", "order_deadline", "order_shortage"]);
    if (error) throw new Error(error.message);
    return data ?? [];
}

export interface BatchResolveEntry {
    type: AlertType;
    entityId: string;
    reason: string;
}

/**
 * Batch-resolve active alerts, grouped by type+reason for efficient DB calls.
 * Replaces per-product dbResolveAlertsForEntity calls in the scan loop.
 */
export async function dbBatchResolveAlerts(entries: BatchResolveEntry[]): Promise<number> {
    if (entries.length === 0) return 0;
    const supabase = createServiceClient();
    const now = new Date().toISOString();
    let total = 0;

    // Group by type::reason → entityIds[]
    const groups = new Map<string, string[]>();
    for (const e of entries) {
        const key = `${e.type}::${e.reason}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(e.entityId);
    }

    for (const [key, entityIds] of groups) {
        const [type, reason] = key.split("::");
        const { data, error } = await supabase
            .from("alerts")
            .update({ status: "resolved", resolved_at: now, resolution_reason: reason })
            .eq("type", type)
            .in("entity_id", entityIds)
            .in("status", ["open", "acknowledged"])
            .select("id");
        if (error) throw new Error(error.message);
        total += data?.length ?? 0;
    }

    return total;
}
