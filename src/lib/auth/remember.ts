/**
 * "Beni hatırla" — gerçek implementasyon (2026-06).
 *
 * Supabase JS session cookie'leri varsayılan olarak KALICI yazılır (maxAge ~400g).
 * Login sayfası kullanıcının tercihini `roven_remember` cookie'sine yazar
 * ("1" = kalıcı [varsayılan], "0" = tarayıcı kapanınca düşsün). Auth cookie'si
 * YAZAN her nokta (server.ts / proxy.ts / client.ts) yazım anında bu tercihi
 * okuyup `applySessionPersistence` ile maxAge/expires'ı düşürür → cookie
 * "session cookie" olur, tarayıcı kapanınca silinir.
 *
 * Saf modül — DOM/Next bağımlılığı yok (proxy edge bundle'ına girebilir).
 */

export const REMEMBER_COOKIE = "roven_remember";

/** Yalnız açık "0" kalıcılığı kapatır — cookie yok/bozuk → kalıcı (geriye uyum). */
export function shouldPersistSession(cookieValue: string | null | undefined): boolean {
    return cookieValue !== "0";
}

export interface SessionCookieOptions {
    maxAge?: number;
    expires?: Date;
    path?: string;
    domain?: string;
    sameSite?: boolean | "lax" | "strict" | "none";
    secure?: boolean;
    httpOnly?: boolean;
}

/**
 * persist=false iken maxAge/expires'ı SİLİNMİŞ kopya döner (session cookie).
 * SİLME yazımlarına dokunmaz (maxAge<=0 veya geçmiş expires) — onlardan
 * maxAge'i düşürmek silmeyi "session-set"e çevirir, logout bozulurdu.
 */
export function applySessionPersistence<T extends SessionCookieOptions>(
    options: T,
    persist: boolean,
): T {
    if (persist) return options;
    const isDeletion =
        (typeof options.maxAge === "number" && options.maxAge <= 0) ||
        (options.expires instanceof Date && options.expires.getTime() <= Date.now());
    if (isDeletion) return options;
    const next = { ...options };
    delete next.maxAge;
    delete next.expires;
    return next;
}

/** `document.cookie` benzeri ham cookie header'ından roven_remember değerini çeker. */
export function rememberValueFromCookieHeader(cookieHeader: string): string | undefined {
    const m = cookieHeader.match(/(?:^|;\s*)roven_remember=([^;]*)/);
    return m ? m[1] : undefined;
}

/**
 * Tarayıcı tarafı cookie serileştirici (client.ts custom setAll için).
 * @supabase/ssr varsayılanıyla uyumlu: değer encodeURIComponent'lenir
 * (Supabase değerleri base64url — pratikte no-op), Path varsayılanı "/".
 */
export function serializeBrowserCookie(
    name: string,
    value: string,
    options: SessionCookieOptions,
    isSecureContext: boolean,
): string {
    let s = `${name}=${encodeURIComponent(value)}`;
    if (typeof options.maxAge === "number") s += `; Max-Age=${Math.floor(options.maxAge)}`;
    if (options.expires instanceof Date) s += `; Expires=${options.expires.toUTCString()}`;
    s += `; Path=${options.path ?? "/"}`;
    if (options.domain) s += `; Domain=${options.domain}`;
    const sameSite = typeof options.sameSite === "string" ? options.sameSite : "lax";
    s += `; SameSite=${sameSite.charAt(0).toUpperCase()}${sameSite.slice(1)}`;
    if (options.secure ?? isSecureContext) s += "; Secure";
    return s;
}
