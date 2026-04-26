/**
 * Faz 11.4 (HIGH bulgu fix) — /api/parasut/stats
 *   - byStep + byErrorKind dağılımları
 *   - token info (connected, expiresAt, secondsRemaining, tokenVersion)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const tokenRow = { expires_at: new Date(Date.now() + 3600_000).toISOString(), token_version: 7, updated_at: new Date().toISOString() };
const distRows = [
    { parasut_step: "contact",  parasut_error_kind: null },
    { parasut_step: "contact",  parasut_error_kind: "validation" },
    { parasut_step: "shipment", parasut_error_kind: null },
    { parasut_step: "edoc",     parasut_error_kind: "auth" },
    { parasut_step: "edoc",     parasut_error_kind: "auth" },
    { parasut_step: "edoc",     parasut_error_kind: null },
];

interface CountRes { count: number | null; data?: unknown }

function makeBuilder(result: CountRes | { data: unknown; error: null }) {
    const promise: Promise<unknown> = Promise.resolve(result);
    const builder: Record<string, unknown> = {
        then:        promise.then.bind(promise),
        catch:       promise.catch.bind(promise),
    };
    const chain = ["select","not","neq","eq","in","lt","gte","or","is","maybeSingle"];
    for (const m of chain) {
        builder[m] = () => builder;
    }
    return builder;
}

let fromCallCount = 0;
const responses: Array<unknown> = [];

vi.mock("@/lib/supabase/service", () => ({
    createServiceClient: () => ({
        from: () => {
            const next = responses[fromCallCount++] ?? { count: 0 };
            return makeBuilder(next as CountRes);
        },
    }),
}));

import { GET } from "@/app/api/parasut/stats/route";

beforeEach(() => {
    fromCallCount = 0;
    responses.length = 0;
});

describe("GET /api/parasut/stats — Faz 11.4", () => {
    it("byStep + byErrorKind dağılımları doğru sayar", async () => {
        // 8 promise sırası: customers, synced, pending, in_progress, failed, blocked, dist, token
        responses.push(
            { count: 5  },        // customers
            { count: 2  },        // synced_invoices
            { count: 4  },        // pending_syncs
            { count: 3  },        // in_progress_syncs
            { count: 1  },        // failed_syncs
            { count: 0  },        // blocked_syncs
            { data: distRows, error: null },
            { data: tokenRow, error: null },
        );

        const res = await GET();
        const body = await res.json();

        expect(body.byStep).toEqual({ contact: 2, shipment: 1, edoc: 3 });
        expect(body.byErrorKind).toEqual({ validation: 1, auth: 2 });
    });

    it("token info: connected + secondsRemaining > 0 + version", async () => {
        responses.push(
            { count: 0 }, { count: 0 }, { count: 0 }, { count: 0 }, { count: 0 }, { count: 0 },
            { data: [], error: null },
            { data: tokenRow, error: null },
        );
        const res = await GET();
        const body = await res.json();
        expect(body.token.connected).toBe(true);
        expect(body.token.secondsRemaining).toBeGreaterThan(0);
        expect(body.token.tokenVersion).toBe(7);
    });

    it("token yok → connected:false", async () => {
        responses.push(
            { count: 0 }, { count: 0 }, { count: 0 }, { count: 0 }, { count: 0 }, { count: 0 },
            { data: [], error: null },
            { data: null, error: null },
        );
        const res = await GET();
        const body = await res.json();
        expect(body.token.connected).toBe(false);
        expect(body.token.expiresAt).toBeNull();
    });

    it("token süresi dolmuş → connected:false ama expiresAt + version dolu", async () => {
        const expired = { ...tokenRow, expires_at: new Date(Date.now() - 60_000).toISOString() };
        responses.push(
            { count: 0 }, { count: 0 }, { count: 0 }, { count: 0 }, { count: 0 }, { count: 0 },
            { data: [], error: null },
            { data: expired, error: null },
        );
        const res = await GET();
        const body = await res.json();
        expect(body.token.connected).toBe(false);
        expect(body.token.expiresAt).toBe(expired.expires_at);
        expect(body.token.secondsRemaining).toBeLessThan(0);
    });
});
