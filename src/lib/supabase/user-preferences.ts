import { createServiceClient } from "./service";
import { NOTIFICATION_TYPES, NOTIFICATION_TYPE_KEYS, type NotificationTypeKey } from "@/lib/notification-types";
import type { Role } from "@/lib/auth/permissions";
import { eligibleNotificationTypes } from "@/lib/notification-policy";

/**
 * 2026-08-29 — `browserEnabled` YÜZEYDEN DÜŞTÜ.
 *
 * mig.045'ten beri `browser_enabled` bir DB kolonuydu; burada default'lanıyor,
 * API'de tip doğrulaması yapılıyor, upsert'te yazılıyordu — ama HİÇBİR ŞEY
 * okumuyordu: kaynakta `Notification` / `serviceWorker` / `PushManager` /
 * `web-push` için sıfır sonuç, yani tarayıcı bildirimi hiç yazılmamıştı.
 * Sekme yarısı çalışan (e-posta) yarısı hayalet bir söz veriyordu.
 *
 * Kolon DB'de KALIYOR (`not null default true`) — zararsız, geri dönüşümlü ve
 * migration/APPLY yükü çıkarmıyor. Düşen yalnız TS/API yüzeyi.
 * Emsal: mig.097 `order_new` gerçek bir olay olmaktan çıkınca tercih
 * satırlarını temizlemiş ve gerekçesini yorumda bırakmıştı.
 */
export interface NotificationPref {
    type: string;
    emailEnabled: boolean;
}

/**
 * Kullanıcının tüm bildirim tercihlerini döner. DB'de satırı olmayan türler için
 * rol matrisine uygun türlerde default `{ emailEnabled: true }` virtual değer
 * döner — ilk PATCH'te upsert ile DB'ye yazılır.
 */
export async function dbListUserPrefs(
    userId: string,
    roles?: Role[],
    internalOperator = false,
): Promise<NotificationPref[]> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("user_notification_preferences")
        .select("notification_type, email_enabled")
        .eq("user_id", userId);
    if (error) throw new Error(error.message);
    const stored = new Map(
        (data ?? []).map(r => [r.notification_type as string, { emailEnabled: !!r.email_enabled }])
    );
    const eligible = roles ? new Set(eligibleNotificationTypes(roles, internalOperator)) : null;
    return NOTIFICATION_TYPES
        .filter(t => !eligible || eligible.has(t.key))
        .map(t => ({
            type: t.key,
            emailEnabled: stored.get(t.key)?.emailEnabled ?? true,
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
    // `browser_enabled` GÖNDERİLMEZ — kolon DB'de `not null default true`,
    // varsayılan kendiliğinden dolar (bkz. NotificationPref notu).
    const rows = filtered.map(p => ({
        user_id: userId,
        notification_type: p.type,
        email_enabled: p.emailEnabled,
        updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase
        .from("user_notification_preferences")
        .upsert(rows, { onConflict: "user_id,notification_type" });
    if (error) throw new Error(error.message);
}
