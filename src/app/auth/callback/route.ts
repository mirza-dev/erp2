import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isProvisionedUser } from "@/lib/auth/permissions";
import { reconcileOAuthUserRoles } from "@/lib/auth/oauth-provision";

/**
 * Supabase OAuth (Google) dönüş noktası — PKCE `?code=` server-side exchange.
 *
 * `@supabase/ssr` akışında signInWithOAuth dönüşündeki `code`, session cookie'lerine
 * ÇEVRİLMEDEN korunan bir route render edilirse `proxy.ts` getUser()'ı session'sız
 * görüp /login'e geri atar (code asla exchange edilmez). Bu handler exchange'i yapar,
 * ardından /dashboard'a yönlendirir. `ALWAYS_PUBLIC`'te (proxy.ts) → session yokken erişilebilir.
 *
 * Google-auth kapanışı (2026-06):
 *  - Hata KÖRLÜĞÜ giderildi: provider error paramları + exchange hatası loglanır,
 *    login'e `reason` parametresiyle gider (pkce = code_verifier cookie eksik →
 *    büyük olasılıkla Supabase Redirect URL allowlist'inde bu domain yok).
 *  - Provizyon kontrolü BURADA: provizyonsuz kullanıcıda önce e-posta-eşleşme
 *    onarımı (reconcileOAuthUserRoles), olmazsa signOut + açık mesaj. Önceki
 *    davranış oturumu AÇIK bırakıp proxy'den /login'e atıyordu → arkada 401/403
 *    gürültüsü ("sayfa çalışmıyor, 401 dönüyor" şikayetinin kaynağı).
 *
 * Location HEADER'I RELATIVE: Coolify/Traefik reverse-proxy host pass-through'unda
 * `new URL(path, request.url)` container internal hostname (0.0.0.0:3000) verir
 * (parasut/oauth/callback precedent'i) — relative path browser tarafından same-origin follow edilir.
 */

function redirect307(path: string): NextResponse {
    return new NextResponse(null, { status: 307, headers: { Location: path } });
}

function adminEmailsFromEnv(): string[] {
    return (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim()).filter(Boolean);
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);

    // Provider reddi (kullanıcı izni iptal etti, Google config hatası vb.)
    const providerError = searchParams.get("error");
    if (providerError) {
        console.error(
            "[auth/callback] provider error:",
            providerError,
            searchParams.get("error_description") ?? "",
        );
        return redirect307("/login?error=oauth&reason=provider");
    }

    const code = searchParams.get("code");
    if (!code) return redirect307("/login?error=oauth&reason=no_code");

    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
        console.error("[auth/callback] exchange failed:", error.message);
        // "code verifier" sınıfı hata = PKCE cookie'si bu domain'de yok →
        // tipik kök: Supabase Redirect URLs allowlist'inde bu domain kayıtlı değil.
        const reason = /verifier/i.test(error.message) ? "pkce" : "exchange";
        return redirect307(`/login?error=oauth&reason=${reason}`);
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (user && !isProvisionedUser(user.app_metadata, user.email, adminEmailsFromEnv())) {
        const repaired = await reconcileOAuthUserRoles(
            user.id,
            user.email,
            Boolean(user.email_confirmed_at),
        );
        if (!repaired) {
            // Yarım oturum bırakma: session temizlenir, login açık nedenle gösterir.
            await supabase.auth.signOut();
            const attempted = encodeURIComponent(user.email ?? "");
            return redirect307(`/login?error=unauthorized&attempted=${attempted}`);
        }
    }

    return redirect307("/dashboard");
}
