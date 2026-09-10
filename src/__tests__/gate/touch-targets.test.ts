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
import { readFileSync, readdirSync, statSync } from "node:fs";
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

/**
 * Mobil CSS'i `{ seçiciler, gövde }` kurallarına ayırır (iç içe blok yok).
 *
 * YORUMLAR BÖLMEDEN ÖNCE SOYULUR. İlk sürüm önce virgülle bölüp SONRA her
 * parçadan yorum soyuyordu; virgül İÇEREN çok satırlı bir gerekçe yorumu
 * parçalara ayrılınca hiçbir parça tam bir `/* … *\/` taşımıyor, dolayısıyla
 * soyulmuyor ve seçici listesine yapışıyordu. Sonuç: yorumdan hemen sonra
 * gelen kural `sels.includes(".x")` ile HİÇ BULUNAMIYOR — kuralın kendisi
 * doğru, ölçüm aracı kör. (2026-09-10'da iki yeni kural bunu ortaya çıkardı.)
 */
function rules(source: string): { sels: string[]; body: string }[] {
    const clean = source.replace(/\/\*[\s\S]*?\*\//g, "");
    const out: { sels: string[]; body: string }[] = [];
    for (const m of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const sels = m[1].split(",").map((x) => x.trim()).filter(Boolean);
        out.push({ sels, body: m[2] });
    }
    return out;
}
const MOBILE_RULES = rules(MOBILE_CSS);

/** `.tsx` dosyalarını toplar (testler hariç). */
function walkTsx(dir: string, out: string[]): string[] {
    for (const e of readdirSync(dir)) {
        if (e === "__tests__") continue;
        const full = join(dir, e);
        if (statSync(full).isDirectory()) walkTsx(full, out);
        else if (/\.tsx$/.test(e)) out.push(full);
    }
    return out;
}

/** Yorum soyucu — kural kendi gerekçesine takılmasın (deponun 6 kez tekrarlanan tuzağı). */
function stripSrcComments(src: string): string {
    return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

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

    // ── 2026-09-10 ölçüm turu ──────────────────────────────────────────────
    //
    // 390×844 / 2 tema / 29 rota: **1664 kontrolün 584'ü** 44px'in altındaydı.
    // Kayıtlı "36 kontrol" notu bayattı ve asıl aile hiç görülmemişti, çünkü
    // ÖLÇÜM ÇEKMECE KAPALIYKEN yapılıyordu.
    it("gezinme rayı — uygulamanın EN ÇOK dokunulan yüzeyi kapsamda", () => {
        // Ölçüm (mobil çekmece AÇIK): 16 bağlantının hepsi 222×**36**,
        // `::after` YOK. `.nav-rail-item` 2026-08-31'deki seçici listesine hiç
        // girmemişti.
        const positioned = MOBILE_RULES.some(
            r => r.sels.includes(".nav-rail-item") && /position:\s*relative/.test(r.body),
        );
        const hasBox = MOBILE_RULES.some(
            r => r.sels.includes(".nav-rail-item::after") && /content:\s*""/.test(r.body),
        );
        expect(positioned, ".nav-rail-item için position: relative yok").toBe(true);
        expect(hasBox, ".nav-rail-item::after kutusu yok").toBe(true);

        // Kutu TEK BAŞINA yetmez: bir gruptaki bağlantılar bitişik duruyor.
        // 36px satıra 44px kutu → her satır 4'er px taşar → komşusuyla 8px
        // ÜST ÜSTE biner ve DOM'da sonra gelen kazanır. Boşluk bu yüzden açıldı.
        const gap = MOBILE_RULES.find(r => r.sels.includes(".nav-rail-group"));
        expect(gap, ".nav-rail-group mobil kuralı yok — kutular üst üste biner").toBeTruthy();
        expect(gap!.body, "satır aralığı 8px'in altında → görünür alan çalınır")
            .toMatch(/gap:\s*8px/);

        // Düzen CSS'te; iki tüketici de kendi boşluğunu YAZMAZ.
        const sidebar = readFileSync(join(root, "src/components/layout/Sidebar.tsx"), "utf8");
        expect(sidebar, "Sidebar grup sarmalayıcısı ortak sınıfı taşımıyor")
            .toContain('className="nav-rail-group"');
    });

    it("ortak bileşenler kendi hit-area garantisini TAŞIR", () => {
        // Tek dosya, çok yüzey — kaldıraç merkezde.
        const CENTRAL: [string, string, string][] = [
            ["src/components/ui/Pagination.tsx", "tap-44", "sayfalama düğmeleri 32×32'ydi"],
            ["src/components/ui/Toast.tsx", "tap-44", "kapat düğmesi ~18px, aksiyon bağlantısı dolgusuz"],
        ];
        for (const [file, needle, why] of CENTRAL) {
            expect(readFileSync(join(root, file), "utf8"), `${file}: ${why}`).toContain(needle);
        }
        // Sayfalama numaraları YAN YANA: 32px + 44px kutu → 12px aralık şart.
        //
        // İDDİA SINIRA BAĞLI: ilk yazımda yalnız `gap: "12px"` aranıyordu ve
        // dosyada BAŞKA bir 12px daha var (dış `<nav>`). Numara satırının
        // aralığını 4px'e düşürdüm, kural YEŞİL kaldı — desen komşusuna
        // tutunuyordu. (Deponun tekrarlayan dersi, 6. kez.)
        const pagination = readFileSync(join(root, "src/components/ui/Pagination.tsx"), "utf8");
        const buttonRow = pagination.match(/<div style=\{\{[^}]*\}\}>\s*\n\s*<PageButton/)?.[0] ?? "";
        expect(buttonRow, "numara satırının sarmalayıcısı bulunamadı — kural boşa düştü").not.toBe("");
        expect(buttonRow, "numara satırı aralığı daraltılmış — 44px kutular çakışır")
            .toMatch(/gap:\s*"12px"/);
    });

    it("checkbox/radio ailesi kapsamda — `::after` bu elemanda ÇALIŞIR (ölçüldü)", () => {
        // Plan `::after`in replaced element'te çalışmadığını VARSAYIYORDU ve
        // sarmalayıcı `<label>` öngörüyordu. Tarayıcıda `elementFromPoint` ile
        // ölçüldü: 14px'lik kutunun merkezinden 20px aşağıdaki tıklama HÂLÂ
        // input'a düşüyor → sınıf doğrudan elemana verilebiliyor.
        // *Bir varsayım, ölçülene kadar plandır.*
        // ETİKET ÇIKARIMI DENGELİ, SINIRLI DEĞİL: ilk yazım `<input[\s\S]{0,400}?\/>`
        // kullanıyordu ve bu desen dosyalarda **SIFIR** eşleşme üretiyordu —
        // gerçek `<input>` etiketleri (ref/onChange/onClick/style/aria-label
        // ile) 400 karakteri aşıyor. Yani kural boş bir kümeyi denetliyor,
        // her mutasyonda yeşil kalıyordu. Ölçü aracı da bir bulgudur.
        const files = walkTsx(join(root, "src/app"), []).concat(walkTsx(join(root, "src/components"), []));
        const missing: string[] = [];
        let scanned = 0;
        for (const f of files) {
            const src = readFileSync(f, "utf8");
            for (const m of src.matchAll(/<input\b/g)) {
                // `{}` derinliğini sayarak etiketi kapatan `>`ı bul.
                let depth = 0;
                let end = -1;
                for (let i = m.index!; i < src.length; i++) {
                    const c = src[i];
                    if (c === "{") depth++;
                    else if (c === "}") depth--;
                    else if (c === ">" && depth === 0) { end = i; break; }
                }
                if (end === -1) continue;
                const tag = src.slice(m.index!, end + 1);
                if (!/type="(checkbox|radio)"/.test(tag)) continue;
                scanned++;
                if (!/tap-44/.test(tag)) missing.push(`${f.replace(root + "/", "")} :: ${tag.slice(0, 70).replace(/\s+/g, " ")}`);
            }
        }
        expect(scanned, "hiç seçim kutusu taranmadı — kural sahte-yeşil").toBeGreaterThanOrEqual(30);
        expect(missing, `44px'e bağlanmamış seçim kutusu: ${missing.join(" | ")}`).toEqual([]);
    });

    it("Developer Console kapsamda — sınıf sayısı SIFIR değil", () => {
        // §A5: konsolun altı sayfası iki turda kapsam dışı bırakılmıştı ve
        // `tap-44` ailesi orada SIFIRDI. `console-ui.ts` yerleşimi
        // merkezîleştiriyor ama KONTROLLERİ değil.
        const consoleFiles = walkTsx(join(root, "src/app/dashboard/developer"), []);
        expect(consoleFiles.length, "konsol dosyaları bulunamadı").toBeGreaterThan(5);

        // SAYI DEĞİL KÜME: ilk yazım "en az bir dosya tap-44 taşısın" diyordu
        // ve sekme şeridinin sınıfı silinince YEŞİL kaldı — başka bir dosya
        // sayıyı doldurmaya yetiyordu. Deponun kendi dersi (2026-09-04):
        // *kaynak-kilidi testi "en az N tane olmalı" DEMEMELİ*; o iddia
        // değişmezi değil o günkü sayıyı kilitler. Ölçümde 44'ün altında
        // çıkan HER kontrol adıyla kilitli.
        const CONSOLE_CONTROLS: [string, string][] = [
            ["src/app/dashboard/developer/layout.tsx", "sekme şeridi (6 bağlantı, ölçüm 69–98×35.5)"],
            ["src/app/dashboard/developer/logs/page.tsx", "'temizle' + requestId düğmeleri"],
            ["src/app/dashboard/developer/errors/[id]/page.tsx", "bug başlığı bağlantısı"],
        ];
        // `stripSrcComments` ZORUNLU: bu dosyaların gerekçe yorumları
        // "…`tap-44` ailesinde değildi" gibi cümleler içeriyor. Yorum
        // soyulmadan kural KENDİ AÇIKLAMASINA tutunuyor ve sınıf silinse bile
        // yeşil kalıyor — depoda bu tuzağa YEDİNCİ düşüş (ölçüldü: K14'ün ilk
        // kırmızı-kanıt turu bu yüzden yanmadı).
        for (const [rel, why] of CONSOLE_CONTROLS) {
            expect(stripSrcComments(readFileSync(join(root, rel), "utf8")), `${rel}: ${why} kapsam dışı`)
                .toMatch(/className="tap-44(-v)?"/);
        }
        // "Tümü →" ortak `.row-link` sınıfına geçti (o sınıf zaten hit-area listesinde).
        expect(stripSrcComments(readFileSync(join(root, "src/app/dashboard/developer/page.tsx"), "utf8")),
            "konsol 'Tümü →' bağlantısı ortak row-link'ten beslenmiyor")
            .toMatch(/className="row-link"/);

        // Sekme şeridi SARMAZ — sarsaydı 44px kutular alt satırın görünür
        // alanına girerdi (2026-09-04: çözüm CSS yaması değil YERLEŞİM).
        const layout = readFileSync(join(root, "src/app/dashboard/developer/layout.tsx"), "utf8");
        expect(layout, "konsol sekme şeridi sarıyor — hit alanları çakışır")
            .toMatch(/flexWrap:\s*"nowrap"/);
        expect(layout, "şerit kendi kabında kaymıyor").toContain("tab-strip-scroll");
        expect(css, ".tab-strip-scroll kuralı globals.css'te yok").toMatch(/\.tab-strip-scroll\s*\{/);
    });

    it("sarabilen kontrol satırları için satır aralığı yardımcısı var ve kullanılıyor", () => {
        // Ölçüm: 44px kutu, kontrolün kendi yüksekliğinin üstüne taşar (xs için
        // 9px). Satır aralığı bundan küçükse alttaki satırın kutusu üsttekinin
        // GÖRÜNÜR dikdörtgenine girer ve tıklamayı çalar.
        const rule = MOBILE_RULES.find(r => r.sels.includes(".tap-wrap-row"));
        expect(rule, ".tap-wrap-row kuralı yok").toBeTruthy();
        expect(rule!.body, "satır aralığı en küçük boyu (xs=26px) 44'e taşımıyor")
            .toMatch(/row-gap:\s*18px/);
        // Anti-vacuous: sınıfın gerçek tüketicisi olmalı.
        const users = walkTsx(join(root, "src/app"), [])
            .concat(walkTsx(join(root, "src/components"), []))
            .filter(f => /tap-wrap-row/.test(readFileSync(f, "utf8")));
        expect(users.length, ".tap-wrap-row hiç kullanılmıyor — kural boşa düştü")
            .toBeGreaterThanOrEqual(4);
    });

    it("geri gezinme TEK bileşenden — elle yazılmış kırıntı bağlantısı kalmadı", () => {
        // Ölçüm: BEŞ lehçe / 11 yüzey; dördü 44px tabanının altındaydı
        // (`← Teklifler` 65.3×**16**). Kullanıcı kararı: buton dili kazanır.
        const back = readFileSync(join(root, "src/components/ui/BackLink.tsx"), "utf8");
        expect(back, "BackLink paletini Button'dan almıyor").toMatch(/ButtonLink/);
        expect(back, "BackLink kendi rengini yazıyor").not.toMatch(/color:\s*"var\(--/);

        const offenders: string[] = [];
        for (const f of walkTsx(join(root, "src/app/dashboard"), [])) {
            const src = stripSrcComments(readFileSync(f, "utf8"));
            // `←` ile başlayan bir <Link> = elle yazılmış kırıntı.
            for (const m of src.matchAll(/<Link[\s\S]{0,400}?<\/Link>/g)) {
                if (/←\s*[A-ZÇĞİÖŞÜ]/.test(m[0])) offenders.push(f.replace(root + "/", ""));
            }
        }
        expect([...new Set(offenders)], `elle yazılmış geri bağlantısı: ${offenders.join(", ")}`)
            .toEqual([]);
    });

    it("demo bandosunun kapat düğmesi erişilebilir (envanterin en kötüsüydü: 13×14)", () => {
        const banner = readFileSync(join(root, "src/components/ui/DemoBanner.tsx"), "utf8");
        expect(banner).toMatch(/aria-label="Bildirimi kapat"/);
        expect(banner).toMatch(/type="button"/);
    });
});
