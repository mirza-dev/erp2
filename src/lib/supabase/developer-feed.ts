import { createServiceClient } from "./service";
import { redactString } from "@/lib/telemetry/redact";
import { orIlikeFilter } from "@/lib/list-query";
import { dbListSystemEvents } from "./telemetry";
import { FEED_SOURCES as FEED_SOURCE_LIST } from "@/lib/telemetry/console-types";
import type { FeedEntry, FeedSource } from "@/lib/telemetry/console-types";
import type {
    AuditLogRow,
    EmailLogRow,
    IntegrationSyncLogRow,
    MaintenanceIncidentRow,
    SystemErrorEventRow,
    SystemEventRow,
    TelemetrySeverity,
} from "@/lib/database.types";

/**
 * Birleşik olay akışı (Developer Console §9 Logs, §14 Recent Activity).
 *
 * BURADA YENİ BİR LOG BORUSU KURULMAZ. ERP zaten gerçek olay üretiyor —
 * `audit_log` (kim ne yaptı), `integration_sync_logs` (Paraşüt), `email_logs`
 * (teslimat), `maintenance_incidents` (açık arıza) — ve telemetri kendi
 * olaylarını yazıyor. Bunları ikinci bir tabloya KOPYALAMAK hem yazma
 * maliyetini ikiye katlar hem de iki gerçeğin birbirinden ayrılma riskini
 * doğurur. Onun yerine okurken birleştiriyoruz: sıfır yazma yükü, sıfır
 * ekstra büyüme, %100 gerçek veri (§28).
 *
 * Bedeli: sayfalama kaynaklar arası "yaklaşık"tır — her kaynak aynı zaman
 * penceresinden kendi payını verir, TS'te birleşip sıralanır ve `before`
 * imleciyle ilerlenir. Bu ekranın işi (son olayları görmek) için doğru
 * davranış; muhasebe kesinliği gerektiren bir rapor değil.
 */

// Tipler istemciyle PAYLAŞILDIĞI için `telemetry/console-types.ts`'te; burada
// yalnız yeniden dışa vurulur (mevcut import'lar bozulmasın).
export { FEED_SOURCES, FEED_SOURCE_LABELS } from "@/lib/telemetry/console-types";
export type { FeedEntry, FeedSource } from "@/lib/telemetry/console-types";

export interface FeedFilters {
    sources?: FeedSource[];
    level?: TelemetrySeverity | null;
    module?: string | null;
    requestId?: string | null;
    userId?: string | null;
    since?: string | null;
    /** Bu zamandan ESKİ kayıtlar (cursor). */
    before?: string | null;
    search?: string | null;
    limit?: number;
}

/**
 * Akış imleci "yaklaşık"tır: altı heterojen kaynağın id uzayı ortak değil, bu
 * yüzden bileşik (ts,id) imleci kaynaklar arasında anlam taşımaz. Gelen imleç
 * bileşik biçimdeyse (hata listesinden gelmiş olabilir) yalnız zaman damgası
 * kullanılır; kaynak-içi determinizmi her sorgudaki ikincil `order by id`
 * sağlar (2026-08 O2).
 */
function cursorTs(before: string | null | undefined): string | null {
    if (!before) return null;
    const parts = before.split("|");
    return parts.length === 3 ? parts[1] : parts[0];
}

const DEFAULT_LIMIT = 60;
const MAX_LIMIT = 200;

/** Her kaynaktan çekilecek pay — birleşim sonrası kırpılır. */
function perSourceLimit(limit: number): number {
    return Math.min(MAX_LIMIT, limit + 10);
}

/** Kaynak okuyucusunun sonucu — "olay yok" ile "okunamadı" AYRI (O7). */
interface SourceResult {
    entries: FeedEntry[];
    failed: boolean;
}

const OK = (entries: FeedEntry[]): SourceResult => ({ entries, failed: false });
/** Kaynağın bu filtre ekseninde karşılığı yok → boş, ama ARIZA DEĞİL. */
const NONE: SourceResult = { entries: [], failed: false };
const FAILED: SourceResult = { entries: [], failed: true };

