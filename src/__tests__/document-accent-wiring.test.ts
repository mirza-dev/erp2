/**
 * mig.112 — belge vurgu rengi: KABLOLAMA kilitleri.
 *
 * `document-accent.test.ts` rengin ÜRETİMİNİ (render çıktısı) ölçer; bu dosya
 * rengin firma ayarından belgeye kadar olan YOLUNU kilitler. Yol üç yerde
 * kopabilir ve üçü de test edilmesi pahalı yüzeylerde (React efekti, baskı CSS'i,
 * ayar formu) olduğu için kaynak kilidi tercih edildi:
 *
 *  1. QuoteForm iki efektle renk çeker (snapshot'lı / snapshot'sız teklif) —
 *     biri silinirse o teklif türü sessizce varsayılan mavide kalır.
 *  2. Baskı CSS'i DB okuyamaz → renk `.q-card` kökünden `--q-accent` custom
 *     property'siyle iner. Kök stil silinirse ekran renkli, ÇIKTI mavi olur.
 *  3. Ayarlar formu alanı YALNIZ değiştiyse PATCH'e koyar: kolon canlıda yokken
 *     her kaydetme 409'a düşmesin (kullanıcı adres bile değiştiremez).
 *
 * Yorumlar soyulur (satır yorumu ÖNCE, blok yorumu SONRA) — iddialar gövdeye bağlı.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const code = (src: string) =>
    src.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

const FORM = code(read("src/app/dashboard/quotes/_components/QuoteForm.tsx"));
const CSS = read("src/app/globals.css");
const SETTINGS = code(read("src/app/dashboard/settings/page.tsx"));

describe("QuoteForm — renk firma ayarından gelir, iki teklif türünde de", () => {
    it("iki efekt de `setDocAccent(resolveDocumentAccent(...))` çağırır", () => {
        const calls = FORM.match(/setDocAccent\(resolveDocumentAccent\(/g) ?? [];
        expect(calls.length, "renk çekimi iki efektte de olmalı").toBe(2);
    });

    it("efektler birbirini dışlar: biri snapshot'lıyı, diğeri snapshot'sızı alır", () => {
        const skipSnapshot = FORM.indexOf('if (hasSellerSnapshot) return;');
        const onlySnapshot = FORM.indexOf('if (!hasSellerSnapshot) return;');
        expect(skipSnapshot, "snapshot freeze kapısı yok").toBeGreaterThan(-1);
        expect(onlySnapshot, "snapshot'lı teklif için renk efekti yok").toBeGreaterThan(-1);
        // İkisi de aynı endpoint'i okur; snapshot'lı olan YALNIZ rengi set eder
        // (satıcı alanları donmuş kalmalı).
        const onlyBody = FORM.slice(onlySnapshot, onlySnapshot + 400);
        expect(onlyBody).toMatch(/fetch\("\/api\/settings\/company"\)/);
        expect(onlyBody).toMatch(/setDocAccent\(resolveDocumentAccent\(s\.document_accent_color\)\)/);
        expect(onlyBody, "snapshot'lı teklifte satıcı alanları güncellenmemeli")
            .not.toMatch(/setSellerName|setSellerTel|setSellerAddr/);
    });

    it("önizleme/PDF yükü rengi taşır ve taşıdığı her yerde bağımlılık listesinde", () => {
        const payloads = Array.from(FORM.matchAll(/accentColor: docAccent,/g));
        expect(payloads.length, "iki QuoteData yükü de rengi taşımalı").toBe(2);
        for (const m of payloads) {
            const after = FORM.slice(m.index!);
            const deps = after.match(/\}, \[([\s\S]*?)\]\);/);
            expect(deps, "yükten sonra bağımlılık listesi bulunamadı").not.toBeNull();
            expect(deps![1], "docAccent bağımlılıkta yok → renk değişince yük bayat kalır")
                .toContain("docAccent");
        }
    });

    it(".q-card kökü baskı CSS'i için `--q-accent` + `--q-accent-border` yazar", () => {
        const card = FORM.match(/className="q-card" style=\{\{[\s\S]*?\}\}>/);
        expect(card, ".q-card kökü bulunamadı").not.toBeNull();
        expect(card![0]).toMatch(/"--q-accent": docAccent/);
        expect(card![0]).toMatch(/"--q-accent-border": accentRgba\(docAccent, 0\.2\)/);
    });

    it("formda sabit PMT mavisi kalmadı (renk tek kaynaktan)", () => {
        expect(FORM).not.toMatch(/#0072BC/i);
        expect(FORM).not.toMatch(/0,\s*114,\s*188/);
    });
});

describe("globals.css — baskı kuralları custom property okur, fallback varsayılan", () => {
    it("başlık bandı, bölüm başlığı ve tablo başlığı `var(--q-accent…)` kullanır", () => {
        const band = CSS.match(/\.q-title-band span \{[^}]*\}/);
        expect(band![0]).toContain("var(--q-accent, #0072BC)");
        const meta = CSS.match(/\.q-meta-col > :first-child \{[^}]*\}/);
        expect(meta![0]).toContain("var(--q-accent, #0072BC)");
        expect(meta![0]).toContain("var(--q-accent-border, rgba(0,114,188,0.2))");
        const th = CSS.match(/\.q-th \{[^}]*\}/);
        expect(th![0]).toContain("var(--q-accent, #0072BC)");
    });

    it("baskı bloğunda çıplak (var'sız) PMT mavisi kalmadı", () => {
        // `var(--q-accent, #0072BC)` fallback'leri meşru; başka her geçiş kaçak.
        const stripped = CSS.replace(/var\(--q-accent[^)]*\)|var\(--q-accent-border,\s*rgba\(0,114,188,0\.2\)\)/g, "");
        expect(stripped).not.toMatch(/#0072BC/i);
    });
});

describe("Ayarlar › Firma — alan yalnız değiştiyse gönderilir, kolon yoksa kilitlenir", () => {
    it("PATCH gövdesine renk YALNIZ kaydedilenden farklıysa eklenir", () => {
        expect(SETTINGS).toMatch(
            /\.\.\.\(form\.documentAccent !== savedRef\.current\.documentAccent\s*\?\s*\{ document_accent_color: form\.documentAccent \}\s*:\s*\{\}\)/,
        );
    });

    it("doğrulama da yalnız değişince koşar (API ile aynı kural)", () => {
        const guard = SETTINGS.indexOf("if (form.documentAccent !== savedRef.current.documentAccent) {");
        expect(guard).toBeGreaterThan(-1);
        expect(SETTINGS.slice(guard, guard + 220)).toMatch(/validateDocumentAccent\(form\.documentAccent\)/);
    });

    it("kolon desteği GET yanıtındaki anahtarın VARLIĞINDAN okunur", () => {
        expect(SETTINGS).toMatch(/setAccentSupported\("document_accent_color" in s\)/);
        expect(SETTINGS).toMatch(/documentAccent: resolveDocumentAccent\(s\.document_accent_color\)/);
    });

    it("alan DocumentAccentField'e `supported` ve hata ile bağlanır", () => {
        const tag = SETTINGS.match(/<DocumentAccentField(?:(?!\/>)[\s\S])*?\/>/);
        expect(tag, "DocumentAccentField render edilmiyor").not.toBeNull();
        expect(tag![0]).toMatch(/value=\{form\.documentAccent\}/);
        expect(tag![0]).toMatch(/supported=\{accentSupported\}/);
        expect(tag![0]).toMatch(/error=\{fieldErrors\.documentAccent\}/);
    });
});
