import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
    rateLimitCheck,
    selectPolicy,
    extractClientIp,
    detectSupabaseAuthCookie,
    type RateCheckResult,
} from "@/lib/rate-limit";
// RBAC Faz 2 — pure helper'lar (next/supabase import etmez → middleware-safe).
import { parseRoles, permissionsForRoles, isProvisionedUser } from "@/lib/auth/permissions";
import { canAccessPath } from "@/lib/auth/page-access";

// Hiç auth kontrolü yapılmayan path'ler (login'i dahil etmiyoruz — auth'd user redirect için)
// Not: /api/seed kendi içinde CRON_SECRET veya session kontrolü yapar
// /api/alerts/scan is listed here because it handles its own auth (CRON_SECRET OR session)
const ALWAYS_PUBLIC = ["/api/health", "/api/auth/demo", "/api/seed", "/api/alerts/scan", "/api/ai/purchase-copilot", "/api/parasut/oauth/callback", "/auth/callback"];

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

/**
 * M-3 Review (2026-05-25): rate-limit allow path'lerinin TÜMÜNE X-RateLimit-*
 * observability header ekler — NextResponse.next / redirect / 401 ayrımı yok.
 * 429 response zaten kendi header set'iyle dönüyor; bu helper başarılı yol için.
 */
function withRateHeaders(response: NextResponse, rate: RateCheckResult): NextResponse {
    response.headers.set("X-RateLimit-Limit", String(rate.limit));
    response.headers.set("X-RateLimit-Remaining", String(rate.remaining));
    return response;
}

function adminEmailsFromEnv(): string[] {
    return (process.env.ADMIN_EMAILS ?? "").split(",").map(e => e.trim()).filter(Boolean);
}

/**
 * RBAC Faz 2 page-gate. /dashboard/** için kullanıcının permission'ı yetmezse
 * /dashboard?forbidden=<path>'e redirect döner; yeterli/ilgisiz path → null.
 * Güvenlik enforcement burada (Sidebar filtre yalnız UX). Ek getUser çağrısı
 * yapmaz — perms zaten elde edilen rollerden türetilir.
 */
function pageGateRedirect(
    request: NextRequest,
    pathname: string,
    perms: Set<import("@/lib/auth/permissions").Permission>,
    rate: RateCheckResult,
    isAdmin = false,
): NextResponse | null {
    if (!pathname.startsWith("/dashboard")) return null;
    if (canAccessPath(pathname, perms, isAdmin)) return null;
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.searchParams.set("forbidden", pathname);
    return withRateHeaders(NextResponse.redirect(url), rate);
}

