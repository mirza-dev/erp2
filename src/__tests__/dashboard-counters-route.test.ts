/**
 * /api/dashboard/counters — Sidebar rozet sayaçları (perf Faz 2).
 *  - 3 sayaç tek istekte döner; tam liste taşınmaz.
 *  - activeAlerts tanımı open+acknowledged (data-context ile birebir) — DB
 *    helper'da kilitli.
 *  - reorderCount copilot ile AYNI saf helper'dan (isReorderCandidateRow);
 *    copilot'taki eski inline filtre geri gelmez.
 *  - Sidebar artık useData ile tam liste çekmez → useDashboardCounters.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("next/cache", () => ({
    // unstable_cache passthrough — testte cache katmanı yok, fonksiyon direkt çalışır
    unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
    revalidateTag: vi.fn(),
}));

const mockCountOrders = vi.fn();
const mockCountAlerts = vi.fn();
const mockListProducts = vi.fn();
const mockQuoted = vi.fn();

vi.mock("@/lib/supabase/orders", () => ({
    dbCountOrdersByCommercialStatus: (...a: unknown[]) => mockCountOrders(...a),
}));
vi.mock("@/lib/supabase/alerts", () => ({
    dbCountActiveAlerts: (...a: unknown[]) => mockCountAlerts(...a),
}));
vi.mock("@/lib/supabase/products", () => ({
    dbListAllActiveProducts: (...a: unknown[]) => mockListProducts(...a),
    dbGetQuotedQuantities: (...a: unknown[]) => mockQuoted(...a),
}));

import { GET } from "@/app/api/dashboard/counters/route";

const commercialRow = (over: Partial<{
    id: string; product_type: string; available_now: number; min_stock_level: number;
    daily_usage: number | null; lead_time_days: number | null;
}> = {}) => ({
    id: "p1", product_type: "commercial", available_now: 100, min_stock_level: 10,
    daily_usage: null, lead_time_days: null, ...over,
});

beforeEach(() => {
    mockCountOrders.mockReset().mockResolvedValue(3);
    mockCountAlerts.mockReset().mockResolvedValue(7);
    mockListProducts.mockReset().mockResolvedValue([]);
    mockQuoted.mockReset().mockResolvedValue(new Map());
});

describe("GET /api/dashboard/counters", () => {
    it("3 sayaç döner; pending sayacı pending_approval ile sorgulanır", async () => {
        mockListProducts.mockResolvedValue([
            commercialRow({ id: "a", available_now: 5, min_stock_level: 10 }),  // aday
            commercialRow({ id: "b", available_now: 100 }),                     // değil
            commercialRow({ id: "c", product_type: "manufactured", available_now: 0 }), // manufactured hariç
        ]);
        const res = await GET();
        expect(res.status).toBe(200);
        await expect(res.json()).resolves.toEqual({ pendingOrders: 3, reorderCount: 1, activeAlerts: 7 });
        expect(mockCountOrders).toHaveBeenCalledWith("pending_approval");
    });

    it("quoted düşülür: available 50, quoted 45, min 10 → promisable 5 ≤ 10 → aday", async () => {
        mockListProducts.mockResolvedValue([commercialRow({ id: "q", available_now: 50, min_stock_level: 10 })]);
        mockQuoted.mockResolvedValue(new Map([["q", 45]]));
        const res = await GET();
        const body = await res.json();
        expect(body.reorderCount).toBe(1);
    });

    it("DB hatası → handleApiError yolu (500'lü yanıt, ham mesaj sızmaz)", async () => {
        mockCountAlerts.mockRejectedValue(new Error("db down"));
        const res = await GET();
        expect(res.status).toBeGreaterThanOrEqual(500);
    });
});

describe("kaynak kilitleri", () => {
    const root = process.cwd();

    it("activeAlerts tanımı: dbCountActiveAlerts open+acknowledged sayar", () => {
        const src = readFileSync(join(root, "src/lib/supabase/alerts.ts"), "utf8");
        expect(src).toMatch(/\.in\("status", \["open", "acknowledged"\]\)/);
    });

    it("count helper'ları head+count — satır taşımaz", () => {
        const alerts = readFileSync(join(root, "src/lib/supabase/alerts.ts"), "utf8");
        const orders = readFileSync(join(root, "src/lib/supabase/orders.ts"), "utf8");
        expect(alerts).toMatch(/count: "exact", head: true/);
        expect(orders).toMatch(/count: "exact", head: true/);
    });

    it("copilot inline reorder filtresi geri gelmez — isReorderCandidateRow kullanır", () => {
        const src = readFileSync(join(root, "src/app/api/ai/purchase-copilot/route.ts"), "utf8");
        expect(src).toMatch(/isReorderCandidateRow\(p, quotedMap\.get\(p\.id\) \?\? 0\)/);
        expect(src).not.toMatch(/REORDER_DEADLINE_WINDOW_DAYS = 7/);
    });

    it("Sidebar tam liste çekmez: useData yok, useDashboardCounters var", () => {
        const src = readFileSync(join(root, "src/components/layout/Sidebar.tsx"), "utf8");
        expect(src).not.toMatch(/useData\(/);
        expect(src).toMatch(/useDashboardCounters\(\)/);
        // rozet davranışı korunur: 0 sayaç rozet üretmez
        expect(src).toMatch(/pendingOrderCount \|\| undefined/);
        expect(src).toMatch(/reorderCount \|\| undefined/);
        expect(src).toMatch(/activeAlertCount \|\| undefined/);
    });

    it("counters route guard'sız GET (emsal /api/alerts) + force-dynamic", () => {
        const src = readFileSync(join(root, "src/app/api/dashboard/counters/route.ts"), "utf8");
        expect(src).not.toMatch(/requirePermission|requireRole/);
        expect(src).toMatch(/force-dynamic/);
        expect(src).toMatch(/tags: \["products"\]/);
    });
});
