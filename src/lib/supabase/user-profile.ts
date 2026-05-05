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

async function patchUserMetadata(userId: string, patch: Record<string, unknown>): Promise<void> {
    const supabase = createServiceClient();
    // Mevcut metadata'yı al, sonra merge et — admin update tüm metadata'yı override ediyor
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
