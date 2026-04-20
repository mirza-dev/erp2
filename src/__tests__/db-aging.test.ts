/**
 * Tests for stock aging Supabase query functions.
 * (src/lib/supabase/aging.ts)
 *
 * Mocks the Supabase service client. All DB operations verified via mock calls.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Supabase mock ─────────────────────────────────────────────

const mockEq    = vi.fn();
const mockIn    = vi.fn();
const mockOrder = vi.fn();

function makeThenableBuilder(result: { data: unknown; error: unknown }) {
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.eq     = (...args: unknown[]) => { mockEq(...args); return b; };
    b.in     = (...args: unknown[]) => { mockIn(...args); return b; };
    b.order  = (...args: unknown[]) => { mockOrder(...args); return b; };
    b.then   = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
        Promise.resolve(result).then(resolve, reject);
    return b;
}

const mockFrom = vi.fn();

vi.mock("@/lib/supabase/service", () => ({
    createServiceClient: () => ({ from: mockFrom }),
    ConfigError: class ConfigError extends Error {
        readonly code = "CONFIG_ERROR";
        constructor(message: string) { super(message); this.name = "ConfigError"; }
    },
}));

// ── Import under test ─────────────────────────────────────────

import {
    dbGetLastSaleDates,
    dbGetLastIncomingDates,
    dbGetLastProductionDates,
    computeAgingCategory,
    computeAgingCategoryFinished,
    pickMax,
} from "@/lib/supabase/aging";

// ── Setup ─────────────────────────────────────────────────────

beforeEach(() => {
    mockFrom.mockReset();
    mockEq.mockReset();
    mockIn.mockReset();
    mockOrder.mockReset();
});

// ── computeAgingCategoryFinished (pure) ───────────────────────

describe("computeAgingCategoryFinished", () => {
    it("null → no_movement", () => expect(computeAgingCategoryFinished(null)).toBe("no_movement"));
    it("0 gün → active",     () => expect(computeAgingCategoryFinished(0)).toBe("active"));
    it("44 gün → active",    () => expect(computeAgingCategoryFinished(44)).toBe("active"));
    it("45 gün → slow",      () => expect(computeAgingCategoryFinished(45)).toBe("slow"));
    it("89 gün → slow",      () => expect(computeAgingCategoryFinished(89)).toBe("slow"));
    it("90 gün → stagnant",  () => expect(computeAgingCategoryFinished(90)).toBe("stagnant"));
    it("179 gün → stagnant", () => expect(computeAgingCategoryFinished(179)).toBe("stagnant"));
    it("180 gün → dead",     () => expect(computeAgingCategoryFinished(180)).toBe("dead"));
    it("365 gün → dead",     () => expect(computeAgingCategoryFinished(365)).toBe("dead"));
});

// ── computeAgingCategory (backward compat) ────────────────────

describe("computeAgingCategory (eski API — finished eşiklerini kullanır)", () => {
    it("null → no_movement", () => expect(computeAgingCategory(null)).toBe("no_movement"));
    it("0 → active",         () => expect(computeAgingCategory(0)).toBe("active"));
    it("44 → active",        () => expect(computeAgingCategory(44)).toBe("active"));
    it("45 → slow",          () => expect(computeAgingCategory(45)).toBe("slow"));
    it("179 → stagnant",     () => expect(computeAgingCategory(179)).toBe("stagnant"));
    it("180 → dead",         () => expect(computeAgingCategory(180)).toBe("dead"));
});

// ── pickMax (pure) ────────────────────────────────────────────

describe("pickMax", () => {
    it("ikisi de null → null",  () => expect(pickMax(null, null)).toBeNull());
    it("a null → b döner",      () => expect(pickMax(null, "2024-06-01")).toBe("2024-06-01"));
    it("b null → a döner",      () => expect(pickMax("2024-06-01", null)).toBe("2024-06-01"));
    it("a > b → a döner",       () => expect(pickMax("2024-09-01", "2024-06-01")).toBe("2024-09-01"));
    it("b > a → b döner",       () => expect(pickMax("2024-01-01", "2024-12-31")).toBe("2024-12-31"));
    it("eşit → a döner",        () => expect(pickMax("2024-06-01", "2024-06-01")).toBe("2024-06-01"));
});

// ── dbGetLastSaleDates ────────────────────────────────────────

describe("dbGetLastSaleDates", () => {
    function setup(rows: { product_id: string; sales_orders: { created_at: string } }[], error?: unknown) {
        mockFrom.mockImplementation(() =>
            makeThenableBuilder({ data: error ? null : rows, error: error ?? null })
        );
    }

    it("boş veri → boş Map", async () => {
        setup([]);
        expect((await dbGetLastSaleDates()).size).toBe(0);
    });

    it("hata → boş Map", async () => {
        setup([], { message: "DB error" });
        expect((await dbGetLastSaleDates()).size).toBe(0);
    });

    it("tek satır → doğru product_id ve tarih", async () => {
        setup([{ product_id: "p1", sales_orders: { created_at: "2024-06-01T00:00:00Z" } }]);
        const result = await dbGetLastSaleDates();
        expect(result.get("p1")).toBe("2024-06-01T00:00:00Z");
        expect(result.size).toBe(1);
    });

    it("aynı ürün için MAX alınır", async () => {
        setup([
            { product_id: "p1", sales_orders: { created_at: "2024-01-01T00:00:00Z" } },
            { product_id: "p1", sales_orders: { created_at: "2024-12-31T00:00:00Z" } },
            { product_id: "p1", sales_orders: { created_at: "2024-06-15T00:00:00Z" } },
        ]);
        const result = await dbGetLastSaleDates();
        expect(result.get("p1")).toBe("2024-12-31T00:00:00Z");
        expect(result.size).toBe(1);
    });

    it("birden fazla ürün bağımsız takip edilir", async () => {
        setup([
            { product_id: "p1", sales_orders: { created_at: "2024-06-01T00:00:00Z" } },
            { product_id: "p2", sales_orders: { created_at: "2024-09-01T00:00:00Z" } },
            { product_id: "p1", sales_orders: { created_at: "2024-03-01T00:00:00Z" } },
        ]);
        const result = await dbGetLastSaleDates();
        expect(result.get("p1")).toBe("2024-06-01T00:00:00Z");
        expect(result.get("p2")).toBe("2024-09-01T00:00:00Z");
        expect(result.size).toBe(2);
    });

    it("order_lines tablosunu sorgular", async () => {
        setup([]);
        await dbGetLastSaleDates();
        expect(mockFrom).toHaveBeenCalledWith("order_lines");
    });

    it("commercial_status = approved filtresi uygulanır", async () => {
        setup([]);
        await dbGetLastSaleDates();
        expect(mockIn).toHaveBeenCalledWith("sales_orders.commercial_status", ["approved"]);
    });
});

// ── dbGetLastIncomingDates ────────────────────────────────────

describe("dbGetLastIncomingDates", () => {
    function setup(rows: { product_id: string; received_at: string | null }[], error?: unknown) {
        mockFrom.mockImplementation(() =>
            makeThenableBuilder({ data: error ? null : rows, error: error ?? null })
        );
    }

    it("boş veri → boş Map", async () => {
        setup([]);
        expect((await dbGetLastIncomingDates()).size).toBe(0);
    });

    it("hata → boş Map", async () => {
        setup([], { message: "DB error" });
        expect((await dbGetLastIncomingDates()).size).toBe(0);
    });

    it("tek satır → doğru product_id ve received_at tarihi", async () => {
        setup([{ product_id: "p1", received_at: "2024-08-01T00:00:00Z" }]);
        const result = await dbGetLastIncomingDates();
        expect(result.get("p1")).toBe("2024-08-01T00:00:00Z");
    });

    it("received_at null olan satırlar atlanır", async () => {
        setup([
            { product_id: "p1", received_at: null },
            { product_id: "p1", received_at: "2024-08-01T00:00:00Z" },
        ]);
        const result = await dbGetLastIncomingDates();
        expect(result.get("p1")).toBe("2024-08-01T00:00:00Z");
        expect(result.size).toBe(1);
    });

    it("aynı ürün için MAX alınır", async () => {
        setup([
            { product_id: "p1", received_at: "2024-01-01T00:00:00Z" },
            { product_id: "p1", received_at: "2024-11-01T00:00:00Z" },
        ]);
        const result = await dbGetLastIncomingDates();
        expect(result.get("p1")).toBe("2024-11-01T00:00:00Z");
    });

    it("birden fazla ürün bağımsız takip edilir", async () => {
        setup([
            { product_id: "p1", received_at: "2024-05-01T00:00:00Z" },
            { product_id: "p2", received_at: "2024-07-01T00:00:00Z" },
        ]);
        const result = await dbGetLastIncomingDates();
        expect(result.get("p1")).toBe("2024-05-01T00:00:00Z");
        expect(result.get("p2")).toBe("2024-07-01T00:00:00Z");
        expect(result.size).toBe(2);
    });

    it("purchase_commitments tablosunu sorgular", async () => {
        setup([]);
        await dbGetLastIncomingDates();
        expect(mockFrom).toHaveBeenCalledWith("purchase_commitments");
    });

    it("sadece status = received filtresi uygulanır (pending dahil değil)", async () => {
        setup([]);
        await dbGetLastIncomingDates();
        expect(mockEq).toHaveBeenCalledWith("status", "received");
    });
});

// ── dbGetLastProductionDates ──────────────────────────────────

describe("dbGetLastProductionDates", () => {
    function setup(rows: { product_id: string; production_date: string }[], error?: unknown) {
        mockFrom.mockImplementation(() =>
            makeThenableBuilder({ data: error ? null : rows, error: error ?? null })
        );
    }

    it("boş veri → boş Map", async () => {
        setup([]);
        expect((await dbGetLastProductionDates()).size).toBe(0);
    });

    it("hata → boş Map", async () => {
        setup([], { message: "DB error" });
        expect((await dbGetLastProductionDates()).size).toBe(0);
    });

    it("tek satır → doğru product_id ve production_date", async () => {
        setup([{ product_id: "p1", production_date: "2024-09-15" }]);
        const result = await dbGetLastProductionDates();
        expect(result.get("p1")).toBe("2024-09-15");
        expect(result.size).toBe(1);
    });

    it("DESC sıralı geldiğinde ilk = MAX alınır", async () => {
        // DESC sıralamayla geldiğinde ilk satır en yeni — sadece ilk set edilir
        setup([
            { product_id: "p1", production_date: "2024-12-01" },  // en yeni (DESC)
            { product_id: "p1", production_date: "2024-06-01" },
            { product_id: "p1", production_date: "2024-01-01" },
        ]);
        const result = await dbGetLastProductionDates();
        expect(result.get("p1")).toBe("2024-12-01");
        expect(result.size).toBe(1);
    });

    it("birden fazla ürün bağımsız takip edilir", async () => {
        setup([
            { product_id: "p1", production_date: "2024-11-01" },
            { product_id: "p2", production_date: "2024-08-01" },
        ]);
        const result = await dbGetLastProductionDates();
        expect(result.get("p1")).toBe("2024-11-01");
        expect(result.get("p2")).toBe("2024-08-01");
        expect(result.size).toBe(2);
    });

    it("production_entries tablosunu sorgular", async () => {
        setup([]);
        await dbGetLastProductionDates();
        expect(mockFrom).toHaveBeenCalledWith("production_entries");
    });

    it("DESC sıralı sorgular (production_date)", async () => {
        setup([]);
        await dbGetLastProductionDates();
        expect(mockOrder).toHaveBeenCalledWith("production_date", { ascending: false });
    });
});
