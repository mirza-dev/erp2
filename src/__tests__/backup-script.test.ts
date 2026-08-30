/**
 * GATE: yedekleme aracının bozulamayacak invaryantları.
 *
 * Arka plan (2026-08-30 doğrulaması): proje Supabase Free planında — otomatik
 * yedek YOK — ve Supabase'in DB yedeği hiçbir planda Storage objelerini
 * kapsamıyor. `scripts/backup.ts` bu iki boşluğu birden kapatan tek araç.
 * Üç şey sessizce bozulursa yedek "çalışıyor gibi görünüp" işe yaramaz olur:
 *
 *  1. `backups/` git'e sızarsa → müşteri listesi, fiyatlar ve
 *     `parasut_oauth_tokens` public repo'ya gider.
 *  2. Script kaynağa yazarsa → "yedek" aracı canlıyı değiştirir.
 *  3. Satır sayısı doğrulaması kalkarsa → yarım yedek exit 0 döner
 *     (yeşil-ama-işlevsiz; RLS gate'inde aynı sınıf hata yaşandı).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const script = readFileSync(join(root, "scripts/backup.ts"), "utf8");
const gitignore = readFileSync(join(root, ".gitignore"), "utf8");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
};

describe("GATE — yedekleme aracı", () => {
    it("backups/ .gitignore'da (müşteri verisi + OAuth token repoya girmez)", () => {
        const ignored = gitignore
            .split("\n")
            .map((l) => l.trim())
            .filter((l) => l && !l.startsWith("#"));
        expect(ignored).toContain("/backups/");
    });

    it("npm run backup mevcut", () => {
        expect(pkg.scripts.backup).toBe("tsx scripts/backup.ts");
    });

    it("kaynağa YAZMAZ — /rest/v1 ve /auth/v1/admin yalnız okunur", () => {
        // /storage/v1/object/list POST'u bir LİSTELEME çağrısıdır (PostgREST değil),
        // bu yüzden hedef yola göre ayrıştırılıyor.
        const writes = [...script.matchAll(/method:\s*"(POST|PUT|PATCH|DELETE)"/g)];
        expect(writes.length).toBeGreaterThan(0); // liste çağrısı var, desen ölmedi

        for (const m of writes) {
            // her yazma-metodunun ait olduğu fetch bloğunun URL'i
            const before = script.slice(0, m.index ?? 0);
            const fetchStart = before.lastIndexOf("fetch(");
            const target = script.slice(fetchStart, (m.index ?? 0) + 200);
            expect(target).toMatch(/storage\/v1\/object\/list/);
        }
        expect(script).not.toMatch(/rest\/v1\/[^`"']*`?,\s*\{\s*method:\s*"(POST|PATCH|DELETE)"/);
        expect(script).not.toMatch(/resolution=merge-duplicates/);
    });

    it("satır sayısı doğrulaması yerinde (yarım yedek exit 0 dönemez)", () => {
        expect(script).toMatch(/Prefer:\s*"count=exact"/);
        expect(script).toMatch(/lines\.length\s*!==\s*expected/);
        expect(script).toMatch(/errors\.length/);
        expect(script).toMatch(/process\.exit\(1\)/);
    });

    it("sayfalama deterministik sırayla yapılıyor (Range sırasız kullanılamaz)", () => {
        // PostgREST'te ORDER BY'sız Range sayfalaması satır kaçırabilir/yineleyebilir.
        expect(script).toMatch(/order=\$\{encodeURIComponent\(pk\)\}\.asc/);
        expect(script).toMatch(/<pk\\\/>/); // birincil anahtar OpenAPI'den okunuyor
    });

    it("parola hash'i sınırı kullanıcıya bildiriliyor", () => {
        expect(script).toMatch(/PAROLA HASH'LER/);
        const runbook = readFileSync(join(root, "docs/backup-restore.md"), "utf8");
        expect(runbook).toMatch(/Parolalar geri gelmez/);
        expect(runbook).toMatch(/restoreOrder/);
    });
});
