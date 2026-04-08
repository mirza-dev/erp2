/**
 * Tests for purchase_commitments Supabase query functions.
 * (src/lib/supabase/purchase-commitments.ts)
 *
 * Mocks the Supabase service client. All DB operations verified via mock calls.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Supabase mock ─────────────────────────────────────────────

const mockEq      = vi.fn();
const mockSingle  = vi.fn();
const mockRpc     = vi.fn();

function makeThenableBuilder(result: { data: unknown; error: unknown }) {
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.insert = () => b;
    b.update = () => b;
    b.order  = () => b;
    b.eq     = (...args: unknown[]) => { mockEq(...args); return b; };
    b.single = mockSingle;
    b.then   = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
        Promise.resolve(result).then(resolve, reject);
    return b;
}

const mockFrom = vi.fn();

vi.mock("@/lib/supabase/service", () => ({
    createServiceClient: () => ({
        from: mockFrom,
        rpc:  mockRpc,
    }),
    ConfigError: class ConfigError extends Error {
        readonly code = "CONFIG_ERROR";
        constructor(message: string) {
            super(message);
            this.name = "ConfigError";
        }
    },
}));

// ── Import under test (after mock) ───────────────────────────

import {
    dbListCommitments,
    dbGetCommitment,
    dbCreateCommitment,
    dbReceiveCommitment,
    dbCancelCommitment,
    dbGetIncomingQuantities,
    CommitmentConflictError,
} from "@/lib/supabase/purchase-commitments";

// ── Helpers ───────────────────────────────────────────────────

function makeRow(overrides: Record<string, unknown> = {}) {
    return {
        id:            "commit-1",
        product_id:    "prod-1",
        quantity:      40,
        expected_date: "2025-04-25",
        supplier_name: "ABC Tedarikçi",
        notes:         null,
        status:        "pending",
        created_at:    "2026-01-01T00:00:00Z",
        received_at:   null,
        ...overrides,
    };
}

// ── Shared setup ─────────────────────────────────────────────

beforeEach(() => {
    mockFrom.mockReset();
    mockEq.mockReset();
    mockSingle.mockReset();
    mockRpc.mockReset();
});

// ── dbGetIncomingQuantities ───────────────────────────────────

describe("dbGetIncomingQuantities", () => {
    // dbGetIncomingQuantities uses: .from().select().eq("status","pending")
    // Last chained method is .eq() — we intercept via makeThenableBuilder

    function setupIncoming(data: { product_id: string; quantity: number }[], error?: unknown) {
        mockFrom.mockImplementation(() => makeThenableBuilder({ data: error ? null : data, error: error ?? null }));
    }

    it("returns empty Map when no pending commitments", async () => {
        setupIncoming([]);
        const result = await dbGetIncomingQuantities();
        expect(result.size).toBe(0);
    });

    it("returns empty Map on Supabase error", async () => {
        setupIncoming([], { message: "DB error" });
        const result = await dbGetIncomingQuantities();
        expect(result.size).toBe(0);
    });

    it("returns empty Map when data is null without error", async () => {
        mockFrom.mockImplementation(() => makeThenableBuilder({ data: null, error: null }));
        const result = await dbGetIncomingQuantities();
        expect(result.size).toBe(0);
    });

    it("aggregates a single product from a single commitment", async () => {
        setupIncoming([{ product_id: "prod-1", quantity: 40 }]);
        const result = await dbGetIncomingQuantities();
        expect(result.get("prod-1")).toBe(40);
        expect(result.size).toBe(1);
    });

    it("aggregates the same product across multiple commitments", async () => {
        setupIncoming([
            { product_id: "prod-1", quantity: 30 },
            { product_id: "prod-1", quantity: 20 },
        ]);
        const result = await dbGetIncomingQuantities();
        expect(result.get("prod-1")).toBe(50);
        expect(result.size).toBe(1);
    });

    it("tracks multiple products independently", async () => {
        setupIncoming([
            { product_id: "prod-1", quantity: 40 },
            { product_id: "prod-2", quantity: 15 },
            { product_id: "prod-1", quantity: 10 },
        ]);
        const result = await dbGetIncomingQuantities();
        expect(result.get("prod-1")).toBe(50);
        expect(result.get("prod-2")).toBe(15);
        expect(result.size).toBe(2);
    });

    it("queries the purchase_commitments table", async () => {
        setupIncoming([]);
        await dbGetIncomingQuantities();
        expect(mockFrom).toHaveBeenCalledWith("purchase_commitments");
    });

    it("filters by status='pending'", async () => {
        setupIncoming([]);
        await dbGetIncomingQuantities();
        expect(mockEq).toHaveBeenCalledWith("status", "pending");
    });
});

// ── dbListCommitments ─────────────────────────────────────────

describe("dbListCommitments", () => {
    it("returns all rows when no filter applied", async () => {
        const rows = [makeRow(), makeRow({ id: "commit-2" })];
        mockFrom.mockImplementation(() => makeThenableBuilder({ data: rows, error: null }));
        const result = await dbListCommitments();
        expect(result).toHaveLength(2);
    });

    it("returns empty array on error", async () => {
        mockFrom.mockImplementation(() => makeThenableBuilder({ data: null, error: { message: "fail" } }));
        await expect(dbListCommitments()).rejects.toThrow("fail");
    });

    it("applies product_id filter", async () => {
        mockFrom.mockImplementation(() => makeThenableBuilder({ data: [makeRow()], error: null }));
        await dbListCommitments({ product_id: "prod-1" });
        expect(mockEq).toHaveBeenCalledWith("product_id", "prod-1");
    });

    it("applies status filter", async () => {
        mockFrom.mockImplementation(() => makeThenableBuilder({ data: [], error: null }));
        await dbListCommitments({ status: "received" });
        expect(mockEq).toHaveBeenCalledWith("status", "received");
    });
});

// ── dbGetCommitment ───────────────────────────────────────────

describe("dbGetCommitment", () => {
    it("returns row when found", async () => {
        const row = makeRow();
        mockSingle.mockResolvedValue({ data: row, error: null });
        mockFrom.mockImplementation(() => makeThenableBuilder({ data: null, error: null }));
        const result = await dbGetCommitment("commit-1");
        expect(result?.id).toBe("commit-1");
    });

    it("returns null on error", async () => {
        mockSingle.mockResolvedValue({ data: null, error: { message: "not found" } });
        mockFrom.mockImplementation(() => makeThenableBuilder({ data: null, error: null }));
        const result = await dbGetCommitment("missing");
        expect(result).toBeNull();
    });
});

// ── dbCreateCommitment ────────────────────────────────────────

describe("dbCreateCommitment", () => {
    it("returns created row on success", async () => {
        const row = makeRow();
        mockSingle.mockResolvedValue({ data: row, error: null });
        mockFrom.mockImplementation(() => makeThenableBuilder({ data: null, error: null }));
        const result = await dbCreateCommitment({
            product_id:    "prod-1",
            quantity:      40,
            expected_date: "2025-04-25",
            supplier_name: "ABC Tedarikçi",
        });
        expect(result.quantity).toBe(40);
        expect(result.product_id).toBe("prod-1");
    });

    it("throws on Supabase error", async () => {
        mockSingle.mockResolvedValue({ data: null, error: { message: "insert failed" } });
        mockFrom.mockImplementation(() => makeThenableBuilder({ data: null, error: null }));
        await expect(
            dbCreateCommitment({ product_id: "p", quantity: 1, expected_date: "2025-04-25" })
        ).rejects.toThrow("insert failed");
    });
});

// ── dbReceiveCommitment ───────────────────────────────────────

describe("dbReceiveCommitment", () => {
    it("calls RPC with correct commitment id", async () => {
        mockRpc.mockResolvedValue({ error: null });
        await dbReceiveCommitment("commit-1");
        expect(mockRpc).toHaveBeenCalledWith("receive_purchase_commitment", {
            p_commitment_id: "commit-1",
        });
    });

    it("throws CommitmentConflictError when commitment is not pending", async () => {
        mockRpc.mockResolvedValue({ error: { message: "Commitment bulunamadı veya pending değil: commit-1" } });
        await expect(dbReceiveCommitment("commit-1")).rejects.toBeInstanceOf(CommitmentConflictError);
    });

    it("throws generic Error for non-conflict RPC errors", async () => {
        mockRpc.mockResolvedValue({ error: { message: "RPC failed" } });
        const err = await dbReceiveCommitment("commit-1").catch(e => e);
        expect(err).toBeInstanceOf(Error);
        expect(err).not.toBeInstanceOf(CommitmentConflictError);
        expect(err.message).toBe("RPC failed");
    });
});

// ── dbCancelCommitment ────────────────────────────────────────

describe("dbCancelCommitment", () => {
    it("updates status to cancelled when row exists", async () => {
        mockFrom.mockImplementation(() => makeThenableBuilder({ data: [{ id: "commit-1" }], error: null }));
        await dbCancelCommitment("commit-1");
        expect(mockFrom).toHaveBeenCalledWith("purchase_commitments");
        expect(mockEq).toHaveBeenCalledWith("id", "commit-1");
        expect(mockEq).toHaveBeenCalledWith("status", "pending");
    });

    it("throws when no pending row found (already cancelled or wrong id)", async () => {
        mockFrom.mockImplementation(() => makeThenableBuilder({ data: [], error: null }));
        await expect(dbCancelCommitment("commit-1")).rejects.toThrow("Commitment bulunamadı veya zaten iptal edilmiş.");
    });

    it("throws when data is null (no matching row)", async () => {
        mockFrom.mockImplementation(() => makeThenableBuilder({ data: null, error: null }));
        await expect(dbCancelCommitment("commit-1")).rejects.toThrow("Commitment bulunamadı veya zaten iptal edilmiş.");
    });

    it("throws on Supabase error", async () => {
        mockFrom.mockImplementation(() => makeThenableBuilder({ data: null, error: { message: "update failed" } }));
        await expect(dbCancelCommitment("commit-1")).rejects.toThrow("update failed");
    });
});
