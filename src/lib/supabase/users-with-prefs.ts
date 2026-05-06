import { createServiceClient } from "./service";
import { NOTIFICATION_TYPE_KEYS } from "@/lib/notification-types";

export interface UserWithPref {
    userId: string;
    email: string;
    fullName: string;
}

/**
 * Belirli bir bildirim türü için e-posta almak isteyen tüm aktif kullanıcıları döner.
 *
 * Akış:
 * 1. Bilinmeyen `notificationType` → boş döndür (whitelist).
 * 2. `auth.admin.listUsers()` (service_role) — banned/deleted user'lar atlanır.
 * 3. `user_notification_preferences`'tan tüm satırları çek (per-user filter yapma — küçük tablo).
 * 4. Her user için: tercih satırı varsa `email_enabled` değerine bak; yoksa default true.
 *
 * Default davranış (`dbListUserPrefs` ile aynı): satır yoksa kullanıcı default olarak
 * email almak ister. Sessiz spam'e yol açmaması için ilk PATCH'te kullanıcı kapatabilir.
 */
export async function dbListUsersForEmailNotification(
    notificationType: string,
): Promise<UserWithPref[]> {
    if (!NOTIFICATION_TYPE_KEYS.has(notificationType)) return [];

    const supabase = createServiceClient();

    // 1) Tüm kullanıcılar (service_role)
    const { data: usersPage, error: usersErr } = await supabase.auth.admin.listUsers({
        page: 1,
        perPage: 200,    // tek sayfa yeterli; 200+ user senaryosu sonraki turda
    });
    if (usersErr) throw new Error(usersErr.message);
    const users = usersPage?.users ?? [];

    if (users.length === 0) return [];

    // 2) İlgili tipte tercih satırlarını çek
    const userIds = users.map(u => u.id);
    const { data: prefRows, error: prefErr } = await supabase
        .from("user_notification_preferences")
        .select("user_id, email_enabled")
        .eq("notification_type", notificationType)
        .in("user_id", userIds);
    if (prefErr) throw new Error(prefErr.message);

    const prefMap = new Map<string, boolean>(
        (prefRows ?? []).map(r => [r.user_id as string, !!r.email_enabled]),
    );

    // 3) Filter + map
    const result: UserWithPref[] = [];
    for (const u of users) {
        if (!u.email) continue;                        // e-posta yok → atla
        if (u.banned_until) continue;                  // ban'lı → atla
        const enabled = prefMap.get(u.id) ?? true;     // default true
        if (!enabled) continue;
        const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
        result.push({
            userId: u.id,
            email: u.email,
            fullName: typeof meta.full_name === "string" ? meta.full_name : "",
        });
    }
    return result;
}
