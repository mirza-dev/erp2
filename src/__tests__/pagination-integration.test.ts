/**
 * Pagination integration smoke — her liste sayfasına pagination düzgün bağlanmış.
 *
 * Pattern: kaynak dosya source-regex regression lock.
 * - usePagination + Pagination import edilmiş
 * - pagedItems.map(...) kullanılıyor
 * - filtered.map(...) eski kullanım kalmadı (regression)
 */
import { describe, it, expect } from "vitest";
import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();

async function readPage(rel: string): Promise<string> {
    return fs.readFile(path.resolve(ROOT, rel), "utf-8");
}

function expectPaginationWired(src: string) {
    expect(src).toContain('from "@/hooks/usePagination"');
    expect(src).toContain('from "@/components/ui/Pagination"');
    expect(src).toContain("usePagination(filtered");
    expect(src).toContain("pagedItems.map(");
    // Eski kullanım kalmamalı (regression lock)
    expect(src).not.toMatch(/\{\s*filtered\.map\(/);
}

describe("Pagination — liste sayfası entegrasyonu", () => {
    it("vendors/page.tsx pagination wired", async () => {
        const src = await readPage("src/app/dashboard/vendors/page.tsx");
        expectPaginationWired(src);
        expect(src).toContain('itemLabel="tedarikçi"');
    });

    it("purchase/orders/page.tsx pagination wired", async () => {
        const src = await readPage("src/app/dashboard/purchase/orders/page.tsx");
        expectPaginationWired(src);
        expect(src).toContain('itemLabel="sipariş"');
    });

    it("quotes/page.tsx pagination wired", async () => {
        const src = await readPage("src/app/dashboard/quotes/page.tsx");
        expectPaginationWired(src);
        expect(src).toContain('itemLabel="teklif"');
    });

    it("customers/page.tsx pagination wired", async () => {
        const src = await readPage("src/app/dashboard/customers/page.tsx");
        expectPaginationWired(src);
        expect(src).toContain('itemLabel="müşteri"');
    });

    // A1: orders SUNUCU tarafı sayfalamaya geçti — client usePagination(filtered)
    // /pagedItems yok; total + page sunucudan gelir, sayfa değişimi URL'e yazılır.
    it("orders/OrdersClient.tsx server-side pagination wired", async () => {
        const src = await readPage("src/app/dashboard/orders/OrdersClient.tsx");
        expect(src).toContain('from "@/components/ui/Pagination"');
        expect(src).toContain("computeTotalPages");
        expect(src).toContain("<Pagination");
        expect(src).toContain('itemLabel="sipariş"');
        expect(src).toContain("onPageChange={(p) => navigate({ page: p })}");
        // client-side dilimleme kalmamalı (regression lock)
        expect(src).not.toContain("usePagination(filtered");
        expect(src).not.toContain("pagedItems");
    });

    it("products/page.tsx pagination wired", async () => {
        const src = await readPage("src/app/dashboard/products/page.tsx");
        expectPaginationWired(src);
        expect(src).toContain('itemLabel="ürün"');
        // Multi-filter resetKey ingredients (regression lock)
        expect(src).toContain("alertFilter");
        expect(src).toContain("selectedCategories.join");
    });
});
