/**
 * G11 audit 11. tur Fix 2 — frozen suggestQty UI'da
 *
 * Backend out-of-scope decided rec'ler için metadata.suggestQty (frozen)
 * yayınlıyor; UI satır render'ı her render'da computeSuggestion(p) ile güncel
 * hesap yapıyordu. Bu durumda kullanıcı kabul ettiği miktar yerine güncel
 * öneri görünüyor — backend "frozen" niyeti UI'a yansımıyor.
 *
 * Yeni helper `selectDisplaySuggestQty(rec, computedQty)`:
 *   - rec yok / suggested → güncel hesap
 *   - edited → editedQty (kullanıcı düzenleme miktarı)
 *   - accepted / rejected → frozenSuggestQty (kararı verildiği miktar)
 *   - legacy (frozenSuggestQty undefined) → fallback computedQty
 */
import { describe, it, expect } from "vitest";
import { selectDisplaySuggestQty } from "@/app/dashboard/purchase/suggested/page";

type Rec = Parameters<typeof selectDisplaySuggestQty>[0];

describe("selectDisplaySuggestQty", () => {
    it("rec yok → güncel hesap (computedQty)", () => {
        expect(selectDisplaySuggestQty(undefined, 50)).toBe(50);
    });

    it("rec.status=suggested → güncel hesap (henüz karar yok)", () => {
        const rec: Rec = { id: "r1", status: "suggested" };
        expect(selectDisplaySuggestQty(rec, 50)).toBe(50);
    });

    it("rec.status=accepted, frozenSuggestQty=30 → frozen 30 (computed 50 ignore)", () => {
        const rec: Rec = { id: "r1", status: "accepted", frozenSuggestQty: 30 };
        expect(selectDisplaySuggestQty(rec, 50)).toBe(30);
    });

    it("rec.status=rejected, frozenSuggestQty=30 → frozen 30 (kararı verdiği miktar)", () => {
        const rec: Rec = { id: "r1", status: "rejected", frozenSuggestQty: 30 };
        expect(selectDisplaySuggestQty(rec, 50)).toBe(30);
    });

    it("rec.status=edited, editedQty=25, frozenSuggestQty=30 → editedQty 25 (öncelik)", () => {
        const rec: Rec = { id: "r1", status: "edited", editedQty: 25, frozenSuggestQty: 30 };
        expect(selectDisplaySuggestQty(rec, 50)).toBe(25);
    });

    it("rec.status=accepted, frozenSuggestQty=undefined (legacy) → computedQty fallback", () => {
        const rec: Rec = { id: "r1", status: "accepted" };
        expect(selectDisplaySuggestQty(rec, 50)).toBe(50);
    });

    it("rec.status=accepted, frozenSuggestQty=null → computedQty fallback", () => {
        const rec: Rec = { id: "r1", status: "accepted", frozenSuggestQty: null };
        expect(selectDisplaySuggestQty(rec, 50)).toBe(50);
    });

    it("rec.status=edited, editedQty=undefined, frozenSuggestQty=30 → fallback computed 50", () => {
        // editedQty undefined → ilk branch (status=edited && editedQty != null) atlanır;
        // ikinci branch (status accepted/rejected) status=edited olduğu için yine atlanır;
        // → fallback computedQty (50). frozenSuggestQty=30 burada kullanılmaz çünkü
        // edited durumda kararı verdiği miktar editedQty olmalı; eksikliği boundary edge.
        const rec: Rec = { id: "r1", status: "edited", frozenSuggestQty: 30 };
        expect(selectDisplaySuggestQty(rec, 50)).toBe(50);
    });

    it("frozenSuggestQty=0 (sıfır miktar) → 0 (geçerli karar)", () => {
        // Sınır: 0 falsy ama geçerli sayısal değer; null check `!= null` ile ayrılır.
        const rec: Rec = { id: "r1", status: "accepted", frozenSuggestQty: 0 };
        expect(selectDisplaySuggestQty(rec, 50)).toBe(0);
    });
});
