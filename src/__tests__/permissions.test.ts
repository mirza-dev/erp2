/**
 * RBAC Faz 1 — permissions.ts pure fonksiyon testleri.
 *
 * Yüksek riskli kabul kriterleri (taslak §High-Risk Review Points):
 *   - roles dizisi tekil role'ü yener
 *   - eski tekil role okunur (purchaser → purchasing normalize)
 *   - rol yoksa → viewer (eski purchaser default DEĞİL)
 *   - user_metadata ASLA okunmaz (parseRoles sadece app_metadata alır)
 *   - ADMIN_EMAILS bootstrap → metadata yoksa admin
 *   - admin → tüm permission'lar
 *   - çoklu rol → permission union
 */
import { describe, it, expect } from "vitest";
import {
    ROLES,
    ALL_PERMISSIONS,
    ROLE_PERMISSIONS,
    normalizeRole,
    parseRoles,
    isProvisionedUser,
    permissionsForRoles,
    hasPermission,
    hasRole,
    primaryRole,
    normalizeAssignedRoles,
    type Role,
} from "@/lib/auth/permissions";

describe("normalizeRole", () => {
    it("legacy 'purchaser' → 'purchasing'", () => {
        expect(normalizeRole("purchaser")).toBe("purchasing");
    });
    it("geçerli roller aynen döner (case-insensitive + trim)", () => {
        expect(normalizeRole("admin")).toBe("admin");
        expect(normalizeRole(" Sales ")).toBe("sales");
        expect(normalizeRole("PRODUCTION")).toBe("production");
    });
    it("geçersiz / non-string → null", () => {
        expect(normalizeRole("manager")).toBeNull();
        expect(normalizeRole("")).toBeNull();
        expect(normalizeRole(null)).toBeNull();
        expect(normalizeRole(123)).toBeNull();
        expect(normalizeRole(undefined)).toBeNull();
    });
});

describe("parseRoles — kaynak önceliği", () => {
    it("roles dizisi tekil role'ü yener", () => {
        const r = parseRoles({ roles: ["sales", "purchasing"], role: "admin" }, null, []);
        expect(r.sort()).toEqual(["purchasing", "sales"]);
        expect(r).not.toContain("admin");
    });

    it("roles dizisi geçersizleri eler + dedup + legacy normalize", () => {
        const r = parseRoles({ roles: ["sales", "manager", "purchaser", "sales"] }, null, []);
        expect(r.sort()).toEqual(["purchasing", "sales"]);
    });

    it("roles boş/geçersizse tekil role'e düşer (legacy purchaser→purchasing)", () => {
        expect(parseRoles({ roles: [], role: "purchaser" }, null, [])).toEqual(["purchasing"]);
        expect(parseRoles({ roles: ["manager"], role: "admin" }, null, [])).toEqual(["admin"]);
    });

    it("tekil role legacy okunur", () => {
        expect(parseRoles({ role: "accounting" }, null, [])).toEqual(["accounting"]);
    });

    it("metadata yok + email ∈ ADMIN_EMAILS → admin (bootstrap, case-insensitive)", () => {
        expect(parseRoles({}, "Boss@PMT.com", ["boss@pmt.com"])).toEqual(["admin"]);
        expect(parseRoles(null, "boss@pmt.com", ["boss@pmt.com"])).toEqual(["admin"]);
    });

    it("metadata yok + email ADMIN_EMAILS dışında → viewer (purchaser DEĞİL)", () => {
        expect(parseRoles({}, "rastgele@pmt.com", ["boss@pmt.com"])).toEqual(["viewer"]);
        expect(parseRoles(undefined, null, [])).toEqual(["viewer"]);
    });

    it("explicit roles, ADMIN_EMAILS'i ezmez (bootstrap sadece metadata yoksa)", () => {
        expect(parseRoles({ role: "viewer" }, "boss@pmt.com", ["boss@pmt.com"])).toEqual(["viewer"]);
    });
});

describe("isProvisionedUser — davetiye-bazlı erişim kilidi", () => {
    it("app_metadata.roles dolu (admin) → true", () => {
        expect(isProvisionedUser({ roles: ["admin"] }, "a@x.com", [])).toBe(true);
    });
    it("app_metadata.roles=['viewer'] (admin-created viewer) → true", () => {
        expect(isProvisionedUser({ roles: ["viewer"] }, "v@x.com", [])).toBe(true);
    });
    it("legacy tekil app_metadata.role → true", () => {
        expect(isProvisionedUser({ role: "sales" }, "s@x.com", [])).toBe(true);
    });
    it("ADMIN_EMAILS bootstrap (roles yok ama email listede) → true", () => {
        expect(isProvisionedUser({}, "boss@pmt.com", ["boss@pmt.com"])).toBe(true);
    });
    it("self-signup: app_metadata.roles HİÇ yok + ADMIN_EMAILS dışı → false", () => {
        expect(isProvisionedUser({}, "random@gmail.com", [])).toBe(false);
        expect(isProvisionedUser(null, "random@gmail.com", ["boss@pmt.com"])).toBe(false);
        expect(isProvisionedUser(undefined, null, [])).toBe(false);
    });
    it("boş roles dizisi → false (provize sayılmaz)", () => {
        expect(isProvisionedUser({ roles: [] }, "x@x.com", [])).toBe(false);
    });
    it("yalnız geçersiz roller → false", () => {
        expect(isProvisionedUser({ roles: ["superhero"] }, "x@x.com", [])).toBe(false);
    });
});

