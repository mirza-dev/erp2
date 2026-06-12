import { createServiceClient } from "@/lib/supabase/service";
import { isProvisionedUser, parseRoles, type Role } from "@/lib/auth/permissions";

/**
 * Google OAuth onarımı (2026-06, "yalnız ekli kullanıcılar" politikası):
 *
 * Ayarlar→Kullanıcılar'dan e-posta/şifreyle eklenmiş biri Google ile girdiğinde
 * Supabase (identity-linking durumuna göre) ROLSÜZ yeni bir auth user açabilir →
 * provizyon kapısı reddeder. Bu helper AYNI e-postalı, rol atanmış BAŞKA bir auth
 * user varsa rollerini OAuth kullanıcısına kopyalar; yoksa null döner (red sürer).
 *
 * Güvenlik: e-posta provider tarafından DOĞRULANMAMIŞSA kopyalama yapılmaz
 * (doğrulanmamış e-postayla hesap ele geçirme vektörü kapalı). ADMIN_EMAILS
 * bootstrap'i buranın işi değil — isProvisionedUser zaten kapsıyor.
 */
export async function reconcileOAuthUserRoles(
    userId: string,
    email: string | null | undefined,
    emailVerified: boolean,
): Promise<Role[] | null> {
    if (!email || !emailVerified) return null;
    const normalized = email.trim().toLowerCase();

    const admin = createServiceClient().auth.admin;
    const { data, error } = await admin.listUsers({ page: 1, perPage: 200 });
    if (error) {
        console.error("[oauth-provision] listUsers failed:", error.message);
        return null;
    }

    const donor = data.users.find(
        (u) =>
            u.id !== userId &&
            (u.email ?? "").trim().toLowerCase() === normalized &&
            // ham app_metadata.roles VARLIĞI şart — parseRoles'un viewer fallback'i
            // provize olmayanı da ["viewer"] gösterir, onu donör saymayız
            isProvisionedUser(u.app_metadata, null, []),
    );
    if (!donor) return null;

    const roles = parseRoles(donor.app_metadata, donor.email, []);
    const { error: updErr } = await admin.updateUserById(userId, {
        app_metadata: { roles },
    });
    if (updErr) {
        console.error("[oauth-provision] updateUserById failed:", updErr.message);
        return null;
    }
    console.info(`[oauth-provision] roles copied to OAuth user ${userId}: ${roles.join(",")}`);
    return roles;
}
