/**
 * "Beni hatırla" — remember.ts birim testleri + cookie-yazan katman kaynak kilitleri.
 * Davranış: roven_remember=0 → auth cookie'leri maxAge/expires'siz (session) yazılır;
 * "1"/yok/bozuk → kalıcı (geriye uyum). Silme yazımları persistence'tan muaf.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
    REMEMBER_COOKIE,
    shouldPersistSession,
    applySessionPersistence,
    rememberValueFromCookieHeader,
    serializeBrowserCookie,
} from "@/lib/auth/remember";

const read = (p: string) => readFileSync(p, "utf8");

describe("shouldPersistSession", () => {
    it('yalnız "0" kalıcılığı kapatır; yok/bozuk/1 → kalıcı', () => {
        expect(shouldPersistSession("0")).toBe(false);
        expect(shouldPersistSession("1")).toBe(true);
        expect(shouldPersistSession(undefined)).toBe(true);
        expect(shouldPersistSession(null)).toBe(true);
        expect(shouldPersistSession("garbage")).toBe(true);
    });
});

describe("applySessionPersistence", () => {
    it("persist=true → opsiyonlar aynen", () => {
        const opts = { maxAge: 400 * 86400, path: "/" };
        expect(applySessionPersistence(opts, true)).toBe(opts);
    });

    it("persist=false → maxAge/expires silinir (session cookie)", () => {
        const out = applySessionPersistence(
            { maxAge: 400 * 86400, expires: new Date(Date.now() + 86400_000), path: "/", sameSite: "lax" as const },
            false,
        );
        expect(out.maxAge).toBeUndefined();
        expect(out.expires).toBeUndefined();
        expect(out.path).toBe("/");
        expect(out.sameSite).toBe("lax");
    });

    it("SİLME yazımlarına dokunmaz (maxAge<=0 / geçmiş expires) — logout bozulmaz", () => {
        const del1 = { maxAge: 0, path: "/" };
        expect(applySessionPersistence(del1, false)).toBe(del1);
        const del2 = { expires: new Date(0), path: "/" };
        expect(applySessionPersistence(del2, false)).toBe(del2);
    });
});

describe("rememberValueFromCookieHeader", () => {
    it("header'dan değeri çeker; yoksa undefined", () => {
        expect(rememberValueFromCookieHeader("a=1; roven_remember=0; b=2")).toBe("0");
        expect(rememberValueFromCookieHeader("roven_remember=1")).toBe("1");
        expect(rememberValueFromCookieHeader("a=1; b=2")).toBeUndefined();
    });
});

describe("serializeBrowserCookie", () => {
    it("maxAge'li yazım Max-Age içerir; session yazım içermez", () => {
        const persistent = serializeBrowserCookie("sb-x", "v", { maxAge: 100 }, true);
        expect(persistent).toContain("Max-Age=100");
        expect(persistent).toContain("Secure");

        const session = serializeBrowserCookie("sb-x", "v", {}, false);
        expect(session).not.toContain("Max-Age");
        expect(session).not.toContain("Expires");
        expect(session).not.toContain("Secure");
        expect(session).toContain("Path=/");
        expect(session).toContain("SameSite=Lax");
    });
});

describe("kaynak kilitleri — cookie yazan üç katman + login sayfası", () => {
    it("server.ts setAll persistence uygular", () => {
        const src = read("src/lib/supabase/server.ts");
        expect(src).toContain("shouldPersistSession(cookieStore.get(REMEMBER_COOKIE)?.value)");
        expect(src).toContain("applySessionPersistence(options ?? {}, persist)");
    });

    it("proxy.ts setAll persistence uygular", () => {
        const src = read("src/proxy.ts");
        expect(src).toContain("shouldPersistSession(request.cookies.get(REMEMBER_COOKIE)?.value)");
        expect(src).toContain("applySessionPersistence(options ?? {}, persist)");
    });

    it("client.ts custom cookie katmanı persistence uygular ve tercih cookie'sini atlar", () => {
        const src = read("src/lib/supabase/client.ts");
        expect(src).toContain("rememberValueFromCookieHeader(document.cookie)");
        expect(src).toContain("applySessionPersistence(options ?? {}, persist)");
        expect(src).toContain("if (name === REMEMBER_COOKIE) continue;");
    });

    it("login sayfası tercihi her iki akışta sign-in ÖNCESİ yazar; KOZMETİK yorumu geri gelmez", () => {
        const src = read("src/app/login/page.tsx");
        expect(src).toContain("persistRememberChoice(remember);");
        expect(src.split("persistRememberChoice(remember);").length - 1).toBe(2); // şifre + Google
        expect(src).not.toContain("KOZMETİK");
        expect(src).toContain(`\${REMEMBER_COOKIE}=`);
    });

    it("REMEMBER_COOKIE adı sabit (cookie sözleşmesi)", () => {
        expect(REMEMBER_COOKIE).toBe("roven_remember");
    });
});
