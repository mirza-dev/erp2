/**
 * GATE: şema paketinin bozulamayacak invaryantı.
 *
 * Paket (`npm run schema:bundle`) yeni bir müşteri/dev projesini sıfırdan kuran
 * araç. Tek gerçek felaket senaryosu: **bir migration paketten sessizce düşmesi.**
 * O zaman kurulum "başarılı" görünür, eksik bir tablo veya açılmamış bir RLS ile
 * proje ayağa kalkar ve fark edilmesi aylar sürer.
 *
 * Bu yüzden burada tek bir şey kanıtlanıyor: parçaların birleşimi = migration'ların
 * sıralı birleşimi. Ne kayıp, ne yineleme, ne sıra bozulması.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
    DEFAULT_MAX_BYTES,
    VERIFY_SQL,
    planChunks,
    readMigrations,
    renderChunk,
} from "../../../scripts/build-schema-bundle";

const root = process.cwd();
const migrations = readMigrations(join(root, "supabase/migrations"));
const chunks = planChunks(migrations, DEFAULT_MAX_BYTES);

describe("GATE — şema paketi", () => {
    it("hiçbir migration kaybolmuyor, hiçbiri iki kez girmiyor, sıra korunuyor", () => {
        const packed = chunks.flatMap((c) => c.files.map((f) => f.name));
        expect(packed).toEqual(migrations.map((m) => m.name));
    });

    it("migration çıkarımı çökmedi (yeşil-ama-işlevsiz gate koruması)", () => {
        // Zemin 2026-08-31: 111 migration. Okuma bozulup boş dönerse yukarıdaki
        // test [] === [] ile SESSİZCE geçerdi — bu eşik onu engelliyor.
        expect(migrations.length).toBeGreaterThanOrEqual(100);
        expect(chunks.length).toBeGreaterThan(1);
        expect(migrations[0].name).toMatch(/^001_/);
    });

    it("bir migration İKİYE BÖLÜNMÜYOR ve parçalar tavanı boşuna aşmıyor", () => {
        for (const c of chunks) {
            const oversizedAlone =
                c.files.length === 1 && Buffer.byteLength(c.files[0].content, "utf8") > DEFAULT_MAX_BYTES;
            // Tavanı aşmanın tek meşru sebebi: tek başına tavandan büyük bir dosya
            // (bölmek SQL'i geçersiz kılardı).
            if (!oversizedAlone) expect(c.bytes).toBeLessThanOrEqual(DEFAULT_MAX_BYTES);
        }
    });

    it("üretilen SQL her migration'ın gövdesini gerçekten taşıyor", () => {
        chunks.forEach((c, i) => {
            const sql = renderChunk(c, i, chunks.length);
            for (const f of c.files) {
                expect(sql).toContain(f.name); // başlıkta adı
                expect(sql).toContain(f.content.replace(/\s*$/, "")); // gövdesi birebir
            }
        });
    });

    it("doğrulama sorgusu RLS eşitliğini ölçüyor (kurulumun kritik kontrolü)", () => {
        expect(VERIFY_SQL).toMatch(/relrowsecurity/);
        expect(VERIFY_SQL).toMatch(/storage\.buckets/);
        expect(VERIFY_SQL).toMatch(/rls_acik/);
    });

    it("npm run schema:bundle bağlı ve çıktı .gitignore'da (türetilmiş dosya)", () => {
        const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
            scripts: Record<string, string>;
        };
        expect(pkg.scripts["schema:bundle"]).toBe("tsx scripts/build-schema-bundle.ts");
        const ignored = readFileSync(join(root, ".gitignore"), "utf8")
            .split("\n")
            .map((l) => l.trim());
        expect(ignored).toContain("/supabase/schema-bundle/");
    });
});
