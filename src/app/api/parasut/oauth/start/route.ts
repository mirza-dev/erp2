import { NextResponse } from "next/server";
import crypto, { createHmac } from "crypto";
import { createClient } from "@/lib/supabase/server";

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

function signState(state: string): string {
    // Denetim O8 (2026-06): secret unset iken boş-anahtar HMAC üretmek yerine
    // FAIL-CLOSED — OAuth akışı hiç başlamaz (callback doğrulaması da secret
    // yokken false döner; "her imza geçer" durumu yapısal olarak imkânsız).
    const secret = process.env.CRON_SECRET;
    if (!secret) throw new Error("CRON_SECRET tanımsız — OAuth state imzalanamaz.");
    const sig = createHmac("sha256", secret).update(state).digest("hex");
    return `${state}.${sig}`;
}

export async function GET(): Promise<NextResponse> {
    const guard = await requireAdmin();
    if (guard) return guard.error;

    const state      = crypto.randomBytes(32).toString("hex");
    const cookieVal  = signState(state);

    let redirectLocation: string;

    if (process.env.PARASUT_USE_MOCK !== "false") {
        // Mock mode: skip real OAuth, relative same-origin redirect.
        // request.nextUrl.origin reverse-proxy ardında container internal host'u
        // (0.0.0.0:3000) verebiliyor; relative Location header güvenli.
        const params = new URLSearchParams({ code: "mock_code", state });
        redirectLocation = `/api/parasut/oauth/callback?${params.toString()}`;
    } else {
        const authorizeUrl = process.env.PARASUT_AUTHORIZE_URL;
        const clientId     = process.env.PARASUT_CLIENT_ID;
        const redirectUri  = process.env.PARASUT_REDIRECT_URI;

        if (!authorizeUrl || !clientId || !redirectUri) {
            return NextResponse.json(
                { error: "Paraşüt OAuth ortam değişkenleri eksik (PARASUT_AUTHORIZE_URL, PARASUT_CLIENT_ID, PARASUT_REDIRECT_URI)." },
                { status: 503 }
            );
        }

        const target = new URL(authorizeUrl);
        target.searchParams.set("client_id",     clientId);
        target.searchParams.set("redirect_uri",  redirectUri);
        target.searchParams.set("response_type", "code");
        target.searchParams.set("state",         state);
        redirectLocation = target.toString();
    }

    const response = new NextResponse(null, {
        status: 307,
        headers: { Location: redirectLocation },
    });
    response.cookies.set("parasut_oauth_state", cookieVal, {
        httpOnly: true,
        secure:   process.env.NODE_ENV === "production",
        sameSite: "lax",
        path:     "/",
        maxAge:   300, // 5 minutes
    });
    return response;
}
