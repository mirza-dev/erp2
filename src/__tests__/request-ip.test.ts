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

describe("extractClientIp — spoof-dayanıklı davranış (O5)", () => {
    it("X-Real-IP PRIMARY — Traefik-set, XFF spoof'undan bağımsız kazanır", () => {
        // Saldırgan XFF soluna sahte IP koysa bile X-Real-IP (Traefik) kullanılır.
        const req = makeReq({
            "x-real-ip": "192.0.2.99",
            "x-forwarded-for": "1.2.3.4, 203.0.113.5",
        });
        expect(extractClientIp(req)).toBe("192.0.2.99");
    });

    it("X-Real-IP yoksa XFF'in EN SAĞDAKİ (son) hop'u alınır — soldaki client-kontrollü DEĞİL", () => {
        // Traefik gerçek peer'ı XFF'e EKLER → son değer güvenilir.
        const req = makeReq({ "x-forwarded-for": "203.0.113.5, 10.0.0.1, 172.16.0.99" });
        expect(extractClientIp(req)).toBe("172.16.0.99");
    });

    it("SPOOF: saldırgan soldaki sahte IP alınmaz (eski davranışın gerilemesi kilidi)", () => {
        // Önceki sürüm soldaki "evil"i alıyordu (O5 açığı) — artık en sağ alınır.
        const req = makeReq({ "x-forwarded-for": "evil-spoof, 198.51.100.7" });
        expect(extractClientIp(req)).toBe("198.51.100.7");
    });

    it("XFF tek IP — direkt döner (whitespace trim)", () => {
        const req = makeReq({ "x-forwarded-for": "  198.51.100.7  " });
        expect(extractClientIp(req)).toBe("198.51.100.7");
    });

    it("X-Real-IP garbage → XFF son-hop fallback", () => {
        const req = makeReq({ "x-real-ip": "not-an-ip", "x-forwarded-for": "10.0.0.1, 192.0.2.50" });
        expect(extractClientIp(req)).toBe("192.0.2.50");
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

    it("ai-route-limit.ts extractClientIp'i request-ip'ten alır (rate-limit'ten DEĞİL)", () => {
        // O5 (2026-06-19): ai-route-limit artık rateLimitCheck/aiRoutePolicy'yi
        // rate-limit.ts'ten import eder (Redis-primary). Ancak extractClientIp
        // hâlâ Redis-bağımsız request-ip helper'ından gelmeli — bu assertion onu kilitler.
        const src = readFileSync(join(process.cwd(), "src/lib/ai-route-limit.ts"), "utf8");
        expect(src).toMatch(/from\s*["']@\/lib\/request-ip["']/);
        // extractClientIp rate-limit'ten import EDİLMEMELİ (yalnız request-ip).
        expect(src).not.toMatch(/extractClientIp[^}]*from\s*["']@\/lib\/rate-limit["']/);
    });

    it("rate-limit.ts re-export pattern korunur (mevcut proxy.ts importu kırılmasın)", () => {
        const src = readFileSync(join(process.cwd(), "src/lib/rate-limit.ts"), "utf8");
        expect(src).toMatch(/export\s*\{\s*extractClientIp\s*\}\s*from\s*["']@\/lib\/request-ip["']/);
    });
});