export async function dbActivityFeed(filters: FeedFilters = {}): Promise<{
    entries: FeedEntry[];
    nextCursor: string | null;
    unavailableSources: FeedSource[];
}> {
    const limit = Math.min(MAX_LIMIT, Math.max(1, filters.limit ?? DEFAULT_LIMIT));
    const want = new Set<FeedSource>(filters.sources?.length ? filters.sources : [...FEED_SOURCE_LIST]);
    const share = perSourceLimit(limit);
    const filters2 = { ...filters, before: cursorTs(filters.before) };

    const [telemetry, errors, audit, integration, email, incidents] = await Promise.all([
        want.has("telemetry") ? fetchTelemetry(filters2, share) : Promise.resolve(NONE),
        want.has("error") ? fetchErrors(filters2, share) : Promise.resolve(NONE),
        want.has("audit") ? fetchAudit(filters2, share) : Promise.resolve(NONE),
        want.has("integration") ? fetchIntegration(filters2, share) : Promise.resolve(NONE),
        want.has("email") ? fetchEmail(filters2, share) : Promise.resolve(NONE),
        want.has("incident") ? fetchIncidents(filters2, share) : Promise.resolve(NONE),
    ]);

    const bySource: Array<[FeedSource, SourceResult]> = [
        ["telemetry", telemetry], ["error", errors], ["audit", audit],
        ["integration", integration], ["email", email], ["incident", incidents],
    ];
    const unavailableSources = bySource.filter(([, r]) => r.failed).map(([k]) => k);

    // 2026-08 Y6: `level`/`module`/`search` artık HER kaynağın SORGUSUNA iniyor.
    // Eskiden filtresiz çekilip bellekte eleniyordu ve imleç eleme SONRASI
    // diziden hesaplanıyordu → "level=critical" seçilince ekran boş görünüp
    // "Daha fazla yükle" de kayboluyordu; bir saat önceki kritik olaylar hiçbir
    // şekilde bulunamıyordu. Artık her kaynak kendi payını FİLTRELİ getirir.
    const merged = bySource.flatMap(([, r]) => r.entries);
    merged.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

    const entries = merged.slice(0, limit);
    const nextCursor = merged.length > limit ? entries[entries.length - 1]?.occurredAt ?? null : null;
    return { entries, nextCursor, unavailableSources };
}

// ── Kaynak okuyucuları ───────────────────────────────────────────────────

/**
 * 2026-08 Nit: bu kaynak kendi sorgusunu elle kuruyordu ve `dbListSystemEvents`
 * (aynı işi sunucu-tarafı filtrelerle YAPAN fonksiyon) sıfır çağıranla ölü
 * duruyordu. Artık ona delege ediliyor — tek sorgu tanımı, tek bakım noktası.
 */
async function fetchTelemetry(f: FeedFilters, limit: number): Promise<SourceResult> {
    let data: SystemEventRow[];
    try {
        const page = await dbListSystemEvents({
            level: f.level,
            module: f.module,
            requestId: f.requestId,
            userId: f.userId,
            since: f.since,
            before: f.before,
            search: f.search,
            limit,
        });
        data = page.rows;
    } catch {
        return FAILED;
    }
    return OK(data.map(r => ({
        id: `sys:${r.id}`,
        occurredAt: r.occurred_at,
        level: r.level,
        source: "telemetry" as const,
        message: r.message,
        module: r.module,
        endpoint: r.endpoint,
        requestId: r.request_id,
        userId: r.user_id,
        errorGroupId: null,
    })));
}

