/**
 * GET /api/parasut/stats — route coverage
 * Verifies all metric fields including in_progress_syncs (Faz 4.5 spec).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// RBAC R2: parasut/stats GET'e view_parasut guard eklendi → allow.
vi.mock("@/lib/auth/role-guard", () => ({
    requirePermission: vi.fn().mockResolvedValue(null),
    requireRole: vi.fn().mockResolvedValue(null),
    requireAnyRole: vi.fn().mockResolvedValue(null),
    getCurrentUserPermissions: vi.fn().mockResolvedValue(new Set(["view_parasut"])),
    getCurrentUserRoles: vi.fn().mockResolvedValue(["admin"]),
    getCurrentUserRole: vi.fn().mockResolvedValue("admin"),
}));

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
let lastSyncAt: string | null = "2026-06-01T10:30:00.000Z";
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
                if (table === "integration_sync_logs") {
                    // last_sync_at sorgusu: select → order → limit → maybeSingle
                    return {
                        select:      vi.fn().mockReturnThis(),
                        order:       vi.fn().mockReturnThis(),
                        limit:       vi.fn().mockReturnThis(),
                        maybeSingle: vi.fn().mockResolvedValue({
                            data: { requested_at: lastSyncAt },
                            error: null,
                        }),
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

    it("returns last_sync_at from the most recent (unfiltered) sync log", async () => {
        lastSyncAt = "2026-06-01T10:30:00.000Z";
        const res = await GET();
        const body = await res.json();
        expect(body.last_sync_at).toBe("2026-06-01T10:30:00.000Z");
    });

    it("returns last_sync_at = null when no sync logs exist", async () => {
        lastSyncAt = null;
        const res = await GET();
        const body = await res.json();
        expect(body.last_sync_at).toBeNull();
    });
});
