/**
 * GATE: geliştirme canlı veritabanına bağlanamasın.
 *
 * Arka plan: bu projede ayrı bir dev veritabanı yoktu — `.env.local` doğrudan
 * canlı fabrika verisine bakıyordu, her `npm run dev` gerçek cari/fiyat/sipariş
 * kayıtlarının üstünde çalışıyordu. Dev projesine geçmek tek başına yetmez:
 * bir `.env.local` kopyalaması veya "şunu canlıda bir bakayım" ile sessizce
 * geri dönülür. Kapı o dönüşü görünür kılar.
 *
 * Bağlanmayanlar KASITLI: `backup` canlıyı hedeflemeli, `build`/`start` ise
 * Coolify prod derlemesinde meşru biçimde canlıya bakar.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PROD_PROJECT_REF, isProdTarget, projectRefFromUrl } from "../../lib/env-target";

const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
    scripts: Record<string, string>;
};

describe("GATE — prod hedef koruması", () => {
    it("canlı proje ref'i tanınıyor", () => {
        expect(PROD_PROJECT_REF).toMatch(/^[a-z0-9]{20}$/);
        expect(projectRefFromUrl(`https://${PROD_PROJECT_REF}.supabase.co`)).toBe(PROD_PROJECT_REF);
        expect(isProdTarget(`https://${PROD_PROJECT_REF}.supabase.co`)).toBe(true);
        expect(isProdTarget(`https://${PROD_PROJECT_REF.toUpperCase()}.supabase.co/`)).toBe(true);
    });

    it("başka bir proje canlı SAYILMIYOR (dev projesi çalışabilmeli)", () => {
        const other = "abcdefghijklmnopqrst";
        expect(other).not.toBe(PROD_PROJECT_REF);
        expect(isProdTarget(`https://${other}.supabase.co`)).toBe(false);
    });

    it("tanınmayan hedef canlı sayılmıyor — fail-closed DEĞİL, bilinçli", () => {
        // Kapının koruduğu risk ref EŞLEŞMESİ gerektirir; eşleşmeyen hedef
        // tanımı gereği canlı değildir (yerel Supabase, self-host, başka müşteri).
        // Bilinmeyeni bloklamak kapıyı gürültüye çevirir ve kapatılmasına yol açar.
        for (const u of [undefined, null, "", "not-a-url", "http://localhost:54321", "https://x.supabase.co"]) {
            expect(isProdTarget(u)).toBe(false);
        }
        expect(projectRefFromUrl("http://localhost:54321")).toBeNull();
    });

    it("dev ve E2E kapıya bağlı", () => {
        expect(pkg.scripts["preflight:env"]).toBe("tsx scripts/check-env-target.ts");
        for (const hook of ["predev", "pretest:e2e", "pretest:e2e:ui", "pretest:e2e:headed"]) {
            expect(pkg.scripts[hook]).toBe("npm run preflight:env");
        }
    });

    it("backup ve build kapıya BAĞLI DEĞİL (kasıtlı)", () => {
        // backup canlıyı hedeflemeli; build/start Coolify prod derlemesinde canlıya bakar.
        expect(pkg.scripts.prebackup).toBeUndefined();
        expect(pkg.scripts.prebuild).toBeUndefined();
        expect(pkg.scripts.prestart).toBeUndefined();
        expect(pkg.scripts.backup).toBe("tsx scripts/backup.ts");
    });

    it("kapı canlı hedefte exit 1 veriyor ve kaçış kapısını anlatıyor", () => {
        const src = readFileSync(join(process.cwd(), "scripts/check-env-target.ts"), "utf8");
        expect(src).toMatch(/ALLOW_PROD_TARGET/);
        expect(src).toMatch(/process\.exit\(1\)/);
        expect(src).toMatch(/musteri-kurulum\.md/);
    });
});
