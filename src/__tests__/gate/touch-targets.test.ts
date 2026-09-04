/**
 * GATE: dokunma hedefleri (mobil).
 *
 * 2026-08-31 ölçümü (iPhone 14 emülasyonu, 10 rota + çekmece açık): **35 kontrolün
 * en küçük kenarı 32px'in altındaydı** — en kötüsü demo bandosunun `×` düğmesi
 * (13×14) ve teklif satırındaki not/sil düğmeleri (22×22).
 *
 * Çözüm görsel büyütme DEĞİL: `::after` ile görünmez hit-area. Bu yüzden hiçbir
 * ekran görüntüsü testi bunu koruyamaz — kural CSS'te bir yerde ve sessizce
 * silinebilir. Testler o yüzden burada.
 *
 * İki iddia sınıfı var ve ikincisi daha kritik:
 *  1. Kuralların VARLIĞI (yardımcılar, bileşenlerin sınıfı taşıması).
 *  2. **Üst üste binme koruması.** İki küçük kontrol yan yanaysa ikisini de 44px'e
 *     genişletmek hit alanlarını çakıştırır ve DOM'da SONRA gelen kazanır. Teklif
 *     satırında bu çift not|sil — yani yıkıcı düğme komşusunun alanını yutar.
 *     Boşluk kuralları (topbar 16px, q-note-btn 24px) bunun tek savunması ve
 *     "gereksiz görünen bir margin" diye silinmeye açıklar.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const css = readFileSync(join(root, "src/app/globals.css"), "utf8");
const button = readFileSync(join(root, "src/components/ui/Button.tsx"), "utf8");

/** `@media (max-width: 768px) { … }` bloklarını dengeli parantezle çıkarır. */
function mobileBlocks(source: string): string[] {
    const out: string[] = [];
    const re = /@media \(max-width: 768px\) \{/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) {
        let depth = 1;
        let i = m.index + m[0].length;
        const start = i;
        while (i < source.length && depth > 0) {
            if (source[i] === "{") depth++;
            else if (source[i] === "}") depth--;
            i++;
        }
        out.push(source.slice(start, i - 1));
    }
    return out;
}

const MOBILE = mobileBlocks(css);
const MOBILE_CSS = MOBILE.join("\n");

