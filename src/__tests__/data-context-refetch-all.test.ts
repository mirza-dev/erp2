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

    it("İlk yükleme (refetchAll) ?all=1 kullanır", () => {
        expect(dataContextSource).toContain('fetch("/api/products?all=1")');
    });

    it("uretimEkle, uretimSil, updateOrderStatus path'leri tutarlı", () => {
        // En az 3 farklı yerde ?all=1 olmalı (ilk yükleme + 3 mutasyon path'i)
        const allMatches = dataContextSource.match(/\/api\/products\?all=1/g) ?? [];
        expect(allMatches.length).toBeGreaterThanOrEqual(3);
    });
});
