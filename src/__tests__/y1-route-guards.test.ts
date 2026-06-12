/**
 * Denetim Y1 (2026-06) — kalan 7 guard'sız GET'in kapanışı.
 *
 * Karar (kullanıcı, AskUserQuestion): DEMO-DOSTU varyant — guard'lar
 * requirePermissionFor ile izin arar ama `!user → 401` dalı YOK; anonim
 * istek resolveAuthContext'in viewer-fallback'inden geçer. Böylece demo
 * gezintisi (viewer izinli uçlar) çalışmaya devam eder; view_import gibi
 * viewer'da olmayan izinler demo dahil fiilen kapanır.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { NextResponse } from "next/server";
import { GUARDLESS_BASELINE } from "./gate/route-guard-baseline";

const read = (p: string) => readFileSync(p, "utf8");

// ── Kaynak kilitleri: 7 route da doğru izni arar ──────────────────────────
const ROUTE_PERMS: Array<[string, string]> = [
    ["src/app/api/alerts/calendar/route.ts", '"view_alerts"'],
    ["src/app/api/import/[batchId]/drafts/route.ts", '"view_import"'],
    ["src/app/api/import/documents/[id]/lines/route.ts", '"view_import"'],
    ["src/app/api/import/documents/[id]/lines/[lineId]/preview-image/route.ts", '"view_import"'],
    ["src/app/api/orders/[id]/parasut-status/route.ts", '"view_sales_orders"'],
    ["src/app/api/orders/open-count-by-product/route.ts", '["view_purchase_suggestions", "view_sales_orders"]'],
    ["src/app/api/products/[id]/shortages/route.ts", '"view_products"'],
];

describe("Y1 — 7 route guard kaynak kilidi", () => {
    it.each(ROUTE_PERMS)("%s requirePermissionFor(%s) çağırır", (path, perm) => {
        const src = read(path);
        expect(src).toContain("resolveAuthContext");
        expect(src).toContain(`requirePermissionFor(authCtx, ${perm})`);
        expect(src).toMatch(/if \(permGuard\) return permGuard;/);
    });

    it("demo-dostu varyant: 7 route'un hiçbirinde `!authCtx.user` 401 dalı yok", () => {
        for (const [path] of ROUTE_PERMS) {
            expect(read(path)).not.toContain("!authCtx.user");
        }
    });

    it("baseline'da ACIK-BULGU sınıfı kalmadı (Y1 tamamen kapandı)", () => {
        expect(GUARDLESS_BASELINE.filter((r) => r.cls === "ACIK-BULGU")).toEqual([]);
    });
});

// ── Davranışsal: open-count-by-product (tek route testi olmayan uçtu) ─────
const mockResolveAuthContext = vi.fn();
const mockRequirePermissionFor = vi.fn();

vi.mock("@/lib/auth/role-guard", () => ({
    resolveAuthContext: (...a: unknown[]) => mockResolveAuthContext(...a),
    requirePermissionFor: (...a: unknown[]) => mockRequirePermissionFor(...a),
}));

const mockOpenCount = vi.fn();
vi.mock("@/lib/supabase/orders", () => ({
    dbGetOpenOrderCountByProduct: (...a: unknown[]) => mockOpenCount(...a),
}));

describe("GET /api/orders/open-count-by-product — Y1 guard", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockResolveAuthContext.mockResolvedValue({
            user: { id: "u-1" }, userId: "u-1", roles: ["purchasing"],
            perms: new Set(["view_purchase_suggestions"]),
        });
        mockRequirePermissionFor.mockReturnValue(null);
        mockOpenCount.mockResolvedValue(new Map([["p-1", 3]]));
    });

    it("izinli istekte sayım haritası döner ve OR izin seti sorulur", async () => {
        const { GET } = await import("@/app/api/orders/open-count-by-product/route");
        const res = await GET();
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ "p-1": 3 });
        expect(mockRequirePermissionFor).toHaveBeenCalledWith(
            expect.anything(),
            ["view_purchase_suggestions", "view_sales_orders"],
        );
    });

    it("izin yoksa 403 döner ve DB'ye inmez", async () => {
        mockRequirePermissionFor.mockReturnValue(
            NextResponse.json({ error: "Yetkiniz yok." }, { status: 403 }),
        );
        const { GET } = await import("@/app/api/orders/open-count-by-product/route");
        const res = await GET();
        expect(res.status).toBe(403);
        expect(mockOpenCount).not.toHaveBeenCalled();
    });
});
