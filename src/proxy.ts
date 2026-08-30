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
import { REMEMBER_COOKIE, shouldPersistSession, applySessionPersistence } from "@/lib/auth/remember";
import { canAccessPath } from "@/lib/auth/page-access";
import { hasInternalOperatorAccess } from "@/lib/auth/internal-access";
import { REQUEST_ID_HEADER, newRequestId } from "@/lib/telemetry/request-id";

// Hiç auth kontrolü yapılmayan path'ler (login'i dahil etmiyoruz — auth'd user redirect için)
// Not: /api/seed kendi içinde CRON_SECRET veya session kontrolü yapar
// /api/alerts/scan is listed here because it handles its own auth (CRON_SECRET OR session)
// /api/quotes/shared: müşteri teklif linki (login'siz) — kendi HMAC token doğrulaması var
// /api/alerts/ai-suggest: /api/alerts/scan ile AYNI sebeple burada (2026-08-24) —
// Uyarılar sayfasındaki "AI Öner" butonu bunu tarayıcıdan çağırıyor ama CRON_PATHS'te
// olduğu için her tık 401 alıyordu; AI bulguları kullanıcıya HİÇ ulaşmıyordu.
// Route kendi içinde CRON_SECRET OR (oturum + view_alerts) doğrular.
// /api/developer/retention: /api/alerts/scan ile AYNI sınıf — hem saatlik cron
// (Bearer CRON_SECRET) hem Tanılama ekranındaki "Şimdi temizle" (oturumlu
// internalOperator) çağırır. Route kendi içinde ikisinden birini doğrular;
// ikisi de yoksa 401/403 döner. CRON_PATHS'e konulsaydı oturum yolu 401 yerdi.
// DİKKAT: yalnız bu TEK yol açık — diğer /api/developer/* uçları normal
// oturum + internalOperator kapısından geçer.
const ALWAYS_PUBLIC = ["/api/health", "/api/auth/demo", "/api/seed", "/api/alerts/scan", "/api/alerts/ai-suggest", "/api/ai/purchase-copilot", "/api/parasut/oauth/callback", "/api/email/webhooks/resend", "/auth/callback", "/api/quotes/shared", "/api/developer/retention"];

// Sadece CRON_SECRET Bearer token ile erişilir — session bypass YOK
// Not: /api/alerts/scan ve /api/alerts/ai-suggest buraya dahil DEĞİL — ikisi de
// kendi içinde session OR CRON_SECRET kontrolü yapar (UI butonları var).
const CRON_PATHS = [
    "/api/parasut/sync-all",
    "/api/parasut/sync-purchase-all",
    "/api/parasut/poll-e-documents",
    "/api/parasut/poll-payments",
    "/api/parasut/reconcile-stock",
    "/api/orders/check-shipments",
    "/api/quotes/expire",
    "/api/email/retry-failed",
    "/api/email/outbox/process",
];

/**
 * Yalnız internal operator'a açık sayfa önekleri.
 *
 * Bunlar `page-access.ts` matrisinden AYRI tutulur çünkü matris bir Permission
 * ister; internalOperator ise permission DEĞİL — müşteriye atanabilen bir rolle
 * elde edilemeyen, e-posta allowlist'ine bağlı ve `INTERNAL_OPERATOR_EMAILS`
 * tanımsızken fail-closed olan ayrı bir sinyaldir. Matris kaba ilk kapı
 * (view_settings), burası ince kapı.
 */
const INTERNAL_ONLY_PREFIXES = [
    "/dashboard/settings/email-deliveries",
    "/dashboard/developer",
];

/**
 * M-3 Review (2026-05-25): rate-limit allow path'lerinin TÜMÜNE X-RateLimit-*
 * observability header ekler — NextResponse.next / redirect / 401 ayrımı yok.
 * 429 response zaten kendi header set'iyle dönüyor; bu helper başarılı yol için.
 */
function withRateHeaders(
    response: NextResponse,
    rate: RateCheckResult,
    requestId: string,
): NextResponse {
    response.headers.set("X-RateLimit-Limit", String(rate.limit));
    response.headers.set("X-RateLimit-Remaining", String(rate.remaining));
    // 2026-08 Nit: `Reset` yalnız 429'da basılıyordu → istemci geri-çekilme
    // hesabı yapamıyordu. Üç başlık artık her yolda birlikte gider.
    response.headers.set(
        "X-RateLimit-Reset",
        String(Math.ceil(Date.now() / 1000) + Math.max(0, rate.retryAfter)),
    );
    // Developer Console §13 — kullanıcı/tarayıcı aynı ID'yi görsün; bir hata
    // bildirildiğinde "şu isteğe bak" demek için tek referans.
    response.headers.set(REQUEST_ID_HEADER, requestId);
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
    requestId: string,
    isAdmin = false,
): NextResponse | null {
    if (!pathname.startsWith("/dashboard")) return null;
    if (canAccessPath(pathname, perms, isAdmin)) return null;
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.searchParams.set("forbidden", pathname);
    return withRateHeaders(NextResponse.redirect(url), rate, requestId);
}

