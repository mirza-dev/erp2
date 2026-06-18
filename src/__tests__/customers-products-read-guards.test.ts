/**
 * customers/products GET read-guard WIRING testi (denied + allowed path).
 *
 * customers/products derin denetimi (2026-06-19):
 *  O1 — GET /api/customers `view_customers` guard'ı (production'da YOK).
 *  D1 — GET /api/products/[id]/quotes `view_products` guard'ı (accounting'de YOK).
 *
 * Gerçek role-guard zinciri (parseRoles → permissionsForRoles → requirePermission/
 * requirePermissionFor) kullanılır; yalnız `createClient` (getUser) rol seçilebilir
 * mock'la beslenir + DB helper'ları no-op. Böylece guard'ın DOĞRU permission ile
 * bağlandığı uçtan uca kanıtlanır. (rbac-mutation-guards.test.ts viewer'a sabit
 * olduğundan viewer'ın TAŞIDIĞI bu iki perm'i ifade edemez → ayrı dosya.)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { permissionsForRoles, type Role } from "@/lib/auth/permissions";

const mockGetUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
    createClient: async () => ({ auth: { getUser: mockGetUser } }),
}));

vi.mock("@/lib/supabase/customers", () => ({
    dbListCustomers: vi.fn(async () => []),
    dbCreateCustomer: vi.fn(),
}));

vi.mock("@/lib/supabase/products", () => ({
    dbGetQuotedBreakdownByProduct: vi.fn(async () => []),
    dbLookupUserEmails: vi.fn(async () => new Map<string, string>()),
}));

import { GET as customersGet } from "@/app/api/customers/route";
import { GET as productQuotesGet } from "@/app/api/products/[id]/quotes/route";

function asRoles(roles: Role[]) {
    mockGetUser.mockResolvedValue({
        data: { user: { id: "u-1", email: "u@example.com", app_metadata: { roles } } },
    });
}
const getReq = (url = "http://localhost/api/x") => new NextRequest(url);
const qp = { params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000001" }) };

beforeEach(() => {
    vi.clearAllMocks();
});

describe("O1 — GET /api/customers view_customers guard", () => {
    it("production (view_customers YOK) → 403", async () => {
        asRoles(["production"]);
        expect((await customersGet(getReq())).status).toBe(403);
    });

    it("viewer (view_customers VAR) → 403 değil", async () => {
        asRoles(["viewer"]);
        expect((await customersGet(getReq())).status).not.toBe(403);
    });

    it("perm-fact: production view_customers taşımaz; viewer taşır", () => {
        expect(permissionsForRoles(["production"]).has("view_customers")).toBe(false);
        expect(permissionsForRoles(["viewer"]).has("view_customers")).toBe(true);
    });
});

describe("D1 — GET /api/products/[id]/quotes view_products guard", () => {
    it("accounting (view_products YOK) → 403", async () => {
        asRoles(["accounting"]);
        expect((await productQuotesGet(getReq(), qp)).status).toBe(403);
    });

    it("viewer (view_products VAR) → 403 değil", async () => {
        asRoles(["viewer"]);
        expect((await productQuotesGet(getReq(), qp)).status).not.toBe(403);
    });

    it("perm-fact: accounting view_products taşımaz; viewer/production taşır", () => {
        expect(permissionsForRoles(["accounting"]).has("view_products")).toBe(false);
        expect(permissionsForRoles(["viewer"]).has("view_products")).toBe(true);
        expect(permissionsForRoles(["production"]).has("view_products")).toBe(true);
    });
});
