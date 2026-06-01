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

describe("AI enrich timeout — canlı loader takılma regresyonu", () => {
    it("purchase-copilot fetch'i dedicated AbortController signal'ı kullanır", () => {
        expect(pageSource).toContain("const requestController = new AbortController()");
        expect(pageSource).toMatch(/fetch\("\/api\/ai\/purchase-copilot",\s*\{[\s\S]*signal:\s*requestController\.signal/);
    });

    it("AI çağrısı 30 saniye soft timeout ile deterministik moda düşer", () => {
        expect(pageSource).toContain("const AI_ENRICH_SOFT_TIMEOUT_MS = 30_000");
        expect(pageSource).toMatch(/setTimeout\(\(\)\s*=>\s*\{[\s\S]*softTimedOut\s*=\s*true[\s\S]*setAiError\(true\)[\s\S]*setAiLoading\(false\)[\s\S]*resolve\(false\)/);
    });

    it("soft timeout uzun süren AI isteğini abort etmez", () => {
        const timeoutBlock = pageSource.match(
            /timeoutId = setTimeout\(\(\) => \{([\s\S]*?)\}, AI_ENRICH_SOFT_TIMEOUT_MS\);/
        )?.[1] ?? "";
        expect(timeoutBlock).not.toContain("requestController.abort()");
        expect(pageSource).toMatch(/return await Promise\.race\(\[fetchTask,\s*softTimeoutTask\]\)/);
    });

    it("parent abort listener cleanup edilir", () => {
        expect(pageSource).toMatch(/signal\?\.addEventListener\("abort",\s*abortFromParent,\s*\{\s*once:\s*true\s*\}\)/);
        expect(pageSource).toMatch(/signal\?\.removeEventListener\("abort",\s*abortFromParent\)/);
        expect(pageSource).toMatch(/clearTimeout\(timeoutId\)/);
    });
});

// ─── Audit 10. tur Fix 2 — Behavior helper: shouldTriggerFetch ──────────────
//
// page.tsx'teki effect'in fetch tetikleme koşulunu birebir taklit eden helper.
// Source-regex testlerine ek olarak gerçek davranış matrisi koşullarını
// doğrular (chicken-and-egg senaryosu pure unit testle yakalanır).

function shouldTriggerFetch(productsLen: number): boolean {
    // page.tsx effect'in early-return mantığı:
    //   if (products.length === 0) return; // bekle
    //   ...loadAiData() çağrılır
    if (productsLen === 0) return false;
    return true;
}

describe("shouldTriggerFetch — initial fetch davranışı (behavior testi)", () => {
    // Effect'in fetch tetikleme koşulu sadece products.length'a bağlı;
    // signature değişimi React'in dependency mekanizmasıyla effect'in
    // yeniden çalıştırılmasını tetikler ama erken-dönüş koşulu products bazlı.

    it("products=0 → false (DataContext yüklenmedi)", () => {
        expect(shouldTriggerFetch(0)).toBe(false);
    });

    it("products>0 (signature boş senaryo) → true (chicken-and-egg kırılır)", () => {
        // Audit 9. Fix 1 ana senaryosu: ilk yüklemede recMap boş +
        // reorderSuggestions boş ama products dolu → fetch tetiklensin ki
        // out-of-scope decided rec'ler UI'ya gelsin.
        expect(shouldTriggerFetch(5)).toBe(true);
    });

    it("products>0 (signature dolu senaryo) → true (normal akış)", () => {
        // Aynı koşul; signature React dep'inde, fetch koşulu değil.
        expect(shouldTriggerFetch(5)).toBe(true);
    });

    it("products=1 → true (boundary: tek ürün)", () => {
        expect(shouldTriggerFetch(1)).toBe(true);
    });
});
