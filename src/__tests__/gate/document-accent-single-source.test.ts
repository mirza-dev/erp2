/**
 * GATE: belge vurgu rengi TEK KAYNAKTAN gelir (mig.112, 2026-09-18).
 *
 * 2026-09-18'e kadar PMT'nin kurumsal mavisi (`#0072BC`) sekiz dosyada sabitti:
 * teklif ekranı, teklif belgesi, baskı CSS'i, teklif PDF'i, satın alma siparişi,
 * RFQ belgesi + PDF'i, arşiv HTML'i. Teslim modeli müşteri başına ayrı kurulum
 * olduğu için ikinci müşterinin teklifleri de PMT mavisiyle çıkacaktı. Renk artık
 * `company_settings.document_accent_color` → `src/lib/document-accent.ts`.
 *
 * Bu kapı, rengin geri SABİTLENMESİNİ (yeni bir belge yüzeyinde `#0072BC` veya
 * `rgba(0,114,188,…)` yazılmasını) görünür kılar. Yorum içindeki geçişler
 * meşrudur (tarihçe anlatır) → yorumlar soyulur. İki istisna:
 *   · `src/lib/document-accent.ts` — varsayılanın TANIMI.
 *   · `globals.css` `var(--q-accent, #0072BC)` fallback'leri — baskı stili DB
 *     okuyamaz; custom property hiç set edilmezse (ör. arşiv-view) varsayılana
 *     düşmeli. Fallback DIŞINDA bir geçiş yine kaçaktır.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const strip = (s: string) =>
    s.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

/** `#0072BC` (harf boyu farkı dahil) ve aynı rengin rgb üçlüsü. */
const BLUE_RE = /#0072BC\b|\b0\s*,\s*114\s*,\s*188\b/i;

const ALLOWED = new Set(["src/lib/document-accent.ts"]);

function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) {
            if (name !== "__tests__") walk(p, out);
        } else if (/\.(tsx?|css)$/.test(name)) {
            out.push(p);
        }
    }
    return out;
}

describe("GATE — PMT mavisi yalnız document-accent.ts'te (ve baskı fallback'inde)", () => {
    const files = walk(join(ROOT, "src"));

    it("tarama kapsamı gerçek: 300+ dosya ve bilinen belge yüzeyleri içinde", () => {
        const rels = files.map((f) => relative(ROOT, f));
        expect(files.length).toBeGreaterThan(300);
        for (const must of [
            "src/app/dashboard/quotes/components/QuoteDocument.tsx",
            "src/lib/quote-pdf/QuotePdfDocument.tsx",
            "src/components/purchase/PurchaseOrderDocument.tsx",
            "src/app/dashboard/purchase/rfqs/components/RfqDocument.tsx",
            "src/lib/rfq-pdf/RfqPdfDocument.tsx",
            "src/app/globals.css",
        ]) {
            expect(rels, `${must} taranmıyor`).toContain(must);
        }
    });

    it("hiçbir dosya rengi yeniden sabitlemiyor", () => {
        const offenders: string[] = [];
        for (const file of files) {
            const rel = relative(ROOT, file);
            if (ALLOWED.has(rel)) continue;
            let src = strip(readFileSync(file, "utf8"));
            if (rel === "src/app/globals.css") {
                // Yalnız `var(--q-accent…, <varsayılan>)` fallback'i muaf.
                src = src
                    .replace(/var\(--q-accent,\s*#0072BC\)/gi, "")
                    .replace(/var\(--q-accent-border,\s*rgba\(0,114,188,0\.2\)\)/gi, "");
            }
            for (const line of src.split("\n")) {
                if (BLUE_RE.test(line)) offenders.push(`${rel}: ${line.trim().slice(0, 100)}`);
            }
        }
        expect(offenders, `Renk sabitlenmiş — document-accent.ts'ten türetin:\n${offenders.join("\n")}`)
            .toEqual([]);
    });

    it("varsayılan gerçekten o renk (kural vakum değil)", async () => {
        const mod = await import("@/lib/document-accent");
        expect(mod.DEFAULT_DOCUMENT_ACCENT).toBe("#0072BC");
        expect(BLUE_RE.test(strip(readFileSync(join(ROOT, "src/lib/document-accent.ts"), "utf8")))).toBe(true);
    });
});