describe("permissionsForRoles", () => {
    it("admin → TÜM permission'lar", () => {
        const p = permissionsForRoles(["admin"]);
        expect(p.size).toBe(ALL_PERMISSIONS.length);
        for (const perm of ALL_PERMISSIONS) expect(p.has(perm)).toBe(true);
    });

    it("admin başka rollerle birlikte de tam yetki", () => {
        expect(permissionsForRoles(["viewer", "admin"]).size).toBe(ALL_PERMISSIONS.length);
    });

    it("çoklu rol → union (sales ∪ purchasing)", () => {
        const p = permissionsForRoles(["sales", "purchasing"]);
        expect(p.has("view_sales_prices")).toBe(true);   // sales
        expect(p.has("view_purchase_costs")).toBe(true); // purchasing
        expect(p.has("manage_quotes")).toBe(true);       // sales
        expect(p.has("manage_vendors")).toBe(true);      // purchasing
    });

    it("viewer → salt-okuma, hassas finansal YOK", () => {
        const p = permissionsForRoles(["viewer"]);
        expect(p.has("view_products")).toBe(true);
        expect(p.has("view_sales_prices")).toBe(false);
        expect(p.has("view_purchase_costs")).toBe(false);
        expect(p.has("view_financial_summary")).toBe(false);
        expect(p.has("manage_quotes")).toBe(false);
    });

    it("sales: satış finansalı görür, satın alma maliyeti GÖRMEZ", () => {
        const p = permissionsForRoles(["sales"]);
        expect(p.has("view_sales_prices")).toBe(true);
        expect(p.has("view_purchase_costs")).toBe(false);
        expect(p.has("view_financial_summary")).toBe(false);
        expect(p.has("ship_sales_orders")).toBe(false);
        expect(p.has("manage_parasut")).toBe(false);
    });

    it("purchasing: maliyet görür, satış finansal özeti GÖRMEZ", () => {
        const p = permissionsForRoles(["purchasing"]);
        expect(p.has("view_purchase_costs")).toBe(true);
        expect(p.has("view_financial_summary")).toBe(false);
        expect(p.has("view_sales_prices")).toBe(false);
        expect(p.has("manage_quotes")).toBe(false);
    });

    it("production: finansal alan YOK, sevkiyat + stok hareketi VAR", () => {
        const p = permissionsForRoles(["production"]);
        expect(p.has("ship_sales_orders")).toBe(true);
        expect(p.has("stock_adjust_general")).toBe(true);
        expect(p.has("view_sales_prices")).toBe(false);
        expect(p.has("view_purchase_costs")).toBe(false);
    });

    it("accounting: tüm finansal görür, operasyonel mutasyon YOK", () => {
        const p = permissionsForRoles(["accounting"]);
        expect(p.has("view_sales_prices")).toBe(true);
        expect(p.has("view_purchase_costs")).toBe(true);
        expect(p.has("view_financial_summary")).toBe(true);
        expect(p.has("manage_parasut")).toBe(true);
        expect(p.has("manage_quotes")).toBe(false);
        expect(p.has("manage_purchase_orders")).toBe(false);
        expect(p.has("ship_sales_orders")).toBe(false);
    });

    it("boş rol dizisi → boş permission seti", () => {
        expect(permissionsForRoles([]).size).toBe(0);
    });
});

describe("hasPermission / hasRole / primaryRole", () => {
    it("hasPermission", () => {
        const p = permissionsForRoles(["sales"]);
        expect(hasPermission(p, "manage_quotes")).toBe(true);
        expect(hasPermission(p, "manage_parasut")).toBe(false);
    });
    it("hasRole", () => {
        expect(hasRole(["sales", "purchasing"], "purchasing")).toBe(true);
        expect(hasRole(["sales"], "admin")).toBe(false);
    });
    it("primaryRole: admin > operasyonel > viewer", () => {
        expect(primaryRole(["viewer", "admin", "sales"])).toBe("admin");
        expect(primaryRole(["viewer", "production"])).toBe("production");
        expect(primaryRole(["viewer"])).toBe("viewer");
        expect(primaryRole([])).toBe("viewer");
    });
});

describe("normalizeAssignedRoles (admin UI → app_metadata.roles)", () => {
    it("geçerli rolleri korur + dedup + legacy normalize", () => {
        expect(normalizeAssignedRoles(["sales", "purchaser", "sales"]).sort()).toEqual(["purchasing", "sales"]);
    });
    it("operasyonel rol varsa viewer çıkarılır", () => {
        expect(normalizeAssignedRoles(["sales", "viewer"])).toEqual(["sales"]);
        expect(normalizeAssignedRoles(["admin", "viewer"])).toEqual(["admin"]);
    });
    it("yalnız viewer → viewer korunur", () => {
        expect(normalizeAssignedRoles(["viewer"])).toEqual(["viewer"]);
    });
    it("boş / geçersiz / non-array → viewer (sessiz yetki YOK)", () => {
        expect(normalizeAssignedRoles([])).toEqual(["viewer"]);
        expect(normalizeAssignedRoles(["manager", "xyz"])).toEqual(["viewer"]);
        expect(normalizeAssignedRoles(null)).toEqual(["viewer"]);
        expect(normalizeAssignedRoles("admin")).toEqual(["viewer"]);
    });
});

describe("bütünlük (drift guard)", () => {
    it("6 rol tanımlı + ROLE_PERMISSIONS hepsini kapsar", () => {
        expect(ROLES).toEqual(["admin", "sales", "purchasing", "production", "accounting", "viewer"]);
        for (const r of ROLES) expect(Array.isArray(ROLE_PERMISSIONS[r as Role])).toBe(true);
    });
    it("her rolün permission'ları geçerli (ALL_PERMISSIONS içinde)", () => {
        const all = new Set<string>(ALL_PERMISSIONS);
        for (const r of ROLES) for (const p of ROLE_PERMISSIONS[r as Role]) expect(all.has(p)).toBe(true);
    });
});
