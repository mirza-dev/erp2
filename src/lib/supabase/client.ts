import { createBrowserClient } from "@supabase/ssr";
import {
    REMEMBER_COOKIE,
    shouldPersistSession,
    applySessionPersistence,
    rememberValueFromCookieHeader,
    serializeBrowserCookie,
} from "@/lib/auth/remember";

/**
 * Browser Supabase client — cookie yazımı "Beni hatırla" tercihine bağlı (2026-06):
 * `roven_remember=0` iken auth cookie'leri maxAge'siz (session) yazılır, tarayıcı
 * kapanınca düşer. getAll/setAll @supabase/ssr varsayılan davranışının birebir
 * karşılığıdır (encodeURIComponent + Path=/ + SameSite=Lax), tek fark persistence.
 */
export function createClient() {
    return createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    if (typeof document === "undefined") return [];
                    return document.cookie
                        .split("; ")
                        .filter(Boolean)
                        .map((c) => {
                            const i = c.indexOf("=");
                            return { name: c.slice(0, i), value: decodeURIComponent(c.slice(i + 1)) };
                        });
                },
                setAll(cookiesToSet) {
                    if (typeof document === "undefined") return;
                    const persist = shouldPersistSession(
                        rememberValueFromCookieHeader(document.cookie),
                    );
                    for (const { name, value, options } of cookiesToSet) {
                        if (name === REMEMBER_COOKIE) continue; // tercih cookie'sine dokunma
                        document.cookie = serializeBrowserCookie(
                            name,
                            value,
                            applySessionPersistence(options ?? {}, persist),
                            window.location.protocol === "https:",
                        );
                    }
                },
            },
        }
    );
}
