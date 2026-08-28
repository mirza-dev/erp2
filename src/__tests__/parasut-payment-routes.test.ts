/**
 * Faz 14 — tahsilat uçları.
 *   /api/parasut/poll-payments  → CRON (poll-e-documents kalıbı)
 *   /api/parasut/receivables    → GET, view_parasut (Açık Alacak kartının verisi)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";

const mockRequireCronSecret = vi.fn();
const mockPoll = vi.fn();

vi.mock("@/lib/auth/cron-guard", () => ({
    requireCronSecret: (...a: unknown[]) => mockRequireCronSecret(...a),
}));
vi.mock("@/lib/services/parasut-payment-service", () => ({
    serviceParasutPollPayments: (...a: unknown[]) => mockPoll(...a),
}));

import { POST as pollPayments } from "@/app/api/parasut/poll-payments/route";

function makeReq(): Request {
    return new Request("http://localhost/api/parasut/poll-payments", { method: "POST" });
}

beforeEach(() => {
    mockRequireCronSecret.mockReset();
    mockPoll.mockReset();
});

describe("POST /api/parasut/poll-payments", () => {
    it("CRON_SECRET yoksa guard yanıtı döner, servis çağrılmaz", async () => {
        const { NextResponse } = await import("next/server");
        mockRequireCronSecret.mockReturnValue(NextResponse.json({ error: "Yetkisiz." }, { status: 401 }));
        const res = await pollPayments(makeReq() as never);
        expect(res.status).toBe(401);
        expect(mockPoll).not.toHaveBeenCalled();
    });

    it("geçerli CRON_SECRET → 200 + özet", async () => {
        mockRequireCronSecret.mockReturnValue(null);
        mockPoll.mockResolvedValue({ checked: 5, updated: 5, failed: 0, overdue: 1 });
        const res = await pollPayments(makeReq() as never);
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ checked: 5, updated: 5, failed: 0, overdue: 1 });
    });

    it("devre dışıyken `disabled` bayrağı dışarı taşınır", async () => {
        // "0 sonuç" ile "hiç koşmadı" ayırt edilebilmeli — C3 dersi (degraded).
        mockRequireCronSecret.mockReturnValue(null);
        mockPoll.mockResolvedValue({ checked: 0, updated: 0, failed: 0, overdue: 0, disabled: true });
        const body = await (await pollPayments(makeReq() as never)).json();
        expect(body.disabled).toBe(true);
    });

    it("req'siz çağrıda guard atlanır (unit test yolu)", async () => {
        mockPoll.mockResolvedValue({ checked: 0, updated: 0, failed: 0, overdue: 0 });
        const res = await pollPayments();
        expect(res.status).toBe(200);
        expect(mockRequireCronSecret).not.toHaveBeenCalled();
    });
});

describe("kayıt ve guard yerleşimi", () => {
    const proxy = readFileSync("src/proxy.ts", "utf8");
    const receivables = readFileSync("src/app/api/parasut/receivables/route.ts", "utf8");

    it("poll-payments CRON_PATHS'te (oturum bypass'ı yok)", () => {
        expect(proxy).toContain('"/api/parasut/poll-payments"');
    });

    it("receivables CRON değil — oturum + view_parasut ile korunur", () => {
        expect(proxy).not.toContain('"/api/parasut/receivables"');
        expect(receivables).toContain('requirePermission(req, "view_parasut")');
    });

    it("receivables DAR kolon döner (müşteri/tutar ayrıntısı sızmaz)", () => {
        expect(receivables).toContain('.select("parasut_payment_status, parasut_remaining_try")');
        expect(receivables).not.toContain("select(\"*\")");
    });

    it("receivables yalnız açık faturaları sorgular", () => {
        expect(receivables).toContain('.in("parasut_payment_status", ["unpaid", "partially_paid", "overdue"])');
    });
});
