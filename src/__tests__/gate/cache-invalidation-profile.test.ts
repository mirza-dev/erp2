/**
 * GATE: mutasyon sonrası okuma TAZE olmalı — `revalidateTag` profili (2026-09-16).
 *
 * Next 16'da `revalidateTag(tag, "max")` stale-while-revalidate: etiket bayat işaretlenir ama
 * `expire` uzak olduğundan bir sonraki okuma ESKİ önbelleği sunar. Bu depoda 75 çağrı yeri
 * "max" kullanıyordu (perf turu, 2026-06 — deprecation uyarısını susturmak için seçilmişti) ve
 * quotes.spec E2E'si yakaladı: teklif gönderildikten sonra detay "Taslak" + "Gönder" gösterdi.
 * `updateTag` route handler'da yasak (yalnız Server Action). Çözüm `next.config.ts`'te
 * `cacheLife.immediate = { expire: 0 }` → `areTagsExpired` anında true → sonraki okuma DB'ye.
 *
 * Kurallar (yorumlar soyulmuş kaynakta):
 *  1. next.config `cacheLife.immediate` tanımlı ve `expire: 0`.
 *  2. src altında (testler hariç) hiçbir `revalidateTag(…, "max")` yok.
 *  3. Tek argümanlı `revalidateTag("x")` yok (deprecated; davranışı immediate ama uyarı üretir).
 *  4. Her `revalidateTag` çağrısı "immediate" profiliyle (başka profil sızmasın).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const strip = (s: string) => s.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) { if (name !== "__tests__") walk(p, out); }
        else if (/\.tsx?$/.test(name)) out.push(p);
    }
    return out;
}

describe("GATE — revalidateTag 'immediate' profili", () => {
    const config = strip(readFileSync(join(ROOT, "next.config.ts"), "utf8"));

    it("next.config: cacheLife.immediate tanımlı ve expire 0", () => {
        const m = config.match(/cacheLife:\s*\{([\s\S]*?)\n\s*\},/);
        expect(m, "cacheLife bloğu yok").not.toBeNull();
        expect(m![1]).toMatch(/immediate:\s*\{[^}]*expire:\s*0\b[^}]*\}/);
    });

    const files = walk(join(ROOT, "src"));
    const calls: Array<{ file: string; call: string }> = [];
    for (const f of files) {
        const src = strip(readFileSync(f, "utf8"));
        for (const m of src.matchAll(/revalidateTag\(([^()]*(?:\([^()]*\))?[^()]*)\)/g)) {
            calls.push({ file: f.replace(ROOT + "/", ""), call: m[0] });
        }
    }

    it("çağrı kümesi boş değil (kural vakum değil)", () => {
        expect(calls.length).toBeGreaterThanOrEqual(60);
    });

    it("hiçbir çağrı 'max' (SWR) veya tek argüman (deprecated) kullanmıyor — hepsi 'immediate'", () => {
        const bad = calls.filter(c => !/,\s*"immediate"\s*\)$/.test(c.call));
        expect(bad.map(b => `${b.file}: ${b.call}`)).toEqual([]);
    });
});
