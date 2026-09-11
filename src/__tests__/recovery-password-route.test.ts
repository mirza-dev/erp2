/**
 * `POST /api/auth/recovery-password` — kurtarma akışının SUNUCU parola ucu.
 *
 * 2026-09-11, dış inceleme #2. Öncesinde `/sifre-yenile` politikayı istemcide
 * kontrol edip parolayı doğrudan tarayıcıdan yazıyordu; kurtarma oturumuna
 * sahip biri devtools'tan aynı çağrıyı yapıp politikayı atlayabiliyordu.
 * Diğer üç parola yüzeyi zaten sunucu-otoriterdi.
 *
 * Not: incelemenin delili olarak gösterilen `supabase/config.toml` YEREL
 * geliştirme config'idir (`project_id="proje-codex"`, port 54321), prod ayarı
 * değil — iddia yine de doğruydu, kanıtı yanlıştı.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetUser = vi.fn();
const mockUpdateUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
    createClient: () => Promise.resolve({
        auth: { getUser: mockGetUser, updateUser: mockUpdateUser },
    }),
}));

const mockServiceInsert = vi.fn();
vi.mock("@/lib/supabase/service", () => ({
    createServiceClient: () => ({ from: () => ({ insert: mockServiceInsert }) }),
}));

import { POST } from "@/app/api/auth/recovery-password/route";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password-policy";

const GOOD = "kuzeyde-parlayan-fener-2026";

beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "u-1", email: "user@example.com" } } });
    mockUpdateUser.mockResolvedValue({ data: {}, error: null });
    mockServiceInsert.mockResolvedValue({ error: null });
});

const req = (body: unknown) =>
    new NextRequest("http://localhost/api/auth/recovery-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });

describe("POST /api/auth/recovery-password", () => {
    it("kurtarma oturumu yoksa 401 — parola YAZILMAZ", async () => {
        mockGetUser.mockResolvedValue({ data: { user: null } });
        const res = await POST(req({ password: GOOD }));
        expect(res.status).toBe(401);
        expect(mockUpdateUser).not.toHaveBeenCalled();
    });

    it("politikayı geçmeyen parola 400 — SUNUCUDA reddedilir", async () => {
        const res = await POST(req({ password: "abc123" }));
        expect(res.status).toBe(400);
        expect(mockUpdateUser, "zayıf parola yazıldı — politika sunucuda uygulanmıyor")
            .not.toHaveBeenCalled();
        const body = await res.json() as { error: string };
        expect(body.error).toContain(String(MIN_PASSWORD_LENGTH));
    });

    it("kullanıcının kendi e-postası parola olamaz (bağlam sunucuya taşınıyor)", async () => {
        const res = await POST(req({ password: "user@example.com!!" }));
        expect(res.status).toBe(400);
        expect(mockUpdateUser).not.toHaveBeenCalled();
    });

    it("politikayı geçen parola yazılır ve audit kaydı düşer", async () => {
        const res = await POST(req({ password: GOOD }));
        expect(res.status).toBe(200);
        expect(mockUpdateUser).toHaveBeenCalledWith({ password: GOOD });
        expect(mockServiceInsert).toHaveBeenCalledWith(
            expect.objectContaining({ action: "password_reset_via_recovery" }),
        );
    });

    it("MEVCUT ŞİFRE İSTENMEZ — kurtarma akışının tanımı bu (kayda geçen karar)", async () => {
        const res = await POST(req({ password: GOOD }));
        expect(res.status).toBe(200);
    });

    it("Supabase reddederse 400 + dostça mesaj (süresi dolmuş bağlantı)", async () => {
        mockUpdateUser.mockResolvedValue({ data: {}, error: { message: "session expired" } });
        const res = await POST(req({ password: GOOD }));
        expect(res.status).toBe(400);
        const body = await res.json() as { error: string };
        expect(body.error).toContain("sıfırlama bağlantısı");
        // Ham Supabase metni kullanıcıya sızmamalı.
        expect(body.error).not.toContain("session expired");
    });

    it("audit hatası parola değişimini GERİ ALMAZ ama sessiz de kalmaz", async () => {
        const spy = vi.spyOn(console, "error").mockImplementation(() => {});
        try {
            mockServiceInsert.mockResolvedValue({ error: { message: "rls denied" } });
            const res = await POST(req({ password: GOOD }));
            expect(res.status).toBe(200);
            expect(spy).toHaveBeenCalled();
            expect(spy.mock.calls.flat().join(" ")).toContain("audit_insert_failed");
        } finally {
            spy.mockRestore();
        }
    });
});

describe("/sifre-yenile artık parolayı KENDİ yazmıyor", () => {
    it("sayfa sunucu ucuna gidiyor, doğrudan updateUser çağırmıyor", async () => {
        const { readFileSync } = await import("node:fs");
        const src = readFileSync("src/app/sifre-yenile/page.tsx", "utf8")
            .replace(/\/\*[\s\S]*?\*\//g, "")
            .replace(/^\s*\/\/.*$/gm, "");
        expect(src).toContain("/api/auth/recovery-password");
        expect(src, "sayfa hâlâ parolayı tarayıcıdan yazıyor")
            .not.toMatch(/updateUser\s*\(\s*\{\s*password/);
        // İstemci aynası KALIR — anında geri bildirim için.
        expect(src, "istemci politika aynası kaldırılmış — kullanıcı hatayı geç görür")
            .toMatch(/checkPasswordPolicy\(/);
    });
});