// proxy.ts convention: Next 16 named export `proxy` veya default export bekler.
// Mevcut testler `middleware()` import ediyordu — geriye uyumluluk için
// `middleware` alias'ı da export edilir (proxy.ts dosya altında).
export async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // ── 0. Request ID (Developer Console §13) ───────────────────────────────
    // Bu projede korelasyon kimliği HİÇ yoktu: bir hatayla o hataya yol açan
    // isteği bağlamanın yolu yoktu. ID burada üretilir ve İSTEK başlığına
    // yazılır; route handler'lar `next/headers` ile okur. Böylece 148 route'un
    // hiçbirinin imzası değişmez (§21). Yanıt başlığına da basılır.
    const requestId = newRequestId();
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set(REQUEST_ID_HEADER, requestId);
    const forward = (): NextResponse => {
        const res = NextResponse.next({ request: { headers: requestHeaders } });
        res.headers.set(REQUEST_ID_HEADER, requestId);
        return res;
    };

    // ── 1. /api/health — ABSOLUTE bypass (monitoring, k6 smoke) ─────────────
    // Coolify/UptimeRobot health check 30-60sn/IP frekans — rate limit'e takılırsa
    // izleme kırılır. Diğer eski ALWAYS_PUBLIC endpoint'leri (auth/demo, ai/*) artık
    // rate limit'e tabi (M-3) ama auth gate'i aşağıda atlamaya devam eder.
    if (pathname === "/api/health") {
        return forward();
    }

    // ── 2. CRON_SECRET Bearer — server-to-server bypass ─────────────────────
    // Vercel/GH Actions cron meşru yüksek frekans (4-8x/gün × server-side). Rate
    // limit'i de atlatır. SECRET yoksa aşağıda 401 dönülecek (M-1 invariant).
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = request.headers.get("authorization");
    const hasCronSecret = Boolean(cronSecret) && authHeader === `Bearer ${cronSecret}`;
    if (hasCronSecret && CRON_PATHS.some(p => pathname === p)) {
        return forward();
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
        return withRateHeaders(forward(), rate, requestId);
    }

    // ── 5. CRON path ama CRON_SECRET yoksa 401 (mevcut M-1 invariant) ──────
    if (CRON_PATHS.some(p => pathname === p)) {
        return withRateHeaders(
            NextResponse.json({ error: "CRON_SECRET gerekli." }, { status: 401 }),
            rate,
            requestId,
        );
    }

    // ── 6. Supabase session kontrolü ────────────────────────────────────────
    let supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } });

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
                        supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } });
                        // "Beni hatırla" kapalıysa token-refresh yazımları da session cookie kalır.
                        const persist = shouldPersistSession(request.cookies.get(REMEMBER_COOKIE)?.value);
                        cookiesToSet.forEach(({ name, value, options }) =>
                            supabaseResponse.cookies.set(name, value, applySessionPersistence(options ?? {}, persist))
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
            // Denetim O11 (2026-06) — default FLIP: demo cookie'li anonim kullanıcı
            // private bucket signed URL uçlarına VARSAYILAN OLARAK erişemez
            // (sertifika/çizim/PDF sızıntısı). Bucket'ı yalnız seed/fake data içeren
            // izole demo dağıtımı bilinçli açabilir: ATTACHMENTS_ALLOW_DEMO_ANON=true.
            // (Eski opt-in BLOCK bayrağı kaldırıldı — bloklama artık default.)
            if (
                process.env.ATTACHMENTS_ALLOW_DEMO_ANON !== "true" &&
                /^\/api\/products\/[^/]+\/attachments/.test(pathname)
            ) {
                return withRateHeaders(
                    NextResponse.json({ error: "Bu kaynak için kimlik doğrulama gerekiyor." }, { status: 401 }),
                    rate,
                    requestId,
                );
            }
            // Dashboard sayfaları → izin ver (RBAC: demo = viewer muamelesi;
            // viewer'a kapalı sayfalar — settings/parasut/import vb. — demo'ya da kapalı)
            if (pathname.startsWith("/dashboard")) {
                const demoPerms = permissionsForRoles(["viewer"]);
                const gated = pageGateRedirect(request, pathname, demoPerms, rate, requestId);
                if (gated) return gated;
                return withRateHeaders(forward(), rate, requestId);
            }
            // GET API → izin ver (DataProvider veri çekebilsin)
            if (pathname.startsWith("/api/") && request.method === "GET") {
                return withRateHeaders(forward(), rate, requestId);
            }
            // Non-GET API (POST/PATCH/DELETE) → 403
            if (pathname.startsWith("/api/")) {
                return withRateHeaders(
                    NextResponse.json({ error: "Demo modunda değişiklik yapılamaz." }, { status: 403 }),
                    rate,
                    requestId,
                );
            }
            // / veya /login → mevcut davranışa düş
        }

        // Public sayfalar — auth gerektirmiyor
        if (pathname === "/login" || pathname === "/") {
            return withRateHeaders(forward(), rate, requestId);
        }
        // API → 401 JSON
        if (pathname.startsWith("/api/")) {
            return withRateHeaders(
                NextResponse.json({ error: "Yetkisiz erişim." }, { status: 401 }),
                rate,
                requestId,
            );
        }
        // Diğer sayfalar → /login'e yönlendir
        const url = request.nextUrl.clone();
        url.pathname = "/login";
        return withRateHeaders(NextResponse.redirect(url), rate, requestId);
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
                requestId,
            );
        }
        // /login → hata mesajıyla göster (döngü yok); diğer tüm sayfalar → /login?error=unauthorized
        if (pathname === "/login") {
            return withRateHeaders(forward(), rate, requestId);
        }
        const url = request.nextUrl.clone();
        url.pathname = "/login";
        url.searchParams.set("error", "unauthorized");
        return withRateHeaders(NextResponse.redirect(url), rate, requestId);
    }

    // Auth'lu kullanıcı /login veya / → dashboard'a yönlendir
    if (pathname === "/login" || pathname === "/") {
        const url = request.nextUrl.clone();
        url.pathname = "/dashboard";
        return withRateHeaders(NextResponse.redirect(url), rate, requestId);
    }

    // RBAC Faz 2 page-gate — auth'lu kullanıcının rol→permission'ına göre
    // /dashboard/** erişimi. user.app_metadata authoritative (user_metadata DEĞİL).
    const roles = parseRoles(user.app_metadata, user.email, adminEmailsFromEnv());
    const perms = permissionsForRoles(roles);
    if (
        INTERNAL_ONLY_PREFIXES.some(p => pathname === p || pathname.startsWith(p + "/"))
        && !hasInternalOperatorAccess(user.email, perms)
    ) {
        const url = request.nextUrl.clone();
        url.pathname = "/dashboard";
        url.searchParams.set("forbidden", pathname);
        return withRateHeaders(NextResponse.redirect(url), rate, requestId);
    }
    const gated = pageGateRedirect(request, pathname, perms, rate, requestId, roles.includes("admin"));
    if (gated) return gated;

    return withRateHeaders(supabaseResponse, rate, requestId);
}

