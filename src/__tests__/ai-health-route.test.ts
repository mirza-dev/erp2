/**
 * GET /api/ai/health + istemci tarafı mesaj seçimi.
 *
 * Bu uç, "AI açık mı" sorusunun TEK doğru kaynağı. Veri Aktarım Merkezi hub'ı,
 * İncele ekranı ve uyarılar sayfası aynı ayrımı okuyor: no_key / auth_failed / ok.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

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

import { NextRequest, NextResponse } from "next/server";
import { GET } from "@/app/api/ai/health/route";
import { aiUnavailableMessage, type AiHealth } from "@/lib/ai-health";

function req(): NextRequest {
    return new NextRequest("http://localhost:3000/api/ai/health");
}

beforeEach(() => {
    mockRequirePermission.mockReset();
    mockProbeAIKey.mockReset();
    mockRequirePermission.mockResolvedValue(null); // yetkili
});

describe("guard", () => {
    it("yetkisiz kullanıcı 403 alır", async () => {
        mockRequirePermission.mockResolvedValue(
            NextResponse.json({ error: "Yetkiniz yok." }, { status: 403 }),
        );
        const res = await GET(req());
        expect(res.status).toBe(403);
        // Guard geçilmeden probe ÇAĞRILMAMALI — yetkisiz istek token yakamaz.
        expect(mockProbeAIKey).not.toHaveBeenCalled();
    });

    it("AI kullanan ekranların izinlerinden herhangi biri yeterli", async () => {
        mockProbeAIKey.mockResolvedValue({ available: true, reason: "ok" });
        await GET(req());
        expect(mockRequirePermission).toHaveBeenCalledWith(
            expect.anything(),
            ["view_import", "view_alerts", "view_products"],
        );
    });
});

describe("durum aktarımı", () => {
    it("ok durumunu aynen döner", async () => {
        mockProbeAIKey.mockResolvedValue({ available: true, reason: "ok" });
        const res = await GET(req());
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ available: true, reason: "ok" });
    });

    it("anahtar geçersizse auth_failed + HTTP durumu taşır", async () => {
        mockProbeAIKey.mockResolvedValue({ available: false, reason: "auth_failed", status: 401 });
        const res = await GET(req());
        expect(await res.json()).toEqual({ available: false, reason: "auth_failed", status: 401 });
    });

    it("anahtar yoksa no_key döner", async () => {
        mockProbeAIKey.mockResolvedValue({ available: false, reason: "no_key" });
        expect(await (await GET(req())).json()).toEqual({ available: false, reason: "no_key" });
    });
});

describe("aiUnavailableMessage — sebep ayrımı kullanıcıya yansımalı", () => {
    it("çalışırken mesaj yok", () => {
        expect(aiUnavailableMessage({ available: true, reason: "ok" })).toBeNull();
    });

    it("durum bilinmiyorsa mesaj yok (yanlış 'kapalı' demeyiz)", () => {
        expect(aiUnavailableMessage(null)).toBeNull();
    });

    it("anahtar yoksa 'tanımlı değil' der", () => {
        const m = aiUnavailableMessage({ available: false, reason: "no_key" })!;
        expect(m).toContain("tanımlı değil");
        expect(m).toContain("Excel/CSV");
    });

    it("anahtar geçersizse 'geçersiz' der — kullanıcı ne yapacağını bilsin", () => {
        const m = aiUnavailableMessage({ available: false, reason: "auth_failed", status: 401 })!;
        expect(m).toContain("geçersiz");
        expect(m).toContain("Excel/CSV");
    });

    it("her iki kapalı durumda da çalışan yolu söyler", () => {
        const durumlar: AiHealth[] = [
            { available: false, reason: "no_key" },
            { available: false, reason: "auth_failed", status: 401 },
        ];
        for (const d of durumlar) {
            expect(aiUnavailableMessage(d)).toMatch(/Excel\/CSV yolu normal çalışıyor/);
        }
    });
});
