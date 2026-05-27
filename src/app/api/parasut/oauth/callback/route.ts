/**
 * GET /api/parasut/oauth/callback
 *
 * ALWAYS_PUBLIC — Paraşüt redirects here without a user session.
 * 1. Verify HMAC-signed CSRF state against parasut_oauth_state cookie.
 * 2. Exchange auth code for tokens via adapter.
 * 3. Atomic upsert (ON CONFLICT singleton_key DO UPDATE) with token_version + 1.
 */

import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { getParasutAdapter } from "@/lib/parasut";
import { createServiceClient } from "@/lib/supabase/service";

interface TokenRow {
    token_version:      number;
    refresh_lock_until: string | null;
}

function verifyCookieState(cookieValue: string, stateParam: string): boolean {
    const secret = process.env.CRON_SECRET ?? "";
    const sep = cookieValue.lastIndexOf(".");
    if (sep === -1) return false;
    const state = cookieValue.slice(0, sep);
    const sig   = cookieValue.slice(sep + 1);
    const expected = createHmac("sha256", secret).update(state).digest("hex");
    // Constant-time comparison via timingSafeEqual
    try {
        const a = Buffer.from(sig, "hex");
        const b = Buffer.from(expected, "hex");
        if (a.length !== b.length) return false;
        return timingSafeEqual(a, b) && state === stateParam;
    } catch {
        return false;
    }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
    const { searchParams } = request.nextUrl;
    const code  = searchParams.get("code");
    const state = searchParams.get("state");

    // CSRF guard — verify signed state cookie
    const cookieValue = request.cookies.get("parasut_oauth_state")?.value;
    if (!state || !cookieValue || !verifyCookieState(cookieValue, state)) {
        return NextResponse.json(
            { error: "Geçersiz state parametresi (CSRF koruması)." },
            { status: 400 }
        );
    }
    if (!code) {
        return NextResponse.json({ error: "OAuth kodu eksik." }, { status: 400 });
    }

    const redirectUri = process.env.PARASUT_REDIRECT_URI ?? "";
    const adapter     = getParasutAdapter();
    const supabase    = createServiceClient();

    // Check for in-progress refresh before exchanging code
    const { data: existingRaw } = await supabase
        .from("parasut_oauth_tokens")
        .select("token_version,refresh_lock_until")
        .eq("singleton_key", "default")
        .maybeSingle();

    const existing = existingRaw as TokenRow | null;

    if (existing) {
        const lockExpiry = existing.refresh_lock_until
            ? new Date(existing.refresh_lock_until).getTime()
            : 0;
        if (lockExpiry > Date.now()) {
            return NextResponse.json(
                { error: "Token yenileme devam ediyor. Lütfen kısa bir süre sonra tekrar deneyin." },
                { status: 409 }
            );
        }
    }

    let tokens;
    try {
        tokens = await adapter.exchangeAuthCode(code, redirectUri);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: `OAuth kodu değiştirilemedi: ${msg}` }, { status: 502 });
    }

    const nowISO = new Date().toISOString();

    // Atomic upsert — ON CONFLICT (singleton_key) DO UPDATE.
    // Handles both first-connection and re-auth. Two parallel first-auth callbacks
    // would both see "no row" and both try to upsert; the last writer wins with
    // valid tokens (the first call's tokens are overwritten, not lost to a unique error).
    //
    // OAuth callback URL is always GET (called by Paraşüt provider — cannot be POST).
    // CSRF is mitigated via signed state cookie verification above.
    // eslint-disable-next-line react-doctor/nextjs-no-side-effect-in-get-handler
    const { error: upsertError } = await supabase
        .from("parasut_oauth_tokens")
        .upsert(
            {
                singleton_key:      "default",
                access_token:       tokens.access_token,
                refresh_token:      tokens.refresh_token,
                expires_at:         tokens.expires_at,
                refresh_lock_until: null,
                refresh_lock_owner: null,
                token_version:      (existing?.token_version ?? 0) + 1,
                updated_at:         nowISO,
            },
            { onConflict: "singleton_key" }
        );

    if (upsertError) {
        return NextResponse.json({ error: `Token kaydedilemedi: ${upsertError.message}` }, { status: 500 });
    }

    // Relative Location — same-origin redirect; reverse proxy (Coolify Traefik)
    // X-Forwarded-Host pass-through gerektirmez, request.nextUrl.origin container
    // internal host'u (0.0.0.0:3000) verebiliyor.
    const response = new NextResponse(null, {
        status: 307,
        headers: { Location: "/dashboard/settings?parasut=connected" },
    });
    response.cookies.set("parasut_oauth_state", "", { maxAge: 0, path: "/" });
    return response;
}
