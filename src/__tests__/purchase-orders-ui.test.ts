/**
 * Faz 4 — PO UI smoke tests (4 tests, plan §11.1)
 *
 * Page'lerin Next.js module olarak load olabildiğini ve client component
 * default export'larının doğru olduğunu doğrular. Test ortamında JSX render
 * çağrılmaz (DOM yok); sadece statik import + export inspection.
 */
import { describe, it, expect, vi } from "vitest";

// ── Mocks for next.js client primitives ───────────────────────

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/components/ui/Toast", () => ({
    useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/lib/demo-utils", () => ({
    useIsDemo: () => false,
    DEMO_DISABLED_TOOLTIP: "Demo modda devre dışı",
    DEMO_BLOCK_TOAST: { type: "info", message: "Demo modda devre dışı" },
}));

describe("Faz 4 — PO UI module load smoke", () => {
    it("/dashboard/purchase/orders (list) page default export = function component", async () => {
        const mod = await import("@/app/dashboard/purchase/orders/page");
        expect(typeof mod.default).toBe("function");
    });

    it("/dashboard/purchase/orders/new (form) page default export = function component", async () => {
        const mod = await import("@/app/dashboard/purchase/orders/new/page");
        expect(typeof mod.default).toBe("function");
    });

    it("/dashboard/purchase/orders/[id] (detail) page default export = function component", async () => {
        const mod = await import("@/app/dashboard/purchase/orders/[id]/page");
        expect(typeof mod.default).toBe("function");
    });

    it("Sidebar export 'Satın Alma' grubuna 'Siparişler' linkini içerir", async () => {
        // Sidebar source check — string match in file.
        const fs = await import("fs/promises");
        const path = await import("path");
        const src = await fs.readFile(
            path.resolve(process.cwd(), "src/components/layout/Sidebar.tsx"),
            "utf-8",
        );
        expect(src).toContain('href: "/dashboard/purchase/orders"');
        expect(src).toContain('label: "Siparişler"');
    });
});
