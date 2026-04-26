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

// Faz 11.4 — stats route'a parasut_oauth_tokens + dist (data) sorguları eklendi
let salesOrderQueryIdx = 0;
const salesOrderKeys = ["synced", "pending", "in_progress", "failed", "blocked"];

vi.mock("@/lib/supabase/service", () => {
    class ConfigErrorClass extends Error {}
    return {
        ConfigError: ConfigErrorClass,
        createServiceClient: () => ({
            from: (table: string) => {
                if (table === "customers") return makeCountChain("customers");
                if (table === "parasut_oauth_tokens") {
                    return {
                        select: vi.fn().mockReturnThis(),
                        eq:     vi.fn().mockReturnThis(),
                        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                        then: (resolve: (v: { data: null; error: null }) => void) =>
                            resolve({ data: null, error: null }),
                    };
                }
                // sales_orders — count sorguları + dist sorgusu (data)
                return {
                    select: vi.fn(() => {
                        // 6. çağrı (index 5) dist sorgusu — count yok, data döner
                        const isDist = salesOrderQueryIdx === 5;
                        const key = salesOrderKeys[salesOrderQueryIdx];
                        salesOrderQueryIdx++;
                        if (isDist) {
                            return {
                                not: vi.fn().mockReturnThis(),
                                then: (resolve: (v: { data: unknown[]; error: null }) => void) =>
                                    resolve({ data: [], error: null }),
                            };
                        }
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
            },
        }),
    };
});

import { GET } from "@/app/api/parasut/stats/route";

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("GET /api/parasut/stats", () => {
    beforeEach(() => {
        salesOrderQueryIdx = 0;
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
