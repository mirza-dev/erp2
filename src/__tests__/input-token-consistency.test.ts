/**
 * Form alanı token tutarlılığı (2026-08-24).
 *
 * `premium light theme` (`f550e83`) input'lara özel `--input-bg`/`--input-border`
 * token'larını getirmişti ama repodaki 19 yerel `inputStyle` sabitinin 13'ü eski
 * `0.5px solid var(--border-secondary)` + `var(--bg-tertiary)` üzerinde kalmıştı.
 *
 * Neden iki ay fark edilmedi: KOYU temada `--bg-tertiary` ile `--input-bg` aynı
 * renk (#22252c) ve kenarlıklar neredeyse özdeş. AYDINLIK temada farklılar
 * (#f3f6fa vs #f8fbfe) — üstelik `0.5px` ile `--line-width` (1px) farkı her iki
 * temada da görünür. Sonuç: form ekranları sayfadan sayfaya farklı duruyordu.
 *
 * Çözüm: yerel sabitler `fieldStyle(size)`'a bağlandı — kullanım yerleri
 * (`style={inputStyle}`) hiç değişmedi, token tek kaynaktan geliyor.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { fieldStyle } from "@/components/ui/Input";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");

/** `fieldStyle`e bağlanan dosyalar — hepsi aynı token kaynağını kullanmalı. */
const WIRED = [
    "src/app/dashboard/settings/note-templates/page.tsx",
    "src/app/dashboard/settings/users/page.tsx",
    "src/app/dashboard/settings/product-types/page.tsx",
    "src/app/dashboard/settings/product-types/[id]/page.tsx",
    "src/app/dashboard/products/[id]/page.tsx",
    "src/app/dashboard/purchase/rfqs/new/page.tsx",
    "src/app/dashboard/purchase/rfqs/[id]/page.tsx",
    "src/app/dashboard/purchase/orders/new/page.tsx",
    "src/app/dashboard/orders/OrderForm.tsx",
    "src/components/customers/CustomerDetailPanel.tsx",
    "src/components/products/DynamicFieldEdit.tsx",
];

/**
 * BİLİNÇLİ İSTİSNALAR — bunlar "kayma" DEĞİL.
 * Uyarılar/takvim yüzeyinin kendi input dili: 1px kenarlık + `--bg-primary` +
 * daha yuvarlak köşe (7-8px), renkli yüzey ÜSTÜNDE duran alan görünümü.
 * `--input-bg`e zorlamak bilinçli bir tasarımı bozardı.
 */
const INTENTIONAL_EXCEPTIONS = [
    "src/app/dashboard/alerts/page.tsx",
    "src/components/alerts/NoteFormModal.tsx",
];

describe("fieldStyle — tek token kaynağı", () => {
    it("doğru token'ları üretir", () => {
        const s = fieldStyle("md");
        expect(s.background).toBe("var(--input-bg)");
        expect(s.border).toBe("var(--line-width) solid var(--input-border)");
    });

    it("eski token'lar ÜRETİLMEZ (kayma geri gelmesin)", () => {
        for (const size of ["sm", "md", "lg"] as const) {
            const s = fieldStyle(size);
            expect(String(s.background)).not.toContain("bg-tertiary");
            expect(String(s.border)).not.toContain("border-secondary");
            expect(String(s.border)).not.toContain("0.5px");
        }
    });

    it("üç boyut repodaki gerçek padding varyasyonlarını karşılar", () => {
        expect(fieldStyle("sm").padding).toBe("5px 8px");
        expect(fieldStyle("md").padding).toBe("6px 10px");
        expect(fieldStyle("lg").padding).toBe("8px 10px");
    });
});

describe("bağlanan dosyalar", () => {
    it.each(WIRED)("%s → fieldStyle kullanır", (path) => {
        const src = read(path);
        expect(src).toMatch(/const (inputStyle|modalInputStyle): React\.CSSProperties = fieldStyle\("(sm|md|lg)"\)/);
        expect(src).toContain('from "@/components/ui/Input"');
    });

    it.each(WIRED)("%s → elle yazılmış eski input token'ı KALMADI", (path) => {
        const src = read(path);
        // Not: bu dosyalarda panel/ayraç kenarlığı olarak 0.5px kalabilir —
        // burada yalnız `const inputStyle` bloğunun temiz olduğunu kilitliyoruz.
        const m = src.match(/const (inputStyle|modalInputStyle): React\.CSSProperties = [^;]+;/);
        expect(m).not.toBeNull();
        expect(m![0]).not.toContain("border-secondary");
        expect(m![0]).not.toContain("bg-tertiary");
    });
});

describe("bilinçli istisnalar korunur", () => {
    it.each(INTENTIONAL_EXCEPTIONS)("%s kendi yüzey-üstü input dilini sürdürür", (path) => {
        const src = read(path);
        // 1px + bg-primary: bunlar 0.5px/bg-tertiary kaymasının parçası DEĞİL.
        expect(src).toMatch(/border: "1px solid var\(--border-(tertiary|secondary)\)"[\s\S]{0,80}background: "var\(--bg-primary\)"/);
    });

    it("istisna listesi kısa tutulur (sessizce büyümesin)", () => {
        expect(INTENTIONAL_EXCEPTIONS.length).toBeLessThanOrEqual(2);
    });
});
