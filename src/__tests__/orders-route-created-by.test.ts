/**
 * Tests that POST /api/orders populates created_by from the session user.
 *
 * Faz 5 — Teklif Kırılımı: created_by was wired in CreateOrderInput/dbCreateOrder
 * but not populated by the route handler. This fix makes sure session wins.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────

const mockServiceCreateOrder = vi.fn();
const mockValidateOrderCreate = vi.fn();
const mockAiScoreOrder = vi.fn();

vi.mock("@/lib/services/order-service", () => ({
    serviceListOrders: vi.fn(),
    serviceCreateOrder: (...args: unknown[]) => mockServiceCreateOrder(...args),
    validateOrderCreate: (...args: unknown[]) => mockValidateOrderCreate(...args),
}));

vi.mock("@/lib/services/ai-service", () => ({
    aiScoreOrder: (...args: unknown[]) => mockAiScoreOrder(...args),
}));

const mockGetUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
    createClient: () => Promise.resolve({
        auth: { getUser: () => mockGetUser() },
    }),
}));

import { POST } from "@/app/api/orders/route";

// ── Helpers ───────────────────────────────────────────────────

function makeRequest(body: object): NextRequest {
    return new NextRequest("http://localhost/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
}

const VALID_BODY = {
    customer_id: "cust-1",
    customer_name: "Test Müşteri",
    commercial_status: "draft",
    currency: "USD",
    lines: [{ product_id: "p1", product_name: "P", product_sku: "S", unit: "adet", quantity: 5, unit_price: 100, discount_pct: 0, line_total: 500 }],
};

beforeEach(() => {
    vi.clearAllMocks();
    mockValidateOrderCreate.mockReturnValue({ valid: true, errors: [] });
    mockServiceCreateOrder.mockResolvedValue({ id: "order-new" });
    mockAiScoreOrder.mockResolvedValue(undefined);
});

// ── Tests ─────────────────────────────────────────────────────

describe("POST /api/orders — created_by population", () => {
    it("session'da user var → serviceCreateOrder çağrısında created_by = user.id", async () => {
        mockGetUser.mockResolvedValue({ data: { user: { id: "user-uuid-abc" } } });

        const req = makeRequest(VALID_BODY);
        await POST(req);

        expect(mockServiceCreateOrder).toHaveBeenCalledOnce();
        const [input] = mockServiceCreateOrder.mock.calls[0];
        expect(input.created_by).toBe("user-uuid-abc");
    });

    it("session'da user yok (anonim) → created_by = undefined, sipariş yine oluşur", async () => {
        mockGetUser.mockResolvedValue({ data: { user: null } });

        const req = makeRequest(VALID_BODY);
        const res = await POST(req);

        expect(res.status).toBe(201);
        const [input] = mockServiceCreateOrder.mock.calls[0];
        expect(input.created_by).toBeUndefined();
    });

    it("body'de created_by gönderilse bile session override eder", async () => {
        mockGetUser.mockResolvedValue({ data: { user: { id: "session-user-id" } } });

        const req = makeRequest({ ...VALID_BODY, created_by: "body-provided-id" });
        await POST(req);

        const [input] = mockServiceCreateOrder.mock.calls[0];
        expect(input.created_by).toBe("session-user-id");
    });

    it("validation fail → serviceCreateOrder çağrılmaz", async () => {
        mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
        mockValidateOrderCreate.mockReturnValue({ valid: false, errors: ["lines boş"] });

        const req = makeRequest({ ...VALID_BODY, lines: [] });
        const res = await POST(req);

        expect(res.status).toBe(400);
        expect(mockServiceCreateOrder).not.toHaveBeenCalled();
    });
});
