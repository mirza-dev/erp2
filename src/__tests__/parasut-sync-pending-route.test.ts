/**
 * POST /api/parasut/sync-pending — authenticated toplu sync ucu
 *
 * `sync-all` CRON-only (CRON_SECRET Bearer) olduğundan tarayıcıdan 401 alıyordu;
 * bu uç session + manage_parasut ile Manuel Sync butonunu çalışır kılar.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRequirePermission = vi.fn();
const mockSyncAllPending = vi.fn();

vi.mock("@/lib/auth/role-guard", () => ({
    requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

vi.mock("@/lib/services/parasut-service", () => ({
    serviceSyncAllPending: (...args: unknown[]) => mockSyncAllPending(...args),
}));

import { POST } from "@/app/api/parasut/sync-pending/route";

function makeReq(): Request {
    return new Request("http://localhost/api/parasut/sync-pending", { method: "POST" });
}

describe("POST /api/parasut/sync-pending", () => {
    beforeEach(() => {
        mockRequirePermission.mockReset();
        mockSyncAllPending.mockReset();
    });

    it("yetkisiz (manage_parasut yok) → 403, servis çağrılmaz", async () => {
        const { NextResponse } = await import("next/server");
        mockRequirePermission.mockResolvedValue(
            NextResponse.json({ error: "Yetkiniz yok." }, { status: 403 }),
        );
        const res = await POST(makeReq() as never);
        expect(res.status).toBe(403);
        expect(mockSyncAllPending).not.toHaveBeenCalled();
    });

    it("manage_parasut → guard manage_parasut izni ile çağrılır", async () => {
        mockRequirePermission.mockResolvedValue(null);
        mockSyncAllPending.mockResolvedValue({ synced: 0, failed: 0, errors: [] });
        await POST(makeReq() as never);
        expect(mockRequirePermission).toHaveBeenCalledWith(expect.anything(), "manage_parasut");
    });

    it("yetkili → 200 + serviceSyncAllPending shape ({synced,failed,errors})", async () => {
        mockRequirePermission.mockResolvedValue(null);
        mockSyncAllPending.mockResolvedValue({ synced: 3, failed: 1, errors: ["ORD-1: boom"] });
        const res = await POST(makeReq() as never);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toEqual({ synced: 3, failed: 1, errors: ["ORD-1: boom"] });
        expect(mockSyncAllPending).toHaveBeenCalledTimes(1);
    });

    it("servis throw → handleApiError 500", async () => {
        mockRequirePermission.mockResolvedValue(null);
        mockSyncAllPending.mockRejectedValue(new Error("db down"));
        const res = await POST(makeReq() as never);
        expect(res.status).toBe(500);
        expect(mockSyncAllPending).toHaveBeenCalled();
    });
});
