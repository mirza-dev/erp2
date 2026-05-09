/**
 * G11 audit 4. tur Bulgu 4 — auto-reload set imzası.
 *
 * Önceki: useEffect dependency `reorderSuggestions.length` idi. Aynı sayıda
 * ama farklı ürün seti veya stok/quote değişimi olursa AI/recMap otomatik
 * yenilenmezdi. Yeni: imza productId + available + min + dailyUsage + reserved
 * üzerinden hesaplanır → değişen her şey effect'i tetikler.
 */
import { describe, it, expect } from "vitest";

interface ReorderProductLite {
    id: string;
    available_now: number;
    minStockLevel: number;
    dailyUsage: number | null;
    reserved: number;
    quoted: number;
}

// Page.tsx'deki signature hesabını birebir taklit eden helper
// Audit 5. tur Fix 3: quoted alanı eklendi
function computeReorderSignature(items: ReorderProductLite[]): string {
    if (items.length === 0) return "";
    return items
        .map(p => `${p.id}:${p.available_now}:${p.minStockLevel}:${p.dailyUsage ?? "_"}:${p.reserved}:${p.quoted}`)
        .sort()
        .join("|");
}

describe("Bulgu 4 — reorderSignature: aynı length farklı set'te değişir", () => {
    const baseSet: ReorderProductLite[] = [
        { id: "p-1", available_now: 5, minStockLevel: 20, dailyUsage: 3, reserved: 0, quoted: 0 },
        { id: "p-2", available_now: 10, minStockLevel: 15, dailyUsage: 2, reserved: 5, quoted: 0 },
    ];

    it("aynı set → aynı imza (regresyon: gereksiz fetch tetiklenmez)", () => {
        const a = computeReorderSignature(baseSet);
        const b = computeReorderSignature(baseSet);
        expect(a).toBe(b);
    });

    it("aynı length, farklı productId → imza değişir (eski .length yetmiyordu)", () => {
        const swapped: ReorderProductLite[] = [
            { id: "p-1", available_now: 5, minStockLevel: 20, dailyUsage: 3, reserved: 0, quoted: 0 },
            { id: "p-3", available_now: 10, minStockLevel: 15, dailyUsage: 2, reserved: 5, quoted: 0 }, // p-2 yerine p-3
        ];
        expect(computeReorderSignature(baseSet)).not.toBe(computeReorderSignature(swapped));
    });

    it("aynı set + aynı id'lerde stok değişimi → imza değişir", () => {
        const stockChanged: ReorderProductLite[] = [
            { ...baseSet[0], available_now: 3 }, // 5 → 3
            baseSet[1],
        ];
        expect(computeReorderSignature(baseSet)).not.toBe(computeReorderSignature(stockChanged));
    });

    it("reserved değişimi (quote eklendi) → imza değişir", () => {
        const reservedChanged: ReorderProductLite[] = [
            baseSet[0],
            { ...baseSet[1], reserved: 8 }, // 5 → 8
        ];
        expect(computeReorderSignature(baseSet)).not.toBe(computeReorderSignature(reservedChanged));
    });

    it("dailyUsage null ↔ sayı geçişi → imza değişir", () => {
        const usageChanged: ReorderProductLite[] = [
            { ...baseSet[0], dailyUsage: null },
            baseSet[1],
        ];
        expect(computeReorderSignature(baseSet)).not.toBe(computeReorderSignature(usageChanged));
    });

    it("min değişimi → imza değişir", () => {
        const minChanged: ReorderProductLite[] = [
            { ...baseSet[0], minStockLevel: 30 },
            baseSet[1],
        ];
        expect(computeReorderSignature(baseSet)).not.toBe(computeReorderSignature(minChanged));
    });

    it("boş set → boş string (effect erken döner)", () => {
        expect(computeReorderSignature([])).toBe("");
    });

    it("sıralama deterministik (sort), input order değişse aynı set aynı imza", () => {
        const reordered: ReorderProductLite[] = [baseSet[1], baseSet[0]];
        expect(computeReorderSignature(baseSet)).toBe(computeReorderSignature(reordered));
    });

    // ─── Audit 5. tur Fix 3 — quoted değişimi imzaya yansır ─────────────────

    it("quoted değişimi (sipariş eklendi/iptal) → imza değişir", () => {
        // available_now sabit kalıp quote eklendiğinde imza değişmeli;
        // promisable=available_now-quoted değişir → AI auto-reload tetiklenmeli
        const quoteAdded: ReorderProductLite[] = [
            baseSet[0],
            { ...baseSet[1], quoted: 5 }, // 0 → 5 (quote eklendi)
        ];
        expect(computeReorderSignature(baseSet)).not.toBe(computeReorderSignature(quoteAdded));
    });

    it("quoted ve available_now aynı anda ters yönde değişebilir → imza yine değişir", () => {
        // available_now=10 → 8 (-2); quoted=0 → 2 (+2). Promisable değişmedi (10-0=10 vs 8-2=6 ... aslında değişti)
        // Test: imza değişmeli çünkü hem available_now hem quoted ayrı kanallarda izleniyor
        const both: ReorderProductLite[] = [
            { ...baseSet[0], available_now: 8, quoted: 2 },
            baseSet[1],
        ];
        expect(computeReorderSignature(baseSet)).not.toBe(computeReorderSignature(both));
    });

    it("sadece quoted değişiminde, available_now sabit → imza değişir (regresyon)", () => {
        // Audit 5. tur: önceden imzada quoted yoktu, bu senaryo kaçıyordu
        const quoteOnly: ReorderProductLite[] = [
            { ...baseSet[0], quoted: 10 }, // sadece quoted 0 → 10
            baseSet[1],
        ];
        expect(computeReorderSignature(baseSet)).not.toBe(computeReorderSignature(quoteOnly));
    });

    it("imzada `quoted` field'ı encoding doğru (regresyon)", () => {
        // Imza string'i quoted içermeli; quoted=99 ile yapılı arama
        const withQuote: ReorderProductLite[] = [{ ...baseSet[0], quoted: 99 }];
        const sig = computeReorderSignature(withQuote);
        expect(sig).toContain(":99"); // quoted=99 görünmeli
    });
});

