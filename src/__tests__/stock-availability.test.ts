/**
 * A1 (2026-08-24) — Satır bazlı stok uyarısı.
 *
 * OrderForm satır satır "Stok yetersiz" gösteriyordu ama QuoteForm'da HİÇ stok
 * farkındalığı yoktu: satışçı 3 adetlik valften 100 adet teklif edip müşteriye
 * söz verebiliyor, uyarı ancak teklif siparişe dönüşürken çıkıyordu — huninin
 * yanlış ucu. Kural ortak saf helper'a taşındı; iki form aynı cümleyi kurar.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import {
    stockHintForLine,
    stockHintColor,
    type StockCheckProduct,
} from "@/lib/stock-availability";

const root = process.cwd();
const QUOTE_SRC = readFileSync(join(root, "src/app/dashboard/quotes/_components/QuoteForm.tsx"), "utf8");
const ORDER_SRC = readFileSync(join(root, "src/app/dashboard/orders/OrderForm.tsx"), "utf8");

function product(p: Partial<StockCheckProduct> = {}): StockCheckProduct {
    return { on_hand: 100, quoted: 0, promisable: 100, minStockLevel: 10, unit: "adet", ...p };
}

describe("stockHintForLine", () => {
    it("ürün yoksa uyarı da yok (manuel kod satırı)", () => {
        expect(stockHintForLine(null, 5)).toBeNull();
        expect(stockHintForLine(undefined, 5)).toBeNull();
    });

    it("miktar verilebilirden fazlaysa 'yetersiz'", () => {
        const hint = stockHintForLine(product({ on_hand: 3, quoted: 0, promisable: 3 }), 100);
        expect(hint!.level).toBe("insufficient");
        expect(hint!.text).toBe("Stok yetersiz — 3 adet verilebilir (Stokta 3, Tekliflerde 0)");
    });

    it("NEGATİF promisable (aşırı taahhüt) yetersiz sayılır", () => {
        // Canlı veride var: TANK-CS-60M3 on_hand 0 → promisable -2
        const hint = stockHintForLine(product({ on_hand: 0, quoted: 2, promisable: -2 }), 1);
        expect(hint!.level).toBe("insufficient");
        expect(hint!.promisable).toBe(-2);
        expect(hint!.text).toContain("-2 adet verilebilir");
    });

    it("miktar 0 iken bile durum gösterilir (ürün seçilir seçilmez)", () => {
        const hint = stockHintForLine(product({ on_hand: 50, quoted: 5, promisable: 45 }), 0);
        expect(hint).not.toBeNull();
        expect(hint!.level).toBe("ok");
        expect(hint!.text).toBe("Stokta: 50 | Tekliflerde: 5 | Verilebilir: 45 adet");
    });

    it("tam sınırda yeterli sayılır (miktar == verilebilir)", () => {
        expect(stockHintForLine(product({ promisable: 10, minStockLevel: 0 }), 10)!.level).toBe("ok");
        expect(stockHintForLine(product({ promisable: 10, minStockLevel: 0 }), 11)!.level).toBe("insufficient");
    });

    it("min stok seviyesinin altındaysa 'düşük' (yetersiz değil)", () => {
        const hint = stockHintForLine(product({ on_hand: 8, quoted: 0, promisable: 8, minStockLevel: 10 }), 5);
        expect(hint!.level).toBe("low");
        expect(hint!.text).toContain("— Düşük");
    });

    it("yetersizlik 'düşük'ü gölgeler (daha ciddi olan kazanır)", () => {
        const hint = stockHintForLine(product({ promisable: 2, minStockLevel: 10 }), 5);
        expect(hint!.level).toBe("insufficient");
        expect(hint!.text).not.toContain("Düşük");
    });

    it("birim metne yansır", () => {
        expect(stockHintForLine(product({ unit: "metre", promisable: 1 }), 9)!.text)
            .toContain("1 metre verilebilir");
    });
});

describe("stockHintColor", () => {
    it("seviyeye göre tema rengi (hardcoded hex yok)", () => {
        expect(stockHintColor("insufficient")).toBe("var(--danger-text)");
        expect(stockHintColor("low")).toBe("var(--warning-text)");
        expect(stockHintColor("ok")).toBe("var(--text-tertiary)");
    });
});

describe("iki form da ortak helper'ı kullanır (kaynak kilidi)", () => {
    it("QuoteForm satır bazlı stok uyarısı gösterir", () => {
        expect(QUOTE_SRC).toContain('from "@/lib/stock-availability"');
        expect(QUOTE_SRC).toMatch(/const stockHint = stockHintForLine\(liveProduct, parseFloat\(row\.qty\) \|\| 0\)/);
        expect(QUOTE_SRC).toMatch(/color: stockHintColor\(stockHint\.level\)/);
    });

    it("QuoteForm YALNIZ listeden seçilmiş üründe uyarır (manuel kodda stok bilinemez)", () => {
        expect(QUOTE_SRC).toMatch(/row\.productId\s*\n?\s*\? products\.find\(p => p\.id === row\.productId\)\s*\n?\s*: null/);
    });

    it("OrderForm aynı helper'a taşındı — metin iki formda ayrışamaz", () => {
        expect(ORDER_SRC).toContain('from "@/lib/stock-availability"');
        expect(ORDER_SRC).toMatch(/const stockHint = stockHintForLine\(liveProduct, line\.quantity\)/);
        // Eski elle yazılmış metin geri gelmesin (drift kilidi)
        expect(ORDER_SRC).not.toMatch(/Stok yetersiz — \$\{promisable\}/);
    });
});
