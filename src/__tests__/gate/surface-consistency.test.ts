/**
 * GATE: kart yüzeyi sayfa zemininden ayrışır; buton ve kategori tek dilde.
 *
 * 2026-08-31 ölçümü — beş sayfa "çalışıyor" ama kartların YÜZEYİ YOKTU:
 *
 *   · `--bg-secondary` HER İKİ TEMADA `--app-bg` ile birebir aynı renk
 *     (koyu #131518 = #131518, aydınlık #e8eef5 = #e8eef5). O token bir İÇ OYUK
 *     rengi; zeminle aynı olması TASARIM GEREĞİ doğru. Kusur, oyuk renginin
 *     yükseltilmiş KART olarak kullanılmasıydı.
 *   · Tarayıcı ölçümü (Öneriler, aydınlık): üç metrik kartının hepsi
 *     `backgroundColor: rgb(232,238,245)` = zemin, `box-shadow: none`. Tablo
 *     sarmalayıcı `rgba(0,0,0,0)` — tamamen şeffaf.
 *   · "Yenile" `variant="toolbar"` = `background: transparent` idi; ölçülen
 *     renk yine #e8eef5, yani ZEMİN. Kullanıcı "beyaz olsun" dedi.
 *   · Kategori çipleri pasifken `transparent`/`--bg-tertiary`, aktifken
 *     `--accent-bg` (%10 tint) — ne beyaz ne mavi.
 *   · Uyarılar'ın HİÇ sayfa başlığı yoktu; Veri Aktarım'ınki 14px `<div>`'di
 *     (kanonik 20px `<h1>`).
 *
 * Düzeltmenin kendisi değil, DÜZELTİLMİŞ KALMASI kilitlenir.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const read = (f: string) => readFileSync(join(root, f), "utf8");

/**
 * Yorumları atar.
 *
 * NEDEN: bu tuzağa repoda İKİ KEZ düşüldü — bir kaynak-iddiası testi dosyanın
 * KENDİ açıklamasındaki metni yakalayıp yeşil yandı. Yukarıdaki başlık yorumu
 * da aradığımız desenlerin hepsini içeriyor.
 */
