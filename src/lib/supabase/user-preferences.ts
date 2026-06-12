import { createServiceClient } from "./service";
import { NOTIFICATION_TYPES, NOTIFICATION_TYPE_KEYS, type NotificationTypeKey } from "@/lib/notification-types";
import type { Role } from "@/lib/auth/permissions";
import { eligibleNotificationTypes } from "@/lib/notification-policy";

export interface NotificationPref {
    type: string;
    emailEnabled: boolean;
    browserEnabled: boolean;
}

/**
 * Kullanıcının tüm bildirim tercihlerini döner. DB'de satırı olmayan türler için
 * Rol matrisine uygun türlerde default `{ email: true, browser: true }` virtual
 * değer döner — ilk PATCH'te upsert ile DB'ye yazılır.
 */
export async function dbListUserPrefs(
    userId: string,
    roles?: Role[],
    internalOperator = false,
): Promise<NotificationPref[]> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("user_notification_preferences")
        .select("notification_type, email_enabled, browser_enabled")
        .eq("user_id", userId);
    if (error) throw new Error(error.message);
    const stored = new Map(
        (data ?? []).map(r => [
            r.notification_type as string,
            { emailEnabled: !!r.email_enabled, browserEnabled: !!r.browser_enabled },
        ])
    );
    const eligible = roles ? new Set(eligibleNotificationTypes(roles, internalOperator)) : null;
    return NOTIFICATION_TYPES
        .filter(t => !eligible || eligible.has(t.key))
        .map(t => ({
            type: t.key,
            emailEnabled: stored.get(t.key)?.emailEnabled ?? true,
            browserEnabled: stored.get(t.key)?.browserEnabled ?? true,
        }));
}

/**
 * Kullanıcı tercihlerini upsert eder. Bilinmeyen `notification_type` değerleri
 * sessizce filtrelenir (whitelist NOTIFICATION_TYPE_KEYS).
 */
export async function dbUpsertUserPrefs(
    userId: string,
    prefs: NotificationPref[],
    roles?: Role[],
    internalOperator = false,
): Promise<void> {
    const eligible = roles ? new Set(eligibleNotificationTypes(roles, internalOperator)) : null;
    const filtered = prefs.filter(p =>
        NOTIFICATION_TYPE_KEYS.has(p.type)
        && (!eligible || eligible.has(p.type as NotificationTypeKey)),
    );
    if (filtered.length === 0) return;
    const supabase = createServiceClient();
    const rows = filtered.map(p => ({
        user_id: userId,
        notification_type: p.type,
        email_enabled: p.emailEnabled,
        browser_enabled: p.browserEnabled,
        updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase
        .from("user_notification_preferences")
        .upsert(rows, { onConflict: "user_id,notification_type" });
    if (error) throw new Error(error.message);
}