async function fetchErrors(f: FeedFilters, limit: number): Promise<SourceResult> {
    const supabase = createServiceClient();
    let q = supabase
        .from("system_error_events")
        .select("*, system_error_groups!inner(id, title, severity, module)")
        .order("occurred_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(limit);
    if (f.since) q = q.gte("occurred_at", f.since);
    if (f.before) q = q.lt("occurred_at", f.before);
    if (f.requestId) q = q.eq("request_id", f.requestId);
    if (f.userId) q = q.eq("user_id", f.userId);
    // Ciddiyet ve modül GRUPTA duruyor; `!inner` join gömülü filtreye izin verir.
    if (f.level) q = q.eq("system_error_groups.severity", f.level);
    if (f.module) q = q.eq("system_error_groups.module", f.module);
    if (f.search?.trim()) {
        q = q.or(orIlikeFilter(["title", "normalized_message"], f.search), {
            referencedTable: "system_error_groups",
        });
    }

    const { data, error } = await q;
    if (error) return FAILED;

    type Joined = SystemErrorEventRow & {
        system_error_groups:
            | { id: string; title: string; severity: TelemetrySeverity; module: string | null }
            | Array<{ id: string; title: string; severity: TelemetrySeverity; module: string | null }>;
    };

    return OK(((data ?? []) as Joined[]).map(r => {
        const g = Array.isArray(r.system_error_groups) ? r.system_error_groups[0] : r.system_error_groups;
        return {
            id: `err:${r.id}`,
            occurredAt: r.occurred_at,
            level: g?.severity ?? "error",
            source: "error" as const,
            message: g?.title ?? "Hata",
            module: g?.module ?? null,
            endpoint: r.endpoint,
            requestId: r.request_id,
            userId: r.user_id,
            errorGroupId: g?.id ?? null,
        };
    }));
}

async function fetchAudit(f: FeedFilters, limit: number): Promise<SourceResult> {
    // `request_id` ve `user_id` audit_log'da karşılığı OLMAYAN eksenler; filtre
    // verilmişse bu kaynak sonuç döndürmemeli (yanlış eşleşme üretmesin).
    // 2026-08 Nit: `userId` için bu erken çıkış eksikti → kullanıcıya göre
    // filtrelendiğinde ilgisiz denetim satırları listeye karışıyordu.
    if (f.requestId || f.userId) return NONE;
    // Denetim satırları her zaman "info" seviyesindedir.
    if (f.level && f.level !== "info") return NONE;
    const supabase = createServiceClient();
    let q = supabase.from("audit_log")
        .select("id, actor, action, entity_type, entity_id, occurred_at, source")
        .order("occurred_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(limit);
    if (f.since) q = q.gte("occurred_at", f.since);
    if (f.before) q = q.lt("occurred_at", f.before);
    if (f.module) q = q.eq("entity_type", f.module);
    if (f.search?.trim()) q = q.or(orIlikeFilter(["action", "entity_type"], f.search));

    const { data, error } = await q;
    if (error) return FAILED;
    return OK(((data ?? []) as AuditLogRow[]).map(r => ({
        id: `audit:${r.id}`,
        occurredAt: r.occurred_at,
        level: "info" as const,
        source: "audit" as const,
        // Aktör serbest metin (e-posta olabilir) → redaksiyondan geçir.
        message: `${r.action} · ${r.entity_type}${r.actor ? ` · ${redactString(r.actor, 80)}` : ""}`,
        module: r.entity_type,
        endpoint: null,
        requestId: null,
        userId: null,
        errorGroupId: null,
    })));
}

async function fetchIntegration(f: FeedFilters, limit: number): Promise<SourceResult> {
    if (f.requestId || f.userId) return NONE;
    // Seviye `status`'ten türetilir: error → "error", diğerleri → "info".
    if (f.level && f.level !== "info" && f.level !== "error") return NONE;
    if (f.module && f.module !== "parasut") return NONE;
    const supabase = createServiceClient();
    let q = supabase.from("integration_sync_logs")
        .select("id, entity_type, direction, status, error_message, requested_at, step")
        .order("requested_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(limit);
    if (f.since) q = q.gte("requested_at", f.since);
    if (f.before) q = q.lt("requested_at", f.before);
    if (f.level === "error") q = q.eq("status", "error");
    if (f.level === "info") q = q.neq("status", "error");
    if (f.search?.trim()) q = q.or(orIlikeFilter(["entity_type", "error_message", "step"], f.search));

    const { data, error } = await q;
    if (error) return FAILED;
    return OK(((data ?? []) as IntegrationSyncLogRow[]).map(r => ({
        id: `sync:${r.id}`,
        occurredAt: r.requested_at,
        level: (r.status === "error" ? "error" : "info") as TelemetrySeverity,
        source: "integration" as const,
        message: `Paraşüt ${r.direction} · ${r.entity_type} · ${r.status}`
            + (r.error_message ? ` — ${redactString(r.error_message, 200)}` : ""),
        module: "parasut",
        endpoint: null,
        requestId: null,
        userId: null,
        errorGroupId: null,
    })));
}

/** Teslimat durumu → akış seviyesi. Filtre ile map AYNI kaynaktan türer. */
const EMAIL_LEVEL: Record<string, TelemetrySeverity> = {
    failed: "error", bounced: "error", complained: "warning", suppressed: "warning",
};

async function fetchEmail(f: FeedFilters, limit: number): Promise<SourceResult> {
    if (f.requestId) return NONE;
    if (f.module && f.module !== "email") return NONE;
    const statuses = Object.keys(EMAIL_LEVEL).filter(
        s => !f.level || EMAIL_LEVEL[s] === f.level,
    );
    if (statuses.length === 0) return NONE;

    const supabase = createServiceClient();
    // Yalnız SORUNLU teslimatlar akışa girer — başarılı e-posta gürültüdür.
    let q = supabase.from("email_logs")
        .select("id, notification_type, delivery_status, error_message, created_at, user_id")
        .in("delivery_status", statuses)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(limit);
    if (f.since) q = q.gte("created_at", f.since);
    if (f.before) q = q.lt("created_at", f.before);
    if (f.userId) q = q.eq("user_id", f.userId);
    if (f.search?.trim()) q = q.or(orIlikeFilter(["notification_type", "error_message"], f.search));

    const { data, error } = await q;
    if (error) return FAILED;
    return OK(((data ?? []) as EmailLogRow[]).map(r => ({
        id: `mail:${r.id}`,
        occurredAt: r.created_at,
        level: EMAIL_LEVEL[r.delivery_status] ?? "warning",
        source: "email" as const,
        message: `E-posta ${r.delivery_status} · ${r.notification_type}`
            + (r.error_message ? ` — ${redactString(r.error_message, 200)}` : ""),
        module: "email",
        endpoint: null,
        requestId: null,
        userId: r.user_id,
        errorGroupId: null,
    })));
}

async function fetchIncidents(f: FeedFilters, limit: number): Promise<SourceResult> {
    if (f.requestId || f.userId) return NONE;
    const supabase = createServiceClient();
    let q = supabase.from("maintenance_incidents")
        .select("id, kind, severity, status, title, opened_at")
        .order("opened_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(limit);
    if (f.since) q = q.gte("opened_at", f.since);
    if (f.before) q = q.lt("opened_at", f.before);
    if (f.level) q = q.eq("severity", f.level);
    if (f.module) q = q.eq("kind", f.module);
    if (f.search?.trim()) q = q.or(orIlikeFilter(["title", "kind"], f.search));

    const { data, error } = await q;
    if (error) return FAILED;
    return OK(((data ?? []) as MaintenanceIncidentRow[]).map(r => ({
        id: `inc:${r.id}`,
        occurredAt: r.opened_at,
        level: r.severity as TelemetrySeverity,
        source: "incident" as const,
        message: `${r.title}${r.status === "resolved" ? " (çözüldü)" : ""}`,
        module: r.kind,
        endpoint: null,
        requestId: null,
        userId: null,
        errorGroupId: null,
    })));
}

// ── Servis sağlığı sondaları ─────────────────────────────────────────────

/** Veritabanı: tek hafif sorgu + süre. Ağır health query YAPILMAZ (§4). */
export async function dbPingDatabase(): Promise<{ ok: boolean; ms: number; error: string | null }> {
    const started = performance.now();
    try {
        const supabase = createServiceClient();
        const { error } = await supabase.from("customers").select("id").limit(1);
        return {
            ok: !error,
            ms: Math.round(performance.now() - started),
            error: error ? redactString(error.message, 200) : null,
        };
    } catch (err) {
        return {
            ok: false,
            ms: Math.round(performance.now() - started),
            error: redactString(err instanceof Error ? err.message : String(err), 200),
        };
    }
}

export interface BackgroundJobHealth {
    queued: number;
    failed: number;
    /** En eski bekleyen işin yaşı (dakika). Kuyruk tıkandıysa bu büyür. */
    oldestQueuedMinutes: number | null;
    lastCompletedAt: string | null;
    /** Cron GitHub Actions'ta çalışıyor; en son etki zamanı dolaylı kanıttır. */
    lastCronEffectAt: string | null;
}

/**
 * 2026-08 Y4: bu fonksiyon `.error` alanını HİÇ kontrol etmiyordu → sorgu
 * patlarsa `count ?? 0` ile "0 bekleyen · 0 başarısız" dönüyor, panel de
 * bunu SAĞLIKLI yeşil gösteriyordu. Artık okunamayan sonda `null` döner ve
 * `buildServiceHealth` satırı "Ölçülmüyor" yapar.
 */
export async function dbBackgroundJobHealth(): Promise<BackgroundJobHealth | null> {
    const supabase = createServiceClient();
    const [queuedRes, failedRes, oldestRes, lastDoneRes, lastSyncRes] = await Promise.all([
        supabase.from("notification_outbox").select("id", { count: "exact", head: true })
            .in("status", ["queued", "waiting_config", "processing"]),
        supabase.from("notification_outbox").select("id", { count: "exact", head: true })
            .eq("status", "failed"),
        supabase.from("notification_outbox").select("created_at")
            .in("status", ["queued", "waiting_config"])
            .order("created_at", { ascending: true }).limit(1).maybeSingle(),
        supabase.from("notification_outbox").select("completed_at")
            .eq("status", "completed")
            .order("completed_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("integration_sync_logs").select("requested_at")
            .eq("source", "scheduled")
            .order("requested_at", { ascending: false }).limit(1).maybeSingle(),
    ]);

    // Sayaç sorgularından biri bile patladıysa sonuç güvenilmez.
    if (queuedRes.error || failedRes.error || oldestRes.error) return null;

    const oldestCreated = (oldestRes.data as { created_at?: string } | null)?.created_at ?? null;
    return {
        queued: queuedRes.count ?? 0,
        failed: failedRes.count ?? 0,
        oldestQueuedMinutes: oldestCreated
            ? Math.round((Date.now() - new Date(oldestCreated).getTime()) / 60_000)
            : null,
        lastCompletedAt: (lastDoneRes.data as { completed_at?: string } | null)?.completed_at ?? null,
        lastCronEffectAt: (lastSyncRes.data as { requested_at?: string } | null)?.requested_at ?? null,
    };
}

/** Son penceredeki e-posta teslimat sağlığı + açık arıza sayısı. */
export async function dbExternalServiceHealth(sinceISO: string): Promise<{
    emailFailures: number;
    emailTotal: number;
    openIncidents: number;
    lastIntegrationError: string | null;
} | null> {
    const supabase = createServiceClient();
    const [failedRes, totalRes, incidentRes, syncErrRes] = await Promise.all([
        supabase.from("email_logs").select("id", { count: "exact", head: true })
            .gte("created_at", sinceISO)
            .in("delivery_status", ["failed", "bounced", "complained"]),
        supabase.from("email_logs").select("id", { count: "exact", head: true })
            .gte("created_at", sinceISO),
        supabase.from("maintenance_incidents").select("id", { count: "exact", head: true })
            .eq("status", "open"),
        supabase.from("integration_sync_logs").select("error_message, requested_at")
            .eq("status", "error").gte("requested_at", sinceISO)
            .order("requested_at", { ascending: false }).limit(1).maybeSingle(),
    ]);

    // Y4 — aynı gerekçe: e-posta sorgusu patlarsa `emailTotal = 0` olur ve
    // satır "Bu pencerede gönderim yok · sağlıklı" der; oysa ÖLÇÜLEMEDİ.
    if (failedRes.error || totalRes.error || incidentRes.error) return null;

    const lastErr = (syncErrRes.data as { error_message?: string | null } | null)?.error_message ?? null;
    return {
        emailFailures: failedRes.count ?? 0,
        emailTotal: totalRes.count ?? 0,
        openIncidents: incidentRes.count ?? 0,
        lastIntegrationError: lastErr ? redactString(lastErr, 200) : null,
    };
}

/**
 * Pencerede iz bırakan tekil kullanıcı sayısı (§3 "Active users mümkünse").
 * "Şu an sitede olan" DEĞİL — oturum takibi yok; bu, denetim izi üretmiş
 * kullanıcı sayısıdır ve panelde etiketinde böyle yazar.
 */
export const ACTIVE_USER_SCAN_LIMIT = 10_000;

export async function dbActiveUserCount(
    sinceISO: string,
): Promise<{ users: number; truncated: boolean } | null> {
    const supabase = createServiceClient();
    // limit + 1: tavana DAYANDIK mı yoksa tam mı okuduk — ayrımı sonuçta taşı.
    // Kırpılmış bir tarama kesin sayı değil ALT SINIRDIR (2026-08 D1).
    const { data, error } = await supabase
        .from("audit_log").select("actor")
        .gte("occurred_at", sinceISO)
        .order("occurred_at", { ascending: false })
        .limit(ACTIVE_USER_SCAN_LIMIT + 1);
    if (error) return null;
    const rows = (data ?? []) as Array<{ actor: string | null }>;
    const truncated = rows.length > ACTIVE_USER_SCAN_LIMIT;
    const actors = new Set(
        rows.slice(0, ACTIVE_USER_SCAN_LIMIT)
            .map(r => r.actor).filter((a): a is string => !!a),
    );
    return { users: actors.size, truncated };
}
