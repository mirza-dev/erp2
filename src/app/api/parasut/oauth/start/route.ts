import { NextRequest, NextResponse } from "next/server";
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
    const secret = process.env.CRON_SECRET ?? "";
    const sig = createHmac("sha256", secret).update(state).digest("hex");
    return `${state}.${sig}`;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
    const guard = await requireAdmin();
    if (guard) return guard.error;

    const state      = crypto.randomBytes(32).toString("hex");
    const cookieVal  = signState(state);

    let redirectTarget: URL;

    if (process.env.PARASUT_USE_MOCK !== "false") {
        // Mock mode: skip real OAuth, go directly to callback with a fake code
        redirectTarget = new URL("/api/parasut/oauth/callback", request.nextUrl.origin);
        redirectTarget.searchParams.set("code",  "mock_code");
        redirectTarget.searchParams.set("state", state);
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

        redirectTarget = new URL(authorizeUrl);
        redirectTarget.searchParams.set("client_id",     clientId);
        redirectTarget.searchParams.set("redirect_uri",  redirectUri);
        redirectTarget.searchParams.set("response_type", "code");
        redirectTarget.searchParams.set("state",         state);
    }

    const response = NextResponse.redirect(redirectTarget);
    response.cookies.set("parasut_oauth_state", cookieVal, {
        httpOnly: true,
        secure:   process.env.NODE_ENV === "production",
        sameSite: "lax",
        path:     "/",
        maxAge:   300, // 5 minutes
    });
    return response;
}
