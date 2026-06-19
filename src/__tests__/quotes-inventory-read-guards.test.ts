/**
 * quotes + inventory/movements GET read-guard WIRING testi (denied + allowed path).
 *
 * A3 (2026-06-19) — method-seviye gate'in yakaladığı gerçek açıklar:
 *  - GET /api/quotes + GET /api/quotes/[id] → view_quotes (İZLENEN borç;
 *    production+purchasing quote pipeline okuyordu; redaction yalnız fiyatı maskeler).
 *  - GET /api/inventory/movements → view_products (UI tüketicisi yok; accounting'e açıktı).
 *
 * Gerçek role-guard zinciri (parseRoles → permissionsForRoles → requirePermission);
 * yalnız `createClient` (getUser) rol seçilebilir mock + DB helper'ları no-op.
 * (customers-products-read-guards / alerts-read-guards kalıbı.)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { permissionsForRoles, type Role } from "@/lib/auth/permissions";

const mockGetUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
    createClient: async () => ({ auth: { getUser: mockGetUser } }),
}));

vi.mock("@/lib/supabase/quotes", () => ({
    dbListQuotes: vi.fn(async () => []),
    dbCreateQuote: vi.fn(),
    dbGetQuote: vi.fn(async () => null),
    dbUpdateQuote: vi.fn(),
    dbDeleteQuote: vi.fn(),
    dbListQuoteChain: vi.fn(async () => []),
}));
vi.mock("@/lib/supabase/orders", () => ({
    dbFindOrderByQuoteId: vi.fn(async () => null),
}));
vi.mock("@/lib/supabase/products", () => ({
    dbRecordMovementAtomic: vi.fn(),
    dbTryResolveShortages: vi.fn(),
    dbListMovements: vi.fn(async () => []),
}));

import { GET as quotesGet } from "@/app/api/quotes/route";
import { GET as quoteDetailGet } from "@/app/api/quotes/[id]/route";
import { GET as movementsGet } from "@/app/api/inventory/movements/route";

function asRoles(roles: Role[]) {
    mockGetUser.mockResolvedValue({
        data: { user: { id: "u-1", email: "u@example.com", app_metadata: { roles } } },
    });
}
const qp = { params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000001" }) };
const req = (url = "http://localhost/api/x") => new NextRequest(url);

beforeEach(() => vi.clearAllMocks());

describe("A3 — GET /api/quotes view_quotes guard", () => {
    it("production (view_quotes YOK) → 403", async () => {
        asRoles(["production"]);
        expect((await quotesGet(req("http://localhost/api/quotes"))).status).toBe(403);
    });
    it("purchasing (view_quotes YOK) → 403", async () => {
        asRoles(["purchasing"]);
        expect((await quotesGet(req("http://localhost/api/quotes"))).status).toBe(403);
    });
    it("viewer (view_quotes VAR) → 403 değil", async () => {
        asRoles(["viewer"]);
        expect((await quotesGet(req("http://localhost/api/quotes"))).status).not.toBe(403);
    });
    it("perm-fact: production/purchasing view_quotes taşımaz; sales/accounting/viewer taşır", () => {
        expect(permissionsForRoles(["production"]).has("view_quotes")).toBe(false);
        expect(permissionsForRoles(["purchasing"]).has("view_quotes")).toBe(false);
        expect(permissionsForRoles(["sales"]).has("view_quotes")).toBe(true);
        expect(permissionsForRoles(["accounting"]).has("view_quotes")).toBe(true);
        expect(permissionsForRoles(["viewer"]).has("view_quotes")).toBe(true);
    });
});

describe("A3 — GET /api/quotes/[id] view_quotes guard", () => {
    it("production → 403", async () => {
        asRoles(["production"]);
        expect((await quoteDetailGet(req(), qp)).status).toBe(403);
    });
    it("viewer → 403 değil (404/200 — guard geçer)", async () => {
        asRoles(["viewer"]);
        expect((await quoteDetailGet(req(), qp)).status).not.toBe(403);
    });
});

describe("A3 — GET /api/inventory/movements view_products guard", () => {
    it("accounting (view_products YOK) → 403", async () => {
        asRoles(["accounting"]);
        expect((await movementsGet(req("http://localhost/api/inventory/movements?product_id=p1"))).status).toBe(403);
    });
    it("viewer (view_products VAR) → 403 değil", async () => {
        asRoles(["viewer"]);
        expect((await movementsGet(req("http://localhost/api/inventory/movements?product_id=p1"))).status).not.toBe(403);
    });
    it("perm-fact: accounting view_products taşımaz; viewer/production taşır", () => {
        expect(permissionsForRoles(["accounting"]).has("view_products")).toBe(false);
        expect(permissionsForRoles(["viewer"]).has("view_products")).toBe(true);
        expect(permissionsForRoles(["production"]).has("view_products")).toBe(true);
    });
});
