/**
 * Voice V3 — mergeFireIntoNote pure helper tests.
 *
 * fireNotes ("fire: N adet") + note (manuel veya sessionNote fallback)
 * birleştirme davranışını kilitler. DB'ye scrap_qty olarak değil; UI'da
 * notlar alanında human-readable kalır (kullanıcı kararı 2026-05-28).
 */
import { describe, it, expect } from "vitest";
import { mergeFireIntoNote } from "@/lib/voice-note-helpers";

describe("mergeFireIntoNote — boş kombinasyonlar", () => {
    it("note boş + fireNotes boş → boş string", () => {
        expect(mergeFireIntoNote("", "")).toBe("");
    });

    it("note dolu + fireNotes boş → note değişmez", () => {
        expect(mergeFireIntoNote("kontrol", "")).toBe("kontrol");
    });

    it("note boş + fireNotes dolu → fireNotes", () => {
        expect(mergeFireIntoNote("", "fire: 2 adet")).toBe("fire: 2 adet");
    });
});

describe("mergeFireIntoNote — concat davranışı", () => {
    it("ikisi dolu → orta nokta ayraç ile birleşir", () => {
        expect(mergeFireIntoNote("kontrol", "fire: 2 adet")).toBe("kontrol · fire: 2 adet");
    });

    it("whitespace trim — leading/trailing boşluklar atılır", () => {
        expect(mergeFireIntoNote("  kontrol  ", "  fire: 2 adet  ")).toBe("kontrol · fire: 2 adet");
    });
});

describe("mergeFireIntoNote — duplicate guard", () => {
    it("fireNotes hâlihazırda note içinde varsa eklenmez (case-sensitive form)", () => {
        expect(mergeFireIntoNote("kontrol fire: 2 adet", "fire: 2 adet")).toBe("kontrol fire: 2 adet");
    });

    it("dedup case-insensitive (BÜYÜK fire vs küçük fire)", () => {
        expect(mergeFireIntoNote("KONTROL FIRE: 2 ADET", "fire: 2 adet")).toBe("KONTROL FIRE: 2 ADET");
    });
});
