/**
 * RBAC Faz 4 R1 — Mutation guard WIRING testi (denied path).
 *
 * Gerçek `requirePermission`'ı kullanır (partial mock); yalnız
 * `getCurrentUserPermissions`'ı viewer'ın GERÇEK permission setine sabitler
 * (permissionsForRoles(["viewer"]) — view_* var; manage / ship / stock_adjust YOK).
 * Her mutation route'unun viewer'a 403 döndüğünü kanıtlar → guard'ın doğru
 * permission ile bağlandığını gösterir. Guard handler'ın İLK adımı olduğu için
 * DB/servis hiç çağrılmaz (403 body parse'tan önce döner).
 *
 * Positive (allowed) path 16 mevcut route test dosyasında kapsanır (guard allow'a
 * mock'lu). Bu dosya negative (forbidden) path'i gerçek guard ile kilitler.
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

// Gerçek requirePermission + permissionsForRoles; sadece effective perm setini
// viewer'a sabitliyoruz (createClient/cookies'e gitmeden).
vi.mock("@/lib/auth/role-guard", async (orig) => {
    const actual = await orig() as Record<string, unknown>;
    const { permissionsForRoles } = await import("@/lib/auth/permissions");
    return {
        ...actual,
        getCurrentUserPermissions: vi.fn().mockResolvedValue(permissionsForRoles(["viewer"])),
    };
});

// DB/servis modülleri import-time yan etki üretmez; guard 403'ten sonra
// çağrılmaz. Yine de createClient'ı no-op'a indirgeyelim (güvenli).
vi.mock("@/lib/supabase/server", () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));

import { POST as quotesPost } from "@/app/api/quotes/route";
import { PATCH as quotePatch, DELETE as quoteDelete } from "@/app/api/quotes/[id]/route";
import { POST as quoteConvert } from "@/app/api/quotes/[id]/convert/route";
import { POST as quoteRevise } from "@/app/api/quotes/[id]/revise/route";
import { POST as ordersPost } from "@/app/api/orders/route";
import { PATCH as orderPatch, DELETE as orderDelete } from "@/app/api/orders/[id]/route";
import { POST as orderShip } from "@/app/api/orders/[id]/ship/route";
import { POST as customersPost } from "@/app/api/customers/route";
import { PATCH as customerPatch, DELETE as customerDelete } from "@/app/api/customers/[id]/route";
import { POST as inventoryPost } from "@/app/api/inventory/movements/route";

const params = (id = "00000000-0000-4000-8000-000000000001") => ({ params: Promise.resolve({ id }) });
function postReq(url = "http://localhost/api/x", body: unknown = {}): NextRequest {
    return new NextRequest(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
function patchReq(body: unknown = { name: "X" }): NextRequest {
    return new NextRequest("http://localhost/api/x", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
function delReq(): NextRequest {
    return new NextRequest("http://localhost/api/x", { method: "DELETE" });
}

describe("R1 mutation guards — viewer → 403 (Batch A: sales domain)", () => {
    it("quotes POST → 403 (manage_quotes)", async () => {
        expect((await quotesPost(postReq())).status).toBe(403);
    });
    it("quotes [id] PATCH → 403 (manage_quotes)", async () => {
        expect((await quotePatch(patchReq({ transition: "sent" }), params())).status).toBe(403);
    });
    it("quotes [id] DELETE → 403 (manage_quotes)", async () => {
        expect((await quoteDelete(delReq(), params())).status).toBe(403);
    });
    it("quotes [id]/convert → 403 (manage_quotes)", async () => {
        expect((await quoteConvert(postReq(), params())).status).toBe(403);
    });
    it("quotes [id]/revise → 403 (manage_quotes)", async () => {
        expect((await quoteRevise(postReq(), params())).status).toBe(403);
    });
    it("orders POST → 403 (manage_sales_orders)", async () => {
        expect((await ordersPost(postReq())).status).toBe(403);
    });
    it("orders [id] PATCH → 403 (manage_sales_orders)", async () => {
        expect((await orderPatch(patchReq({ transition: "approved" }), params())).status).toBe(403);
    });
    it("orders [id] DELETE → 403 (manage_sales_orders)", async () => {
        expect((await orderDelete(delReq(), params())).status).toBe(403);
    });
    it("orders [id]/ship → 403 (ship_sales_orders)", async () => {
        expect((await orderShip(postReq("http://localhost/api/orders/x/ship", { shipDate: "2026-06-01" }), params())).status).toBe(403);
    });
    it("customers POST → 403 (manage_customers)", async () => {
        expect((await customersPost(postReq())).status).toBe(403);
    });
    it("customers [id] PATCH → 403 (manage_customers)", async () => {
        expect((await customerPatch(patchReq(), params())).status).toBe(403);
    });
    it("customers [id] DELETE → 403 (manage_customers)", async () => {
        expect((await customerDelete(delReq(), params())).status).toBe(403);
    });
    it("inventory/movements POST → 403 (stock_adjust_*)", async () => {
        expect((await inventoryPost(postReq())).status).toBe(403);
    });
});
