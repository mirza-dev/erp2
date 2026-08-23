/**
 * POST /api/import — batch oluşturma: created_by SUNUCU-OTORİTER kilidi.
 *
 * Mass-assignment / non-repudiation regresyon testi (Purchase O1 / Vendors D1
 * ile aynı sınıf): istemci body'sindeki `created_by` YOK SAYILMALI, attribution
 * yalnız oturum kullanıcısından (`getCurrentUserId`) gelmeli. manage_import
 * rol-gated olsa da audit damgası sahtelenememeli.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/role-guard", () => ({
    requirePermission: vi.fn().mockResolvedValue(null),
    getCurrentUserId: vi.fn().mockResolvedValue("session-user-real"),
}));

const mockDbCreateBatch = vi.fn();
const mockDbListBatches = vi.fn();
vi.mock("@/lib/supabase/import", () => ({
    dbCreateBatch: (...args: unknown[]) => mockDbCreateBatch(...args),
    dbListBatches: (...args: unknown[]) => mockDbListBatches(...args),
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/import/route";
import { getCurrentUserId } from "@/lib/auth/role-guard";

function postReq(body: object): NextRequest {
    return new NextRequest("http://localhost/api/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}

describe("POST /api/import — created_by sunucu-otoriter", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockDbCreateBatch.mockResolvedValue({ id: "batch-1", status: "analyzing" });
    });

    it("body.created_by sahteciliğini yok sayar, oturum kullanıcısını kullanır", async () => {
        const res = await POST(postReq({ file_name: "x.xlsx", created_by: "attacker-forged" }));
        expect(res.status).toBe(201);
        expect(mockDbCreateBatch).toHaveBeenCalledTimes(1);
        const arg = mockDbCreateBatch.mock.calls[0][0];
        expect(arg.created_by).toBe("session-user-real");
        expect(arg.created_by).not.toBe("attacker-forged");
        expect(arg.file_name).toBe("x.xlsx");
        expect(getCurrentUserId).toHaveBeenCalled();
    });

    it("body'de created_by olmasa da oturum kullanıcısını damgalar", async () => {
        await POST(postReq({ file_name: "y.xlsx" }));
        expect(mockDbCreateBatch.mock.calls[0][0].created_by).toBe("session-user-real");
    });

    it("oturum yoksa created_by undefined (null değil) geçer", async () => {
        vi.mocked(getCurrentUserId).mockResolvedValueOnce(null);
        await POST(postReq({ file_name: "z.xlsx" }));
        expect(mockDbCreateBatch.mock.calls[0][0].created_by).toBeUndefined();
    });
});
