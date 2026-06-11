/**
 * SWR altyapısı — kalıcı performans turu Faz 0 kilitleri.
 *  - jsonFetcher: !ok → status taşıyan FetchError (SWR error state'i).
 *  - SWR_DEFAULTS: revalidateOnFocus KAPALI kalır (ERP'de pencere odağında
 *    veri fırtınası geri gelmesin) + dedup penceresi makul.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { jsonFetcher, FetchError, SWR_DEFAULTS } from "@/lib/swr-config";

afterEach(() => vi.unstubAllGlobals());

describe("jsonFetcher", () => {
    it("ok yanıtta JSON döner", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ a: 1 }), { status: 200 })));
        await expect(jsonFetcher("/api/x")).resolves.toEqual({ a: 1 });
    });

    it("!ok yanıtta status taşıyan FetchError fırlatır", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 403 })));
        const err = await jsonFetcher("/api/x").catch(e => e);
        expect(err).toBeInstanceOf(FetchError);
        expect((err as FetchError).status).toBe(403);
        expect((err as FetchError).message).toContain("403");
    });
});

describe("SWR_DEFAULTS — davranış kilitleri", () => {
    it("focus-refetch kapalı; reconnect açık; dedup ≥ 10sn", () => {
        expect(SWR_DEFAULTS.revalidateOnFocus).toBe(false);
        expect(SWR_DEFAULTS.revalidateOnReconnect).toBe(true);
        expect(SWR_DEFAULTS.dedupingInterval).toBeGreaterThanOrEqual(10_000);
        expect(SWR_DEFAULTS.keepPreviousData).toBe(true);
    });
});
