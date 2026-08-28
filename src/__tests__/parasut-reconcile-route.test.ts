/**
 * Faz 15 — /api/parasut/reconcile-stock (CRON).
 * Varsayılanı YALNIZ RAPOR olduğu için, ucun yazma yapmadığı da kilitlenir.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";

const mockRequireCronSecret = vi.fn();
const mockReconcile = vi.fn();

vi.mock("@/lib/auth/cron-guard", () => ({
    requireCronSecret: (...a: unknown[]) => mockRequireCronSecret(...a),
}));
vi.mock("@/lib/services/parasut-stock-service", () => ({
    serviceReconcileParasutStock: (...a: unknown[]) => mockReconcile(...a),
}));

import { POST } from "@/app/api/parasut/reconcile-stock/route";

function makeReq(): Request {
    return new Request("http://localhost/api/parasut/reconcile-stock", { method: "POST" });
}

beforeEach(() => {
    mockRequireCronSecret.mockReset();
    mockReconcile.mockReset();
});

describe("POST /api/parasut/reconcile-stock", () => {
    it("CRON_SECRET yoksa 401, servis çağrılmaz", async () => {
        const { NextResponse } = await import("next/server");
        mockRequireCronSecret.mockReturnValue(NextResponse.json({ error: "Yetkisiz." }, { status: 401 }));
        const res = await POST(makeReq() as never);
        expect(res.status).toBe(401);
        expect(mockReconcile).not.toHaveBeenCalled();
    });

    it("sapma raporu yanıtta görünür (operatör okuyabilsin)", async () => {
        mockRequireCronSecret.mockReturnValue(null);
        mockReconcile.mockResolvedValue({
            checked: 42, drifted: 3, corrected: 0, failed: 0, autocorrect: false,
            drifts: [{ productId: "p1", sku: "KV-1", name: "Vana", parasutId: "x", erpOnHand: 100, parasutCount: 90, diff: 10 }],
        });
        const body = await (await POST(makeReq() as never)).json();
        expect(body.drifted).toBe(3);
        expect(body.autocorrect).toBe(false);
        expect(body.drifts[0].sku).toBe("KV-1");
    });

    it("devre dışıyken `disabled` dışarı taşınır", async () => {
        mockRequireCronSecret.mockReturnValue(null);
        mockReconcile.mockResolvedValue({
            checked: 0, drifted: 0, corrected: 0, failed: 0, autocorrect: false, drifts: [], disabled: true,
        });
        expect((await (await POST(makeReq() as never)).json()).disabled).toBe(true);
    });

    it("req'siz çağrıda guard atlanır (unit test yolu)", async () => {
        mockReconcile.mockResolvedValue({ checked: 0, drifted: 0, corrected: 0, failed: 0, autocorrect: false, drifts: [] });
        expect((await POST()).status).toBe(200);
        expect(mockRequireCronSecret).not.toHaveBeenCalled();
    });

    it("route kendisi yazma kararı VERMEZ — servise delege eder", () => {
        const src = readFileSync("src/app/api/parasut/reconcile-stock/route.ts", "utf8");
        expect(src).not.toContain("createStockUpdate");
        expect(src).toContain("PARASUT_STOCK_AUTOCORRECT");
    });
});
