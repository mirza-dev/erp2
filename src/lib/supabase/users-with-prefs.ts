import { createServiceClient } from "./service";
import { NOTIFICATION_TYPE_KEYS } from "@/lib/notification-types";
import type { NotificationTypeKey } from "@/lib/notification-types";
import { parseRoles, permissionsForRoles, type Role } from "@/lib/auth/permissions";
import { hasInternalOperatorAccess } from "@/lib/auth/internal-access";
import { isEligibleForNotification } from "@/lib/notification-policy";

export interface UserWithPref {
    userId: string;
    email: string;
    fullName: string;
    roles: Role[];
    internalOperator: boolean;
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
    opts: { actorUserId?: string | null } = {},
): Promise<UserWithPref[]> {
    if (!NOTIFICATION_TYPE_KEYS.has(notificationType)) return [];
    const type = notificationType as NotificationTypeKey;

    const supabase = createServiceClient();

    // 1) Tüm kullanıcılar (service_role) — 200+ kullanıcıda sessiz kesilmez.
    const users = [];
    const perPage = 200;
    for (let page = 1; ; page++) {
        const { data: usersPage, error: usersErr } = await supabase.auth.admin.listUsers({ page, perPage });
        if (usersErr) throw new Error(usersErr.message);
        const batch = usersPage?.users ?? [];
        users.push(...batch);
        if (batch.length < perPage) break;
    }

    if (users.length === 0) return [];

    // 2) İlgili tipte tercih satırlarını çek
    const userIds = users.map(u => u.id);
    const prefRows: { user_id: string; email_enabled: boolean }[] = [];
    for (let i = 0; i < userIds.length; i += 200) {
        const { data, error: prefErr } = await supabase
            .from("user_notification_preferences")
            .select("user_id, email_enabled")
            .eq("notification_type", notificationType)
            .in("user_id", userIds.slice(i, i + 200));
        if (prefErr) throw new Error(prefErr.message);
        prefRows.push(...((data ?? []) as { user_id: string; email_enabled: boolean }[]));
    }

    const prefMap = new Map<string, boolean>(
        (prefRows ?? []).map(r => [r.user_id as string, !!r.email_enabled]),
    );

    // 3) Filter + map
    const result: UserWithPref[] = [];
    for (const u of users) {
        if (!u.email) continue;                        // e-posta yok → atla
        if (u.banned_until) continue;                  // ban'lı → atla
        if (u.id === opts.actorUserId) continue;       // kendi işlemini yapan kişiye mail yok
        const roles = parseRoles(
            u.app_metadata as Record<string, unknown>,
            u.email,
            [],
        );
        const internalOperator = hasInternalOperatorAccess(u.email, permissionsForRoles(roles));
        if (!isEligibleForNotification(type, roles, internalOperator)) continue;
        const enabled = prefMap.get(u.id) ?? true;     // default true
        if (!enabled) continue;
        const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
        result.push({
            userId: u.id,
            email: u.email,
            fullName: typeof meta.full_name === "string" ? meta.full_name : "",
            roles,
            internalOperator,
        });
    }
    return result;
}