// proxy.ts convention: Next 16 named export `proxy` veya default export bekler.
// Mevcut testler `middleware()` import ediyordu — geriye uyumluluk için
// `middleware` alias'ı da export edilir (proxy.ts dosya altında).
export async function proxy(request: NextRequest) {
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
    //
    // M-3 Review (P2): demo_mode cookie de "authenticated-like" sayılır —
    // demo dashboard auto-reload trafiği (alerts 60s, purchase 60s, vb.) anon
    // 30/dk limitine takılırsa kullanıcı yanlışlıkla 429 görür. Demo session
    // YARATMA (/api/auth/demo) yine DEMO policy'de (5/15dk) kalır.
    const ip = extractClientIp(request);
    const hasAuthCookie = detectSupabaseAuthCookie(request);
    const hasDemoCookie = request.cookies.get("demo_mode")?.value === "1";
    const isSessionLike = hasAuthCookie || hasDemoCookie;
    const policy = selectPolicy(pathname, request.method, isSessionLike);
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
        return withRateHeaders(NextResponse.next(), rate);
    }

    // ── 5. CRON path ama CRON_SECRET yoksa 401 (mevcut M-1 invariant) ──────
    if (CRON_PATHS.some(p => pathname === p)) {
        return withRateHeaders(
            NextResponse.json({ error: "CRON_SECRET gerekli." }, { status: 401 }),
            rate,
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
                return withRateHeaders(
                    NextResponse.json({ error: "Bu kaynak için kimlik doğrulama gerekiyor." }, { status: 401 }),
                    rate,
                );
            }
            // Dashboard sayfaları → izin ver (RBAC: demo = viewer muamelesi;
            // viewer'a kapalı sayfalar — settings/parasut/import vb. — demo'ya da kapalı)
            if (pathname.startsWith("/dashboard")) {
                const demoPerms = permissionsForRoles(["viewer"]);
                const gated = pageGateRedirect(request, pathname, demoPerms, rate);
                if (gated) return gated;
                return withRateHeaders(NextResponse.next(), rate);
            }
            // GET API → izin ver (DataProvider veri çekebilsin)
            if (pathname.startsWith("/api/") && request.method === "GET") {
                return withRateHeaders(NextResponse.next(), rate);
            }
            // Non-GET API (POST/PATCH/DELETE) → 403
            if (pathname.startsWith("/api/")) {
                return withRateHeaders(
                    NextResponse.json({ error: "Demo modunda değişiklik yapılamaz." }, { status: 403 }),
                    rate,
                );
            }
            // / veya /login → mevcut davranışa düş
        }

        // Public sayfalar — auth gerektirmiyor
        if (pathname === "/login" || pathname === "/") {
            return withRateHeaders(NextResponse.next(), rate);
        }
        // API → 401 JSON
        if (pathname.startsWith("/api/")) {
            return withRateHeaders(
                NextResponse.json({ error: "Yetkisiz erişim." }, { status: 401 }),
                rate,
            );
        }
        // Diğer sayfalar → /login'e yönlendir
        const url = request.nextUrl.clone();
        url.pathname = "/login";
        return withRateHeaders(NextResponse.redirect(url), rate);
    }

    // ── Davetiye-bazlı erişim kilidi (yalnız bizim oluşturduğumuz kullanıcılar) ──
    // Birincil kilit = Supabase "Allow new users to sign up" OFF (self-signup oturum
    // bile yaratamaz). Bu kod tarafı = İKİNCİ kilit (defense-in-depth): signup ayarı
    // açık kalır/geri açılırsa veya kilitten önce kaydolan bir hesap kalırsa yakalar.
    // Google OAuth ile kendi kaydolan kullanıcıda app_metadata.roles HİÇ yoktur →
    // provize değil → reddet. Admin-created kullanıcılar (panel/create-admin) +
    // ADMIN_EMAILS bootstrap geçer.
    if (!isProvisionedUser(user.app_metadata, user.email, adminEmailsFromEnv())) {
        if (pathname.startsWith("/api/")) {
            return withRateHeaders(
                NextResponse.json({ error: "Hesabınız yetkili değil. Yöneticinizle iletişime geçin." }, { status: 403 }),
                rate,
            );
        }
        // /login → hata mesajıyla göster (döngü yok); diğer tüm sayfalar → /login?error=unauthorized
        if (pathname === "/login") {
            return withRateHeaders(NextResponse.next(), rate);
        }
        const url = request.nextUrl.clone();
        url.pathname = "/login";
        url.searchParams.set("error", "unauthorized");
        return withRateHeaders(NextResponse.redirect(url), rate);
    }

    // Auth'lu kullanıcı /login veya / → dashboard'a yönlendir
    if (pathname === "/login" || pathname === "/") {
        const url = request.nextUrl.clone();
        url.pathname = "/dashboard";
        return withRateHeaders(NextResponse.redirect(url), rate);
    }

    // RBAC Faz 2 page-gate — auth'lu kullanıcının rol→permission'ına göre
    // /dashboard/** erişimi. user.app_metadata authoritative (user_metadata DEĞİL).
    const roles = parseRoles(user.app_metadata, user.email, adminEmailsFromEnv());
    const perms = permissionsForRoles(roles);
    const gated = pageGateRedirect(request, pathname, perms, rate, roles.includes("admin"));
    if (gated) return gated;

    return withRateHeaders(supabaseResponse, rate);
}

// Backward-compat alias — mevcut testler `import { middleware } from "../../middleware"`
// veya proxy'den `middleware` import ediyor. Bu alias 1 satır maliyetle hem
// proxy convention'ı (Next runtime) hem test import'larını destekler.
export const middleware = proxy;

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};

// M-3 Review 2 (2026-05-25): Bu dosya **proxy.ts** convention'ı (eski
// `middleware.ts` rename). Next 16'da middleware Node.js runtime için iki yol:
//
//   1) `middleware.ts` + `export const runtime = "nodejs"` veya
//      `config.runtime = "nodejs"` — build'de `getStaticInfoIncludingLayouts`
//      runtime'ı düzgün parse etmedi. functions-config-manifest.json boş kaldı,
//      production'da middleware invoke EDİLMEDİ.
//
//   2) `proxy.ts` — `isProxyFile(page)` otomatik tanır, runtime export
//      gerekmez, build/utils.js:1535 koşulu (`staticInfo.runtime === 'nodejs'
//      || isProxyFile(page)`) sağlanır → functions-config-manifest.json'a
//      `/_middleware` entry'si yazılır → production'da middleware invoke EDİLİR.
//
// P0 smoke kanıtı (ilk Review öncesi): GET /dashboard auth'suz 200 (login
// redirect olmalıydı), GET /api/products 401 değil, POST /api/parasut/sync-all
// Bearer'sız 200 (CRON_SECRET 401 olmalıydı), X-RateLimit-* header yoktu —
// middleware tamamen bypass oluyordu. proxy.ts rename bu P0'ı kapatır.
//
// Davranış sözleşmesi değişmedi — Next runtime aynı fn signature'ı bekler
// (`export async function middleware(request: NextRequest)`); auth/cron/
// rate-limit gate'leri aynen çalışır.
