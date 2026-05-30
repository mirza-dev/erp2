/**
 * Settings — Company PATCH server-side validation
 *
 * UI'da inline validation var ama auth'lu kullanıcı endpoint'i doğrudan
 * çağırabildiği için API tarafında da aynı kuralları doğrula (defense in depth).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// RBAC Faz 4: route'a requirePermission guard eklendi → guard'ı allow'a mock'la.
vi.mock("@/lib/auth/role-guard", () => ({
    requirePermission: vi.fn().mockResolvedValue(null),
    requireRole: vi.fn().mockResolvedValue(null),
    requireAnyRole: vi.fn().mockResolvedValue(null),
    getCurrentUserPermissions: vi.fn().mockResolvedValue(
        new Set(["view_sales_prices", "view_purchase_costs", "view_financial_summary"])),
    getCurrentUserRoles: vi.fn().mockResolvedValue(["admin"]),
    getCurrentUserRole: vi.fn().mockResolvedValue("admin"),
}));
import { NextRequest } from "next/server";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockDbUpdate = vi.fn();
const mockDbGet = vi.fn();
vi.mock("@/lib/supabase/company-settings", () => ({
    dbGetCompanySettings: (...a: unknown[]) => mockDbGet(...a),
    dbUpdateCompanySettings: (...a: unknown[]) => mockDbUpdate(...a),
}));

vi.mock("next/cache", () => ({
    unstable_cache: (fn: unknown) => fn,
    revalidateTag: vi.fn(),
}));

import { PATCH } from "@/app/api/settings/company/route";

beforeEach(() => {
    vi.clearAllMocks();
    mockDbUpdate.mockResolvedValue({ id: "c-1", name: "Test" });
});

function makeReq(body: unknown): NextRequest {
    return new NextRequest("http://localhost/api/settings/company", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("PATCH /api/settings/company — server-side validation", () => {
    it("boş name → 400", async () => {
        const res = await PATCH(makeReq({ name: "" }));
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toContain("Firma adı");
        expect(mockDbUpdate).not.toHaveBeenCalled();
    });

    it("name boşluk only → 400", async () => {
        const res = await PATCH(makeReq({ name: "   " }));
        expect(res.status).toBe(400);
    });

    it("name 200+ karakter → 400", async () => {
        const res = await PATCH(makeReq({ name: "a".repeat(201) }));
        expect(res.status).toBe(400);
    });

    it("geçersiz email → 400", async () => {
        const res = await PATCH(makeReq({ email: "not-an-email" }));
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toContain("e-posta");
    });

    it("boş email → kabul (opsiyonel alan)", async () => {
        const res = await PATCH(makeReq({ email: "" }));
        expect(res.status).toBe(200);
    });

    it("VKN 9 hane → 400", async () => {
        const res = await PATCH(makeReq({ tax_no: "123456789" }));
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toContain("Vergi");
    });

    it("VKN 10 hane → 200", async () => {
        const res = await PATCH(makeReq({ tax_no: "1234567890" }));
        expect(res.status).toBe(200);
    });

    it("geçersiz website → 400", async () => {
        const res = await PATCH(makeReq({ website: "not a url" }));
        expect(res.status).toBe(400);
    });

    it("geçersiz currency → 400", async () => {
        const res = await PATCH(makeReq({ currency: "GBP" }));
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toContain("USD, EUR veya TRY");
    });

    it("happy path → 200, dbUpdate çağrılır", async () => {
        const res = await PATCH(makeReq({
            name: "PMT",
            email: "info@pmt.com",
            tax_no: "1234567890",
            website: "pmt.com.tr",
            currency: "USD",
        }));
        expect(res.status).toBe(200);
        expect(mockDbUpdate).toHaveBeenCalledWith({
            name: "PMT",
            email: "info@pmt.com",
            tax_no: "1234567890",
            website: "pmt.com.tr",
            currency: "USD",
        });
    });

    it("logo_url whitelist'te yok → drop edilir", async () => {
        await PATCH(makeReq({ name: "PMT", logo_url: "https://evil.com/x.png" }));
        const calledWith = mockDbUpdate.mock.calls[0][0];
        expect(calledWith).not.toHaveProperty("logo_url");
    });
});
