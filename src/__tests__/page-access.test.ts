/**
 * RBAC Faz 2 — page-access.ts pure testleri (route → permission matris).
 */
import { describe, it, expect } from "vitest";
import { requiredPermissionForPath, canAccessPath } from "@/lib/auth/page-access";
import { permissionsForRoles } from "@/lib/auth/permissions";

describe("requiredPermissionForPath", () => {
    it("temel sayfalar doğru permission'a map'lenir", () => {
        expect(requiredPermissionForPath("/dashboard/quotes")).toBe("view_quotes");
        expect(requiredPermissionForPath("/dashboard/orders")).toBe("view_sales_orders");
        expect(requiredPermissionForPath("/dashboard/products")).toBe("view_products");
        expect(requiredPermissionForPath("/dashboard/vendors")).toBe("view_vendors");
        expect(requiredPermissionForPath("/dashboard/production")).toBe("view_production");
        expect(requiredPermissionForPath("/dashboard/import")).toBe("view_import");
        expect(requiredPermissionForPath("/dashboard/alerts")).toBe("view_alerts");
        expect(requiredPermissionForPath("/dashboard/parasut")).toBe("view_parasut");
        expect(requiredPermissionForPath("/dashboard/customers")).toBe("view_customers");
        expect(requiredPermissionForPath("/dashboard/purchase/suggested")).toBe("view_purchase_suggestions");
        expect(requiredPermissionForPath("/dashboard/purchase/orders")).toBe("view_purchase_orders");
    });

    it("alt-yollar (detay/new) parent prefix'e map'lenir", () => {
        expect(requiredPermissionForPath("/dashboard/quotes/abc-123")).toBe("view_quotes");
        expect(requiredPermissionForPath("/dashboard/orders/new")).toBe("view_sales_orders");
        expect(requiredPermissionForPath("/dashboard/purchase/orders/xyz/print")).toBe("view_purchase_orders");
    });

    it("spesifiklik sırası: settings/users settings'ten önce", () => {
        expect(requiredPermissionForPath("/dashboard/settings/users")).toBe("view_users");
        expect(requiredPermissionForPath("/dashboard/settings/product-types")).toBe("view_product_types");
        expect(requiredPermissionForPath("/dashboard/settings")).toBe("view_settings");
        expect(requiredPermissionForPath("/dashboard/settings/company")).toBe("view_settings");
    });

    it("/dashboard exact → view_dashboard", () => {
        expect(requiredPermissionForPath("/dashboard")).toBe("view_dashboard");
    });

    it("bilinmeyen /dashboard alt-yol → null (fail-open auth-only)", () => {
        expect(requiredPermissionForPath("/dashboard/yeni-modul")).toBeNull();
    });

    it("/dashboard dışı → null", () => {
        expect(requiredPermissionForPath("/login")).toBeNull();
        expect(requiredPermissionForPath("/api/quotes")).toBeNull();
    });
});

