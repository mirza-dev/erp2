/**
 * GATE: Developer Console'un elle örülmüş yüzeyleri tek kaynaktan.
 *
 * 2026-08-31 tarayıcı ölçümü — konsol ÇALIŞIYORDU ama sıkışık görünüyordu:
 *
 *   · Tanılama'daki **5 kartın hepsinde `padding: 0px`** ve ilk içerik kartın
 *     kenarlığına **1px** kalıyordu. Kayıtlar'da bir satırın son hücresinin sağ
 *     kenarı (1446px) kartın iç kenarıyla BİREBİR aynıydı — metin çerçeveye
 *     değiyordu. Ev standardı `DataTable` hücresi ise `10px 14px`.
 *   · `sectionTitle` **üç dosyada ayrı ayrı** tanımlıydı ve zaten ayrışmıştı
 *     (`margin` 6px'e karşı 8px); `factGrid` iki dosyada, o da ayrışmıştı.
 *   · `<dt>` etiketi satır içi yazıldığı için ölçülen ağırlık **450**'ydi —
 *     uygulamanın kanonik form etiketi 600. Bu varyant bir önceki turun
 *     `form-consistency` kapısından KAÇTI, çünkü o kural yalnız `const
 *     labelStyle` bildirimlerine bakıyordu.
 *   · Performans tablosunda `"> 12.80 sn"` 84px'lik sütunda ikiye kırılıyor,
 *     ilk üç satır **58px**, kalanlar **41px** yüksekliğe düşüyordu.
 *   · Tanılama'nın "Yapılandırma" ızgarasında iki etiket iki satıra kırılınca
 *     komşularının durumu aşağı kayıyordu: aynı ızgara satırında taban
 *     çizgileri **610px'e karşı 627px**.
 *   · Hatalar ve Kayıtlar, veri gelmeden önce "**0** grup/kayıt gösteriliyor"
 *     diyordu — gövde hâlâ "yükleniyor" derken.
 *
 * Düzeltmenin kendisi değil, DÜZELTİLMİŞ KALMASI kilitlenir.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const CONSOLE_DIR = join(root, "src/app/dashboard/developer");

/**
 * Yorumları atar.
 *
 * NEDEN: bu tuzak repoda İKİ KEZ gerçekleşti — bir kaynak-iddiası testi,
 * dosyanın KENDİ açıklamasındaki metni yakalayıp yeşil yandı. Bu dosyanın
 * yukarıdaki başlık yorumu da tam olarak aradığımız desenleri içeriyor.
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

const consoleFiles = walk(CONSOLE_DIR).map(f => ({
    path: relative(root, f),
    src: stripComments(readFileSync(f, "utf8")),
}));

const consoleUi = readFileSync(join(CONSOLE_DIR, "console-ui.ts"), "utf8");
const consoleUiCode = stripComments(consoleUi);

describe("GATE: Developer Console ortak stil kaynağı", () => {
    it("konsolun kendi stil modülü vardır ve kanonik etiket yardımcısına bağlıdır", () => {
        // factLabel kendi tipografisini YAZMAMALI — uygulamanın kanonik
        // labelStyle()'ını genişletmeli, yoksa üçüncü bir varyant doğar.
        expect(consoleUiCode).toContain('from "@/components/ui/Input"');
        expect(consoleUiCode).toMatch(/export function factLabel[\s\S]*?sharedLabelStyle\(\)/);
        const factLabelBody = consoleUiCode.slice(consoleUiCode.indexOf("export function factLabel"));
        expect(factLabelBody.slice(0, 200)).not.toMatch(/fontSize\s*:/);
    });

    it("hiçbir konsol sayfası kendi sectionTitle/factGrid'ini tanımlamaz", () => {
        const offenders = consoleFiles
            .filter(f => !f.path.endsWith("console-ui.ts"))
            .filter(f => /const\s+(sectionTitle|factGrid)\s*:/.test(f.src))
            .map(f => f.path);
        expect(offenders).toEqual([]);
    });

    it("konsolda satır içi <dt> tipografisi yazılmaz — factLabel() kullanılır", () => {
        const offenders = consoleFiles
            .filter(f => /<dt\s+style=\{\{[^}]*fontSize/.test(f.src))
            .map(f => f.path);
        expect(offenders).toEqual([]);
    });

    it("Card'ın içindeki elle örülmüş satırlar yatay dolgusuz kalmaz", () => {
        // `padding: "8px 0"` deponun genelinde meşrudur — ama dolgusuz `Card`'ın
        // doğrudan çocuğu olduğunda metin kenarlığa değer. Konsolda bu kalıp
        // consoleRow() yardımcısına bağlandı.
        //
        // `<li>` MUAF ve bu bir whitelist değil, kuralın doğru sınırı: bir liste
        // öğesinin yatay girintisi kendi işi değil, ebeveyn `<ul>`'nin
        // `paddingLeft`'inin işidir. Gutter'ı listenin taşıdığı ayrıca aşağıda
        // doğrulanır — yoksa muafiyet gerçek bir kusuru gizlerdi.
        const offenders: string[] = [];
        for (const f of consoleFiles) {
            for (const line of f.src.split("\n")) {
                if (/<li[\s>]/.test(line)) continue;
                const m = line.match(/padding:\s*"\d+(?:\.\d+)?px 0"/);
                if (m) offenders.push(`${f.path}: ${m[0]}`);
            }
        }
        expect(offenders).toEqual([]);
    });

    it("liste öğelerini taşıyan <ul> yatay boşluğu kendisi verir", () => {
        // Yukarıdaki <li> muafiyetinin dayanağı. Konsolda Card'ın doğrudan
        // çocuğu olan tek liste burada.
        const detail = consoleFiles.find(f => f.path.endsWith("errors/[id]/page.tsx"));
        expect(detail).toBeDefined();
        expect(detail!.src).toMatch(/<ul style=\{\{[^}]*padding:\s*"0 14px 14px 32px"/);
    });

    it("ortak satır yardımcısı yatay boşluğu DataTable ile aynı ritimde verir", () => {
        // DataTable hücresi 10px 14px kullanır; konsol da 14px'e oturur.
        const dataTable = readFileSync(join(root, "src/components/ui/DataTable.tsx"), "utf8");
        expect(dataTable).toContain('padding: "10px 14px"');
        expect(consoleUiCode).toContain('export const CONSOLE_GUTTER = "14px"');
        expect(consoleUiCode).toMatch(/export function consoleRow[\s\S]*?CONSOLE_GUTTER/);
    });

    it("etiket iki satıra kırılınca komşu değerler kaymaz", () => {
        // Kayma hücreler ARASINDA değil, hücrenin İÇİNDE: 1 satırlık etiketin
        // altındaki değer, 2 satırlığınkinden yukarıda kalıyordu (610px'e karşı
        // 627px). Izgaraya `align-items: start` vermek bunu ÇÖZMEZ — ölçülerek
        // görüldü, hâlâ 742'ye karşı 756 çıkıyordu. Doğru kol: hücre satır
        // yüksekliğine esner, değer alta sabitlenir.
        expect(consoleUiCode).toMatch(/export const factCell[\s\S]*?height:\s*"100%"/);
        expect(consoleUiCode).toMatch(/export const factValue[\s\S]*?marginTop:\s*"auto"/);
        // Izgara hücreleri esnetmeli — `start` verilirse height:100% ölür.
        const gridBlock = consoleUiCode.slice(
            consoleUiCode.indexOf("export const factGrid"),
            consoleUiCode.indexOf("export const factCell"),
        );
        expect(gridBlock).not.toMatch(/alignItems/);

        // Her iki Fact bileşeni de bu ikiliyi kullanmalı, yoksa biri kayar.
        for (const name of ["diagnostics/page.tsx", "errors/[id]/page.tsx"]) {
            const f = consoleFiles.find(x => x.path.endsWith(name));
            expect(f, name).toBeDefined();
            const fact = f!.src.slice(f!.src.indexOf("function Fact"));
            expect(fact.slice(0, 700), name).toContain("factCell");
            expect(fact.slice(0, 700), name).toContain("factValue");
        }
    });

    it("uzun tek değerler için tam satır genişliği kolu vardır ve İstemci onu kullanır", () => {
        expect(consoleUiCode).toMatch(/export const factWide[\s\S]*?gridColumn:\s*"1 \/ -1"/);
        const detail = consoleFiles.find(f => f.path.endsWith("errors/[id]/page.tsx"));
        expect(detail).toBeDefined();
        expect(detail!.src).toMatch(/label="İstemci"[^/]*wide/);
    });

    it("gecikme değerleri dar sütunda ikiye kırılmaz", () => {
        const perf = consoleFiles.find(f => f.path.endsWith("performance/page.tsx"));
        expect(perf).toBeDefined();
        const numeric = perf!.src.slice(perf!.src.indexOf("function Numeric"));
        expect(numeric).toContain('whiteSpace: "nowrap"');
    });

    it("veri gelmeden kayıt sayısı iddia edilmez", () => {
        for (const name of ["errors/page.tsx", "logs/page.tsx"]) {
            const f = consoleFiles.find(x => x.path.endsWith(name));
            expect(f, name).toBeDefined();
            // Sayının basıldığı yer bir yükleme koşuluyla korunmalı.
            expect(f!.src, name).toMatch(
                /isLoading && !data \? null : <>\s*<strong>\{(rows|entries)\.length\}<\/strong>/,
            );
        }
    });

    // ── A4 (2026-09-04): filtreler URL'de ───────────────────────────────────
    //
    // 2026-08-31 turunda D1 olarak açık bırakılmıştı: filtreli bir görünüm
    // paylaşılamıyor, yenileme filtreyi siliyor, "şu request-id'ye bak" demenin
    // adresi yok. Filtre `useState`te yaşadığı sürece bunların hiçbiri mümkün değil.
    it("filtre taşıyan konsol sayfaları filtreyi URL'den okur, çıplak state'te tutmaz", () => {
        // Dosya → o sayfanın filtre değişkenleri. Liste sayfa eklendiğinde
        // güncellenmeli; eksik kalırsa aşağıdaki "kapsam" iddiası uyarır.
        const FILTERED: Record<string, string[]> = {
            "src/app/dashboard/developer/page.tsx": ["range"],
            "src/app/dashboard/developer/performance/page.tsx": ["range"],
            "src/app/dashboard/developer/errors/page.tsx": ["range", "severity", "status", "module", "search"],
            "src/app/dashboard/developer/logs/page.tsx": ["range", "level", "sources", "requestId", "search"],
            "src/app/dashboard/developer/bugs/page.tsx": ["status", "priority", "search"],
        };

        // Yalnız SAYFA bileşeninin gövdesine bakılır. Aynı dosyada yaşayan yan
        // bileşenlerin (bugs → `BugModal`) kendi `status`/`priority` form
        // state'i vardır ve o meşrudur: form alanı filtre değil.
        const pageBody = (src: string) => {
            const start = src.indexOf("export default function");
            if (start < 0) return src;
            const rest = src.slice(start + 1);
            const end = rest.search(/\n(?:function|const|export) /);
            return end < 0 ? rest : rest.slice(0, end);
        };

        for (const [path, keys] of Object.entries(FILTERED)) {
            const file = consoleFiles.find(f => f.path === path);
            expect(file, path).toBeDefined();
            const src = pageBody(file!.src);
            expect(src, `${path} useUrlFilters kullanmalı`).toContain("useUrlFilters");

            // Varsayılan sözlüğün GÖVDESİ ayrıştırılır ve iddia YALNIZ onun
            // içinde yapılır.
            //
            // Kırmızı-kanıt turunun yakaladığı kusur: ilk hâli
            // `useUrlFilters\(\{[\s\S]*?<key>:` diyordu. `[\s\S]*?` nesne
            // literalinden ÇIKABİLİYOR — bir anahtar sözlükten silinse bile
            // dosyanın ilerisindeki başka bir `priority:` (rozet haritası, modal
            // state'i) desene yetiyordu ve kural YEŞİL kalıyordu. Bir kaynak
            // iddiası, iddia ettiği SINIRIN içinde kalmalı.
            const dict = src.match(/useUrlFilters\(\{([^}]*)\}/)?.[1];
            expect(dict, `${path} → useUrlFilters varsayılan sözlüğü okunamadı`).toBeDefined();

            for (const key of keys) {
                expect(dict, `${path} → ${key} URL'e bağlı değil`)
                    .toMatch(new RegExp(`\\b${key}\\s*:`));
                // Ve aynı ad çıplak bir useState'te YAŞAMAMALI (iki kaynak =
                // URL ile ekran ayrışır; tam olarak kaçındığımız şey).
                // Setter'sız yıkım da sayılır: `const [priority] = useState()`.
                expect(src, `${path} → ${key} hâlâ useState'te`)
                    .not.toMatch(new RegExp(`\\[\\s*${key}\\s*[,\\]][^=]*=\\s*useState`));
            }
        }
    });

    it("biriken sayfa imleçleri URL'e YAZILMAZ (filtre değil, oturum durumu)", () => {
        for (const path of [
            "src/app/dashboard/developer/errors/page.tsx",
            "src/app/dashboard/developer/logs/page.tsx",
        ]) {
            const src = consoleFiles.find(f => f.path === path)!.src;
            // İmleç yığını yerel state olarak KALIR: linki açan kişide yeniden
            // kurulamaz, kurulmaya çalışılırsa "10 sayfa yükle" gibi bir adres olur.
            expect(src, path).toMatch(/\[cursors, setCursors\] = useState/);
            expect(src, path).not.toMatch(/useUrlFilters\(\{[\s\S]*?cursors\s*:/);
        }
    });

    it("konsol kabuğu Suspense sınırını taşır — `useSearchParams` onsuz build'i kırar", () => {
        const layout = readFileSync(join(CONSOLE_DIR, "layout.tsx"), "utf8");
        const code = stripComments(layout);
        expect(code).toMatch(/import \{ Suspense \} from "react"/);
        // Sınır ÇOCUKLARI sarmalı: altı sayfanın hepsi tek seferde korunsun,
        // yeni sayfa eklenince kimse hatırlamak zorunda kalmasın.
        expect(code).toMatch(/<Suspense[\s\S]{0,120}\{children\}[\s\S]{0,40}<\/Suspense>/);
    });
});
