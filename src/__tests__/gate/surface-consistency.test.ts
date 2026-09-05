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

/** `src/` altındaki tüm .tsx dosyaları (testler hariç). */
function walkSrc(dir: string = join(root, "src"), out: string[] = []): string[] {
    for (const e of readdirSync(dir)) {
        const full = join(dir, e);
        if (e === "__tests__") continue;
        if (statSync(full).isDirectory()) walkSrc(full, out);
        else if (/\.tsx$/.test(e)) out.push(full);
    }
    return out;
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

    it("üst seviye kartlar oyuk rengine dönemez — YAPI iddiası, sayı değil", () => {
        // 2026-09-05'te YENİDEN YAZILDI. Eski hâli sayaçtı (`Paraşüt >= 7`,
        // `Öneriler >= 3`) ve yorumu bile "Ölçülen kusurun tam sayısı" diyordu —
        // yani deponun kendi dersinin ("`>= N` o günün sayısını kilitler,
        // DEĞİŞMEZİ değil") karşı örneğiydi. `Stat` çıkarımı Öneriler'in ÜÇ
        // literalinin ÜÇÜNÜ DE sildi (hepsi stat kutusuydu) ve Paraşüt'ü 7'den
        // 6'ya indirdi — kural, düzeltmeyi kusur sandı.
        //
        // Ayrıca eski hâli `read()` çağırıyordu, `stripComments` YOKTU: bir
        // yorumdaki `var(--surface-raised)` metni iddiayı yeşil tutabilirdi.
        //
        // Yerine geçen iddia: bu sayfaların yükseltilmiş yüzeyi KANONİK
        // kaynaktan gelir (`Card` · `Stat` · `--surface-raised`) ve hiçbiri
        // oyuk rengini (`--bg-secondary`) kutu zemini olarak yazmaz.
        for (const [name, file] of Object.entries(CONVERTED)) {
            const src = stripComments(read(file));
            const canonical = /<Card[\s>]/.test(src) || /<Stat[\s>]/.test(src)
                || src.includes("var(--surface-raised)");
            expect(canonical, `${name}: yükseltilmiş yüzey kanonik kaynaktan gelmiyor`).toBe(true);
            // Negatif iddia STAT İMZASINA bağlı: oyuk zemin + YAKININDA büyük
            // bir sayı. Salt "oyuk zeminli yuvarlak kutu" araması sekme
            // şeridini, tablo sarmalayıcısını ve çekmece içi bölüm kutusunu da
            // yakalıyordu — onlar bu turun konusu değil ve kural iddia
            // ettiğinden fazlasını söylememeli.
            expect(src, `${name}: görünmez stat kutusu geri geldi`)
                .not.toMatch(/background: "var\(--bg-secondary\)"[\s\S]{0,400}?fontSize: "(1[89]|2\d)px"/);
        }
    });

    it("sayı kutusu yüzeyleri oyuk rengini kutu zemini yapamaz", () => {
        // Ölçülen kusur: BEŞ stat yüzeyi (`aging` · `products/[id]` ·
        // `import/excel` · `CustomerDetailPanel` · `VendorDetailPanel`) kutu
        // zemini olarak `--bg-secondary` kullanıyordu — yukarıdaki "kuralın
        // DAYANAĞI" testinin kanıtladığı gibi iki temada da sayfa zeminiyle
        // BİREBİR aynı renk, yani GÖRÜNMEZ KUTU. Kapı bu kusuru 2026-08-31'de
        // bulmuştu ama yalnız beş sayfalık bir allowlist üzerinde; bu beşi
        // listenin dışında kaldığı için o günden beri kusurluydular.
        const STAT_SURFACES = [
            "src/app/dashboard/products/aging/page.tsx",
            "src/app/dashboard/products/[id]/page.tsx",
            "src/app/dashboard/import/excel/page.tsx",
            "src/components/customers/CustomerDetailPanel.tsx",
            "src/components/vendors/VendorDetailPanel.tsx",
            "src/app/dashboard/parasut/page.tsx",
            "src/app/dashboard/production/page.tsx",
            "src/app/dashboard/purchase/suggested/page.tsx",
            "src/app/dashboard/purchase/orders/[id]/page.tsx",
            "src/app/dashboard/settings/email-deliveries/page.tsx",
            "src/app/dashboard/settings/product-types/page.tsx",
            "src/app/dashboard/settings/product-types/[id]/page.tsx",
            "src/components/alerts/AlertCalendarDrawer.tsx",
            "src/components/developer/ConsoleWidgets.tsx",
        ];
        for (const rel of STAT_SURFACES) {
            const src = stripComments(read(rel));
            expect(src, `${rel}: ortak Stat'tan beslenmiyor`).toMatch(/from "@\/components\/ui\/Stat"/);
            // Kendi kutu yüzeyini geri yazamaz — imza: oyuk zemin + büyük sayı.
            expect(src, `${rel}: görünmez stat kutusu geri geldi`)
                .not.toMatch(/background: "var\(--bg-secondary\)"[\s\S]{0,400}?fontSize: "(1[89]|2\d)px"/);
        }
    });

    it("değer tipografisi ve ton haritası TEK kaynakta", () => {
        const stat = stripComments(read("src/components/ui/Stat.tsx"));
        // Kanonik değer ölçeği — ölçümde 20 ayrı tipografi vardı.
        expect(stat).toMatch(/fontSize: "21px"/);
        expect(stat).toMatch(/var\(--font-heading-weight\)/);
        // Izgarada alt alta duran sayılar hizalanmalı; yüzeylerin çoğunda yoktu.
        expect(stat).toMatch(/fontVariantNumeric: "tabular-nums"/);
        // Yüzey `Card`tan gelir — üçlüyü ikinci kez yazmaz.
        expect(stat).toMatch(/from "@\/components\/ui\/Card"/);
        expect(stat).not.toMatch(/var\(--surface-raised\)|var\(--surface-shadow-sm\)/);
        // BÜYÜK HARF YOK: `form-consistency` kanonik etiketi böyle kilitliyor.
        expect(stat).not.toMatch(/textTransform/);

        // Ton→token eşlemesi DÖRT kopyadaydı (`Badge` · `ConsoleWidgets` ·
        // `StatsCards` · `KpiCard`); üçü ortak kaynağa bağlandı.
        expect(stat).toMatch(/TONE_TOKENS/);
        // Üçü de ortak kaynağa bağlı: ikisi doğrudan, `ConsoleWidgets` ise
        // `Stat` üzerinden (kendi `VALUE_COLOR` kopyası silindi).
        for (const rel of [
            "src/components/dashboard/StatsCards.tsx",
            "src/components/dashboard/overview/KpiCard.tsx",
        ]) {
            expect(stripComments(read(rel)), `${rel}: ortak ton haritasına bağlı değil`)
                .toMatch(/TONE_TOKENS/);
        }
        const widgets = stripComments(read("src/components/developer/ConsoleWidgets.tsx"));
        expect(widgets).toMatch(/from "@\/components\/ui\/Stat"/);
        expect(widgets, "VALUE_COLOR kopyası geri geldi").not.toMatch(/VALUE_COLOR/);
        // Kopyanın imzası: AYNI sözlükte success + warning + danger üçlüsü bir
        // arada. Koşullu tek renk (`danger ? x : y`) kopya değildir; alan
        // anlamı taşıyan `HEALTH_COLOR` da değil (dördüncü anahtarı `unknown`
        // ve ton değil SERVİS DURUMU eşliyor).
        const copyPattern = /\{[^{}]*"var\(--success-text\)"[^{}]*"var\(--warning-text\)"[^{}]*"var\(--danger-text\)"[^{}]*\}/;
        for (const f of walkSrc()) {
            const rel = relative(root, f);
            if (rel.endsWith("Badge.tsx") || rel.endsWith("ConsoleWidgets.tsx")) continue;
            expect(copyPattern.test(stripComments(readFileSync(f, "utf8"))), `${rel}: ton haritası kopyası`).toBe(false);
        }
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
        // KURALIN BİLİNEN SINIRI: `role="tab"` taşımayan elle örülmüş bir çip
        // satırı buradan kaçar — 2026-08-31'de RFQ sayfasında tam olarak bu oldu
        // ve ancak 390px mobil turunda dokunma hedefi ölçümüyle görüldü.
        // "Aktiflikle zemini değişen her buton çiptir" diye genelleştirmek
        // DENENDİ ve geri alındı: dosya-bırakma alanlarını, açma/kapama
        // anahtarlarını ve kategori kutucuklarını da yakalıyordu (5 yanlış
        // pozitif). Gürültülü kural kapatılır. Kapsama yerine
        // `filter-chips-source.test.ts`'teki POZİTİF benimseme listesiyle
        // sağlanıyor: bilinen her filtre yüzeyi orada tek tek kilitli.
        //
        // Sınır bir whitelist değil, gerçek bir ayrım: `aria-controls` taşıyan
        // `role="tab"` bir PANEL DEĞİŞTİRİCİDİR (ürün detayındaki Genel/Teknik
        // sekmeleri gibi) — listeyi süzmez, içerik bölmesi değiştirir.
        //
        // 2026-09-04 — MUAFİYETİN GEREKÇESİ DEĞİŞTİ (kullanıcı kararı). Eskiden
        // "alt çizgili kalması doğrudur" diyordu; kullanıcı gözüyle panel
        // sekmeleri de kategoridir ve gri/alt-çizgili durmaları "beyaz olsun"
        // isteğinin dışında kalmalarını haklı çıkarmıyor. Artık muafiyet YALNIZ
        // `FilterChips` BİLEŞENİNİ kullanma zorunluluğundan: o bileşen
        // `aria-controls` üretmiyor ve panel bağını kuramıyor. YÜZEY yine tek
        // dilden gelmek ZORUNDA — aşağıdaki kural bunu ayrıca kilitliyor.
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

    // 2026-09-04 (Karar 1): muaf tutulan panel sekmeleri de tek buton dilinden
    // beslenmek zorunda. Muafiyet "istediğin yüzeyi yaz" demek DEĞİL; yalnız
    // `FilterChips` bileşenini kullanma zorunluluğunu kaldırıyor.
    it("aria-controls'lu panel sekmeleri de Button dilinden besleniyor", () => {
        const PANEL_TAB_FILES = ["src/app/dashboard/products/[id]/page.tsx"];
        for (const rel of PANEL_TAB_FILES) {
            const src = stripComments(readFileSync(join(root, rel), "utf8"));
            expect(src, rel).toMatch(/role="tab"/);
            expect(src, rel).toMatch(/aria-controls=/);
            // Sekme yüzeyi elle yazılmaz: aktif/pasif ayrımı `Button` varyantından.
            expect(src, rel).toMatch(/<Button[\s\S]{0,400}variant=\{isActive \? "primary" : "secondary"\}/);
            expect(src, rel).not.toMatch(/role="tab"[\s\S]{0,300}borderBottom:\s*isActive/);
        }
    });

    // ── 2026-09-05: yan çekmeceler ────────────────────────────────
    //
    // Ölçüm: repoda YEDİ yan çekmece vardı — dört z-index katmanı (50 · 80/81 ·
    // 200/201), üç dikey teknik (`height:100vh` · `100dvh` · `top/bottom:0`),
    // iki yüzey token'ı ve yedi ayrı erişilebilirlik seviyesi. Dördünde Escape,
    // altısında odak tuzağı, altısında odak dönüşü yoktu; beşi buna rağmen
    // `role="dialog"` İLAN EDİYORDU. İkisi sayfaların İÇİNE gömülüydü.

    it("elle yazılmış diyalog yüzeyi kalmadı — küme tam olarak bu", () => {
        // Sayı değil KÜME iddia ediliyor: yeni bir `role="dialog"` yüzeyi
        // eklemek ancak bu listeyi gerekçesiyle büyüterek mümkün olsun.
        // ("en az N tane olmalı" dersi: sayı kilidi değişmezi değil o günkü
        // durumu kilitler.)
        const ALLOWED: Record<string, string> = {
            "src/components/ui/Modal.tsx": "merkezî çerçevenin kendisi",
            "src/components/ui/Drawer.tsx": "yan çekmece çerçevesinin kendisi",
            // Merkezî önizleme; sağa yaslı değil, çekmece kapsamında değil.
            "src/components/settings/DosyalarTab.tsx": "dosya önizleme kutusu",
            // `product-detail-page-ekler.test.ts` bu yüzeyleri ÇERÇEVEYE
            // TAŞINMAMAYA kilitliyor (kendi keydown'ı + `body.style.overflow`u
            // testle isteniyor). Kasıtlı istisna, ihmal değil.
            "src/app/dashboard/products/[id]/page.tsx": "ışık kutusu — testle muaf",
        };
        const found = walkSrc()
            .filter(f => /role="dialog"/.test(stripComments(readFileSync(f, "utf8"))))
            .map(f => relative(root, f))
            .sort();
        expect(found).toEqual(Object.keys(ALLOWED).sort());
    });

    it("yedi çekmecenin hepsi ortak Drawer'dan besleniyor", () => {
        const DRAWERS = [
            "src/components/ai/AIDetailDrawer.tsx",
            "src/components/alerts/AlertCalendarDrawer.tsx",
            "src/components/customers/CustomerDetailPanel.tsx",
            "src/components/purchase/PurchaseOrderModal.tsx",
            "src/components/vendors/VendorDetailPanel.tsx",
            "src/app/dashboard/vendors/VendorsClient.tsx",
            "src/app/dashboard/settings/email-deliveries/page.tsx",
        ];
        for (const rel of DRAWERS) {
            const src = stripComments(read(rel));
            expect(src, rel).toMatch(/from "@\/components\/ui\/Drawer"/);
            expect(src, rel).toMatch(/<Drawer\b/);
            // Kendi konumlandırmasını/katmanını geri yazamaz.
            expect(src, rel).not.toMatch(/height:\s*"100[dv]vh"|height:\s*"100dvh"/);
            expect(src, rel).not.toMatch(/zIndex:\s*(50|80|81|200|201)\b/);
        }
    });

    it("davranış TEK kaynakta — iki çerçeve de kendi Escape'ini yazmaz", () => {
        // Turun kök bulgusu buydu: aynı mantığın eksik kopyaları dağılmıştı
        // (`AIDetailDrawer` kendi tuzağını, `PurchaseOrderModal` tuzaksız bir
        // "focus trap"i, `AlertCalendarDrawer` üçüncü bir sürümü taşıyordu).
        for (const rel of ["src/components/ui/Modal.tsx", "src/components/ui/Drawer.tsx"]) {
            const src = stripComments(read(rel));
            expect(src, rel).toMatch(/useDialogA11y/);
            expect(src, rel).not.toMatch(/addEventListener\(\s*"keydown"/);
        }
        // Çekirdeğin kendisi dördünü de kuruyor.
        const core = stripComments(read("src/components/ui/dialog-a11y.ts"));
        expect(core).toMatch(/addEventListener\("keydown"/);
        expect(core).toMatch(/event\.key === "Escape"/);
        expect(core).toMatch(/event\.key !== "Tab"/);
        expect(core).toMatch(/previouslyFocused\?\.focus\?\.\(\)/);
    });

    // ── 2026-09-05: gezinme rayı ──────────────────────────────────
    //
    // Ölçüm üç gezinme yüzeyi buldu ve eksenlerin ÇAPRAZLANDIĞINI gösterdi:
    // görsel ikili Sidebar+Ayarlar (aynı üç nav token'ı, aynı 2px sol accent
    // şeridi — iki ayrı uygulama, altı ölçülebilir kayma), mantık ikilisi
    // Sidebar+Developer (aynı `isActive` ifadesi birebir iki kez yazılmış).
    // Sidebar'ın hover'ı ALTI satır DOM mutasyonuydu ve 16-18 bağlantısının
    // hiçbirinde `aria-current` yoktu.

    it("üç gezinme yüzeyi de aktif durumu ekran okuyucuya BİLDİRİR", () => {
        // İşaretlemenin varlığı davranışın varlığı değildir — ama yokluğu
        // kesinlikle yokluğudur. Sidebar'da altı GÖRSEL işaret vardı ve
        // hiçbiri semantik değildi.
        const surfaces: Record<string, RegExp> = {
            // Ray yüzeyleri niteliği ORTAK çerçeveden alır: `active` propunu
            // geçirmezlerse aktiflik sessizce kaybolur.
            "src/components/layout/Sidebar.tsx": /<NavLink[\s\S]{0,300}?active=\{active\}/,
            "src/app/dashboard/settings/page.tsx": /<NavButton[\s\S]{0,400}?active=\{active\}/,
            // Developer sekmeleri KASTEN ayrı görsel dilde (yatay alt çizgi),
            // bu yüzden niteliği kendi basar.
            "src/app/dashboard/developer/layout.tsx": /aria-current=\{active \? "page" : undefined\}/,
        };
        for (const [rel, pattern] of Object.entries(surfaces)) {
            expect(stripComments(read(rel)), rel).toMatch(pattern);
        }
        // Çerçevenin kendisi niteliği iki elemanda da basıyor.
        const nav = stripComments(read("src/components/ui/NavLink.tsx"));
        expect((nav.match(/aria-current=\{active \? "page" : undefined\}/g) ?? []).length).toBe(2);
    });

    it("aktif rota hesabı TEK kaynakta — ifade ikinci kez yazılamaz", () => {
        const core = stripComments(read("src/components/ui/NavLink.tsx"));
        expect(core).toMatch(/export function isActiveHref/);
        expect(core).toMatch(/startsWith\(href \+ "\/"\)/);

        // Kopyanın geri gelmesi = kuralın ihlali. Desen `pathname.startsWith`
        // ile `+ "/"` birleşimini arıyor; `isActiveHref`in kendi gövdesi
        // `href.startsWith` yazdığı için burada eşleşmiyor.
        const offenders = walkSrc()
            .filter(f => !f.endsWith("NavLink.tsx"))
            .filter(f => /pathname\.startsWith\([^)]*\+\s*"\/"\)/.test(stripComments(readFileSync(f, "utf8"))))
            .map(f => relative(root, f));
        expect(offenders, `aktif-rota ifadesinin kopyası: ${offenders.join(", ")}`).toEqual([]);
    });

    it("ray görünümü CSS'te — iki yüzey de kendi stilini YAZMAZ", () => {
        // `.nav-rail-item` ailesi Sidebar ve Ayarlar'ın ortak dili.
        expect(GLOBALS).toMatch(/\.nav-rail-item \{[^}]*min-height: 36px/);
        expect(GLOBALS).toMatch(/\.nav-rail-item:hover \{[^}]*var\(--nav-hover-bg\)/);
        expect(GLOBALS).toMatch(/\.nav-rail-item\.is-active \{[^}]*var\(--nav-active-bg\)/);
        expect(GLOBALS).toMatch(/\.nav-rail-item\.is-active \{[^}]*var\(--nav-active-border\)/);

        // Nav token'ları yüzeylerin SATIR İÇİNDE geri yazılamaz.
        for (const rel of ["src/components/layout/Sidebar.tsx", "src/app/dashboard/settings/page.tsx"]) {
            const src = stripComments(read(rel));
            expect(src, rel).not.toMatch(/var\(--nav-(hover-bg|active-bg|active-border)\)/);
        }
    });

    it("DOM mutasyonlu hover taşıyan dosya KÜMESİ tam olarak bu", () => {
        // Bugüne kadar bu kalıbı yasaklayan HİÇBİR kapı kuralı yoktu; iki
        // dosya-özel iddia vardı (`purchase-orders-ui`, `datatable-rollout`) ve
        // Sidebar ikisinin de dışındaydı. Küme iddiası listenin sessizce
        // BÜYÜMESİNİ engeller — küçülmesi serbest, ama her yeni satır bilinçli
        // bir karar olmalı.
        const ALLOWED: Record<string, string> = {
            "src/components/ui/Button.tsx":
                "merkezî stil motoru: varyantlar JS nesnesi, hover'ı applyHover TEK yerden sürer",
            "src/app/dashboard/products/page.tsx":
                "ürün listesi satır vurgusu — bu turun kapsamı dışında, ayrı tur",
            "src/app/dashboard/orders/OrderForm.tsx":
                "sipariş formu satır vurgusu — bu turun kapsamı dışında, ayrı tur",
            "src/components/dashboard/StatsCards.tsx":
                "ÖLÜ KOD (0 üretim importu) ama dashboard-overview-preservation silinmesini yasaklıyor",
        };
        const found = walkSrc()
            .filter(f => /\.currentTarget\.style\.|\bel\.style\./.test(stripComments(readFileSync(f, "utf8"))))
            .map(f => relative(root, f))
            .sort();
        expect(found).toEqual(Object.keys(ALLOWED).sort());
        for (const [file, reason] of Object.entries(ALLOWED)) {
            expect(reason.length, `${file} için gerekçe çok kısa`).toBeGreaterThan(25);
        }
    });
});
