import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Supabase OAuth (Google) dönüş noktası — PKCE `?code=` server-side exchange.
 *
 * `@supabase/ssr` akışında signInWithOAuth dönüşündeki `code`, session cookie'lerine
 * ÇEVRİLMEDEN korunan bir route render edilirse `proxy.ts` getUser()'ı session'sız
 * görüp /login'e geri atar (code asla exchange edilmez). Bu handler exchange'i yapar,
 * ardından /dashboard'a yönlendirir. `ALWAYS_PUBLIC`'te (proxy.ts) → session yokken erişilebilir.
 *
 * Location HEADER'I RELATIVE: Coolify/Traefik reverse-proxy host pass-through'unda
 * `new URL(path, request.url)` container internal hostname (0.0.0.0:3000) verir
 * (parasut/oauth/callback precedent'i) — relative path browser tarafından same-origin follow edilir.
 */
export async function GET(request: Request) {
    const code = new URL(request.url).searchParams.get("code");

    if (code) {
        const supabase = await createClient();
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) {
            return new NextResponse(null, { status: 307, headers: { Location: "/dashboard" } });
        }
    }

    return new NextResponse(null, { status: 307, headers: { Location: "/login?error=oauth" } });
}
