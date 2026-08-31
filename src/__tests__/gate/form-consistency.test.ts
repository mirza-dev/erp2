/**
 * GATE: form ve başlık tipografisi tek kaynaktan.
 *
 * 2026-08-31 ölçümü — uygulama ekrandan ekrana FARKLI görünüyordu:
 *
 *   · `labelStyle` **10 dosyaya kopyalanmış**, 5 ayrı varyanta ayrışmıştı
 *     (11px/12px · tertiary/secondary · BÜYÜK HARF olan/olmayan · ağırlık kimi
 *     yerde 500 kimi yerde tanımsız). Tedarikçi formundan RFQ formuna geçen
 *     kullanıcı etiketlerin boyut ve renk değiştirdiğini görüyordu.
 *   · `inputStyle` 11 dosyada; 8'i `fieldStyle()`'a bağlıydı ama **3'ü elle
 *     yazılmıştı** ve biri eski `--border-secondary` token'ında kalmıştı.
 *   · **16 elle yazılmış `<h1>`**, 5 farklı boyut (16·18·19·20·24) ve 3 farklı
 *     ağırlık (600·650·760). `PageHeader` bileşeni vardı ve 15 dosyada
 *     kullanılıyordu — yani uygulama başlık konusunda tam ikiye bölünmüştü.
 *
 * Bu iş TEK SEFERLİK bir temizlik olduğu için asıl risk **geri kaymak**: yeni bir
 * ekran kendi etiketini/başlığını yazar, kimse fark etmez, ayrışma yeniden başlar.
 * Test o yüzden düzeltmenin kendisini değil, DÜZELTİLMİŞ KALMASINI kilitler.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const APP = join(root, "src/app");

/**
 * Yorumları atar.
 *
 * NEDEN: aynı gün `global-error` kırmızı-kanıtı YANMADI çünkü dosyanın YORUMU da
 * `<html>` içeriyordu ve regex onu yakalıyordu — test kodu değil kendi
 * açıklamasını doğruluyordu. Kaynak-iddiası testlerinin tekrarlayan tuzağı budur.
 */
function stripComments(src: string): string {
    return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full, out);
        else if (/\.tsx?$/.test(entry)) out.push(full);
    }
    return out;
}

const FILES = walk(APP).map(f => ({ path: relative(root, f), code: stripComments(readFileSync(f, "utf8")) }));

/**
 * Elle yazılmış başlığın MEŞRU olduğu yerler — her biri ölçülerek gerekçelendirildi.
 * Listeye yeni satır eklemek bilinçli bir karar olmalı; varsayılan `PageHeader`.
 */
const HEADER_EXCEPTIONS: Record<string, string> = {
    "src/app/not-found.tsx": "uygulama kabuğu dışında, bağımsız 404 sayfası",
    "src/app/global-error.tsx": "kök hata sınırı — kendi <html>'ini kurar, uygulama bileşeni kullanamaz",
    "src/app/offline/page.tsx": "service worker'ın döndürdüğü sabit sayfa; kasten istemci mantığı yok",
    "src/app/dashboard/settings/product-types/[id]/page.tsx": "detay kahramanı: geri-kırıntı + ikon + durum çipleri",
    "src/app/dashboard/products/[id]/page.tsx": "başlığın SOLUNDA 80px ürün görseli — PageHeader satır düzeni bunu ifade edemez",
    "src/app/dashboard/developer/layout.tsx": "'Console kapalı' uyarı başlığı, sayfa başlığı değil",
    "src/app/dashboard/developer/errors/[id]/page.tsx": "<h1> bir HATA MESAJI; sarması için lineHeight 1.45",
    "src/app/dashboard/purchase/rfqs/components/RfqDocument.tsx": "baskı belgesi (marka rengi), uygulama kabuğu değil",
    "src/app/gizlilik/page.tsx": "bağımsız hukuki belge sayfası, uygulama kabuğu dışında",
    "src/app/sifre-yenile/page.tsx": "kimlik kurtarma ekranı, uygulama kabuğu dışında (login emsali)",
};

