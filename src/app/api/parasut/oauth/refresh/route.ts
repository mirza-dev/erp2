/**
 * Faz 11.5 — Manuel OAuth refresh
 * POST /api/parasut/oauth/refresh — admin-only.
 *
 * Token expiry'a yakın olmasa bile zorla yenilemek için:
 *   1) refresh_lock al
 *   2) adapter.refreshToken çağır
 *   3) yeni token CAS yazımı
 *
 * Notlar:
 *   - Demo mode middleware tarafından zaten 403'le bloklanır (POST).
 *   - Asıl mantık `serviceParasutOAuthRefresh` içine extract edildi (Faz 1 — alert
 *     sync-retry akışı da aynı helper'ı çağırır).
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { handleApiError } from "@/lib/api-error";
import { serviceParasutOAuthRefresh } from "@/lib/services/parasut-oauth";

async function requireAdmin(): Promise<{ error: NextResponse } | null> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return { error: NextResponse.json({ error: "Yetkisiz." }, { status: 401 }) };
    }
    const allowed = (process.env.ADMIN_EMAILS ?? "").split(",").map(e => e.trim()).filter(Boolean);
    if (allowed.length > 0 && !allowed.includes(user.email ?? "")) {
        return { error: NextResponse.json({ error: "Bu işlem için admin yetkisi gereklidir." }, { status: 403 }) };
    }
    return null;
}

export async function POST(): Promise<NextResponse> {
    const guard = await requireAdmin();
    if (guard) return guard.error;

    try {
        const result = await serviceParasutOAuthRefresh();
        if (!result.success) {
            return NextResponse.json(
                { error: "OAuth bağlantısı henüz kurulmamış. Önce 'Paraşüt'e bağlan' linki ile akışı başlatın." },
                { status: 404 },
            );
        }
        return NextResponse.json({
            success:      true,
            expiresAt:    result.expiresAt,
            tokenVersion: result.tokenVersion,
        });
    } catch (err) {
        return handleApiError(err, "POST /api/parasut/oauth/refresh");
    }
}
