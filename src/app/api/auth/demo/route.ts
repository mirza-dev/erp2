import { type NextRequest, NextResponse } from "next/server";

/**
 * GET /api/auth/demo
 * Sets demo_mode cookie (server-side) and redirects to /dashboard.
 * Using a server redirect avoids React event-system issues (e.g. Google Translate).
 */
export async function GET(request: NextRequest) {
    const dashboardUrl = new URL("/dashboard", request.url);
    const res = NextResponse.redirect(dashboardUrl);
    res.cookies.set("demo_mode", "1", {
        path: "/",
        maxAge: 86400,
        sameSite: "lax",
    });
    return res;
}
