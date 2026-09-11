/**
 * DAVRANIŞ testi — Paraşüt toplu işleri kataloğun tamamını görüyor mu?
 *
 * 2026-09-11, dış inceleme #4. Kaynak kilidi `gate/parasut-batch-progress`te;
 * burası gerçek çağrı sayısını ölçer: 250 senkronlu ürünle koşup `checked`
 * gerçekten 250 mi diye bakar. Düzeltmeden önce 100'dü ve kalan 150 ürün
 * HİÇBİR ZAMAN kontrol edilmiyordu.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/** Sayfalı `products` sorgusunu taklit eden minimal zincir. */
function makeSupabase(total: number) {
    const calls: { from: number; to: number; ordered: boolean }[] = [];
    const rows = Array.from({ length: total }, (_, i) => ({
        id: `p${i}`,
        sku: `SKU-${String(i).padStart(4, "0")}`,
        name: `Ürün ${i}`,
        on_hand: 10,
        parasut_product_id: `x${i}`,
    }));
    return {
        calls,
        from: () => {
            let ordered = false;
            const chain: Record<string, unknown> = {
                select: () => chain,
                not: () => chain,
                eq: () => chain,
                order: () => { ordered = true; return chain; },
                range: (a: number, b: number) => {
                    calls.push({ from: a, to: b, ordered });
                    return Promise.resolve({ data: rows.slice(a, b + 1), error: null });
                },
                limit: (n: number) => {
                    calls.push({ from: 0, to: n - 1, ordered });
                    return Promise.resolve({ data: rows.slice(0, n), error: null });
                },
            };
            return chain;
        },
    };
}

let supa = makeSupabase(0);
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => supa }));
vi.mock("@/lib/parasut", () => ({
    getParasutAdapter: () => ({
        // Her ürün için "ERP ile aynı" döner → sapma yok, akış sade kalır.
        listInventoryLevels: () => Promise.resolve([{ stock_count: 10 }]),
        updateStocks: () => Promise.resolve(undefined),
    }),
    ParasutError: class extends Error {
        kind: string;
        constructor(kind: string, msg: string) { super(msg); this.kind = kind; }
    },
}));
vi.mock("@/lib/services/parasut-service", () => ({
    parasutApiCall: (_m: unknown, fn: () => Promise<unknown>) => fn(),
}));
vi.mock("@/lib/supabase/alerts", () => ({
    dbCreateAlert: vi.fn(), dbBatchResolveAlerts: vi.fn(), dbListActiveAlerts: vi.fn(() => Promise.resolve([])),
}));

import { serviceReconcileParasutStock } from "@/lib/services/parasut-stock-service";

const ORIGINAL = { ...process.env };
beforeEach(() => { process.env.PARASUT_ENABLED = "true"; });
afterEach(() => { process.env = { ...ORIGINAL }; });

describe("stok mutabakatı — 100'ün ötesi de taranıyor", () => {
    it("250 senkronlu üründe checked = 250 (eskiden 100'de kesiliyordu)", async () => {
        supa = makeSupabase(250);
        const res = await serviceReconcileParasutStock();
        expect(res.checked, "katalog 100'de kesildi — kalan ürünler hiç kontrol edilmiyor").toBe(250);
        expect(res.truncated, "tavan dolmadı, bayrak kurulmamalı").toBeFalsy();
    });

    it("her sayfa SIRALI okunuyor — sırasız `.range()` satır kaçırır", async () => {
        supa = makeSupabase(250);
        await serviceReconcileParasutStock();
        expect(supa.calls.length, "hiç sayfa okunmadı").toBeGreaterThan(1);
        expect(supa.calls.every(c => c.ordered), "bir sayfa sırasız okundu").toBe(true);
    });

    it("sayfalar ÖRTÜŞMÜYOR ve boşluk bırakmıyor", async () => {
        supa = makeSupabase(250);
        await serviceReconcileParasutStock();
        for (let i = 1; i < supa.calls.length; i++) {
            expect(supa.calls[i].from, `sayfa ${i} önceki sayfanın hemen ardından başlamıyor`)
                .toBe(supa.calls[i - 1].to + 1);
        }
    });

    it("tavan dolarsa SESSİZ kesilmiyor — truncated raporlanıyor", async () => {
        process.env.PARASUT_RECONCILE_MAX = "150";
        vi.resetModules();
        supa = makeSupabase(500);
        const mod = await import("@/lib/services/parasut-stock-service");
        const res = await mod.serviceReconcileParasutStock();
        expect(res.checked).toBe(150);
        expect(res.truncated, "tavan doldu ama rapor sessiz — katalog yarım tarandı").toBe(true);
    });

    it("Paraşüt kapalıyken hiç sorgu yapılmıyor (teslim kapalı)", async () => {
        process.env.PARASUT_ENABLED = "";
        supa = makeSupabase(250);
        const res = await serviceReconcileParasutStock();
        expect(res.disabled).toBe(true);
        expect(supa.calls).toHaveLength(0);
    });
});