function stripComments(src: string): string {
    return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const GLOBALS = read("src/app/globals.css");
const FILTER_CHIPS = stripComments(read("src/components/ui/FilterChips.tsx"));
const PAGE_HEADER = stripComments(read("src/components/ui/PageHeader.tsx"));

const CONVERTED = {
    "Öneriler": "src/app/dashboard/purchase/suggested/page.tsx",
    "Teknik Şablonlar": "src/app/dashboard/settings/product-types/page.tsx",
    "Uyarılar": "src/app/dashboard/alerts/page.tsx",
    "Veri Aktarım Merkezi": "src/app/dashboard/import/page.tsx",
    "Paraşüt": "src/app/dashboard/parasut/page.tsx",
} as const;

function themeBlock(marker: string): string {
    const i = GLOBALS.indexOf(marker);
    let depth = 0;
    for (let j = i; j < GLOBALS.length; j++) {
        if (GLOBALS[j] === "{") depth++;
        else if (GLOBALS[j] === "}") {
            depth--;
            if (depth === 0) return GLOBALS.slice(i, j);
        }
    }
    throw new Error(`blok bulunamadı: ${marker}`);
}

function tokenValue(block: string, name: string): string {
    const m = block.match(new RegExp(`${name}:\\s*([^;]+);`));
    if (!m) throw new Error(`token yok: ${name}`);
    return m[1].trim();
}

describe("GATE: yüzey + buton/kategori tutarlılığı", () => {
    it("kuralın DAYANAĞI: oyuk rengi iki temada da sayfa zeminiyle aynı", () => {
        // Bu test bir iddia değil, GEREKÇE. Biri token'ları ayırırsa buradan
        // haber alır ve "kart olarak kullanma" yasağı gevşetilebilir.
        for (const marker of [':root[data-theme="dark"] {', ':root[data-theme="light"] {']) {
            const b = themeBlock(marker);
            expect(tokenValue(b, "--bg-secondary"), marker).toBe(tokenValue(b, "--app-bg"));
            expect(tokenValue(b, "--surface-raised"), marker).not.toBe(tokenValue(b, "--app-bg"));
        }
    });

    it("dönüşen beş sayfa kart yüzeyini kanonik token/bileşenden alır", () => {
        for (const [name, file] of Object.entries(CONVERTED)) {
            const src = stripComments(read(file));
            const canonical = src.includes("var(--surface-raised)")
                || /<Card[\s>]/.test(src);
            expect(canonical, `${name}: kart yüzeyi ne Card ne --surface-raised`).toBe(true);
        }
    });

    it("üst seviye kartların sayısı korunur — sessizce oyuk rengine dönmesin", () => {
        // Ölçülen kusurun tam sayısı: Paraşüt'te 7, Öneriler'de 3 kart.
        expect((read(CONVERTED["Paraşüt"]).match(/var\(--surface-raised\)/g) ?? []).length)
            .toBeGreaterThanOrEqual(7);
        expect((read(CONVERTED["Öneriler"]).match(/var\(--surface-raised\)/g) ?? []).length)
            .toBeGreaterThanOrEqual(3);
        expect(stripComments(read(CONVERTED["Uyarılar"]))).toContain('background: "var(--surface-raised)"');
    });

    it("başlıksız sayfa kalmaz — Uyarılar ve Veri Aktarım kanonik PageHeader kullanır", () => {
        // Uyarılar'ın HİÇ <h1>'i yoktu; Veri Aktarım'ınki 14px <div>'di.
        for (const name of ["Uyarılar", "Veri Aktarım Merkezi"] as const) {
            const src = stripComments(read(CONVERTED[name]));
            expect(src, `${name}: PageHeader render EDİLMİYOR`).toMatch(/<PageHeader[\s\n]/);
            expect(src, `${name}: elle küçük başlık geri gelmiş`)
                .not.toMatch(/fontSize:\s*"14px",\s*fontWeight:\s*600,\s*color:\s*"var\(--text-primary\)"/);
        }
    });

    it("Yenile BEYAZ — şeffaf toolbar'a geri dönmez", () => {
        const refresh = PAGE_HEADER.slice(PAGE_HEADER.indexOf("{onRefresh &&"));
        expect(refresh).toContain('variant="secondary"');
        expect(refresh).not.toContain('variant="toolbar"');
    });

    it("FilterChips kendi rengini YAZMAZ — paleti Button'dan alır", () => {
        // Ayrışacak ikinci bir palet doğmasın: çip ile buton tek kaynak.
        expect(FILTER_CHIPS).toContain('variant={active ? "primary" : "secondary"}');
        expect(FILTER_CHIPS).not.toMatch(/background:\s*"var\(--accent-bg\)"/);
        expect(FILTER_CHIPS).not.toMatch(/background:\s*"transparent"/);
    });

    it("tek çip dili — FİLTRE sekmesi yalnız FilterChips'ten gelir", () => {
        // Sınır bir whitelist değil, gerçek bir ayrım: `aria-controls` taşıyan
        // `role="tab"` bir PANEL DEĞİŞTİRİCİDİR (ürün detayındaki Genel/Teknik
        // sekmeleri gibi) — listeyi süzmez, içerik bölmesi değiştirir ve alt
        // çizgili kalması doğrudur. `aria-controls`'suz olan ise bir filtredir
        // ve ortak çipten gelmelidir.
        const walk = (dir: string, out: string[] = []): string[] => {
            for (const e of readdirSync(dir)) {
                const full = join(dir, e);
                if (e === "__tests__") continue;
                if (statSync(full).isDirectory()) walk(full, out);
                else if (/\.tsx$/.test(e)) out.push(full);
            }
            return out;
        };
        const offenders = walk(join(root, "src"))
            .filter(f => !f.endsWith("FilterChips.tsx"))
            .filter(f => {
                const src = stripComments(readFileSync(f, "utf8"));
                return /role="tab"/.test(src) && !/aria-controls=/.test(src);
            })
            .map(f => relative(root, f));
        expect(offenders).toEqual([]);
    });
});
