/**
 * `extractClientIp` — Redis-bağımsız helper testi.
 *
 * Önceden `src/lib/rate-limit.ts` içinde tanımlıydı; advisor refinement ile
 * `src/lib/request-ip.ts`'e taşındı (ai-route-limit.ts Redis runtime
 * bağımlılığı taşımasın). Test source-regex ile yeni dosyanın varlığını ve
 * rate-limit.ts'in re-export ile backward-compat sağladığını kilitler.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { extractClientIp } from "@/lib/request-ip";
import { extractClientIp as extractFromRateLimit } from "@/lib/rate-limit";

function makeReq(headers: Record<string, string>): { headers: Headers } {
    const h = new Headers();
    for (const [k, v] of Object.entries(headers)) h.set(k, v);
    return { headers: h };
}

describe("extractClientIp — behavior", () => {
    it("X-Forwarded-For zincirinde ilki alınır (Coolify Traefik standard)", () => {
        const req = makeReq({ "x-forwarded-for": "203.0.113.5, 10.0.0.1, 172.16.0.1" });
        expect(extractClientIp(req)).toBe("203.0.113.5");
    });

    it("XFF tek IP — direkt döner (whitespace trim)", () => {
        const req = makeReq({ "x-forwarded-for": "  198.51.100.7  " });
        expect(extractClientIp(req)).toBe("198.51.100.7");
    });

    it("XFF yok, X-Real-IP fallback", () => {
        const req = makeReq({ "x-real-ip": "192.0.2.99" });
        expect(extractClientIp(req)).toBe("192.0.2.99");
    });

    it("Hiçbir header yok → 0.0.0.0 default", () => {
        const req = makeReq({});
        expect(extractClientIp(req)).toBe("0.0.0.0");
    });
});

describe("extractClientIp — backward-compat re-export", () => {
    it("rate-limit.ts'ten import edilen extractClientIp aynı fn olmalı (re-export)", () => {
        expect(extractFromRateLimit).toBe(extractClientIp);
    });

    it("src/lib/request-ip.ts dosyası mevcut", () => {
        expect(existsSync(join(process.cwd(), "src/lib/request-ip.ts"))).toBe(true);
    });

    it("ai-route-limit.ts request-ip'ten import ediyor (Redis bağımsız)", () => {
        const src = readFileSync(join(process.cwd(), "src/lib/ai-route-limit.ts"), "utf8");
        expect(src).toMatch(/from\s*["']@\/lib\/request-ip["']/);
        // Negatif assertion: artık rate-limit'ten import etmemeli
        expect(src).not.toMatch(/extractClientIp[^}]*from\s*["']@\/lib\/rate-limit["']/);
    });

    it("rate-limit.ts re-export pattern korunur (mevcut proxy.ts importu kırılmasın)", () => {
        const src = readFileSync(join(process.cwd(), "src/lib/rate-limit.ts"), "utf8");
        expect(src).toMatch(/export\s*\{\s*extractClientIp\s*\}\s*from\s*["']@\/lib\/request-ip["']/);
    });
});
