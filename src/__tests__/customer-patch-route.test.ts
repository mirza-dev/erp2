/**
 * Tests for PATCH /api/customers/[id] route handler.
 * DB layer fully mocked — follows import-parse-route.test.ts pattern.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
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

import { PATCH } from "@/app/api/customers/[id]/route";

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
