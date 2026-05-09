/**
 * G11 audit 8. tur Fix 3 — tab counts ve pendingCount displayProducts üzerinden.
 *
 * Önceki: `tabs.count`/`manufacturedItems`/`commercialItems` `reorderSuggestions`
 * üzerinden hesaplanıyordu. `pendingCount = reorderSuggestions.length - accepted - rejected`
 * → out-of-scope decided ürün varsa (ör. accepted) `acceptedCount` reorderSuggestions
 * sayısından büyük olabiliyor → `pendingCount` negatif çıkıyordu.
 *
 * Yeni: hepsi displayProducts (= reorderSuggestions ∪ outOfScopeDecided) üzerinden.
 */
import { describe, it, expect } from "vitest";

interface Lite {
    id: string;
    productType: "manufactured" | "commercial";
}

interface RecLite {
    status?: "suggested" | "accepted" | "edited" | "rejected";
}

// page.tsx'deki tab count'larını + pending hesabını birebir taklit eden helper
function deriveCounts(
    displayProducts: Lite[],
    recMap: Map<string, RecLite>,
) {
    const manufactured = displayProducts.filter(p => p.productType === "manufactured").length;
    const commercial = displayProducts.filter(p => p.productType === "commercial").length;
    const total = displayProducts.length;

    const displayIds = new Set(displayProducts.map(p => p.id));
    const accepted = [...recMap.entries()].filter(([id, r]) => displayIds.has(id) && r.status === "accepted").length;
    const rejected = [...recMap.entries()].filter(([id, r]) => displayIds.has(id) && r.status === "rejected").length;
    const pending = displayProducts.filter(p => {
        const st = recMap.get(p.id)?.status;
        return !st || st === "suggested";
    }).length;

    return { total, manufactured, commercial, accepted, rejected, pending };
}

describe("Fix 3 — tab counts ve pendingCount displayProducts üzerinden", () => {
    it("Tüm ürünler in-scope, hiç decided yok: count'lar reorderSuggestions ile uyumlu (regresyon)", () => {
        const display: Lite[] = [
            { id: "p-1", productType: "commercial" },
            { id: "p-2", productType: "manufactured" },
        ];
        const r = deriveCounts(display, new Map());
        expect(r.total).toBe(2);
        expect(r.manufactured).toBe(1);
        expect(r.commercial).toBe(1);
        expect(r.pending).toBe(2);
        expect(r.accepted).toBe(0);
    });

    it("Out-of-scope accepted ürün → 'Tümü' count +1", () => {
        const display: Lite[] = [
            { id: "p-1", productType: "commercial" }, // in-scope
            { id: "p-out", productType: "commercial" }, // out-of-scope
        ];
        const recMap = new Map<string, RecLite>([["p-out", { status: "accepted" }]]);
        const r = deriveCounts(display, recMap);
        expect(r.total).toBe(2);
        expect(r.accepted).toBe(1);
    });

    it("Out-of-scope rejected ürün → 'Tümü' count +1", () => {
        const display: Lite[] = [
            { id: "p-1", productType: "commercial" },
            { id: "p-out", productType: "commercial" },
        ];
        const recMap = new Map<string, RecLite>([["p-out", { status: "rejected" }]]);
        const r = deriveCounts(display, recMap);
        expect(r.total).toBe(2);
        expect(r.rejected).toBe(1);
    });

    it("Out-of-scope manufactured → İmalat tab count'una yansır", () => {
        const display: Lite[] = [
            { id: "p-1", productType: "commercial" },
            { id: "p-out", productType: "manufactured" },
        ];
        const recMap = new Map<string, RecLite>([["p-out", { status: "accepted" }]]);
        const r = deriveCounts(display, recMap);
        expect(r.manufactured).toBe(1);
        expect(r.commercial).toBe(1);
    });

    it("pendingCount asla negatif değil — in-scope 1, out-of-scope accepted 2 → pending 1", () => {
        // Eski hesap: 1 - 2 = -1 (BUG). Yeni: displayProducts'taki suggested/null sayısı.
        const display: Lite[] = [
            { id: "p-1", productType: "commercial" }, // suggested (recMap'te yok)
            { id: "p-out-a", productType: "commercial" }, // accepted
            { id: "p-out-b", productType: "commercial" }, // accepted
        ];
        const recMap = new Map<string, RecLite>([
            ["p-out-a", { status: "accepted" }],
            ["p-out-b", { status: "accepted" }],
        ]);
        const r = deriveCounts(display, recMap);
        expect(r.pending).toBe(1); // sadece p-1 pending
        expect(r.accepted).toBe(2);
        expect(r.pending).toBeGreaterThanOrEqual(0);
    });

    it("recMap'te status=suggested olan ürün pending sayılır", () => {
        const display: Lite[] = [{ id: "p-1", productType: "commercial" }];
        const recMap = new Map<string, RecLite>([["p-1", { status: "suggested" }]]);
        const r = deriveCounts(display, recMap);
        expect(r.pending).toBe(1);
        expect(r.accepted).toBe(0);
    });

    it("recMap'te ürün dışı (display'da olmayan) accepted varsa sayılmaz", () => {
        // displayIds set ile filter — recMap'te kalan eski ürünler etkilemez
        const display: Lite[] = [{ id: "p-1", productType: "commercial" }];
        const recMap = new Map<string, RecLite>([
            ["p-1", { status: "suggested" }],
            ["p-old-deleted", { status: "accepted" }], // displayProducts'ta yok
        ]);
        const r = deriveCounts(display, recMap);
        expect(r.accepted).toBe(0); // p-old-deleted sayılmaz
        expect(r.pending).toBe(1);
    });

    it("Edited rec out-of-scope → accepted/rejected sayılmaz, pending de değil", () => {
        // 'edited' status ne accepted ne rejected; pending de değil (status set var ve != suggested)
        const display: Lite[] = [{ id: "p-1", productType: "commercial" }];
        const recMap = new Map<string, RecLite>([["p-1", { status: "edited" }]]);
        const r = deriveCounts(display, recMap);
        expect(r.accepted).toBe(0);
        expect(r.rejected).toBe(0);
        expect(r.pending).toBe(0);
    });
});
