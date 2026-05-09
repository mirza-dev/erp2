/**
 * G11 audit 2. tur Fix 2 — defansif: dbExpireEntityRecommendations
 * recommendation_type belirtildiyse SADECE 'suggested' expire eder.
 *
 * Senaryo: rec invariant kırılırsa (manuel DB müdahalesi, race condition)
 * aynı entity için hem 'suggested' hem 'accepted' aktif olabilir. Helper'ın
 * status filter'ı 'suggested' ile sınırlı olduğu için level değişiminde
 * accepted/edited/rejected dokunulmaz.
 *
 * Bu test direct olarak helper'ı çağırıp Supabase query zincirini
 * doğrular (status'un .eq("status","suggested") ile dar daraltıldığı).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUpdate = vi.fn();
const mockEq = vi.fn();
const mockIn = vi.fn();

// Zincir factory: update → eq(entity_id) → eq(entity_type) → [eq(rec_type) + eq(status)]
//                                                           [in(status)]
//                                                          → select("id") → Promise<{data, error}>
function buildChain() {
    const chain: Record<string, unknown> = {};
    chain.update = (...a: unknown[]) => { mockUpdate(...a); return chain; };
    chain.eq = (col: string, val: unknown) => { mockEq(col, val); return chain; };
    chain.in = (col: string, vals: unknown[]) => { mockIn(col, vals); return chain; };
    chain.select = () => Promise.resolve({ data: [], error: null });
    return chain;
}

vi.mock("@/lib/supabase/service", () => ({
    createServiceClient: () => ({
        from: () => buildChain(),
    }),
}));

import { dbExpireEntityRecommendations } from "@/lib/supabase/recommendations";

beforeEach(() => {
    mockUpdate.mockReset();
    mockEq.mockReset();
    mockIn.mockReset();
});

describe("Fix 2 — dbExpireEntityRecommendations defansif status filter", () => {
    it("recommendationType belirtildi → SADECE 'suggested' expire eder (decided dokunulmaz)", async () => {
        await dbExpireEntityRecommendations("p-1", "product", "purchase_suggestion");

        // .in() çağrılmamalı (status range expand edilmemeli)
        expect(mockIn).not.toHaveBeenCalled();

        // .eq("status", "suggested") çağrılmalı
        const eqCalls = mockEq.mock.calls;
        const statusEq = eqCalls.find(([col]) => col === "status");
        expect(statusEq).toBeDefined();
        expect(statusEq?.[1]).toBe("suggested");

        // .eq("recommendation_type", ...) çağrılmalı
        const typeEq = eqCalls.find(([col]) => col === "recommendation_type");
        expect(typeEq?.[1]).toBe("purchase_suggestion");
    });

    it("recommendationType belirtilmedi → tüm aktif statüler (silme akışı, regresyon)", async () => {
        await dbExpireEntityRecommendations("p-1", "product");

        // .in("status", [...]) çağrılmalı (silme: tüm tipler ve statüler)
        expect(mockIn).toHaveBeenCalledTimes(1);
        const [col, vals] = mockIn.mock.calls[0];
        expect(col).toBe("status");
        expect(vals).toEqual(["suggested", "accepted", "edited", "rejected"]);

        // .eq("status", "suggested") ÇAĞRILMAMALI
        const eqCalls = mockEq.mock.calls;
        const statusEq = eqCalls.find(([c]) => c === "status");
        expect(statusEq).toBeUndefined();

        // .eq("recommendation_type", ...) çağrılmamalı (tüm tipler)
        const typeEq = eqCalls.find(([c]) => c === "recommendation_type");
        expect(typeEq).toBeUndefined();
    });

    it("entity_id ve entity_type her durumda filtrelenir", async () => {
        await dbExpireEntityRecommendations("p-99", "product", "purchase_suggestion");

        const eqCalls = mockEq.mock.calls;
        expect(eqCalls).toContainEqual(["entity_id", "p-99"]);
        expect(eqCalls).toContainEqual(["entity_type", "product"]);
    });
});
