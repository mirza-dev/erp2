import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
    rateLimitCheck,
    selectPolicy,
    extractClientIp,
    detectSupabaseAuthCookie,
} from "@/lib/rate-limit";

// Hiç auth kontrolü yapılmayan path'ler (login'i dahil etmiyoruz — auth'd user redirect için)
// Not: /api/seed kendi içinde CRON_SECRET veya session kontrolü yapar
// /api/alerts/scan is listed here because it handles its own auth (CRON_SECRET OR session)
const ALWAYS_PUBLIC = ["/api/health", "/api/auth/demo", "/api/seed", "/api/alerts/scan", "/api/ai/purchase-copilot", "/api/parasut/oauth/callback"];

// Sadece CRON_SECRET Bearer token ile erişilir — session bypass YOK
// Not: /api/alerts/scan buraya dahil değil — kendi içinde session OR CRON_SECRET kontrolü yapar
const CRON_PATHS = [
    "/api/alerts/ai-suggest",
    "/api/parasut/sync-all",
    "/api/parasut/poll-e-documents",
    "/api/orders/expire-quotes",
    "/api/orders/check-shipments",
    "/api/quotes/expire",
    "/api/email/retry-failed",
];

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // ── 1. /api/health — ABSOLUTE bypass (monitoring, k6 smoke) ─────────────
    // Coolify/UptimeRobot health check 30-60sn/IP frekans — rate limit'e takılırsa
    // izleme kırılır. Diğer eski ALWAYS_PUBLIC endpoint'leri (auth/demo, ai/*) artık
    // rate limit'e tabi (M-3) ama auth gate'i aşağıda atlamaya devam eder.
    if (pathname === "/api/health") {
        return NextResponse.next();
    }

    // ── 2. CRON_SECRET Bearer — server-to-server bypass ─────────────────────
    // Vercel/GH Actions cron meşru yüksek frekans (4-8x/gün × server-side). Rate
    // limit'i de atlatır. SECRET yoksa aşağıda 401 dönülecek (M-1 invariant).
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = request.headers.get("authorization");
    const hasCronSecret = Boolean(cronSecret) && authHeader === `Bearer ${cronSecret}`;
    if (hasCronSecret && CRON_PATHS.some(p => pathname === p)) {
        return NextResponse.next();
    }

    // ── 3. Rate limit (M-3) — auth-cookie hibrit policy, IP-based key ───────
    // getUser() maliyetine girmeden auth proxy (cookie varlığı). Saldırgan fake
    // cookie ile yüksek limit alsa bile aşağıda auth check 401 döner → resource
    // consumption hâlâ sınırlı.
    const ip = extractClientIp(request);
    const hasAuthCookie = detectSupabaseAuthCookie(request);
    const policy = selectPolicy(pathname, request.method, hasAuthCookie);
    const rate = await rateLimitCheck(`ip:${ip}`, policy);

    if (!rate.ok) {
        return new NextResponse(
            JSON.stringify({ error: "Çok fazla istek. Lütfen biraz bekleyin.", retryAfter: rate.retryAfter }),
            {
                status: 429,
                headers: {
                    "Content-Type": "application/json",
                    "Retry-After": String(rate.retryAfter),
                    "X-RateLimit-Limit": String(rate.limit),
                    "X-RateLimit-Remaining": "0",
                    "X-RateLimit-Reset": String(Math.ceil(Date.now() / 1000) + rate.retryAfter),
                },
            }
        );
    }

    // ── 4. ALWAYS_PUBLIC bypass (rate limit'ten geçti) ──────────────────────
    if (ALWAYS_PUBLIC.some(p => pathname === p || pathname.startsWith(p + "/"))) {
        return NextResponse.next();
    }

    // ── 5. CRON path ama CRON_SECRET yoksa 401 (mevcut M-1 invariant) ──────
    if (CRON_PATHS.some(p => pathname === p)) {
        return NextResponse.json(
            { error: "CRON_SECRET gerekli." },
            { status: 401 }
        );
    }

    // ── 6. Supabase session kontrolü ────────────────────────────────────────
    let supabaseResponse = NextResponse.next({ request });

    // C-1: Turbopack Edge Runtime'da createServerClient başarısız olabilir.
    // try-catch ile sarıyoruz — hata durumunda user=null → kimliksiz olarak işlenir.
    let user = null;
    try {
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll() {
                        return request.cookies.getAll();
                    },
                    setAll(cookiesToSet) {
                        cookiesToSet.forEach(({ name, value }) =>
                            request.cookies.set(name, value)
                        );
                        supabaseResponse = NextResponse.next({ request });
                        cookiesToSet.forEach(({ name, value, options }) =>
                            supabaseResponse.cookies.set(name, value, options)
                        );
                    },
                },
            }
        );

        const { data } = await supabase.auth.getUser();
        user = data.user;
    } catch {
        // Turbopack Edge Runtime'da Supabase init başarısız olabilir.
        // user = null → aşağıda kimliksiz olarak işlenir → doğru güvenlik davranışı.
    }

    if (!user) {
        // Demo mode — oturumu yok ama demo cookie var
        const isDemoMode = request.cookies.get("demo_mode")?.value === "1";

        if (isDemoMode) {
            // Faz 2d Review P3-005: ENV opt-in guard.
            // ATTACHMENTS_BLOCK_DEMO_ANON=true ise demo cookie ile anonim kullanıcı
            // private bucket signed URL endpoint'lerine erişemez. Default kapalı —
            // demo bucket SADECE seed/fake data içeriyorsa risksiz. Prod ile aynı
            // bucket'ı paylaşan dağıtımlarda env true yapılmalı.
            if (
                process.env.ATTACHMENTS_BLOCK_DEMO_ANON === "true" &&
                /^\/api\/products\/[^/]+\/attachments/.test(pathname)
            ) {
                return NextResponse.json(
                    { error: "Bu kaynak için kimlik doğrulama gerekiyor." },
                    { status: 401 }
                );
            }
            // Dashboard sayfaları → izin ver
            if (pathname.startsWith("/dashboard")) {
                return NextResponse.next();
            }
            // GET API → izin ver (DataProvider veri çekebilsin)
            if (pathname.startsWith("/api/") && request.method === "GET") {
                return NextResponse.next();
            }
            // Non-GET API (POST/PATCH/DELETE) → 403
            if (pathname.startsWith("/api/")) {
                return NextResponse.json(
                    { error: "Demo modunda değişiklik yapılamaz." },
                    { status: 403 }
                );
            }
            // / veya /login → mevcut davranışa düş
        }

        // Public sayfalar — auth gerektirmiyor
        if (pathname === "/login" || pathname === "/") {
            return NextResponse.next();
        }
        // API → 401 JSON
        if (pathname.startsWith("/api/")) {
            return NextResponse.json(
                { error: "Yetkisiz erişim." },
                { status: 401 }
            );
        }
        // Diğer sayfalar → /login'e yönlendir
        const url = request.nextUrl.clone();
        url.pathname = "/login";
        return NextResponse.redirect(url);
    }

    // Auth'lu kullanıcı /login veya / → dashboard'a yönlendir
    if (pathname === "/login" || pathname === "/") {
        const url = request.nextUrl.clone();
        url.pathname = "/dashboard";
        return NextResponse.redirect(url);
    }

    // Başarı response'ına observability header'ları ekle (rate limit info).
    supabaseResponse.headers.set("X-RateLimit-Limit", String(rate.limit));
    supabaseResponse.headers.set("X-RateLimit-Remaining", String(rate.remaining));
    return supabaseResponse;
}

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
