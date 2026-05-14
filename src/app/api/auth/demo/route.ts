import { NextResponse } from "next/server";

/**
 * GET /api/auth/demo
 * Sets demo_mode cookie (server-side) and redirects to /dashboard.
 * Using a server redirect avoids React event-system issues (e.g. Google Translate).
 *
 * Relative Location header — same-origin redirect; reverse proxy
 * (Coolify Traefik) X-Forwarded-Host pass-through'una ihtiyaç duymaz.
 */
export async function GET() {
    const res = new NextResponse(null, { status: 307, headers: { Location: "/dashboard" } });
    res.cookies.set("demo_mode", "1", {
        path: "/",
        maxAge: 86400,
        sameSite: "lax",
    });
    return res;
}
