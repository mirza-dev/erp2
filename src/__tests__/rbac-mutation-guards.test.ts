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
import { getCurrentUserPermissions } from "@/lib/auth/role-guard";
import { permissionsForRoles, type Permission } from "@/lib/auth/permissions";

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
import { POST as productsPost } from "@/app/api/products/route";
import { PATCH as productPatch, DELETE as productDelete } from "@/app/api/products/[id]/route";
import { GET as vendorsGet, POST as vendorsPost } from "@/app/api/vendors/route";
import { PATCH as vendorPatch, DELETE as vendorDelete } from "@/app/api/vendors/[id]/route";
import { GET as poGet, POST as poPost } from "@/app/api/purchase-orders/route";
import { PATCH as poPatch } from "@/app/api/purchase-orders/[id]/route";
import { POST as poConfirm } from "@/app/api/purchase-orders/[id]/confirm/route";
import { POST as poSend } from "@/app/api/purchase-orders/[id]/send/route";
import { POST as poRevise } from "@/app/api/purchase-orders/[id]/revise/route";
import { PUT as poLines } from "@/app/api/purchase-orders/[id]/lines/route";
import { GET as pcGet, POST as pcPost } from "@/app/api/purchase-commitments/route";
import { PATCH as pcPatch } from "@/app/api/purchase-commitments/[id]/route";
import { GET as recGet } from "@/app/api/recommendations/route";
import { PATCH as recPatch } from "@/app/api/recommendations/[id]/route";
import { POST as productionPost } from "@/app/api/production/route";
import { DELETE as productionDelete } from "@/app/api/production/[id]/route";
import { PATCH as alertPatch } from "@/app/api/alerts/[id]/route";
import { POST as alertSyncRetry } from "@/app/api/alerts/[id]/sync-retry/route";
import { PATCH as companyPatch } from "@/app/api/settings/company/route";
import { POST as parasutSync } from "@/app/api/parasut/sync/route";
import { POST as parasutRetry } from "@/app/api/parasut/retry/route";
import { POST as productTypesPost } from "@/app/api/product-types/route";
import { POST as importPost } from "@/app/api/import/route";
import { PATCH as importBatchPatch, DELETE as importBatchDelete } from "@/app/api/import/[batchId]/route";
import { PATCH as importDraftPatch } from "@/app/api/import/drafts/[id]/route";
import { GET as parasutInvoicesGet } from "@/app/api/parasut/invoices/route";
import { GET as parasutStatsGet } from "@/app/api/parasut/stats/route";
import { GET as parasutLogsGet } from "@/app/api/parasut/logs/route";

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
    it("quotes [id] DELETE → 403 (delete_quotes)", async () => {
        expect((await quoteDelete(delReq(), params())).status).toBe(403);
    });
    // Faz 6 (V4-A8): /convert artık 410 deprecated tombstone (accept atomik RPC
    // ile değişti) — guard yok, RBAC anlamsız. Permission'dan bağımsız 410 döner.
    it("quotes [id]/convert → 410 (deprecated tombstone, guard yok)", async () => {
        expect((await quoteConvert(postReq(), params())).status).toBe(410);
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
    it("orders [id] DELETE → 403 (delete_sales_orders)", async () => {
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
    it("customers [id] DELETE → 403 (delete_customers)", async () => {
        expect((await customerDelete(delReq(), params())).status).toBe(403);
    });
    it("inventory/movements POST → 403 (stock_adjust_*)", async () => {
        expect((await inventoryPost(postReq())).status).toBe(403);
    });
});

describe("R1/R2 guards — viewer → 403 (Batch B1: products + vendors)", () => {
    it("products POST → 403 (manage_product_master)", async () => {
        expect((await productsPost(postReq())).status).toBe(403);
    });
    it("products [id] PATCH → 403 (manage_product_master)", async () => {
        expect((await productPatch(patchReq({ name: "X" }), params())).status).toBe(403);
    });
    it("products [id] DELETE → 403 (manage_product_master)", async () => {
        expect((await productDelete(delReq(), params())).status).toBe(403);
    });
    it("vendors GET → 403 (view_vendors — viewer'da yok)", async () => {
        const req = new NextRequest("http://localhost/api/vendors", { method: "GET" });
        expect((await vendorsGet(req)).status).toBe(403);
    });
    it("vendors POST → 403 (manage_vendors)", async () => {
        expect((await vendorsPost(postReq())).status).toBe(403);
    });
    it("vendors [id] PATCH → 403 (manage_vendors)", async () => {
        expect((await vendorPatch(patchReq(), params())).status).toBe(403);
    });
    it("vendors [id] DELETE → 403 (delete_vendors)", async () => {
        expect((await vendorDelete(delReq(), params())).status).toBe(403);
    });
});

describe("R1/R2 guards — viewer → 403 (Batch B2: PO/commitments/öneri/üretim/alert)", () => {
    it("purchase-orders GET → 403 (view_purchase_orders)", async () => {
        const req = new NextRequest("http://localhost/api/purchase-orders", { method: "GET" });
        expect((await poGet(req)).status).toBe(403);
    });
    it("purchase-orders POST → 403 (manage_purchase_orders)", async () => {
        expect((await poPost(postReq())).status).toBe(403);
    });
    it("purchase-orders [id] PATCH → 403 (manage_purchase_orders)", async () => {
        expect((await poPatch(patchReq(), params())).status).toBe(403);
    });
    it("purchase-orders [id]/confirm → 403", async () => {
        expect((await poConfirm(postReq(), params())).status).toBe(403);
    });
    it("purchase-orders [id]/send → 403", async () => {
        expect((await poSend(postReq(), params())).status).toBe(403);
    });
    it("purchase-orders [id]/revise → 403", async () => {
        expect((await poRevise(postReq(), params())).status).toBe(403);
    });
    it("purchase-orders [id]/lines PUT → 403", async () => {
        expect((await poLines(postReq(), params())).status).toBe(403);
    });
    it("purchase-commitments GET → 403 (view_purchase_orders)", async () => {
        const req = new NextRequest("http://localhost/api/purchase-commitments", { method: "GET" });
        expect((await pcGet(req)).status).toBe(403);
    });
    it("purchase-commitments POST → 403 (manage_purchase_orders)", async () => {
        expect((await pcPost(postReq())).status).toBe(403);
    });
    it("purchase-commitments [id] PATCH → 403", async () => {
        expect((await pcPatch(patchReq({ action: "receive" }), params())).status).toBe(403);
    });
    it("recommendations GET → 403 (view_purchase_suggestions)", async () => {
        const req = new NextRequest("http://localhost/api/recommendations", { method: "GET" });
        expect((await recGet(req)).status).toBe(403);
    });
    it("recommendations [id] PATCH → 403 (manage_purchase_suggestions)", async () => {
        expect((await recPatch(patchReq({ status: "accepted" }), params())).status).toBe(403);
    });
    it("production POST → 403 (manage_production)", async () => {
        expect((await productionPost(postReq())).status).toBe(403);
    });
    it("production [id] DELETE → 403 (delete_production)", async () => {
        expect((await productionDelete(delReq(), params())).status).toBe(403);
    });
    it("alerts [id] PATCH → 403 (manage_alerts)", async () => {
        expect((await alertPatch(patchReq({ status: "resolved" }), params())).status).toBe(403);
    });
    it("alerts [id]/sync-retry → 403 (manage_alerts)", async () => {
        expect((await alertSyncRetry(postReq(), params())).status).toBe(403);
    });
});

describe("R1 guards — viewer → 403 (Batch C: settings + parasut + product-types)", () => {
    it("settings/company PATCH → 403 (manage_settings)", async () => {
        expect((await companyPatch(patchReq({ name: "X" }))).status).toBe(403);
    });
    it("parasut/sync POST → 403 (manage_parasut)", async () => {
        expect((await parasutSync(postReq("http://localhost/api/parasut/sync", { order_id: "x" }))).status).toBe(403);
    });
    it("parasut/retry POST → 403 (manage_parasut)", async () => {
        expect((await parasutRetry(postReq("http://localhost/api/parasut/retry", { orderId: "x" }))).status).toBe(403);
    });
    it("product-types POST → 403 (manage_product_types — viewer'da yok; admin+purchasing'e açık)", async () => {
        expect((await productTypesPost(postReq())).status).toBe(403);
    });
    it("import POST → 403 (manage_import)", async () => {
        expect((await importPost(postReq())).status).toBe(403);
    });
    it("import [batchId] PATCH → 403 (manage_import)", async () => {
        const bp = { params: Promise.resolve({ batchId: "b1" }) };
        expect((await importBatchPatch(patchReq({ status: "review" }), bp)).status).toBe(403);
    });
    it("import [batchId] DELETE → 403 (manage_import)", async () => {
        const bp = { params: Promise.resolve({ batchId: "b1" }) };
        expect((await importBatchDelete(delReq(), bp)).status).toBe(403);
    });
    it("import drafts/[id] PATCH → 403 (manage_import)", async () => {
        expect((await importDraftPatch(patchReq({ status: "confirmed" }), params())).status).toBe(403);
    });
});

describe("R2 read-guards — viewer → 403 (Batch E: parasut finansal GET)", () => {
    function getReq(url: string): NextRequest {
        return new NextRequest(url, { method: "GET" });
    }
    it("parasut/invoices GET → 403 (view_parasut — viewer'da yok)", async () => {
        expect((await parasutInvoicesGet(getReq("http://localhost/api/parasut/invoices"))).status).toBe(403);
    });
    it("parasut/stats GET → 403 (view_parasut)", async () => {
        expect((await parasutStatsGet(getReq("http://localhost/api/parasut/stats"))).status).toBe(403);
    });
    it("parasut/logs GET → 403 (view_parasut)", async () => {
        expect((await parasutLogsGet(getReq("http://localhost/api/parasut/logs"))).status).toBe(403);
    });
});

// ── Faz 6: delete guard ayırt ediciliği ────────────────────────────────────
// Silme uçları artık `delete_*` ister; `manage_*` TEK BAŞINA yetmez. Bu blok,
// perm setini yalnız ilgili `manage_*` ile sabitleyip 403 bekleyerek guard'ın
// gerçekten `delete_*`'e bağlandığını kanıtlar (etiket-only swap'a karşı kilit).
describe("Faz 6 — delete guard delete_* ister (manage_* yetmez)", () => {
    const mockedPerms = vi.mocked(getCurrentUserPermissions);
    const only = (...p: string[]) => new Set(p) as Set<Permission>;

    it("customers [id] DELETE: yalnız manage_customers → 403", async () => {
        mockedPerms.mockResolvedValueOnce(only("manage_customers", "view_customers"));
        expect((await customerDelete(delReq(), params())).status).toBe(403);
    });
    it("vendors [id] DELETE: yalnız manage_vendors → 403", async () => {
        mockedPerms.mockResolvedValueOnce(only("manage_vendors", "view_vendors"));
        expect((await vendorDelete(delReq(), params())).status).toBe(403);
    });
    it("production [id] DELETE: yalnız manage_production → 403", async () => {
        mockedPerms.mockResolvedValueOnce(only("manage_production", "view_production"));
        expect((await productionDelete(delReq(), params())).status).toBe(403);
    });
    it("orders [id] DELETE: yalnız manage_sales_orders → 403", async () => {
        mockedPerms.mockResolvedValueOnce(only("manage_sales_orders", "view_sales_orders"));
        expect((await orderDelete(delReq(), params())).status).toBe(403);
    });
    it("quotes [id] DELETE: yalnız manage_quotes → 403", async () => {
        mockedPerms.mockResolvedValueOnce(only("manage_quotes", "view_quotes"));
        expect((await quoteDelete(delReq(), params())).status).toBe(403);
    });

    // Rol → delete_* eşleme regresyon kilidi: ileride bir rolden delete_X
    // düşerse (yetkili rol sessizce kilitlenir, route testleri yeşil kalır) bu
    // assertion yakalar. Yetkilendiren yarıyı kanıtlar (manage-only blok ise
    // route'un delete_* istediğini).
    it("rol→delete_* eşlemesi korunur (yetki veren yarı)", () => {
        const sales = permissionsForRoles(["sales"]);
        expect(sales.has("delete_customers")).toBe(true);
        expect(sales.has("delete_sales_orders")).toBe(true);
        expect(sales.has("delete_quotes")).toBe(true);
        expect(permissionsForRoles(["purchasing"]).has("delete_vendors")).toBe(true);
        expect(permissionsForRoles(["production"]).has("delete_production")).toBe(true);
        // viewer hiçbir delete_* tutmaz
        const viewer = permissionsForRoles(["viewer"]);
        expect(viewer.has("delete_customers")).toBe(false);
        expect(viewer.has("delete_quotes")).toBe(false);
    });
});

// ── F4: orders PATCH ship per-transition guard (ship_sales_orders) ──────────
// PATCH {transition:"shipped"} artık ship_sales_orders ister (sales tutmaz →
// sevk edemez); diğer geçişler manage_sales_orders. Detay "Sevket" butonu PATCH
// kullandığından "shipped"i kaldırmak yerine per-transition guard uygulandı.
describe("F4 — orders PATCH ship per-transition guard", () => {
    const mockedPerms = vi.mocked(getCurrentUserPermissions);
    const only = (...p: string[]) => new Set(p) as Set<Permission>;

    it("sales-benzeri (manage_sales_orders var, ship_sales_orders YOK) + {transition:'shipped'} → 403", async () => {
        mockedPerms.mockResolvedValueOnce(only("manage_sales_orders", "view_sales_orders", "view_sales_prices"));
        expect((await orderPatch(patchReq({ transition: "shipped" }), params())).status).toBe(403);
    });

    // Authz-önce ordering kilidi: transition'sız body → manage_sales_orders'a düşer
    // → viewer 403 (validation 400'den ÖNCE authz). Guard reorder regression'ı yakalar.
    it("viewer + transition'sız body → 403 (validation değil authz önce)", async () => {
        // module-level mock viewer döner; mockResolvedValueOnce ile sabitlemeye gerek yok
        expect((await orderPatch(patchReq({ foo: "bar" }), params())).status).toBe(403);
    });

    // Rol→permission eşleme regresyonu (per-transition guard'ı doğru kılan yarı):
    // production ship tutar, sales tutmaz; sales non-ship geçişler için manage tutar.
    it("rol→ship_sales_orders eşlemesi: production var, sales YOK", () => {
        expect(permissionsForRoles(["production"]).has("ship_sales_orders")).toBe(true);
        expect(permissionsForRoles(["sales"]).has("ship_sales_orders")).toBe(false);
        expect(permissionsForRoles(["sales"]).has("manage_sales_orders")).toBe(true);
    });
});
