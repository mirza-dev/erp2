import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Hiç auth kontrolü yapılmayan path'ler (login'i dahil etmiyoruz — auth'd user redirect için)
const ALWAYS_PUBLIC = ["/api/health"];

// Cron/external servisler: CRON_SECRET Bearer token ile erişir
const CRON_PATHS = [
    "/api/alerts/scan",
    "/api/alerts/ai-suggest",
    "/api/parasut/sync-all",
];

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Kesinlikle public olan path'ler
    if (ALWAYS_PUBLIC.some(p => pathname === p || pathname.startsWith(p + "/"))) {
        return NextResponse.next();
    }

    // Cron path'ler — CRON_SECRET ile bypass
    if (CRON_PATHS.some(p => pathname === p)) {
        const secret = process.env.CRON_SECRET;
        const authHeader = request.headers.get("authorization");
        if (secret && authHeader === `Bearer ${secret}`) {
            return NextResponse.next();
        }
        // Secret yoksa veya header eşleşmiyorsa → session kontrolüne düş
    }

    // Supabase session kontrolü
    let supabaseResponse = NextResponse.next({ request });

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

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        // /login sayfası — auth gerektirmiyor, geç
        if (pathname === "/login") {
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

    // Auth'lu kullanıcı /login'e gelirse → dashboard'a yönlendir
    if (pathname === "/login") {
        const url = request.nextUrl.clone();
        url.pathname = "/dashboard";
        return NextResponse.redirect(url);
    }

    return supabaseResponse;
}

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
