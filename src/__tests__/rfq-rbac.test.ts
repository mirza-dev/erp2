import { describe, it, expect } from "vitest";
import { ALL_PERMISSIONS, ROLE_PERMISSIONS, permissionsForRoles } from "@/lib/auth/permissions";
import { requiredPermissionForPath, canAccessPath } from "@/lib/auth/page-access";
import { redactRfqDetailForPerms } from "@/lib/auth/redact";

describe("RFQ RBAC — permission tanımları", () => {
    it("view_rfqs ve manage_rfqs ALL_PERMISSIONS'ta", () => {
        expect(ALL_PERMISSIONS).toContain("view_rfqs");
        expect(ALL_PERMISSIONS).toContain("manage_rfqs");
    });
    it("purchasing rolü ikisine de sahip", () => {
        expect(ROLE_PERMISSIONS.purchasing).toContain("view_rfqs");
        expect(ROLE_PERMISSIONS.purchasing).toContain("manage_rfqs");
    });
    it("accounting yalnız view_rfqs (yönetemez)", () => {
        expect(ROLE_PERMISSIONS.accounting).toContain("view_rfqs");
        expect(ROLE_PERMISSIONS.accounting).not.toContain("manage_rfqs");
    });
    it("sales/viewer RFQ yetkisi yok", () => {
        expect(ROLE_PERMISSIONS.sales).not.toContain("view_rfqs");
        expect(ROLE_PERMISSIONS.viewer).not.toContain("view_rfqs");
    });
    it("admin tüm permission'lara sahip (union)", () => {
        const perms = permissionsForRoles(["admin"]);
        expect(perms.has("manage_rfqs")).toBe(true);
    });
});

describe("RFQ RBAC — sayfa erişimi", () => {
    it("/dashboard/purchase/rfqs → view_rfqs (alt yollar dahil)", () => {
        expect(requiredPermissionForPath("/dashboard/purchase/rfqs")).toBe("view_rfqs");
        expect(requiredPermissionForPath("/dashboard/purchase/rfqs/abc")).toBe("view_rfqs");
    });
    it("PO siparişleri yolunu gölgelemez", () => {
        expect(requiredPermissionForPath("/dashboard/purchase/orders")).toBe("view_purchase_orders");
    });
    it("view_rfqs olmadan erişilemez, ile erişilebilir", () => {
        expect(canAccessPath("/dashboard/purchase/rfqs", new Set())).toBe(false);
        expect(canAccessPath("/dashboard/purchase/rfqs", permissionsForRoles(["purchasing"]))).toBe(true);
    });
});

describe("RFQ RBAC — fiyat redaction (view_purchase_costs)", () => {
    const detail = {
        id: "r1",
        vendors: [
            { id: "v1", prices: [{ rfq_line_id: "L1", unit_price: 100 }, { rfq_line_id: "L2", unit_price: null }] },
        ],
        price_history: [{ id: "h1", unit_price: 50 }],
    };

    it("yetki yoksa unit_price null'lanır (vendors[].prices + price_history)", () => {
        const out = redactRfqDetailForPerms(structuredClone(detail), new Set()) as typeof detail;
        expect(out.vendors[0].prices[0].unit_price).toBeNull();
        expect(out.price_history[0].unit_price).toBeNull();
    });
    it("view_purchase_costs varsa dokunulmaz", () => {
        const out = redactRfqDetailForPerms(structuredClone(detail), permissionsForRoles(["purchasing"])) as typeof detail;
        expect(out.vendors[0].prices[0].unit_price).toBe(100);
        expect(out.price_history[0].unit_price).toBe(50);
    });
});