describe("canAccessPath — rol bazlı", () => {
    const admin = permissionsForRoles(["admin"]);
    const sales = permissionsForRoles(["sales"]);
    const purchasing = permissionsForRoles(["purchasing"]);
    const production = permissionsForRoles(["production"]);
    const accounting = permissionsForRoles(["accounting"]);
    const viewer = permissionsForRoles(["viewer"]);

    it("admin her sayfaya erişir", () => {
        for (const path of [
            "/dashboard", "/dashboard/quotes", "/dashboard/parasut",
            "/dashboard/settings", "/dashboard/settings/users", "/dashboard/production",
        ]) {
            expect(canAccessPath(path, admin)).toBe(true);
        }
    });

    it("sales: quotes/orders/customers VAR; parasut/vendors/production/settings YOK", () => {
        expect(canAccessPath("/dashboard/quotes", sales)).toBe(true);
        expect(canAccessPath("/dashboard/orders", sales)).toBe(true);
        expect(canAccessPath("/dashboard/customers", sales)).toBe(true);
        expect(canAccessPath("/dashboard/products", sales)).toBe(true);
        expect(canAccessPath("/dashboard/parasut", sales)).toBe(false);
        expect(canAccessPath("/dashboard/vendors", sales)).toBe(false);
        expect(canAccessPath("/dashboard/production", sales)).toBe(false);
        expect(canAccessPath("/dashboard/settings", sales)).toBe(false);
        expect(canAccessPath("/dashboard/purchase/orders", sales)).toBe(false);
    });

    it("purchasing: vendors/PO/öneri/import/ürün-tipleri VAR; quotes/parasut/production YOK", () => {
        expect(canAccessPath("/dashboard/vendors", purchasing)).toBe(true);
        expect(canAccessPath("/dashboard/purchase/suggested", purchasing)).toBe(true);
        expect(canAccessPath("/dashboard/purchase/orders", purchasing)).toBe(true);
        expect(canAccessPath("/dashboard/import", purchasing)).toBe(true);
        expect(canAccessPath("/dashboard/settings/product-types", purchasing)).toBe(true);
        expect(canAccessPath("/dashboard/quotes", purchasing)).toBe(false);
        expect(canAccessPath("/dashboard/parasut", purchasing)).toBe(false);
        expect(canAccessPath("/dashboard/production", purchasing)).toBe(false);
        expect(canAccessPath("/dashboard/settings", purchasing)).toBe(false);
    });

    it("production: production/orders/products/alerts VAR; quotes/vendors/parasut YOK", () => {
        expect(canAccessPath("/dashboard/production", production)).toBe(true);
        expect(canAccessPath("/dashboard/orders", production)).toBe(true);
        expect(canAccessPath("/dashboard/products", production)).toBe(true);
        expect(canAccessPath("/dashboard/alerts", production)).toBe(true);
        expect(canAccessPath("/dashboard/quotes", production)).toBe(false);
        expect(canAccessPath("/dashboard/vendors", production)).toBe(false);
        expect(canAccessPath("/dashboard/parasut", production)).toBe(false);
    });

    it("accounting: parasut/PO/vendors/quotes(view)/customers VAR; production/alerts/settings YOK", () => {
        expect(canAccessPath("/dashboard/parasut", accounting)).toBe(true);
        expect(canAccessPath("/dashboard/purchase/orders", accounting)).toBe(true);
        expect(canAccessPath("/dashboard/vendors", accounting)).toBe(true);
        expect(canAccessPath("/dashboard/quotes", accounting)).toBe(true);
        expect(canAccessPath("/dashboard/customers", accounting)).toBe(true);
        expect(canAccessPath("/dashboard/production", accounting)).toBe(false);
        expect(canAccessPath("/dashboard/alerts", accounting)).toBe(false);
        expect(canAccessPath("/dashboard/settings", accounting)).toBe(false);
    });

    it("viewer: temel okuma sayfaları VAR; tüm yönetim sayfaları YOK", () => {
        expect(canAccessPath("/dashboard", viewer)).toBe(true);
        expect(canAccessPath("/dashboard/quotes", viewer)).toBe(true);
        expect(canAccessPath("/dashboard/orders", viewer)).toBe(true);
        expect(canAccessPath("/dashboard/products", viewer)).toBe(true);
        expect(canAccessPath("/dashboard/customers", viewer)).toBe(true);
        expect(canAccessPath("/dashboard/alerts", viewer)).toBe(true);
        expect(canAccessPath("/dashboard/parasut", viewer)).toBe(false);
        expect(canAccessPath("/dashboard/vendors", viewer)).toBe(false);
        expect(canAccessPath("/dashboard/production", viewer)).toBe(false);
        expect(canAccessPath("/dashboard/import", viewer)).toBe(false);
        expect(canAccessPath("/dashboard/settings", viewer)).toBe(false);
        expect(canAccessPath("/dashboard/settings/users", viewer)).toBe(false);
        expect(canAccessPath("/dashboard/purchase/suggested", viewer)).toBe(false);
    });

    it("çoklu rol (sales+purchasing) birleşik erişim", () => {
        const both = permissionsForRoles(["sales", "purchasing"]);
        expect(canAccessPath("/dashboard/quotes", both)).toBe(true);   // sales
        expect(canAccessPath("/dashboard/vendors", both)).toBe(true);  // purchasing
        expect(canAccessPath("/dashboard/parasut", both)).toBe(false); // ikisi de değil
    });
});
