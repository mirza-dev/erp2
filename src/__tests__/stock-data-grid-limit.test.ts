/**
 * StockDataGrid — limit + showViewAllLink + öncelik sıralama davranış testleri.
 *
 * `sortByStockPriority` pure helper test + source-regex regression
 * (limit prop, slice, hasMore koşulu, Link render).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sortByStockPriority } from "@/components/dashboard/StockDataGrid";
import type { Product } from "@/lib/mock-data";

const SOURCE = readFileSync(
    join(process.cwd(), "src/components/dashboard/StockDataGrid.tsx"),
    "utf8",
);

function makeProduct(overrides: Partial<Product> & { id: string; available_now: number; minStockLevel: number }): Product {
    return {
        id: overrides.id,
        name: `Ürün ${overrides.id}`,
        sku: `SKU-${overrides.id}`,
        category: "default",
        unit: "adet",
        price: 100,
        currency: "TRY",
        on_hand: overrides.available_now,
        reserved: 0,
        available_now: overrides.available_now,
        minStockLevel: overrides.minStockLevel,
        isActive: true,
        productType: "manufactured",
        warehouse: "ana",
        ...overrides,
    } as Product;
}

describe("sortByStockPriority — öncelik sıralama", () => {
    it("tükendi → kritik → düşük → hazır sırası", () => {
        const products: Product[] = [
            makeProduct({ id: "hazir1", available_now: 100, minStockLevel: 10 }),     // ratio=10 → hazir
            makeProduct({ id: "tukendi1", available_now: 0, minStockLevel: 10 }),     // available=0 → tukendi
            makeProduct({ id: "dusuk1", available_now: 15, minStockLevel: 10 }),      // ratio=1.5 → dusuk
            makeProduct({ id: "kritik1", available_now: 5, minStockLevel: 10 }),      // ratio=0.5 → kritik
        ];
        const sorted = sortByStockPriority(products);
        expect(sorted.map(p => p.id)).toEqual(["tukendi1", "kritik1", "dusuk1", "hazir1"]);
    });

    it("aynı status içinde available/min oranı küçük olan önce", () => {
        const products: Product[] = [
            makeProduct({ id: "kritik-a", available_now: 8, minStockLevel: 10 }),   // ratio=0.8
            makeProduct({ id: "kritik-b", available_now: 3, minStockLevel: 10 }),   // ratio=0.3 → daha kritik
            makeProduct({ id: "kritik-c", available_now: 5, minStockLevel: 10 }),   // ratio=0.5
        ];
        const sorted = sortByStockPriority(products);
        expect(sorted.map(p => p.id)).toEqual(["kritik-b", "kritik-c", "kritik-a"]);
    });

    it("orijinal array mutate edilmez (immutable)", () => {
        const products: Product[] = [
            makeProduct({ id: "a", available_now: 100, minStockLevel: 10 }),
            makeProduct({ id: "b", available_now: 0, minStockLevel: 10 }),
        ];
        const beforeIds = products.map(p => p.id);
        sortByStockPriority(products);
        expect(products.map(p => p.id)).toEqual(beforeIds);  // sırası değişmedi
    });

    it("boş array → boş array", () => {
        expect(sortByStockPriority([])).toEqual([]);
    });

    it("minStockLevel=0 hazir kabul edilir (sonda)", () => {
        const products: Product[] = [
            makeProduct({ id: "nomin", available_now: 50, minStockLevel: 0 }),   // hazir
            makeProduct({ id: "tukendi", available_now: 0, minStockLevel: 5 }),  // tukendi
        ];
        const sorted = sortByStockPriority(products);
        expect(sorted[0]!.id).toBe("tukendi");
        expect(sorted[1]!.id).toBe("nomin");
    });
});

describe("StockDataGrid — source-regex regression (limit + Link)", () => {
    it("limit prop interface'te tanımlı", () => {
        expect(SOURCE).toMatch(/limit\?:\s*number/);
    });

    it("showViewAllLink prop interface'te tanımlı", () => {
        expect(SOURCE).toMatch(/showViewAllLink\?:\s*boolean/);
    });

    it("limit varsa sortByStockPriority uygulanır (dashboard widget için anlamlı sıralama)", () => {
        expect(SOURCE).toMatch(/limit\s*\?\s*sortByStockPriority\(matched\)\s*:\s*matched/);
    });

    it("filtered.slice(0, limit) ile satır sınırlanır", () => {
        expect(SOURCE).toMatch(/filtered\.slice\(0,\s*limit\)/);
    });

    it("hasMore koşulu: showViewAllLink && filtered > limit", () => {
        expect(SOURCE).toMatch(/showViewAllLink\s*&&\s*limit\s*\?\s*filtered\.length\s*>\s*limit/);
    });

    it("Link href='/dashboard/products' + 'Tümünü gör' metni var", () => {
        expect(SOURCE).toMatch(/href="\/dashboard\/products"/);
        expect(SOURCE).toMatch(/Tümünü gör/);
    });

    it("sortByStockPriority named export — test edilebilirlik", () => {
        expect(SOURCE).toMatch(/export\s+\{[^}]*sortByStockPriority/);
    });
});

describe("StockDataGrid — backward-compat", () => {
    it("limit prop opsiyonel (default undefined → tüm satırlar)", () => {
        // Interface'te ? var, dolayısıyla limit verilmediği zaman undefined.
        // Visible = limit ? slice : filtered → filtered (tüm liste).
        expect(SOURCE).toMatch(/const\s+visible\s*=\s*limit\s*\?\s*filtered\.slice/);
    });

    it("showViewAllLink default false (eski kullanım yerleri Link görmez)", () => {
        expect(SOURCE).toMatch(/showViewAllLink\s*=\s*false/);
    });
});
