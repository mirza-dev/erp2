/**
 * Faz 13 — alış faturası uçları.
 *
 * İkisi de satış tarafındaki ikizlerinin RBAC/CRON sözleşmesini aynen taşır:
 *   /api/parasut/sync-purchase      ≡ /api/parasut/sync       (manage_parasut)
 *   /api/parasut/sync-purchase-all  ≡ /api/parasut/sync-all   (CRON_SECRET)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";

const mockRequirePermission = vi.fn();
const mockRequireCronSecret = vi.fn();
const mockSyncOne = vi.fn();
const mockSyncAll = vi.fn();

vi.mock("@/lib/auth/role-guard", () => ({
    requirePermission: (...a: unknown[]) => mockRequirePermission(...a),
}));
vi.mock("@/lib/auth/cron-guard", () => ({
    requireCronSecret: (...a: unknown[]) => mockRequireCronSecret(...a),
}));
vi.mock("@/lib/services/parasut-purchase-service", () => ({
    serviceSyncPurchaseOrderToParasut:  (...a: unknown[]) => mockSyncOne(...a),
    serviceSyncAllPendingPurchaseBills: (...a: unknown[]) => mockSyncAll(...a),
}));

import { POST as syncPurchase } from "@/app/api/parasut/sync-purchase/route";
import { POST as syncPurchaseAll } from "@/app/api/parasut/sync-purchase-all/route";

function makeReq(body?: unknown): Request {
    return new Request("http://localhost/api/parasut/sync-purchase", {
        method: "POST",
        headers: { "content-type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
}

beforeEach(() => {
    mockRequirePermission.mockReset();
    mockRequireCronSecret.mockReset();
    mockSyncOne.mockReset();
    mockSyncAll.mockReset();
});

describe("POST /api/parasut/sync-purchase", () => {
    it("yetkisiz → 403, servis çağrılmaz", async () => {
        const { NextResponse } = await import("next/server");
        mockRequirePermission.mockResolvedValue(NextResponse.json({ error: "Yetkiniz yok." }, { status: 403 }));
        const res = await syncPurchase(makeReq({ po_id: "po-1" }) as never);
        expect(res.status).toBe(403);
        expect(mockSyncOne).not.toHaveBeenCalled();
    });

    it("guard manage_parasut izniyle çağrılır (satış ucuyla aynı sınıf)", async () => {
        mockRequirePermission.mockResolvedValue(null);
        mockSyncOne.mockResolvedValue({ success: true });
        await syncPurchase(makeReq({ po_id: "po-1" }) as never);
        expect(mockRequirePermission).toHaveBeenCalledWith(expect.anything(), "manage_parasut");
    });

    it("po_id yoksa 400", async () => {
        mockRequirePermission.mockResolvedValue(null);
        const res = await syncPurchase(makeReq({}) as never);
        expect(res.status).toBe(400);
        expect(mockSyncOne).not.toHaveBeenCalled();
    });

    it("başarılı → 200", async () => {
        mockRequirePermission.mockResolvedValue(null);
        mockSyncOne.mockResolvedValue({ success: true });
        const res = await syncPurchase(makeReq({ po_id: "po-1" }) as never);
        expect(res.status).toBe(200);
        expect(mockSyncOne).toHaveBeenCalledWith("po-1");
    });

    it("servis hatası → 400 + gerekçe (sessiz başarı YOK)", async () => {
        mockRequirePermission.mockResolvedValue(null);
        mockSyncOne.mockResolvedValue({ success: false, error: "Yalnızca tamamen mal kabul edilmiş siparişler..." });
        const res = await syncPurchase(makeReq({ po_id: "po-1" }) as never);
        expect(res.status).toBe(400);
        expect((await res.json()).error).toContain("mal kabul");
    });

    it("kilitli/uygun değil durumu yanıtta görünür (kaybolmaz)", async () => {
        mockRequirePermission.mockResolvedValue(null);
        mockSyncOne.mockResolvedValue({ success: false, skipped: true, reason: "not_eligible_or_locked" });
        const body = await (await syncPurchase(makeReq({ po_id: "po-1" }) as never)).json();
        expect(body.skipped).toBe(true);
        expect(body.reason).toBe("not_eligible_or_locked");
    });
});

describe("POST /api/parasut/sync-purchase-all (CRON)", () => {
    it("CRON_SECRET yoksa guard'ın yanıtı döner, servis çağrılmaz", async () => {
        const { NextResponse } = await import("next/server");
        mockRequireCronSecret.mockReturnValue(NextResponse.json({ error: "Yetkisiz." }, { status: 401 }));
        const res = await syncPurchaseAll(makeReq() as never);
        expect(res.status).toBe(401);
        expect(mockSyncAll).not.toHaveBeenCalled();
    });

    it("geçerli CRON_SECRET → 200 + özet", async () => {
        mockRequireCronSecret.mockReturnValue(null);
        mockSyncAll.mockResolvedValue({ processed: 3, succeeded: 2, failed: 1 });
        const res = await syncPurchaseAll(makeReq() as never);
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ processed: 3, succeeded: 2, failed: 1 });
    });

    it("req'siz çağrıda (unit test yolu) guard atlanır — sync-all kalıbı", async () => {
        mockSyncAll.mockResolvedValue({ processed: 0, succeeded: 0, failed: 0 });
        const res = await syncPurchaseAll();
        expect(res.status).toBe(200);
        expect(mockRequireCronSecret).not.toHaveBeenCalled();
    });
});

describe("proxy CRON kaydı", () => {
    it("sync-purchase-all CRON_PATHS'te (oturum bypass'ı YOK)", () => {
        const proxy = readFileSync("src/proxy.ts", "utf8");
        expect(proxy).toContain('"/api/parasut/sync-purchase-all"');
        // ALWAYS_PUBLIC'e girmemeli — bu uç UI'dan çağrılmıyor.
        const alwaysPublicLine = proxy.split("\n").find(l => l.includes("const ALWAYS_PUBLIC")) ?? "";
        expect(alwaysPublicLine).not.toContain("sync-purchase-all");
    });

    it("tekil uç CRON_PATHS'te DEĞİL (oturumla çağrılır)", () => {
        const proxy = readFileSync("src/proxy.ts", "utf8");
        expect(proxy).not.toContain('"/api/parasut/sync-purchase",');
    });
});
