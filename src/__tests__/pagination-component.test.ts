/**
 * Pagination component — pure helper (buildPageWindow) + renderToStaticMarkup smoke.
 *
 * Pattern: react-dom/server.renderToStaticMarkup (vitest node env), proje paterni —
 * purchase-order-document.test.ts.
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

describe("Pagination — module load", () => {
    it("default export = function + buildPageWindow named export", async () => {
        const mod = await import("@/components/ui/Pagination");
        expect(typeof mod.default).toBe("function");
        expect(typeof mod.buildPageWindow).toBe("function");
    });
});

describe("buildPageWindow", () => {
    it("totalPages ≤ 7 → tüm sayfalar listelenir", async () => {
        const { buildPageWindow } = await import("@/components/ui/Pagination");
        expect(buildPageWindow(3, 5)).toEqual([1, 2, 3, 4, 5]);
        expect(buildPageWindow(1, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    });

    it("totalPages > 7, current uzakta → 1 … current±2 … last", async () => {
        const { buildPageWindow } = await import("@/components/ui/Pagination");
        expect(buildPageWindow(10, 20)).toEqual([1, "…", 8, 9, 10, 11, 12, "…", 20]);
    });

    it("totalPages > 7, current başta (sayfa 1) → 1 2 3 … last", async () => {
        const { buildPageWindow } = await import("@/components/ui/Pagination");
        expect(buildPageWindow(1, 20)).toEqual([1, 2, 3, "…", 20]);
    });

    it("totalPages > 7, current sonda (sayfa 20) → 1 … 18 19 20", async () => {
        const { buildPageWindow } = await import("@/components/ui/Pagination");
        expect(buildPageWindow(20, 20)).toEqual([1, "…", 18, 19, 20]);
    });

    it("current=3, total=10 → 1 2 3 4 5 … 10 (1-2 ile 3 bitişik)", async () => {
        const { buildPageWindow } = await import("@/components/ui/Pagination");
        expect(buildPageWindow(3, 10)).toEqual([1, 2, 3, 4, 5, "…", 10]);
    });
});

const baseProps = {
    totalPages: 5,
    totalItems: 250,
    pageSize: 50,
    onPageChange: () => {},
};

describe("Pagination — render", () => {
    it("totalPages = 1 → null render (boş string)", async () => {
        const Pagination = (await import("@/components/ui/Pagination")).default;
        const html = renderToStaticMarkup(
            createElement(Pagination, { ...baseProps, currentPage: 1, totalPages: 1, totalItems: 30 }),
        );
        expect(html).toBe("");
    });

    it("info text — sayfa 1: '1-50 / 250 sipariş'", async () => {
        const Pagination = (await import("@/components/ui/Pagination")).default;
        const html = renderToStaticMarkup(
            createElement(Pagination, { ...baseProps, currentPage: 1, itemLabel: "sipariş" }),
        );
        expect(html).toContain("1-50 / 250 sipariş");
    });

    it("info text — son sayfa (5): '201-250 / 250'", async () => {
        const Pagination = (await import("@/components/ui/Pagination")).default;
        const html = renderToStaticMarkup(
            createElement(Pagination, { ...baseProps, currentPage: 5 }),
        );
        expect(html).toContain("201-250 / 250");
    });

    it("info text — partial son sayfa: '201-237 / 237'", async () => {
        const Pagination = (await import("@/components/ui/Pagination")).default;
        const html = renderToStaticMarkup(
            createElement(Pagination, { ...baseProps, currentPage: 5, totalItems: 237 }),
        );
        expect(html).toContain("201-237 / 237");
    });

    it("itemLabel default 'kayıt'", async () => {
        const Pagination = (await import("@/components/ui/Pagination")).default;
        const html = renderToStaticMarkup(
            createElement(Pagination, { ...baseProps, currentPage: 1 }),
        );
        expect(html).toContain("kayıt");
    });

    it("nav wrapper — aria-label='Sayfalama'", async () => {
        const Pagination = (await import("@/components/ui/Pagination")).default;
        const html = renderToStaticMarkup(
            createElement(Pagination, { ...baseProps, currentPage: 1 }),
        );
        expect(html).toContain('aria-label="Sayfalama"');
    });

    it("Önceki disabled on page 1", async () => {
        const Pagination = (await import("@/components/ui/Pagination")).default;
        const html = renderToStaticMarkup(
            createElement(Pagination, { ...baseProps, currentPage: 1 }),
        );
        // disabled attribute, "Önceki sayfa" button içinde
        expect(html).toMatch(/aria-label="Önceki sayfa"[^>]*disabled/);
    });

    it("Sonraki disabled on last page", async () => {
        const Pagination = (await import("@/components/ui/Pagination")).default;
        const html = renderToStaticMarkup(
            createElement(Pagination, { ...baseProps, currentPage: 5 }),
        );
        expect(html).toMatch(/aria-label="Sonraki sayfa"[^>]*disabled/);
    });

    it("aria-current='page' aktif sayfa butonunda", async () => {
        const Pagination = (await import("@/components/ui/Pagination")).default;
        const html = renderToStaticMarkup(
            createElement(Pagination, { ...baseProps, currentPage: 3 }),
        );
        expect(html).toMatch(/aria-current="page"/);
        // Aktif sayfa numarası ile aynı butonda olduğunu görmek için (kabaca):
        expect(html).toContain('aria-label="Sayfa 3"');
    });

    it("ellipsis '…' büyük totalPages'te render edilir (button değil, span)", async () => {
        const Pagination = (await import("@/components/ui/Pagination")).default;
        const html = renderToStaticMarkup(
            createElement(Pagination, { ...baseProps, currentPage: 10, totalPages: 20, totalItems: 1000 }),
        );
        expect(html).toContain("…");
        // ellipsis span aria-hidden
        expect(html).toMatch(/<span[^>]*aria-hidden="true"[^>]*>…<\/span>/);
    });

    it("önceki/sonraki text içerikleri görünür", async () => {
        const Pagination = (await import("@/components/ui/Pagination")).default;
        const html = renderToStaticMarkup(
            createElement(Pagination, { ...baseProps, currentPage: 3 }),
        );
        expect(html).toContain("‹ Önceki");
        expect(html).toContain("Sonraki ›");
    });
});
