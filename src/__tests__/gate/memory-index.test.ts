/**
 * GATE — kalıcı bellek indeksi bütünlüğü.
 *
 * NİÇİN VAR (2026-09-10'da ölçülen gerçek kusur):
 *
 * `~/.claude/projects/.../memory` bir SEMBOLİK BAĞ ve `erp2/memory`yi
 * gösteriyor — yani Claude'un Memory özelliğinin YAZDIĞI yer o worktree.
 * Commit'ler ise her zaman `proje-codex` kopyasından atılıyordu. İki kopya
 * aynı depo, ama farklı çalışma ağaçları: yazma bir tarafa, commit öbür
 * tarafa gidiyordu.
 *
 * Sonuç: **dört dosya / 179 satır hiçbir commit'te yoktu.** En keskin
 * belirti `project_local_dev_db.md`ydi — `MEMORY.md` ona bağ VERİYORDU ama
 * dosya depoda YOKTU. Bir `reset --hard` ya da `checkout -f` onları sessizce
 * silerdi; nitekim `main`i ileri sarma denemesi tam da bunu tetikledi ve
 * yalnız git'in "untracked working tree files would be overwritten" uyarısı
 * durdurdu.
 *
 * Bu kural o imzayı kilitler. İki yön de denetlenir çünkü ikisi de sessiz:
 *  - HAYALET: indekste bağ var, dosya yok → kayma olmuş (yukarıdaki kusur).
 *  - ÖKSÜZ:  dosya var, indekste bağ yok → dosya oturum başında YÜKLENMİYOR,
 *            yani fiilen görünmez. (Ölçüldü: `reference_quote_line_columns.md`
 *            bir kullanıcı kararı taşıyordu — "Ölçü kolonu gelecekte tekrar
 *            EKLENMEYECEK" — ve indekste yoktu.)
 *
 * Kapsam bilerek DAR: yalnız dosya varlığı. İçerik tazeliği bir kapının
 * görebileceği şey değil.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const MEM = join(process.cwd(), "memory");
const INDEX = "MEMORY.md";

const files = readdirSync(MEM)
    .filter((f) => f.endsWith(".md") && f !== INDEX)
    .sort();

const index = readFileSync(join(MEM, INDEX), "utf8");

/** `- [ad.md](ad.md) — ...` satırlarındaki hedefler. */
function indexedTargets(src: string): string[] {
    return [...src.matchAll(/\]\((([a-z0-9_]+)\.md)\)/g)].map((m) => m[1]).sort();
}

describe("GATE — bellek indeksi bütünlüğü", () => {
    it("tarama çalışıyor (boş çıkarsa aşağıdaki her iddia sahte-yeşil olurdu)", () => {
        expect(files.length, "memory/ altında .md bulunamadı").toBeGreaterThanOrEqual(20);
        expect(indexedTargets(index).length, "MEMORY.md'den hiç bağ çıkarılamadı").toBeGreaterThanOrEqual(20);
    });

    it("HAYALET yok — indeksin bağ verdiği her dosya depoda VAR", () => {
        // Kaymanın birebir imzası: `project_local_dev_db.md` buraya bağlıydı
        // ama dosya hiçbir commit'te yoktu.
        const missing = [...new Set(indexedTargets(index))].filter(
            (t) => !existsSync(join(MEM, t)),
        );
        expect(
            missing,
            "MEMORY.md var olmayan dosyaya bağ veriyor — canlı bellek ile commit'lenen kopya AYRIŞMIŞ olabilir " +
                "(symlink erp2/memory'yi gösterir, commit proje-codex'ten atılır)",
        ).toEqual([]);
    });

    it("ÖKSÜZ yok — her bellek dosyası indekste anılıyor", () => {
        // İndekste anılmayan dosya oturum başında YÜKLENMEZ → fiilen yok.
        const indexed = new Set(indexedTargets(index));
        const orphans = files.filter((f) => !indexed.has(f));
        expect(
            orphans,
            "bu dosyalar MEMORY.md'de anılmıyor — oturum başında yüklenmezler, yani görünmezler",
        ).toEqual([]);
    });

    it("her bellek dosyası frontmatter taşır (recall bu alanlara bakar)", () => {
        // İLK YAZIM KUSURLUYDU ve 35/35 dosyayı "name yok" saydı: desen
        // `/^---\n[\s\S]*?\nname:/` idi, ama `---` satırından sonraki `\n`
        // ZATEN tüketiliyor ve `name:` hemen o satırda başlıyor → aranan
        // ikinci `\n` hiç bulunamıyordu. Dosyalar doğruydu, ÖLÇÜ ARACI yanlıştı.
        // (Deponun tekrarlayan dersi: bir kural kırmızıysa önce kuralın
        // kendisini ölç.) Artık frontmatter bloğu ÇIKARILIP içine bakılıyor.
        const bad: string[] = [];
        for (const f of files) {
            const src = readFileSync(join(MEM, f), "utf8");
            const fm = src.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1];
            if (!fm) { bad.push(`${f} (frontmatter bloğu yok)`); continue; }
            if (!/^name:\s*\S/m.test(fm)) bad.push(`${f} (name yok)`);
            else if (!/^description:\s*\S/m.test(fm)) bad.push(`${f} (description yok)`);
        }
        expect(bad, "frontmatter eksik — recall bu dosyaların ne olduğunu bilemez").toEqual([]);
    });

    it("[[wiki-bağ]]ları var olan dosyaları gösterir", () => {
        const broken: string[] = [];
        let scanned = 0;
        for (const f of [INDEX, ...files]) {
            const src = readFileSync(join(MEM, f), "utf8");
            for (const m of src.matchAll(/\[\[([a-z0-9_]+)\]\]/g)) {
                scanned++;
                if (!existsSync(join(MEM, `${m[1]}.md`))) broken.push(`${f} → [[${m[1]}]]`);
            }
        }
        expect(scanned, "hiç wiki-bağ taranmadı — kural boş kümeyi denetliyor").toBeGreaterThanOrEqual(20);
        expect(broken, "kırık [[bağ]] — hedef dosya depoda yok").toEqual([]);
    });
});