describe("GATE — form ve başlık tipografisi", () => {
    it("dosya taraması çalışıyor (boş çıkarsa aşağısı sahte-yeşil olurdu)", () => {
        expect(FILES.length).toBeGreaterThan(50);
        expect(FILES.some(f => f.path.endsWith("src/app/dashboard/page.tsx"))).toBe(true);
    });

    it("hiçbir dosya kendi etiket TİPOGRAFİSİNİ yazmaz", () => {
        const offenders = FILES
            .filter(f => /const labelStyle/.test(f.code))
            .filter(f => {
                const body = f.code.match(/const labelStyle[^=]*=\s*(\{[\s\S]*?\}|[^;]+);/)?.[1] ?? "";
                // Ortak yardımcıyı çağırmalı; çıplak fontSize/color yazamaz.
                return !/sharedLabelStyle\(\)/.test(body) || /fontSize:|color:\s*"var\(--text/.test(body);
            })
            .map(f => f.path);
        expect(offenders, `ortak yardımcıyı kullanmayan etiket: ${offenders.join(", ")}`).toEqual([]);
    });

    it("hiçbir `inputStyle` elle yazılmaz — hepsi `fieldStyle()`'dan gelir", () => {
        const offenders = FILES
            .filter(f => /const inputStyle/.test(f.code))
            .filter(f => !/const inputStyle[^=]*=\s*(\{\s*\.\.\.)?fieldStyle\(/.test(f.code))
            .map(f => f.path);
        expect(offenders, `elle yazılmış inputStyle: ${offenders.join(", ")}`).toEqual([]);
    });

    it("elle yazılmış sayfa başlığı YALNIZ belgelenmiş istisnalarda olabilir", () => {
        // `style={{ … }}` DEĞİL sadece `style={` aranıyor: bir sayfa stilini
        // `const h1Style` diye çıkarıp kuralın altından geçebilirdi (gizlilik ve
        // sifre-yenile tam bunu yapıyordu — ölçümde yakalandı).
        const found = FILES
            .filter(f => /<h1\s+style=\{/.test(f.code))
            .map(f => f.path)
            .sort();
        const allowed = Object.keys(HEADER_EXCEPTIONS).sort();
        // Yeni bir sayfa kendi başlığını yazarsa burada yakalanır ve PageHeader'a yönlenir.
        expect(found).toEqual(allowed);
    });

    it("istisna listesi gerekçesiz büyümesin", () => {
        for (const [file, reason] of Object.entries(HEADER_EXCEPTIONS)) {
            expect(reason.length, `${file} için gerekçe çok kısa`).toBeGreaterThan(25);
        }
    });

    it("`PageHeader` gerçekten benimsendi (anti-vacuous)", () => {
        const users = FILES.filter(f => /<PageHeader\b/.test(f.code)).length;
        // Göç öncesi 15'ti; bu sayı düşerse biri geri almış demektir.
        expect(users).toBeGreaterThanOrEqual(20);
    });

    it("ortak yardımcılar tek dosyada ve login referansıyla aynı", () => {
        const src = readFileSync(join(root, "src/components/ui/Input.tsx"), "utf8");
        const body = src.match(/export function labelStyle\(\): CSSProperties \{[\s\S]*?\n\}/)?.[0] ?? "";
        expect(body).toMatch(/fontSize: "11px"/);
        expect(body).toMatch(/var\(--font-label-weight\)/);
        expect(body).toMatch(/var\(--text-secondary\)/);
        // BÜYÜK HARF bilerek YOK (kullanıcı kararı: Türkçe uzun etiketlerde satır kaplar).
        expect(body).not.toMatch(/textTransform/);
        // Yerleşim taşımaz — `fieldStyle` ile aynı sözleşme.
        expect(body).not.toMatch(/marginBottom|display:/);
    });

    it("hiçbir yüzey VAR OLMAYAN CSS değişkenine başvurmaz", () => {
        // Bu kural iki gerçek kusur yakaladı (2026-08-31):
        //   · `/sifre-yenile` hata kutusu → `--danger-soft-bg` (repodaki benzer ad
        //     `--button-danger-soft-bg`, AYRI bir şey) → arka plan sessizce
        //     `transparent`a düşüyordu;
        //   · `import/excel` satır vurgusu → `--danger-rgb`, satır içi yedeği KOYU
        //     tema kırmızısıydı → aydınlık temada yanlış renk.
        // İkisi de sessiz: hata yok, uyarı yok, yalnız yanlış görünüm.
        //
        // Token'lar globals.css'te OLMAK ZORUNDA DEĞİL — `next/font` de üretir
        // (`quote-fonts.ts` → `variable: "--font-doc-body"`). O yüzden tanımlar
        // repo genelinden toplanıyor; aksi hâlde kural meşru token'ları suçlardı.
        const defined = new Set<string>();
        const collect = (src: string) => {
            for (const m of src.matchAll(/(--[a-z0-9-]+)\s*:/g)) defined.add(m[1]);
            for (const m of src.matchAll(/variable:\s*"(--[a-z0-9-]+)"/g)) defined.add(m[1]);
        };
        collect(readFileSync(join(root, "src/app/globals.css"), "utf8"));
        for (const f of walk(join(root, "src"))) collect(readFileSync(f, "utf8"));
        // Repo DIŞINDA tanımlananlar — `geist` paketi kendi değişkenlerini
        // enjekte eder (`layout.tsx` → GeistSans/GeistMono). Gerekçesiz
        // büyümesin diye liste kısa ve açık.
        for (const t of ["--font-geist-sans", "--font-geist-mono"]) defined.add(t);

        // Toplama çökerse aşağısı sahte-yeşil olurdu.
        expect(defined.size).toBeGreaterThan(50);
        expect(defined.has("--text-primary")).toBe(true);

        const missing: string[] = [];
        for (const f of FILES) {
            for (const m of f.code.matchAll(/var\((--[a-z0-9-]+)[,)]/g)) {
                if (!defined.has(m[1])) missing.push(`${f.path}: ${m[1]}`);
            }
        }
        expect(missing, `tanımsız CSS değişkeni: ${missing.join(" · ")}`).toEqual([]);
    });
});
