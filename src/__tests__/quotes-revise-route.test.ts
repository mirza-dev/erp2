/**
 * Teklif V7 — POST /api/quotes/[id]/revise route mapping.
 * serviceCreateQuoteRevision mock'lu → route'un sonucu doğru HTTP koduna
 * maplediğini test eder (201/409/404).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Faz 8a: RBAC guard — varsayılan izinli (mevcut testler davranışı korur).
vi.mock("@/lib/auth/role-guard", () => ({
    requirePermission: vi.fn().mockResolvedValue(null),
    requireRole: vi.fn().mockResolvedValue(null),
}));

const mockService = vi.fn();
vi.mock("@/lib/services/quote-service", () => ({
    serviceCreateQuoteRevision: (...a: unknown[]) => mockService(...a),
}));

import { POST } from "@/app/api/quotes/[id]/revise/route";

const SRC_ID = "src-quote-uuid";
const NEW_ID = "new-rev-uuid";

function ctx() { return { params: Promise.resolve({ id: SRC_ID }) }; }
function req() { return new NextRequest(`http://localhost/api/quotes/${SRC_ID}/revise`, { method: "POST" }); }

beforeEach(() => vi.clearAllMocks());

describe("POST /api/quotes/[id]/revise", () => {
    it("başarı → 201 + newQuoteId/newQuoteNumber", async () => {
        mockService.mockResolvedValue({ success: true, newQuoteId: NEW_ID, newQuoteNumber: "TKL-2026-001-R2" });
        const res = await POST(req(), ctx());
        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.newQuoteId).toBe(NEW_ID);
        expect(body.newQuoteNumber).toBe("TKL-2026-001-R2");
    });

    it("invalidStatus → 409", async () => {
        mockService.mockResolvedValue({ success: false, error: "revize edilemez", invalidStatus: true });
        const res = await POST(req(), ctx());
        expect(res.status).toBe(409);
    });

    it("notFound → 404", async () => {
        mockService.mockResolvedValue({ success: false, error: "yok", notFound: true });
        const res = await POST(req(), ctx());
        expect(res.status).toBe(404);
    });
});
