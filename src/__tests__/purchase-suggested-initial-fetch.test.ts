/**
 * G11 audit 9. tur Fix 1 — ilk yüklemede recMap boş + reorderSuggestions boş
 * senaryosunda da AI fetch tetiklenir.
 *
 * Önceki: signatureSource = [] → reorderSignature = "" → effect skip → route
 * çağrılmadığı için recMap dolmuyor → out-of-scope decided ürünler UI'da yok.
 * Chicken-and-egg: route çağrılmadan recMap dolmaz, recMap boşken signatureSource
 * out-of-scope ürünleri içermez.
 *
 * Yeni: useEffect dependency'sine `products.length` eklendi. products yüklendiğinde
 * (signature boş olsa bile) loadAiData() çağrılır. recMap dolunca signatureSource
 * genişler ve effect tekrar tetiklenir.
 *
 * Bu test source-regression olarak page.tsx'te değişikliği doğrular.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const pageSource = readFileSync(
    resolve(process.cwd(), "src/app/dashboard/purchase/suggested/page.tsx"),
    "utf-8",
);

describe("Fix 1 — ilk yükleme effect products.length dependency", () => {
    it("loadAiData useEffect'i products.length'ı dependency olarak içerir", () => {
        // Pattern: }, [reorderSignature, products.length, loadAiData]);
        expect(pageSource).toMatch(/\[\s*reorderSignature\s*,\s*products\.length\s*,\s*loadAiData\s*\]/);
    });

    it("Effect products.length === 0 koşuluyla erken döner", () => {
        // products yüklenmemişse effect waitler (DataContext refetch'i bitirsin diye)
        expect(pageSource).toMatch(/if\s*\(\s*products\.length\s*===\s*0\s*\)\s*return/);
    });

    it("Eski sadece-imza-bazlı early-return kaldırılmış (regresyon)", () => {
        // Eski: `if (!reorderSignature) return;` — bu artık olmamalı
        const offendingCount = (pageSource.match(/if\s*\(\s*!reorderSignature\s*\)\s*return/g) ?? []).length;
        expect(offendingCount).toBe(0);
    });
});
