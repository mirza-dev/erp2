/**
 * Faz 9 — Print server page smoke + source-regex
 *
 * Server component (RSC), invoke etmiyoruz; sadece module load + import zinciri doğrulanır.
 */
import { describe, it, expect, beforeAll, vi } from "vitest";

// Side-effect import zincirini önle (createServiceClient supabase env'i okur)
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));

describe("Faz 9 — Print page module load", () => {
    it("default export = function (server component)", async () => {
        const mod = await import("@/app/dashboard/purchase/orders/[id]/print/page");
        expect(typeof mod.default).toBe("function");
    });
});

describe("Faz 9 — Print page source-regex: paralel fetch + 404 lock", () => {
    let src = "";

    beforeAll(async () => {
        const fs = await import("fs/promises");
        const path = await import("path");
        src = await fs.readFile(
            path.resolve(process.cwd(), "src/app/dashboard/purchase/orders/[id]/print/page.tsx"),
            "utf-8",
        );
    });

    it("Paralel fetch: dbGetVendorById + dbGetCompanySettings + dbGetProductRefsByIds import edilir", () => {
        expect(src).toContain("dbGetPurchaseOrderById");
        expect(src).toContain("dbGetVendorById");
        expect(src).toContain("dbGetCompanySettings");
        expect(src).toContain("dbGetProductRefsByIds");
        // Promise.all ile paralel
        expect(src).toMatch(/Promise\.all\(/);
    });

    it("F9-P2 — Veri minimizasyonu: dbListAllActiveProducts import edilmez (tüm katalog leak)", () => {
        // Print payload sadece PO satırlarındaki ürün id'leri için id/sku/name/unit çeker
        expect(src).not.toContain("dbListAllActiveProducts");
    });

    it("F9-P2 — Yalnızca PO line product_id'leri için fetch (Set/dedup)", () => {
        expect(src).toMatch(/po\.lines\.map\(l\s*=>\s*l\.product_id\)/);
        // Set ile dedup
        expect(src).toContain("new Set(");
    });

    it("404 fallback: po null → notFound() çağrılır", () => {
        expect(src).toContain("notFound");
        expect(src).toMatch(/if\s*\(!po\)\s*return\s+notFound\(\)/);
    });

    it("PurchaseOrderDocument mount edilir", () => {
        expect(src).toContain("PurchaseOrderDocument");
        expect(src).toMatch(/<PurchaseOrderDocument\b/);
    });
});

describe("Faz 9 — Detail page'e Yazdır/PDF link butonu eklendi", () => {
    let detailSrc = "";

    beforeAll(async () => {
        const fs = await import("fs/promises");
        const path = await import("path");
        detailSrc = await fs.readFile(
            path.resolve(process.cwd(), "src/app/dashboard/purchase/orders/[id]/page.tsx"),
            "utf-8",
        );
    });

    it("Print sayfasına Link butonu var (target=_blank, demo izinli)", () => {
        expect(detailSrc).toMatch(/\/dashboard\/purchase\/orders\/\$\{po\.id\}\/print/);
        expect(detailSrc).toContain("Yazdır / PDF");
        expect(detailSrc).toContain('target="_blank"');
        expect(detailSrc).toContain('rel="noopener"');
    });
});
