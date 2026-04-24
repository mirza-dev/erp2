/**
 * Paraşüt OAuth token lease service.
 * Handles token validity checks, parallel-safe refresh via lease + CAS,
 * and initial/re-authorization via exchangeAuthCode.
 */

import { createServiceClient } from "@/lib/supabase/service";
import { dbCreateAlert } from "@/lib/supabase/alerts";
import { ALERT_ENTITY_PARASUT_AUTH } from "@/lib/parasut-constants";
import type { ParasutAdapter } from "@/lib/parasut-adapter";

const LEASE_TTL_MS      = 30_000; // how long we hold the refresh lock
const EXPIRY_BUFFER_MS  = 60_000; // refresh 60s before actual expiry
const POLL_INTERVAL_MS  = 1_000;  // polling cadence when lock is held by another
const POLL_MAX_ATTEMPTS = 5;      // max 5s total polling time

function sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
}

/**
 * Returns a valid Paraşüt access token, refreshing if necessary.
 *
 * Parallel-refresh safety:
 * - Only one process acquires the refresh lock (atomic UPDATE with expiry check).
 * - After acquiring the lock, the row is re-read to get the current refresh_token
 *   (another process may have rotated it between our initial read and lease acquire).
 * - Other callers poll until the lock clears or the token becomes fresh.
 * - On CAS conflict during token storage, a sync_issue alert is raised.
 */
export async function getAccessToken(adapter: ParasutAdapter): Promise<string> {
    const supabase = createServiceClient();

    const { data: row, error } = await supabase
        .from("parasut_oauth_tokens")
        .select("*")
        .eq("singleton_key", "default")
        .maybeSingle();

    if (error) throw new Error(`Paraşüt token okuma hatası: ${error.message}`);
    if (!row)  throw new Error("Paraşüt OAuth bağlantısı kurulmamış. /api/parasut/oauth/start ile başlatın.");

    // Token still valid — skip refresh
    if (new Date(row.expires_at).getTime() > Date.now() + EXPIRY_BUFFER_MS) {
        return row.access_token;
    }

    // Another process holds the refresh lock — poll for result
    const lockExpiry = row.refresh_lock_until ? new Date(row.refresh_lock_until).getTime() : 0;
    if (lockExpiry > Date.now()) {
        return pollForFreshToken(supabase);
    }

    // Acquire refresh lease (atomic: UPDATE WHERE no active lock)
    const owner     = crypto.randomUUID();
    const nowISO    = new Date().toISOString();
    const lockUntil = new Date(Date.now() + LEASE_TTL_MS).toISOString();

    const { data: acquired } = await (supabase
        .from("parasut_oauth_tokens")
        .update({ refresh_lock_until: lockUntil, refresh_lock_owner: owner })
        .eq("singleton_key", "default")
        .or(`refresh_lock_until.is.null,refresh_lock_until.lt.${nowISO}`)
        .select("id") as unknown as Promise<{ data: Array<{ id: string }> | null; error: unknown }>);

    if (!acquired || acquired.length === 0) {
        // Lost the race — poll for the winner's result
        return pollForFreshToken(supabase);
    }

    // Re-read after acquiring the lease: another process may have rotated the
    // refresh_token between our initial read and lease acquisition. Using a stale
    // refresh_token would fail at Paraşüt since it is single-use after rotation.
    const { data: liveRow, error: liveErr } = await supabase
        .from("parasut_oauth_tokens")
        .select("*")
        .eq("singleton_key", "default")
        .maybeSingle();

    if (liveErr || !liveRow) {
        await releaseLease(supabase, owner);
        throw new Error("Paraşüt token okunamadı (lease sonrası).");
    }

    // If another process completed a refresh while we were acquiring the lock,
    // our lease is no longer needed — release it and return the fresh token.
    if (new Date(liveRow.expires_at).getTime() > Date.now() + EXPIRY_BUFFER_MS) {
        await releaseLease(supabase, owner);
        return liveRow.access_token as string;
    }

    try {
        const newTokens = await adapter.refreshToken(liveRow.refresh_token as string);

        const { data: saved } = await (supabase
            .from("parasut_oauth_tokens")
            .update({
                access_token:       newTokens.access_token,
                refresh_token:      newTokens.refresh_token,
                expires_at:         newTokens.expires_at,
                refresh_lock_until: null,
                refresh_lock_owner: null,
                token_version:      (liveRow.token_version as number) + 1,
                updated_at:         new Date().toISOString(),
            })
            .eq("singleton_key", "default")
            .eq("token_version", liveRow.token_version)
            .select("access_token") as unknown as Promise<{ data: Array<{ access_token: string }> | null; error: unknown }>);

        if (!saved || saved.length === 0) {
            // token_version mismatch — a concurrent update beat us
            await dbCreateAlert({
                type:        "sync_issue",
                severity:    "warning",
                title:       "Paraşüt token CAS çakışması",
                description: "Token kaydedilirken başka bir işlem müdahale etti (token_version mismatch).",
                entity_type: "parasut_auth",
                entity_id:   ALERT_ENTITY_PARASUT_AUTH,
                source:      "system",
            });
            throw new Error("Paraşüt token güncellenemedi (CAS çakışması). Lütfen tekrar deneyin.");
        }

        return newTokens.access_token;
    } finally {
        // Best-effort release. On the success path the CAS update already cleared
        // refresh_lock_owner, so this becomes a no-op (WHERE owner matches nothing).
        // On the failure path, the lock is still held and must be released here.
        await releaseLease(supabase, owner);
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function releaseLease(
    supabase: ReturnType<typeof createServiceClient>,
    owner: string
): Promise<void> {
    try {
        await supabase
            .from("parasut_oauth_tokens")
            .update({ refresh_lock_until: null, refresh_lock_owner: null })
            .eq("singleton_key", "default")
            .eq("refresh_lock_owner", owner);
    } catch {
        // Best-effort: lock expires naturally after LEASE_TTL_MS
    }
}

async function pollForFreshToken(
    supabase: ReturnType<typeof createServiceClient>
): Promise<string> {
    for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
        await sleep(POLL_INTERVAL_MS);
        const { data: fresh } = await supabase
            .from("parasut_oauth_tokens")
            .select("access_token,expires_at")
            .eq("singleton_key", "default")
            .maybeSingle();
        if (fresh && new Date((fresh as { expires_at: string }).expires_at).getTime() > Date.now() + EXPIRY_BUFFER_MS) {
            return (fresh as { access_token: string }).access_token;
        }
    }
    throw new Error("Paraşüt token yenileme bekleme süresi aşıldı.");
}
