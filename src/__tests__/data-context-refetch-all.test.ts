/**
 * G11 audit 5. tur Fix 4 — refetch path'leri /api/products?all=1 kullanır.
 *
 * Önceki: ilk yükleme `?all=1` ama mutasyon sonrası refetch'ler (uretimEkle,
 * uretimSil, updateOrderStatus) çıplak `/api/products` kullanıyordu →
 * 100+ ürünlü production setlerinde global state ilk 100'e düşüyordu.
 *
 * Bu testler kaynak dosyada `?all=1` flag'inin tutarlı kullanıldığını doğrular.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const dataContextSource = readFileSync(
    resolve(process.cwd(), "src/lib/data-context.tsx"),
    "utf-8",
);

describe("data-context.tsx — tüm /api/products fetch çağrıları ?all=1 kullanır", () => {
    it("Çıplak /api/products GET çağrısı yok (POST/PATCH hariç)", () => {
        // GET çağrıları: fetch("/api/products"), fetch("/api/products?all=1")
        // POST: fetch("/api/products", { method: "POST", body: ... })
        // POST/PATCH/DELETE'leri ayır — bu testin amacı GET-style refetch'leri kontrol.
        // POST: ikinci argümanla method belirtilir, çıplak fetch("/api/products",  ...
        // Match yalnızca tek-arg fetch'leri (GET): fetch(<string>)  with closing )
        // Pattern: fetch("..." + ) (tek argüman)
        const lines = dataContextSource.split("\n");
        const offending: string[] = [];
        for (const line of lines) {
            // GET pattern: fetch("/api/products")  veya  fetch("/api/products?...") (?all=1 dahil)
            const getMatch = line.match(/fetch\(\s*["']\/api\/products(\?[^"']*)?["']\s*\)/);
            if (getMatch) {
                const queryString = getMatch[1] ?? "";
                if (!queryString.includes("all=1")) {
                    offending.push(line.trim());
                }
            }
        }
        expect(offending).toEqual([]);
    });

    it("PRODUCTS_KEY tek kaynak: ?all=1 sabit, useSWR + mutasyonlar bu key'i kullanır", () => {
        // SWR turu: fetch literal'leri yerine tek key sabiti. İlk yükleme
        // useSWR(PRODUCTS_KEY), mutasyon tazelemeleri mutate(PRODUCTS_KEY) —
        // 100-ürün cap regresyonu yapısal olarak imkânsız (tek tanım noktası).
        expect(dataContextSource).toContain('export const PRODUCTS_KEY = "/api/products?all=1"');
        expect(dataContextSource).toMatch(/useSWR<Product\[\]>\(PRODUCTS_KEY, productsFetcher/);
        const mutateMatches = dataContextSource.match(/mutate\(PRODUCTS_KEY/g) ?? [];
        // updateOrderStatus + production revalidation + addProduct/deleteProduct cache patch'leri
        expect(mutateMatches.length).toBeGreaterThanOrEqual(3);
    });
});
