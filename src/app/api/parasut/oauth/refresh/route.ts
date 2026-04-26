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
 *   - getAccessToken normalde EXPIRY_BUFFER kontrol eder; manuel akışta buffer'ı
 *     bypass etmek için expires_at'i geçmişe çekip getAccessToken'ı tetikliyoruz.
 *   - Demo mode middleware tarafından zaten 403'le bloklanır (POST).
 */
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { handleApiError } from "@/lib/api-error";
import { getAccessToken } from "@/lib/services/parasut-oauth";
import { getParasutAdapter } from "@/lib/parasut";

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
        const supabase = createServiceClient();

        // Token kaydı var mı kontrol et
        const { data: row, error: readErr } = await supabase
            .from("parasut_oauth_tokens")
            .select("id, expires_at")
            .eq("singleton_key", "default")
            .maybeSingle();
        if (readErr) throw new Error(`Token okuma hatası: ${readErr.message}`);
        if (!row) {
            return NextResponse.json(
                { error: "OAuth bağlantısı henüz kurulmamış. Önce 'Paraşüt'e bağlan' linki ile akışı başlatın." },
                { status: 404 },
            );
        }

        // Buffer'ı bypass et: expires_at'i geçmişe çek → getAccessToken refresh'i tetikleyecek.
        const oldExpiresAt = row.expires_at as string;
        await supabase
            .from("parasut_oauth_tokens")
            .update({ expires_at: new Date(0).toISOString() })
            .eq("singleton_key", "default");

        try {
            await getAccessToken(getParasutAdapter());
        } catch (err) {
            // Refresh fail olursa eski expires_at'i geri yaz (false negative buffer'ı bozmamak için)
            await supabase
                .from("parasut_oauth_tokens")
                .update({ expires_at: oldExpiresAt })
                .eq("singleton_key", "default");
            throw err;
        }

        const { data: fresh } = await supabase
            .from("parasut_oauth_tokens")
            .select("expires_at, token_version")
            .eq("singleton_key", "default")
            .maybeSingle();

        return NextResponse.json({
            success:      true,
            expiresAt:    fresh?.expires_at ?? null,
            tokenVersion: fresh?.token_version ?? null,
        });
    } catch (err) {
        return handleApiError(err, "POST /api/parasut/oauth/refresh");
    }
}
