/**
 * GET /api/parasut/stats — route coverage
 * Verifies all metric fields including in_progress_syncs (Faz 4.5 spec).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock ─────────────────────────────────────────────────────────────────────

const counts: Record<string, number> = {};

function makeCountChain(key: string) {
    return {
        select: vi.fn().mockReturnThis(),
        not:    vi.fn().mockReturnThis(),
        neq:    vi.fn().mockReturnThis(),
        lt:     vi.fn().mockReturnThis(),
        in:     vi.fn().mockReturnThis(),
        then:   (resolve: (v: { count: number; error: null }) => void) =>
            resolve({ count: counts[key] ?? 0, error: null }),
    };
}

vi.mock("@/lib/supabase/service", () => ({
    createServiceClient: () => ({
        from: (table: string) => {
            if (table === "customers") return makeCountChain("customers");
            // sales_orders — return a chain that resolves to different counts per query
            // We rely on query order: synced, pending, in_progress, failed, blocked
            let callIndex = 0;
            const keys = ["synced", "pending", "in_progress", "failed", "blocked"];
            const baseChain: Record<string, unknown> = {};
            const chain: typeof baseChain = {
                select: vi.fn(() => {
                    const key = keys[callIndex++ % keys.length];
                    return {
                        not:  vi.fn().mockReturnThis(),
                        neq:  vi.fn().mockReturnThis(),
                        lt:   vi.fn().mockReturnThis(),
                        in:   vi.fn().mockReturnThis(),
                        then: (resolve: (v: { count: number; error: null }) => void) =>
                            resolve({ count: counts[key] ?? 0, error: null }),
                    };
                }),
            };
            return chain;
        },
    }),
}));

import { GET } from "@/app/api/parasut/stats/route";

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("GET /api/parasut/stats", () => {
    beforeEach(() => {
        Object.assign(counts, {
            customers:   10,
            synced:       5,
            pending:      3,
            in_progress:  2,
            failed:       1,
            blocked:      0,
        });
    });

    it("returns all 6 metric fields including in_progress_syncs", async () => {
        const res = await GET();
        const body = await res.json();
        expect(body).toHaveProperty("customers");
        expect(body).toHaveProperty("synced_invoices");
        expect(body).toHaveProperty("pending_syncs");
        expect(body).toHaveProperty("in_progress_syncs");
        expect(body).toHaveProperty("failed_syncs");
        expect(body).toHaveProperty("blocked_syncs");
    });

    it("returns numeric values (not null) for all fields", async () => {
        const res = await GET();
        const body = await res.json();
        for (const key of ["customers", "synced_invoices", "pending_syncs", "in_progress_syncs", "failed_syncs", "blocked_syncs"]) {
            expect(typeof body[key]).toBe("number");
        }
    });

    it("returns HTTP 200", async () => {
        const res = await GET();
        expect(res.status).toBe(200);
    });
});
