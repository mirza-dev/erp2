/**
 * Sistem Durumu — env → sağlık raporu (onboarding, 2026-09-16).
 *
 * İki iddia: (1) rapor hiçbir env DEĞERİ sızdırmaz (yalnız var/yok + etiket;
 * tek istisna public NEXT_PUBLIC_APP_URL); (2) sınıflandırma deploy-env-matrix
 * ile aynı — "sessizce kapanan" özellik yeşil build'in arkasında kaybolmasın.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { buildSystemStatus } from "@/lib/system-status";

const { mockRequirePermission, mockProbeAIKey } = vi.hoisted(() => ({
    mockRequirePermission: vi.fn(),
    mockProbeAIKey: vi.fn(),
}));
vi.mock("@/lib/auth/role-guard", () => ({
    requirePermission: (...a: unknown[]) => mockRequirePermission(...a),
}));
vi.mock("@/lib/services/ai-service", () => ({
    probeAIKey: (...a: unknown[]) => mockProbeAIKey(...a),
}));
import { GET } from "@/app/api/settings/system-status/route";

const SECRET = "sk-SUPER-SECRET-VALUE-9f8e7d";

const FULL = {
    NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: SECRET,
    SUPABASE_SERVICE_ROLE_KEY: SECRET,
    ADMIN_EMAILS: "a@b.c",
    CRON_SECRET: SECRET,
    RESEND_API_KEY: SECRET,
    EMAIL_FROM: "Roven <no-reply@example.com>",
    RESEND_WEBHOOK_SECRET: SECRET,
    ANTHROPIC_API_KEY: SECRET,
    OPENAI_API_KEY: SECRET,
    REDIS_URL: "redis://x",
    LIVE_RATES_API_KEY: SECRET,
    NEXT_PUBLIC_APP_URL: "https://erp.example.com",
    SENTRY_DSN: SECRET,
    SENTRY_ENVIRONMENT: "production",
    PARASUT_ENABLED: "true",
    PARASUT_CLIENT_ID: SECRET,
    PARASUT_CLIENT_SECRET: SECRET,
    PARASUT_COMPANY_ID: "123",
    QUOTE_SHARE_SECRET: SECRET,
    INTERNAL_OPERATOR_EMAILS: "ops@example.com",
    NODE_ENV: "production",
};

describe("buildSystemStatus — sızıntı yok", () => {
    it("rapor JSON'unda hiçbir gizli değer geçmez (yalnız public APP_URL)", () => {
        const json = JSON.stringify(buildSystemStatus(FULL, { reason: "ok" }));
        expect(json).not.toContain(SECRET);
        expect(json).not.toContain("a@b.c");
        expect(json).not.toContain("ops@example.com");
        expect(json).not.toContain("no-reply@example.com");
        expect(json).toContain("https://erp.example.com");
    });

    it("her satır env ADI taşır, değer değil", () => {
        for (const it of buildSystemStatus(FULL, { reason: "ok" }).items) {
            expect(it.env.length).toBeGreaterThan(0);
            for (const name of it.env) expect(name).toMatch(/^[A-Z0-9_]+$/);
        }
    });
});

describe("buildSystemStatus — sınıflandırma (deploy-env-matrix ile aynı)", () => {
    it("tam ortam + geçerli AI → danger/warning sıfır", () => {
        const r = buildSystemStatus(FULL, { reason: "ok" });
        expect(r.summary.danger).toBe(0);
        expect(r.summary.warning).toBe(0);
        expect(r.items.find(i => i.key === "ai")!.state).toBe("Çalışıyor");
    });

    it("boş ortam: zorunlular danger, sessizler warning/danger, isteğe bağlılar info", () => {
        const r = buildSystemStatus({}, { reason: "no_key" });
        const tone = (k: string) => r.items.find(i => i.key === k)!.tone;
        expect(tone("supabase")).toBe("danger");
        expect(tone("cron")).toBe("danger");
        expect(tone("email")).toBe("danger");
        expect(tone("ai")).toBe("warning");
        expect(tone("app_url")).toBe("warning");
        expect(tone("redis")).toBe("info");
        expect(tone("parasut")).toBe("info"); // kapalı = teslim varsayılanı, kusur değil
        expect(r.items.find(i => i.key === "supabase")!.state).toContain("NEXT_PUBLIC_SUPABASE_URL");
    });

    it("e-posta: yalnız API key + FROM → doğrudan gönderim açık ama kuyruk bekliyor (warning)", () => {
        // İki ayrı eşik var (deploy-env-matrix): outbox üçünü birden ister.
        const r = buildSystemStatus({ RESEND_API_KEY: "k", EMAIL_FROM: "f" });
        const email = r.items.find(i => i.key === "email")!;
        expect(email.tone).toBe("warning");
        expect(email.state).toContain("RESEND_WEBHOOK_SECRET");
    });

    it("AI: anahtar var ama Anthropic reddediyor → danger + HTTP kodu (2026-08-30 canlı kusuru)", () => {
        const ai = buildSystemStatus({ ANTHROPIC_API_KEY: "k" }, { reason: "auth_failed", status: 401 }).items.find(i => i.key === "ai")!;
        expect(ai.tone).toBe("danger");
        expect(ai.state).toBe("Anahtar geçersiz (HTTP 401)");
    });

    it("AI: probe atılmadıysa (script) anahtar var → info 'geçerlilik ölçülmedi'", () => {
        const ai = buildSystemStatus({ ANTHROPIC_API_KEY: "k" }).items.find(i => i.key === "ai")!;
        expect(ai.tone).toBe("info");
    });

    it("Sentry: prod'da DSN var ama SENTRY_ENVIRONMENT yok → warning (mig.111 gruplama)", () => {
        const s = buildSystemStatus({ SENTRY_DSN: "d", NODE_ENV: "production" }).items.find(i => i.key === "sentry")!;
        expect(s.tone).toBe("warning");
        expect(s.state).toContain("SENTRY_ENVIRONMENT");
    });

    it("Paraşüt açık ama kimlik eksik → danger", () => {
        expect(buildSystemStatus({ PARASUT_ENABLED: "true" }).items.find(i => i.key === "parasut")!.tone).toBe("danger");
    });

    it("sesli giriş İKİ anahtarı birden ister", () => {
        expect(buildSystemStatus({ OPENAI_API_KEY: "o" }).items.find(i => i.key === "voice")!.tone).toBe("info");
        expect(buildSystemStatus({ OPENAI_API_KEY: "o", ANTHROPIC_API_KEY: "a" }).items.find(i => i.key === "voice")!.tone).toBe("ok");
    });

    it("her satır üç sınıftan birinde ve özet toplamı satır sayısına eşit", () => {
        const r = buildSystemStatus(FULL, { reason: "ok" });
        for (const it of r.items) expect(["zorunlu", "sessiz", "deger"]).toContain(it.klass);
        expect(r.summary.ok + r.summary.warning + r.summary.danger + r.summary.info).toBe(r.items.length);
    });
});

describe("GET /api/settings/system-status", () => {
    beforeEach(() => {
        mockRequirePermission.mockReset();
        mockProbeAIKey.mockReset();
        mockRequirePermission.mockResolvedValue(null);
        mockProbeAIKey.mockResolvedValue({ available: true, reason: "ok" });
    });

    const req = () => new NextRequest("http://localhost:3000/api/settings/system-status");

    it("view_settings ister (admin); yetkisizde 403 ve AI probe atılmaz", async () => {
        mockRequirePermission.mockResolvedValue(NextResponse.json({ error: "Yetkiniz yok." }, { status: 403 }));
        const res = await GET(req());
        expect(res.status).toBe(403);
        expect(mockRequirePermission).toHaveBeenCalledWith(expect.anything(), "view_settings");
        expect(mockProbeAIKey).not.toHaveBeenCalled();
    });

    it("yanıt rapor şeklindedir ve AI probe sonucunu taşır", async () => {
        mockProbeAIKey.mockResolvedValue({ available: false, reason: "auth_failed", status: 401 });
        const res = await GET(req());
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(Array.isArray(body.items)).toBe(true);
        expect(body.summary).toBeDefined();
        const ai = body.items.find((i: { key: string }) => i.key === "ai");
        // Anahtar env'de olmayabilir (test ortamı) → "tanımsız"; varsa 401 etiketi.
        expect(["Anahtar tanımsız", "Anahtar geçersiz (HTTP 401)"]).toContain(ai.state);
    });
});
