/**
 * Tests for PATCH /api/customers/[id] route handler.
 * DB layer fully mocked — follows import-parse-route.test.ts pattern.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// RBAC Faz 4: route'lara requirePermission guard eklendi → bu test guard'ı allow'a
// mock'lar (gerçek guard logic role-guard.test.ts + page-access.test.ts'te test edilir).
vi.mock("@/lib/auth/role-guard", () => ({
    requirePermission: vi.fn().mockResolvedValue(null),
    requireRole: vi.fn().mockResolvedValue(null),
    requireAnyRole: vi.fn().mockResolvedValue(null),
    getCurrentUserPermissions: vi.fn().mockResolvedValue(
        new Set(["view_sales_prices", "view_purchase_costs", "view_financial_summary"])),
    getCurrentUserRoles: vi.fn().mockResolvedValue(["admin"]),
    getCurrentUserRole: vi.fn().mockResolvedValue("admin"),
    getCurrentUserId: vi.fn().mockResolvedValue("user-1"),
}));

const mockRevalidateTag = vi.fn();
vi.mock("next/cache", () => ({
    revalidateTag: (...args: unknown[]) => mockRevalidateTag(...args),
}));
import { NextRequest } from "next/server";

// ─── DB mock ──────────────────────────────────────────────────────────────────

const mockDbUpdateCustomer = vi.fn();
const mockDbDeleteCustomer = vi.fn();
const mockDbCountOrdersByCustomer = vi.fn();

vi.mock("@/lib/supabase/customers", () => ({
    dbUpdateCustomer: (...args: unknown[]) => mockDbUpdateCustomer(...args),
    dbDeleteCustomer: (...args: unknown[]) => mockDbDeleteCustomer(...args),
}));

vi.mock("@/lib/supabase/orders", () => ({
    dbCountOrdersByCustomer: (...args: unknown[]) => mockDbCountOrdersByCustomer(...args),
}));

import { PATCH, DELETE } from "@/app/api/customers/[id]/route";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CUSTOMER_ID = "cust-test-1";

function makeRequest(body: unknown): NextRequest {
    return new NextRequest(`http://localhost/api/customers/${CUSTOMER_ID}`, {
        method: "PATCH",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
    });
}

function makeParams(id = CUSTOMER_ID): { params: Promise<{ id: string }> } {
    return { params: Promise.resolve({ id }) };
}

const stubCustomer = {
    id: CUSTOMER_ID,
    name: "Acme Ltd",
    email: null,
    phone: null,
    address: null,
    tax_number: null,
    tax_office: null,
    country: "TR",
    currency: "USD",
    notes: null,
    is_active: true,
    total_orders: 0,
    total_revenue: 0,
    last_order_date: null,
};

beforeEach(() => {
    vi.clearAllMocks();
    mockDbUpdateCustomer.mockResolvedValue(stubCustomer);
});

// ─── Validation: no recognized fields ─────────────────────────────────────────

describe("PATCH /api/customers/[id] — no-op body", () => {
    it("empty body → 400 Güncellenecek alan bulunamadı", async () => {
        const res = await PATCH(makeRequest({}), makeParams());
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toContain("Güncellenecek alan bulunamadı");
    });

    it("unrecognized field only → 400", async () => {
        const res = await PATCH(makeRequest({ unknown_field: "value" }), makeParams());
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toContain("Güncellenecek alan bulunamadı");
    });

    it("no-op rejected before DB call", async () => {
        await PATCH(makeRequest({}), makeParams());
        expect(mockDbUpdateCustomer).not.toHaveBeenCalled();
    });
});

// ─── Validation: empty name ───────────────────────────────────────────────────

describe("PATCH /api/customers/[id] — name validation", () => {
    it("name: '' → 400 Firma adı boş olamaz", async () => {
        const res = await PATCH(makeRequest({ name: "" }), makeParams());
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toContain("Firma adı boş olamaz");
    });

    it("name: '   ' (whitespace only) → 400", async () => {
        const res = await PATCH(makeRequest({ name: "   " }), makeParams());
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toContain("Firma adı boş olamaz");
    });

    it("empty name rejected before DB call", async () => {
        await PATCH(makeRequest({ name: "" }), makeParams());
        expect(mockDbUpdateCustomer).not.toHaveBeenCalled();
    });
});

// ─── Validation: country length ───────────────────────────────────────────────

describe("PATCH /api/customers/[id] — country validation", () => {
    it("country: 'TUR' (3 chars) → 400", async () => {
        const res = await PATCH(makeRequest({ country: "TUR" }), makeParams());
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toContain("2 karakter");
    });

    it("country: 'TR' (2 chars) → accepted", async () => {
        const res = await PATCH(makeRequest({ country: "TR" }), makeParams());
        expect(res.status).toBe(200);
    });

    it("country: 'US' → accepted", async () => {
        const res = await PATCH(makeRequest({ country: "US" }), makeParams());
        expect(res.status).toBe(200);
    });
});

// ─── Happy path ───────────────────────────────────────────────────────────────

describe("PATCH /api/customers/[id] — valid patches", () => {
    it("name update → 200 and calls dbUpdateCustomer", async () => {
        const res = await PATCH(makeRequest({ name: "Yeni İsim A.Ş." }), makeParams());
        expect(res.status).toBe(200);
        expect(mockDbUpdateCustomer).toHaveBeenCalledWith(CUSTOMER_ID, { name: "Yeni İsim A.Ş." });
    });

    it("multi-field update → 200", async () => {
        const res = await PATCH(makeRequest({ name: "Acme", country: "DE", currency: "EUR" }), makeParams());
        expect(res.status).toBe(200);
    });

    it("email-only update → 200 (name not touched)", async () => {
        const res = await PATCH(makeRequest({ email: "info@acme.com" }), makeParams());
        expect(res.status).toBe(200);
        expect(mockDbUpdateCustomer).toHaveBeenCalledWith(
            CUSTOMER_ID,
            expect.objectContaining({ email: "info@acme.com" }),
        );
    });

    it("response body contains updated customer", async () => {
        const updated = { ...stubCustomer, name: "Yeni İsim" };
        mockDbUpdateCustomer.mockResolvedValueOnce(updated);
        const res = await PATCH(makeRequest({ name: "Yeni İsim" }), makeParams());
        const data = await res.json();
        expect(data.name).toBe("Yeni İsim");
    });
});

// ─── DB error path ────────────────────────────────────────────────────────────

describe("PATCH /api/customers/[id] — DB error handling", () => {
    it("dbUpdateCustomer throws → 500 with error message", async () => {
        mockDbUpdateCustomer.mockRejectedValueOnce(new Error("connection refused"));
        const res = await PATCH(makeRequest({ name: "Acme" }), makeParams());
        expect(res.status).toBe(500);
        const body = await res.json();
        expect(body.error).toContain("connection refused");
    });

    it("ConfigError from DB layer → 503", async () => {
        const { ConfigError } = await import("@/lib/supabase/service");
        mockDbUpdateCustomer.mockRejectedValueOnce(new ConfigError("MISSING ENV: SUPABASE_URL"));
        const res = await PATCH(makeRequest({ name: "Acme" }), makeParams());
        expect(res.status).toBe(503);
        const body = await res.json();
        expect(body.code).toBe("CONFIG_ERROR");
    });
});

// ─── Validation parity: string lengths (POST paritesi) ────────────────────────

describe("PATCH /api/customers/[id] — string length validation parity", () => {
    it("10k+ char notes → 400, dbUpdateCustomer çağrılmaz", async () => {
        const res = await PATCH(makeRequest({ notes: "x".repeat(10001) }), makeParams());
        expect(res.status).toBe(400);
        expect(mockDbUpdateCustomer).not.toHaveBeenCalled();
    });

    it("normal kısa alanlar → 200, dbUpdateCustomer çağrılır (regresyon korunur)", async () => {
        const res = await PATCH(makeRequest({ notes: "kısa not", address: "İstanbul" }), makeParams());
        expect(res.status).toBe(200);
        expect(mockDbUpdateCustomer).toHaveBeenCalledTimes(1);
    });
});

// ─── DELETE /api/customers/[id] ───────────────────────────────────────────────

describe("DELETE /api/customers/[id]", () => {
    function makeDeleteParams(id = CUSTOMER_ID): { params: Promise<{ id: string }> } {
        return { params: Promise.resolve({ id }) };
    }
    function makeDeleteRequest(): NextRequest {
        return new NextRequest(`http://localhost/api/customers/${CUSTOMER_ID}`, { method: "DELETE" });
    }

    it("siparişi olan müşteri → 409, dbDeleteCustomer çağrılmaz", async () => {
        mockDbCountOrdersByCustomer.mockResolvedValueOnce(3);
        const res = await DELETE(makeDeleteRequest(), makeDeleteParams());
        expect(res.status).toBe(409);
        expect(mockDbDeleteCustomer).not.toHaveBeenCalled();
        expect(mockRevalidateTag).not.toHaveBeenCalled();
    });

    it("siparişi olmayan müşteri → silinir + revalidateTag('customers') (POST paritesi)", async () => {
        mockDbCountOrdersByCustomer.mockResolvedValueOnce(0);
        mockDbDeleteCustomer.mockResolvedValueOnce(undefined);
        const res = await DELETE(makeDeleteRequest(), makeDeleteParams());
        expect(res.status).toBe(200);
        expect(mockDbDeleteCustomer).toHaveBeenCalledWith(CUSTOMER_ID, "user-1");
        expect(mockRevalidateTag).toHaveBeenCalledWith("customers", "max");
    });
});
