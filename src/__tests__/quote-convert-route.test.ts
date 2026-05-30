/**
 * Tests for POST /api/quotes/[id]/convert — Faz 6 (V4-A8) DEPRECATED.
 * Bu uç nokta artık her zaman 410 Gone döner; accept + sipariş atomik
 * POST /api/quotes/[id]/accept yoluna taşındı. serviceConvertQuoteToOrder
 * referans için korunur (route'tan çağrılmaz).
 */
import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/quotes/[id]/convert/route";

const QUOTE_ID = "quote-test-uuid";

function makeReq(): NextRequest {
    return new NextRequest(`http://localhost/api/quotes/${QUOTE_ID}/convert`, { method: "POST" });
}
function idCtx() {
    return { params: Promise.resolve({ id: QUOTE_ID }) };
}

describe("POST /api/quotes/[id]/convert — Faz 6 deprecate (410)", () => {
    it("her durumda 410 Gone döner + /accept yönlendirmesi", async () => {
        const res = await POST(makeReq(), idCtx());
        expect(res.status).toBe(410);
        const body = await res.json() as { error: string };
        expect(body.error).toContain("/accept");
    });
});
