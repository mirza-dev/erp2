/**
 * M-3 Rate Limiting — pure helper testleri (extractClientIp + detectSupabaseAuthCookie).
 *
 * Bu helper'lar middleware sıralamasında kritik:
 *   - extractClientIp: Coolify Traefik X-Forwarded-For zinciri client IP'sini çıkarır
 *   - detectSupabaseAuthCookie: getUser() maliyetine girmeden auth proxy
 */
import { describe, it, expect } from "vitest";
import { extractClientIp, detectSupabaseAuthCookie } from "@/lib/rate-limit";

// ── extractClientIp ──────────────────────────────────────────────────────────

describe("extractClientIp — Coolify Traefik X-Forwarded-For", () => {
    it("xff zinciri varsa ilki client IP (virgül + trim)", () => {
        const req = { headers: new Headers({ "x-forwarded-for": "203.0.113.45, 10.0.0.1, 172.20.0.1" }) };
        expect(extractClientIp(req)).toBe("203.0.113.45");
    });

    it("xff yoksa x-real-ip fallback", () => {
        const req = { headers: new Headers({ "x-real-ip": "198.51.100.7" }) };
        expect(extractClientIp(req)).toBe("198.51.100.7");
    });

    it("hiçbir header yok → '0.0.0.0' (default rate limit'e dahil edilebilir bilinen değer)", () => {
        const req = { headers: new Headers() };
        expect(extractClientIp(req)).toBe("0.0.0.0");
    });
});

// ── detectSupabaseAuthCookie ─────────────────────────────────────────────────

describe("detectSupabaseAuthCookie — sb-*-auth-token presence", () => {
    function makeReq(cookieNames: string[]) {
        return {
            cookies: {
                getAll: () => cookieNames.map(name => ({ name })),
            },
        };
    }

    it("sb-abc-auth-token cookie varsa true (standart Supabase SSR)", () => {
        expect(detectSupabaseAuthCookie(makeReq(["sb-abc-auth-token"]))).toBe(true);
    });

    it("chunked cookie suffix (sb-x-auth-token.0, .1) varsa true (büyük token)", () => {
        expect(detectSupabaseAuthCookie(makeReq(["sb-x-auth-token.0", "sb-x-auth-token.1"]))).toBe(true);
    });

    it("yalnız diğer cookie'ler (demo_mode, generic) → false", () => {
        expect(detectSupabaseAuthCookie(makeReq(["demo_mode", "theme", "nextjs-locale"]))).toBe(false);
    });
});