/** Mobil CSS'i `{ seçiciler, gövde }` kurallarına ayırır (iç içe blok yok). */
function rules(source: string): { sels: string[]; body: string }[] {
    const out: { sels: string[]; body: string }[] = [];
    for (const m of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const sels = m[1].split(",").map((x) => x.replace(/\/\*[\s\S]*?\*\//g, "").trim()).filter(Boolean);
        out.push({ sels, body: m[2] });
    }
    return out;
}
const MOBILE_RULES = rules(MOBILE_CSS);

describe("GATE — dokunma hedefleri", () => {
    it("mobil blok çıkarımı çalışıyor (boş çıkarsa aşağıdaki her iddia sahte-yeşil olurdu)", () => {
        expect(MOBILE.length).toBeGreaterThanOrEqual(3);
        expect(MOBILE_CSS.length).toBeGreaterThan(500);
    });

    it("`.tap-44` ve `.tap-44-v` yardımcıları YALNIZ dar ekranda tanımlı", () => {
        expect(MOBILE_CSS).toMatch(/\.tap-44\b/);
        expect(MOBILE_CSS).toMatch(/\.tap-44-v\b/);
        expect(MOBILE_CSS).toMatch(/min-height: 44px/);
        expect(MOBILE_CSS).toMatch(/min-width: 44px/);
        // Masaüstünde imleç zaten hassas — kural dışarı sızmamalı.
        const outside = css.split("@media (max-width: 768px)")[0];
        expect(outside).not.toMatch(/\.tap-44/);
    });

    it("hit-area kutusu ortalanmış ve görsel boyutu DEĞİŞTİRMİYOR", () => {
        // `width/height: 100%` + `min-*: 44px` → yalnız KISA eksende büyür.
        // Bunun yerine elemana doğrudan min-height verilseydi düzen kayardı ve
        // 70/70 taşmasızlık sonucu geçersizleşirdi.
        expect(MOBILE_CSS).toMatch(/content: ""/);
        expect(MOBILE_CSS).toMatch(/position: absolute/);
        expect(MOBILE_CSS).toMatch(/transform: translate\(-50%, -50%\)/);
        expect(MOBILE_CSS).toMatch(/width: 100%/);
        expect(MOBILE_CSS).toMatch(/height: 100%/);
    });

    it("`Button` sınıfı yayıyor ve çağıranın className'ini EZMİYOR", () => {
        // `...rest` <button>'a yayılıyor; className rest'te kalsaydı bu sınıfı ezerdi.
        expect(button).toMatch(/className,\s*\n\s*\.\.\.rest/);
        expect(button).toMatch(/className \? `tap-44 \$\{className\}` : "tap-44"/);
        // ::after mutlak konumlanabilsin diye:
        expect(button).toMatch(/position: "relative"/);
        // İki render yolu da (Button + ButtonLink) kapsanmalı.
        expect(button.match(/`tap-44 \$\{className\}`/g)?.length).toBe(2);
    });

    it("hover'a bağlı satır eylemleri mobilde görünür, masaüstünde hover'da KALIYOR", () => {
        // Dokunmatikte hover yok: bu kural olmadan Teklifler/Siparişler listelerinde
        // SİL düğmesi telefonda hiç görünmez (2026-08-31 ölçümü: opaklık 0).
        expect(MOBILE_CSS).toMatch(/\.erp-data-table tbody tr \.row-reveal \{\s*opacity: 1/);
        // Masaüstü davranışı korunmalı — mobil kural onun yerine GEÇMEMELİ.
        expect(css).toMatch(/\.erp-data-table tbody tr:hover \.row-reveal \{\s*opacity: 1/);
        expect(css).toMatch(/\.erp-data-table tbody tr \.row-reveal \{\s*opacity: 0/);
    });

    it("ÜST ÜSTE BİNME koruması: bitişik küçük kontrollerin boşlukları yeterli", () => {
        // Tema (30px) + profil (30px) yan yana, ikisi de tap-44 → her biri 7px taşar.
        // 8px boşlukta 6px çakışırlardı; profil DOM'da sonra geldiği için temanın
        // alanını yutardı.
        expect(MOBILE_CSS).toMatch(/\.topbar-right \{\s*gap: 16px/);
        // Teklif satırı not|sil: 22×22, her biri 11px taşar → 24px boşluk gerekir.
        expect(MOBILE_CSS).toMatch(/\.q-note-btn \{\s*margin-right: 24px !important/);
        // Sarmalayan çip satırları: 30px çip 44'e çıkınca 7px yukarı/aşağı taşar;
        // 6px satır aralığında alttaki satır üsttekinin alanını yerdi (ölçümde
        // eskime filtresi 44 yerine 36'da kalmıştı).
        // 2026-09-04: sarma kaynaklı çakışma artık CSS yamasıyla DEĞİL, yerleşimle
        // önleniyor. Tek çip-satırı üreticisi `FilterChips` ve o sarmıyor:
        // `nowrap` + `overflow-x: auto` → ikinci satır hiç oluşmaz. Ölçüm
        // (390px, eskime filtresi): 6/6 çip 44×44, gövde taşması 0.
        const filterChips = readFileSync(join(root, "src/components/ui/FilterChips.tsx"), "utf8");
        expect(filterChips, "FilterChips sarmamalı — sararsa satırlar hit alanını yer")
            .toMatch(/flexWrap:\s*"nowrap"/);
        expect(filterChips).toMatch(/overflowX:\s*"auto"/);
    });

    it("ölçümde kritik çıkan her aile bir kurala bağlanmış", () => {
        // Bu liste 2026-08-31 envanterinden geliyor; bir yüzey sessizce çıkarılırsa
        // o aile 44px altına geri döner ve kimse fark etmez.
        // `toContain` YETMEZ: bir seçici yalnız `::after` listesinde kalırsa kural
        // sessizce bozulur — kutu, uzaktaki bir ataya göre konumlanır. Bu yüzden
        // HER İKİ tarafı da ayrı ayrı aranıyor. (Gevşek sürüm enjekte edilen
        // regresyonda yanmadı; kural bu yüzden sertleştirildi.)
        for (const sel of [".hamburger-btn", ".topbar-brand", ".field-link", ".row-link", ".seg button"]) {
            const positioned = MOBILE_RULES.some(
                (r) => r.sels.includes(sel) && /position:\s*relative/.test(r.body),
            );
            // Kutuyu YARATAN kural aranıyor (`content` olmadan ::after hiç
            // render edilmez). Yalnız `${sel}::after` aramak yetmiyordu: ikinci
            // bir ::after bloğu (min-width) seçiciyi maskeleyip testi yeşil
            // tutuyordu — enjekte edilen regresyonda görüldü.
            const hasBox = MOBILE_RULES.some(
                (r) => r.sels.includes(`${sel}::after`) && /content:\s*""/.test(r.body),
            );
            expect(positioned, `${sel} için position: relative yok`).toBe(true);
            expect(hasBox, `${sel}::after kutusu yok`).toBe(true);
        }
        const files: [string, string][] = [
            ["src/components/layout/ThemeToggle.tsx", "tap-44"],
            ["src/components/layout/UserAvatarLink.tsx", "tap-44"],
            ["src/components/ui/DemoBanner.tsx", "tap-44"],
            ["src/app/dashboard/layout.tsx", "tap-44-v"],
            ["src/app/dashboard/products/page.tsx", "tap-44"],
            // Eskime filtresi `FilterChips`e geçti; `tap-44`ü artık `Button` veriyor.
            ["src/app/dashboard/products/aging/page.tsx", "FilterChips"],
            ["src/app/dashboard/quotes/_components/QuoteForm.tsx", "q-note-btn"],
        ];
        for (const [file, needle] of files) {
            expect(readFileSync(join(root, file), "utf8")).toContain(needle);
        }
    });

    // ── §A7 (2026-09-04): dar ekranda YATAY TAŞMA ──────────────────────────
    //
    // Ölçüm (360/390px × 2 tema × 30 rota): BEŞ rota gövdeyi itiyordu —
    // Satın Alma Siparişleri 386 · Veri Aktarım Merkezi 383 · Excel Aktarım
    // Sihirbazı 396 · E-posta Teslimatları 378 · Developer Console 371.
    // Sıralama tesadüf değil: hepsi ÜST BARDAKİ SAYFA BAŞLIĞININ uzunluğu.
    //
    // Sebep: `.dashboard-grid` dar ekranda tek kolon (`1fr`) ve bir ızgara
    // kolonunun otomatik minimumu `auto`dur → kolon, çocuklarının MIN-CONTENT'i
    // kadar taban alır. Başlık `white-space: nowrap` taşıyor ve `overflow:
    // hidden` min-content'i KÜÇÜLTMEZ; `<main>`de `minWidth: 0` vardı,
    // `.topbar-wrapper`da YOKTU → kolon başlık kadar genişliyor, üç noktalı
    // kısaltma hiç devreye girmiyordu.
    //
    // Not: ilk teşhis (`.topbar-right`in `flex-shrink: 0`ı + döviz ticker'ı)
    // YANLIŞTI — o küme ≤768px'te zaten `display: none` ve yalnız 76px.
    it("ızgara çocukları min-content'lerini kolona dayatamaz (§A7 yatay taşma)", () => {
        const layout = readFileSync(join(root, "src/app/dashboard/layout.tsx"), "utf8");

        // İki ızgara çocuğu da alt sınırını serbest bırakmalı — biri unutulursa
        // kolon o çocuğun min-content'ine kilitlenir ve gövde yeniden taşar.
        expect(layout, "topbar sarmalayıcısı min-width:0 taşımalı")
            .toMatch(/className="topbar-wrapper"[\s\S]{0,120}minWidth: 0/);
        expect(layout, "<main> min-width:0 taşımalı")
            .toMatch(/<main[\s\S]{0,400}minWidth: 0/);

        // Serbest bırakılan alt sınırın karşılığı: başlık gerçekten KISALIYOR.
        // Bu üç bildirim olmadan başlık kısalmaz, kırpılır ya da taşar.
        const titleRule = css.match(/\.topbar-page-title \{([^}]*)\}/)?.[1] ?? "";
        expect(titleRule, ".topbar-page-title kuralı bulunamadı").not.toBe("");
        expect(titleRule).toMatch(/min-width:\s*0/);
        expect(titleRule).toMatch(/overflow:\s*hidden/);
        expect(titleRule).toMatch(/text-overflow:\s*ellipsis/);
    });

    it("demo bandosunun kapat düğmesi erişilebilir (envanterin en kötüsüydü: 13×14)", () => {
        const banner = readFileSync(join(root, "src/components/ui/DemoBanner.tsx"), "utf8");
        expect(banner).toMatch(/aria-label="Bildirimi kapat"/);
        expect(banner).toMatch(/type="button"/);
    });
});
