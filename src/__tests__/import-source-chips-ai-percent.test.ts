/**
 * Sprint B G5 — Kolon eşleştirme chip'leri: AI source'da confidence yüzdesi gösterilir.
 *
 * Plan kriteri: "AI %85 chip — confidence field kullanılır"
 * sourceChipLabel pure helper'ı doğrudan test edilir.
 */
import { describe, it, expect } from "vitest";
import { sourceChipLabel } from "@/app/dashboard/import/excel/page";

describe("sourceChipLabel — source chip etiket mantığı", () => {
    it("memory source → 'Hafıza'", () => {
        expect(sourceChipLabel("memory", 1.0)).toBe("Hafıza");
    });

    it("ai source + confidence → 'AI %85'", () => {
        expect(sourceChipLabel("ai", 0.85)).toBe("AI %85");
    });

    it("ai source + 100% confidence → 'AI %100'", () => {
        expect(sourceChipLabel("ai", 1.0)).toBe("AI %100");
    });

    it("ai source + düşük confidence → yuvarlama doğru", () => {
        expect(sourceChipLabel("ai", 0.724)).toBe("AI %72");
    });

    it("ai source + 0 confidence → sadece 'AI' (yüzde gösterilmez)", () => {
        expect(sourceChipLabel("ai", 0)).toBe("AI");
    });

    it("user source → 'Kullanıcı'", () => {
        expect(sourceChipLabel("user", 0.5)).toBe("Kullanıcı");
    });

    it("fallback source → 'Otomatik' (sözlük tabanlı eşleşme)", () => {
        expect(sourceChipLabel("fallback", 0.9)).toBe("Otomatik");
    });

    it("bilinmeyen / boş source → '—'", () => {
        expect(sourceChipLabel("xyz", 0.9)).toBe("—");
        expect(sourceChipLabel("", 0)).toBe("—");
    });

    it("memory source'da confidence yüzdesi gösterilmez", () => {
        const label = sourceChipLabel("memory", 0.95);
        expect(label).not.toContain("%");
        expect(label).toBe("Hafıza");
    });
});
