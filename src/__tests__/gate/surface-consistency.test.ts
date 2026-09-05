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
});
