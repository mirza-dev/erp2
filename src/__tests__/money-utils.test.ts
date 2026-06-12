/**
 * roundMoney — tek para-yuvarlama konvansiyonu (denetim D1, 2026-06).
 * Postgres round(numeric,2) half-up ile hizalı; float temsil tuzakları kapalı.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { roundMoney } from "@/lib/money-utils";

describe("roundMoney", () => {
    it("2 ondalığa half-up yuvarlar", () => {
        expect(roundMoney(1.005)).toBe(1.01); // float temsili 1.00499... — EPSILON düzeltir
        expect(roundMoney(2.675)).toBe(2.68);
        expect(roundMoney(10)).toBe(10);
        expect(roundMoney(0.1 + 0.2)).toBe(0.3);
    });

    it("finite olmayan girdi 0 döner (NaN DB'ye sızmaz)", () => {
        expect(roundMoney(NaN)).toBe(0);
        expect(roundMoney(Infinity)).toBe(0);
    });

    it("satır-yuvarla-sonra-topla: 100 satırlık akümülasyon kuruş kaybetmez", () => {
        // 1.234 × 0.95 = 1.1723 → satır başına round 1.17; 100 satır = 117.00 (kesin)
        const lines = Array.from({ length: 100 }, () => roundMoney(1.234 * 1 * 0.95));
        const subtotal = roundMoney(lines.reduce((s, x) => s + x, 0));
        expect(subtotal).toBe(117);
    });
});

describe("093 migration — finansal recompute kaynak kilitleri", () => {
    const mig = readFileSync("supabase/migrations/093_financial_recompute.sql", "utf8");

    it("order RPC'leri line_total'ı sunucuda hesaplar (istemci değeri insert edilmez)", () => {
        // create: v_line_total değişkeni round formülüyle; update: inline round
        expect(mig).toMatch(/v_line_total := round\(v_qty \* v_price \* \(1 - v_disc_pct \/ 100\), 2\)/);
        expect(mig).toMatch(/round\(v_qty \* v_price \* \(1 - v_disc_pct \/ 100\), 2\),\s*\n\s*v_idx/);
        // istemcinin line_total'ı hiçbir INSERT'te kullanılmaz
        expect(mig).not.toMatch(/\(v_line->>'line_total'\)::numeric/);
    });

    it("quote RPC'lerinin ikisi de makul-sapma kontrolünden geçer (override korunur)", () => {
        const performs = mig.match(/PERFORM assert_quote_totals_sane\(p_header, p_lines\);/g) ?? [];
        expect(performs.length).toBe(2);
        // override değerleri yazılmaya devam eder (recompute edilmez — kullanıcı kararı)
        expect(mig).toMatch(/subtotal\s+= COALESCE\(\(p_header->>'subtotal'\)::numeric,\s+0\)/);
    });

    it("sapma toleransı GREATEST(x*0.05, 100)", () => {
        expect(mig).toMatch(/GREATEST\(v_computed_sub \* 0\.05, 100\)/);
        expect(mig).toMatch(/GREATEST\(v_computed_gr \* 0\.05, 100\)/);
    });
});
