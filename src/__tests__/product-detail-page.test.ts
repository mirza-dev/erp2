/**
 * Faz 2b — /dashboard/products/[id] tam ekran detay sayfası testleri.
 *
 * Source-regex tests cover the structural skeleton:
 *   - module loads (default export = function)
 *   - useParams + useRouter + fetch pattern
 *   - 7 tab keys present
 *   - 3 placeholder tabs (Teknik/Ekler/Partiler) wired to Faz 2c/2d/2e
 *   - Save handler PATCH wiring
 *   - Deactivate handler PATCH is_active=false + router.push
 *   - Loading + 404 branches
 *   - Demo guard
 *   - Operational subsections (Bekleyen Teslimatlar + Aktif Teklifler)
 *   - Header (image placeholder + SKU mono + active/inactive badge)
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const SOURCE = fs.readFileSync(
    path.join(process.cwd(), "src/app/dashboard/products/[id]/page.tsx"),
    "utf8",
);

describe("Faz 2b — product detail page source", () => {
    it("module loads, default export is function", async () => {
        const mod = await import("@/app/dashboard/products/[id]/page");
        expect(typeof mod.default).toBe("function");
    });

    it("uses useParams + useRouter + fetch", () => {
        expect(SOURCE).toMatch(/useParams\s*\(\s*\)/);
        expect(SOURCE).toMatch(/useRouter\s*\(\s*\)/);
        expect(SOURCE).toMatch(/fetch\(\s*`\/api\/products\/\$\{productId\}`/);
    });

    it("declares all 7 tab keys", () => {
        for (const key of ["genel", "teknik", "stok", "tedarik", "ticari", "ekler", "partiler"]) {
            expect(SOURCE).toContain(`"${key}"`);
        }
    });

    it("locks Teknik/Ekler/Partiler with Faz 2c/2d/2e placeholders", () => {
        expect(SOURCE).toMatch(/Faz 2c&apos;de gelecek/);
        expect(SOURCE).toMatch(/Faz 2d&apos;de gelecek/);
        expect(SOURCE).toMatch(/Faz 2e&apos;de gelecek/);
        expect(SOURCE).toMatch(/locked:\s*true/);
    });

    it("save handler PATCHes /api/products/[id]", () => {
        expect(SOURCE).toMatch(/method:\s*"PATCH"/);
        expect(SOURCE).toMatch(/`\/api\/products\/\$\{product\.id\}`/);
    });

    it("deactivate handler patches is_active=false and routes back to list", () => {
        expect(SOURCE).toMatch(/is_active:\s*false/);
        expect(SOURCE).toMatch(/router\.push\(\s*"\/dashboard\/products"\s*\)/);
    });

    it("renders Loading and 404 fallback states", () => {
        expect(SOURCE).toMatch(/Ürün yükleniyor/);
        expect(SOURCE).toMatch(/Ürün bulunamadı/);
    });

    it("guards mutations with demo mode", () => {
        expect(SOURCE).toMatch(/useIsDemo/);
        expect(SOURCE).toMatch(/DEMO_BLOCK_TOAST/);
        expect(SOURCE).toMatch(/DEMO_DISABLED_TOOLTIP/);
    });

    it("Stok tab includes Bekleyen Teslimatlar; Ticari tab includes Aktif Teklifler", () => {
        expect(SOURCE).toMatch(/Bekleyen Teslimatlar/);
        expect(SOURCE).toMatch(/Aktif Teklifler/);
        expect(SOURCE).toMatch(/purchase-commitments\?product_id=/);
        expect(SOURCE).toMatch(/\/api\/products\/\$\{product\.id\}\/quotes/);
    });

    it("header has image placeholder + SKU mono + active/inactive badge", () => {
        expect(SOURCE).toMatch(/Ana görsel/);
        expect(SOURCE).toMatch(/var\(--font-mono\)/);
        expect(SOURCE).toMatch(/Aktif/);
        expect(SOURCE).toMatch(/Pasif/);
    });

    it("uses tablist + role tab + aria-selected", () => {
        expect(SOURCE).toMatch(/role="tablist"/);
        expect(SOURCE).toMatch(/role="tab"/);
        expect(SOURCE).toMatch(/aria-selected/);
        expect(SOURCE).toMatch(/aria-controls/);
    });
});