// Backward-compat alias — mevcut testler `import { middleware } from "../../middleware"`
// veya proxy'den `middleware` import ediyor. Bu alias 1 satır maliyetle hem
// proxy convention'ı (Next runtime) hem test import'larını destekler.
export const middleware = proxy;

/**
 * 2026-08 D7 — matcher muafiyeti DARALTILDI.
 *
 * Eski desen `.*\..*` ile **path'inde nokta geçen HER yolu** middleware'den
 * muaf tutuyordu; `/api/products/foo.bar` gibi bir istek gerçek bir route
 * handler'ına ulaşıyor ama request-id üretilmiyor, rate-limit uygulanmıyor ve
 * oturum/RBAC kapısı hiç çalışmıyordu. (Developer Console uçları kendi
 * guard'larını taşıdığı için panel bu yoldan açılmıyordu; etki korelasyon
 * kaybı ve kapı atlanmasıydı.)
 *
 * Yeni desen yalnız BİLİNEN statik uzantılarla BİTEN yolları muaf tutar.
 * `public/` yalnız `.svg` içeriyor; `/icon.svg` ve `/favicon.ico` da listede.
 * Uzantısız her yol (tüm API route'ları ve sayfalar) artık middleware'den geçer.
 */
// NOT: Next `config.matcher` STATİK literal olmak zorunda — string
// birleştirme build'de "route-segment-config" hatası verir (denendi).
export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpe?g|gif|webp|avif|ico|css|js|mjs|map|woff2?|ttf|otf|txt|xml|webmanifest)$).*)"],
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