// ─── Audit 7. tur Fix 1 — imza displayProducts (out-of-scope dahil) üzerinden ─

describe("signatureSource simulation — out-of-scope decided ürünler imzada", () => {
    // Page'deki signatureSource hesabını birebir taklit
    function buildSignatureSource(
        reorderSuggestions: ReorderProductLite[],
        products: ReorderProductLite[],
        recMap: Map<string, { status: string }>,
    ): ReorderProductLite[] {
        const seen = new Set(reorderSuggestions.map(p => p.id));
        const outOfScope = products.filter(p => {
            if (seen.has(p.id)) return false;
            const status = recMap.get(p.id)?.status;
            return status === "accepted" || status === "edited" || status === "rejected";
        });
        return [...reorderSuggestions, ...outOfScope];
    }

    const reorder: ReorderProductLite[] = [
        { id: "p-1", available_now: 5, minStockLevel: 20, dailyUsage: 3, reserved: 0, quoted: 0 },
    ];
    const allProducts: ReorderProductLite[] = [
        { id: "p-1", available_now: 5, minStockLevel: 20, dailyUsage: 3, reserved: 0, quoted: 0 },
        { id: "p-2", available_now: 200, minStockLevel: 20, dailyUsage: null, reserved: 0, quoted: 0 },
    ];

    it("Out-of-scope accepted ürün imzaya eklenir (decided rec varsa)", () => {
        const recMap = new Map<string, { status: string }>([["p-2", { status: "accepted" }]]);
        const src = buildSignatureSource(reorder, allProducts, recMap);
        expect(src.map(p => p.id).sort()).toEqual(["p-1", "p-2"]);
    });

    it("Out-of-scope ürün accepted değilse (suggested) imzaya eklenmez", () => {
        const recMap = new Map<string, { status: string }>([["p-2", { status: "suggested" }]]);
        const src = buildSignatureSource(reorder, allProducts, recMap);
        expect(src.map(p => p.id)).toEqual(["p-1"]);
    });

    it("Out-of-scope ürün stok değişimi imza değişimine yol açar (Fix 1 ana senaryo)", () => {
        const recMap = new Map<string, { status: string }>([["p-2", { status: "accepted" }]]);
        const before = computeReorderSignature(buildSignatureSource(reorder, allProducts, recMap));
        const allProductsModified: ReorderProductLite[] = [
            allProducts[0],
            { ...allProducts[1], quoted: 50 }, // p-2 quoted 0 → 50
        ];
        const after = computeReorderSignature(buildSignatureSource(reorder, allProductsModified, recMap));
        expect(before).not.toBe(after);
    });

    it("rejected ürün de imzaya eklenir (drift bilgisi yenilenir)", () => {
        const recMap = new Map<string, { status: string }>([["p-2", { status: "rejected" }]]);
        const src = buildSignatureSource(reorder, allProducts, recMap);
        expect(src.map(p => p.id).sort()).toEqual(["p-1", "p-2"]);
    });

    it("In-scope + out-of-scope dedup: aynı ID iki kere girmez", () => {
        // p-1 hem reorder içinde hem accepted olsa bile dedup
        const recMap = new Map<string, { status: string }>([["p-1", { status: "accepted" }]]);
        const src = buildSignatureSource(reorder, allProducts, recMap);
        const ids = src.map(p => p.id);
        expect(ids.filter(id => id === "p-1")).toHaveLength(1);
    });
});
