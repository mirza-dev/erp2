/**
 * Tests for POST /api/quotes/[id]/convert — Faz 8.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { revalidateTag } from "next/cache";

// ─── Supabase server mock (createClient / auth.getUser) ──────────────────────

vi.mock("@/lib/supabase/server", () => ({
    createClient: () => Promise.resolve({
        auth: { getUser: () => Promise.resolve({ data: { user: { id: "test-user-id" } } }) },
    }),
}));

// ─── Service mock ─────────────────────────────────────────────────────────────

const mockServiceConvert = vi.fn();

vi.mock("@/lib/services/quote-service", () => ({
    serviceConvertQuoteToOrder: (...args: unknown[]) => mockServiceConvert(...args),
    serviceTransitionQuote:     vi.fn(),
    serviceExpireQuotes:        vi.fn(),
    serviceGetQuote:            vi.fn(),
}));

vi.mock("next/cache", () => ({
    revalidateTag:   vi.fn(),
    unstable_cache:  vi.fn(),
}));

import { POST } from "@/app/api/quotes/[id]/convert/route";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const QUOTE_ID = "quote-test-uuid";
const ORDER_ID = "order-test-uuid";

function makeReq(): NextRequest {
    return new NextRequest(`http://localhost/api/quotes/${QUOTE_ID}/convert`, {
        method: "POST",
    });
}

function idCtx() {
    return { params: Promise.resolve({ id: QUOTE_ID }) };
}

beforeEach(() => {
    vi.clearAllMocks();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("POST /api/quotes/[id]/convert", () => {
    it("T01: başarılı dönüştürme → 201, orderId + orderNumber döner", async () => {
        mockServiceConvert.mockResolvedValue({
            success: true,
            orderId: ORDER_ID,
            orderNumber: "SIP-2026-001",
        });
        const res = await POST(makeReq(), idCtx());
        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.orderId).toBe(ORDER_ID);
        expect(body.orderNumber).toBe("SIP-2026-001");
        expect(body.warnings).toBeUndefined();
    });

    it("T02: başarılı + warnings → 201, warnings array dahil", async () => {
        mockServiceConvert.mockResolvedValue({
            success: true,
            orderId: ORDER_ID,
            orderNumber: "SIP-2026-001",
            warnings: ["Satır 3: ürün eşleşmesi yok, atlandı."],
        });
        const res = await POST(makeReq(), idCtx());
        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.warnings).toHaveLength(1);
        expect(body.warnings[0]).toContain("Satır 3");
    });

    it("T03: teklif bulunamadı → 404", async () => {
        mockServiceConvert.mockResolvedValue({
            success: false,
            error: "Teklif bulunamadı.",
            notFound: true,
        });
        const res = await POST(makeReq(), idCtx());
        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.error).toContain("bulunamadı");
    });

    it("T04: zaten dönüştürüldü → 409, existingOrderId + existingOrderNumber dahil", async () => {
        mockServiceConvert.mockResolvedValue({
            success: false,
            error: "Bu teklif daha önce siparişe dönüştürülmüş.",
            alreadyConverted: true,
            existingOrderId: "existing-order-id",
            existingOrderNumber: "SIP-2026-000",
        });
        const res = await POST(makeReq(), idCtx());
        expect(res.status).toBe(409);
        const body = await res.json();
        expect(body.existingOrderId).toBe("existing-order-id");
        expect(body.existingOrderNumber).toBe("SIP-2026-000");
        expect(body.error).toContain("dönüştürülmüş");
    });

    it("T05: yanlış durum → 400", async () => {
        mockServiceConvert.mockResolvedValue({
            success: false,
            error: "'draft' durumundaki teklif siparişe dönüştürülemez.",
        });
        const res = await POST(makeReq(), idCtx());
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toContain("dönüştürülemez");
    });

    it("T06: satırlarda ürün eşleşmesi yok → 400", async () => {
        mockServiceConvert.mockResolvedValue({
            success: false,
            error: "Teklifin hiçbir satırında ürün eşleşmesi yok.",
        });
        const res = await POST(makeReq(), idCtx());
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toContain("ürün eşleşmesi yok");
    });

    it("T07: beklenmeyen hata → 500", async () => {
        mockServiceConvert.mockRejectedValue(new Error("DB bağlantı kesildi"));
        const res = await POST(makeReq(), idCtx());
        expect(res.status).toBe(500);
    });

    it("T08: başarıda revalidateTag çağrılır; başarısızda çağrılmaz", async () => {
        // Başarısız → tag'ler çağrılmamalı
        mockServiceConvert.mockResolvedValue({ success: false, error: "hata" });
        await POST(makeReq(), idCtx());
        expect(revalidateTag).not.toHaveBeenCalled();

        vi.clearAllMocks();

        // Başarılı → tüm tag'ler çağrılmalı
        mockServiceConvert.mockResolvedValue({
            success: true,
            orderId: ORDER_ID,
            orderNumber: "SIP-2026-001",
        });
        await POST(makeReq(), idCtx());
        expect(revalidateTag).toHaveBeenCalledWith("quotes", "max");
        expect(revalidateTag).toHaveBeenCalledWith(`quote-${QUOTE_ID}`, "max");
        expect(revalidateTag).toHaveBeenCalledWith("orders", "max");
        expect(revalidateTag).toHaveBeenCalledWith("products", "max");
    });
});
