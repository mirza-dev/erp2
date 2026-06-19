/**
 * M-3 Rate Limiting — pure helper testleri (extractClientIp + detectSupabaseAuthCookie).
 *
 * Bu helper'lar middleware sıralamasında kritik:
 *   - extractClientIp: X-Real-IP primary + XFF son-hop (spoof-dayanıklı, O5)
 *   - detectSupabaseAuthCookie: getUser() maliyetine girmeden auth proxy
 */
import { describe, it, expect } from "vitest";
import { extractClientIp, detectSupabaseAuthCookie } from "@/lib/rate-limit";

// ── extractClientIp (spoof-dayanıklı, O5 2026-06-19) ──────────────────────────

describe("extractClientIp — X-Real-IP primary + XFF son-hop", () => {
    it("XFF zincirinde EN SAĞDAKİ (son) hop alınır — soldaki spoof edilebilir", () => {
        // Eski sürüm soldaki (203.0.113.45) alıyordu = O5 spoof açığı; artık son hop.
        const req = { headers: new Headers({ "x-forwarded-for": "203.0.113.45, 10.0.0.1, 172.20.0.1" }) };
        expect(extractClientIp(req)).toBe("172.20.0.1");
    });

    it("X-Real-IP varsa XFF'i ezer (Traefik-set primary)", () => {
        const req = { headers: new Headers({ "x-real-ip": "198.51.100.7", "x-forwarded-for": "1.2.3.4" }) };
        expect(extractClientIp(req)).toBe("198.51.100.7");
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
