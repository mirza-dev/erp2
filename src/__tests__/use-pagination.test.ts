/**
 * usePagination — pure helper'lar + module load smoke.
 *
 * Hook'un useState/useEffect davranışı per-page integration testlerinde
 * implicit kapsanır (filtered.map → pagedItems.map kontratı). Burada pure
 * logic test edilir.
 */
import { describe, it, expect } from "vitest";

describe("usePagination — module load", () => {
    it("PAGE_SIZE = 50 export edilir", async () => {
        const mod = await import("@/hooks/usePagination");
        expect(mod.PAGE_SIZE).toBe(50);
    });

    it("usePagination + pure helper'lar export edilir", async () => {
        const mod = await import("@/hooks/usePagination");
        expect(typeof mod.usePagination).toBe("function");
        expect(typeof mod.computeTotalPages).toBe("function");
        expect(typeof mod.clampPage).toBe("function");
        expect(typeof mod.slicePage).toBe("function");
    });
});

describe("computeTotalPages", () => {
    it("0 item → 1 sayfa (boş liste için bile en az 1)", async () => {
        const { computeTotalPages } = await import("@/hooks/usePagination");
        expect(computeTotalPages(0, 50)).toBe(1);
    });

    it("50 item / 50 size → 1 sayfa", async () => {
        const { computeTotalPages } = await import("@/hooks/usePagination");
        expect(computeTotalPages(50, 50)).toBe(1);
    });

    it("51 item / 50 size → 2 sayfa", async () => {
        const { computeTotalPages } = await import("@/hooks/usePagination");
        expect(computeTotalPages(51, 50)).toBe(2);
    });

    it("137 item / 50 size → 3 sayfa (ceil)", async () => {
        const { computeTotalPages } = await import("@/hooks/usePagination");
        expect(computeTotalPages(137, 50)).toBe(3);
    });

    it("pageSize=0 → 1 sayfa (defansif, division by zero guard)", async () => {
        const { computeTotalPages } = await import("@/hooks/usePagination");
        expect(computeTotalPages(100, 0)).toBe(1);
    });
});

describe("clampPage", () => {
    it("range içinde → değişmez", async () => {
        const { clampPage } = await import("@/hooks/usePagination");
        expect(clampPage(3, 5)).toBe(3);
    });

    it("totalPages üstünde → totalPages", async () => {
        const { clampPage } = await import("@/hooks/usePagination");
        expect(clampPage(99, 3)).toBe(3);
    });

    it("0 → 1 (alt sınır)", async () => {
        const { clampPage } = await import("@/hooks/usePagination");
        expect(clampPage(0, 5)).toBe(1);
    });

    it("negatif → 1", async () => {
        const { clampPage } = await import("@/hooks/usePagination");
        expect(clampPage(-5, 5)).toBe(1);
    });
});

describe("slicePage", () => {
    const items = Array.from({ length: 137 }, (_, i) => i);

    it("page 1 / 50 → ilk 50 (0-49)", async () => {
        const { slicePage } = await import("@/hooks/usePagination");
        const result = slicePage(items, 1, 50);
        expect(result).toHaveLength(50);
        expect(result[0]).toBe(0);
        expect(result[49]).toBe(49);
    });

    it("page 2 / 50 → 50-99", async () => {
        const { slicePage } = await import("@/hooks/usePagination");
        const result = slicePage(items, 2, 50);
        expect(result).toHaveLength(50);
        expect(result[0]).toBe(50);
        expect(result[49]).toBe(99);
    });

    it("page 3 / 50 → 100-136 (partial son sayfa, 37 item)", async () => {
        const { slicePage } = await import("@/hooks/usePagination");
        const result = slicePage(items, 3, 50);
        expect(result).toHaveLength(37);
        expect(result[0]).toBe(100);
        expect(result[36]).toBe(136);
    });

    it("empty items → empty array", async () => {
        const { slicePage } = await import("@/hooks/usePagination");
        expect(slicePage([], 1, 50)).toEqual([]);
    });

    it("page beyond range → empty array (caller clamplemediyse defansif)", async () => {
        const { slicePage } = await import("@/hooks/usePagination");
        expect(slicePage(items, 99, 50)).toEqual([]);
    });
});
