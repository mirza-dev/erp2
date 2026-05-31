/**
 * RBAC Faz 7a — maskCurrency pure helper.
 * canView false → "—"; true → formatCurrency. Yetkisiz role yanıltıcı "₺0,00"
 * yerine "—" gösterir (kozmetik ikinci katman; gerçek koruma API redaction'da).
 */
import { describe, it, expect } from "vitest";
import { maskCurrency, formatCurrency } from "@/lib/utils";

describe("maskCurrency", () => {
    it("canView true → formatCurrency ile aynı", () => {
        expect(maskCurrency(1234.5, "TRY", true)).toBe(formatCurrency(1234.5, "TRY"));
        expect(maskCurrency(999, "EUR", true)).toBe(formatCurrency(999, "EUR"));
    });

    it("canView false → '—' (değer ne olursa olsun)", () => {
        expect(maskCurrency(1234.5, "TRY", false)).toBe("—");
        expect(maskCurrency(0, "TRY", false)).toBe("—");
        expect(maskCurrency(0, "USD", false)).toBe("—");
    });

    it("canView varsayılan true (geriye uyumlu)", () => {
        expect(maskCurrency(500, "TRY")).toBe(formatCurrency(500, "TRY"));
    });

    it("redakte edilmiş null→0 senaryosu: yetkisiz '—', yetkili '₺0,00'", () => {
        // mapper redakte null'ı 0'a çevirir; yetki kararı değeri değil permission'ı kullanır
        expect(maskCurrency(0, "TRY", false)).toBe("—");
        expect(maskCurrency(0, "TRY", true)).toBe(formatCurrency(0, "TRY"));
    });
});
