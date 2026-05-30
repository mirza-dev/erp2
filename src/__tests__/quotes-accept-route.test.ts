/**
 * Faz 6 (V7) — POST /api/quotes/[id]/accept.
 * serviceAcceptQuoteToOrder sonucu → HTTP status eşleme + revalidateTag.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { revalidateTag } from "next/cache";

vi.mock("@/lib/supabase/server", () => ({
    createClient: () => Promise.resolve({
        auth: { getUser: () => Promise.resolve({ data: { user: { id: "test-user-id" } } }) },
    }),
}));

const mockAccept = vi.fn();
vi.mock("@/lib/services/quote-service", () => ({
    serviceAcceptQuoteToOrder: (...a: unknown[]) => mockAccept(...a),
}));

vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));

import { POST } from "@/app/api/quotes/[id]/accept/route";

const QID = "quote-test-uuid";
const makeReq = () => new NextRequest(`http://localhost/api/quotes/${QID}/accept`, { method: "POST" });
const idCtx = () => ({ params: Promise.resolve({ id: QID }) });

beforeEach(() => vi.clearAllMocks());

describe("POST /api/quotes/[id]/accept", () => {
    it("başarılı → 201 orderId/orderNumber + actor geçilir", async () => {
        mockAccept.mockResolvedValue({ success: true, orderId: "ord-1", orderNumber: "SIP-2026-001", already: false });
        const res = await POST(makeReq(), idCtx());
        expect(res.status).toBe(201);
        const body = await res.json() as { orderId: string; orderNumber: string; already: boolean };
        expect(body.orderId).toBe("ord-1");
        expect(body.already).toBe(false);
        expect(mockAccept).toHaveBeenCalledWith(QID, "test-user-id");
    });

    it("başarılı → revalidateTag (quotes/quote-id/orders/products)", async () => {
        mockAccept.mockResolvedValue({ success: true, orderId: "ord-1", orderNumber: "SIP-2026-001" });
        await POST(makeReq(), idCtx());
        expect(revalidateTag).toHaveBeenCalledWith("quotes", "max");
        expect(revalidateTag).toHaveBeenCalledWith(`quote-${QID}`, "max");
        expect(revalidateTag).toHaveBeenCalledWith("orders", "max");
        expect(revalidateTag).toHaveBeenCalledWith("products", "max");
    });

    it("already:true → 201 already döner", async () => {
        mockAccept.mockResolvedValue({ success: true, orderId: "ord-1", orderNumber: "SIP-2026-001", already: true });
        const res = await POST(makeReq(), idCtx());
        expect(res.status).toBe(201);
        expect((await res.json()).already).toBe(true);
    });

    it("notFound → 404", async () => {
        mockAccept.mockResolvedValue({ success: false, notFound: true, error: "yok" });
        expect((await POST(makeReq(), idCtx())).status).toBe(404);
    });

    it("invalidStatus → 409", async () => {
        mockAccept.mockResolvedValue({ success: false, invalidStatus: true, error: "durum" });
        expect((await POST(makeReq(), idCtx())).status).toBe(409);
    });

    it("archiveFailed → 502", async () => {
        mockAccept.mockResolvedValue({ success: false, archiveFailed: true, error: "arşiv" });
        expect((await POST(makeReq(), idCtx())).status).toBe(502);
    });

    it("expired → 400", async () => {
        mockAccept.mockResolvedValue({ success: false, expired: true, error: "süre" });
        expect((await POST(makeReq(), idCtx())).status).toBe(400);
    });

    it("unprocessable (silinmiş ürün/küsürat) → 422", async () => {
        mockAccept.mockResolvedValue({ success: false, unprocessable: true, error: "ürün" });
        expect((await POST(makeReq(), idCtx())).status).toBe(422);
    });

    it("başarısız → revalidateTag çağrılmaz", async () => {
        mockAccept.mockResolvedValue({ success: false, invalidStatus: true, error: "x" });
        await POST(makeReq(), idCtx());
        expect(revalidateTag).not.toHaveBeenCalled();
    });
});
