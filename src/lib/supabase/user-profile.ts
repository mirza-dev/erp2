import { createServiceClient } from "./service";

export interface UserProfile {
    id: string;
    email: string;
    fullName: string;
    avatarUrl: string | null;
    createdAt: string;
}

export async function dbGetUserProfile(userId: string): Promise<UserProfile> {
    const supabase = createServiceClient();
    const { data, error } = await supabase.auth.admin.getUserById(userId);
    if (error || !data?.user) throw new Error("Kullanıcı bulunamadı.");
    const u = data.user;
    const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
    return {
        id: u.id,
        email: u.email ?? "",
        fullName: typeof meta.full_name === "string" ? meta.full_name : "",
        avatarUrl: typeof meta.avatar_url === "string" ? meta.avatar_url : null,
        createdAt: u.created_at,
    };
}

/**
 * GET → merge → admin updateUserById. Supabase admin updateUserById,
 * `user_metadata` içeriğini REPLACE ediyor (client-side updateUser merge yapar
 * ama admin API replace yapar) — bu yüzden mevcut metadata'yı önce çekip merge ediyoruz.
 *
 * Race window: GET ile UPDATE arasında başka bir işlem aynı kullanıcının metadata'sını
 * değiştirirse lost-update olabilir (avatar yüklerken aynı anda full_name kaydetme gibi).
 * Settings sayfası tek kullanıcı tek-tab senaryosunda bu pratikte mümkün değil; UI
 * ek olarak frontend mutation lock ile concurrent çağrıları önlüyor (KullaniciTab
 * `isMutating` flag). Çoklu istemci/sekme senaryosu gerekirse atomic JSONB merge
 * RPC eklenmeli (sonraki tur).
 */
async function patchUserMetadata(userId: string, patch: Record<string, unknown>): Promise<void> {
    const supabase = createServiceClient();
    const { data, error: getErr } = await supabase.auth.admin.getUserById(userId);
    if (getErr || !data?.user) throw new Error("Kullanıcı bulunamadı.");
    const merged = { ...(data.user.user_metadata ?? {}), ...patch };
    const { error } = await supabase.auth.admin.updateUserById(userId, {
        user_metadata: merged,
    });
    if (error) throw new Error(error.message);
}

export async function dbUpdateUserFullName(userId: string, fullName: string): Promise<void> {
    await patchUserMetadata(userId, { full_name: fullName });
}

export async function dbUpdateUserAvatarUrl(userId: string, avatarUrl: string | null): Promise<void> {
    await patchUserMetadata(userId, { avatar_url: avatarUrl });
}
