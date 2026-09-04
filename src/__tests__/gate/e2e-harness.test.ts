/**
 * GATE: E2E koşum altyapısının SESSİZCE bozulabilen değişmezleri.
 *
 * 2026-09-05 ölçümü — suite "yeşil" sanılıyordu ama değildi. `retries: 1` ile
 * koşulduğunda rapor **85 passed · 8 flaky · 1 failed / 32.8 dk** diyordu;
 * "flaky" satırları ilk denemede DÜŞÜP retry'da geçen testlerdi. İki bağımsız
 * kök sebep vardı:
 *
 *  1. **Hidrasyon yarışı.** `gotoApp` yalnız kabuğun boyandığını bekliyordu.
 *     Ölçüldü: `domcontentloaded` anında `main` üzerinde HİÇ `__react*`
 *     anahtarı yok. O pencerede `setInputFiles` native `change` olayını atıyor,
 *     React'in `onChange`i henüz bağlı olmadığı için sihirbaz idle'da kalıyor
 *     ve test 30 sn bekleyip düşüyordu. (2026-08-30'da beklemeler 15→30 sn'ye
 *     çıkarılmıştı; süreyi büyütmek yarışı çözmez.)
 *  2. **Soğuk derleme.** Suite `next dev`e karşı koşmak ZORUNDA — üretim CSP'si
 *     `connect-src`i `*.supabase.co` ile sınırlıyor, yerel Supabase ise
 *     `127.0.0.1:54321`de; `next start`a karşı giriş sessizce düşüyor (denendi,
 *     globalSetup girişte takıldı). Turbopack'in ilk-istek derlemesi testin
 *     İÇİNDE kaldığı sürece bütçeyi yiyordu.
 *
 * İkisi kapatıldıktan sonra: **94/94, retries=0, 2.3 dk** (iki ardışık koşum).
 * Aşağıdaki kurallar bu iki mekanizmanın yerinde kalmasını kilitler; biri
 * kaldırılırsa suite yine yavaşça "flaky"leşir ve bunu kimse fark etmez.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const stripComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("GATE — E2E koşum altyapısı", () => {
    it("gezinme yardımcısı HİDRASYONU bekler, yalnız boyanmayı değil", () => {
        const nav = stripComments(read("tests/helpers/nav.ts"));

        // Sinyalin kendisi: React'in DOM'a yazdığı fiber anahtarı.
        expect(nav, "waitForHydration __react sinyalini aramalı").toMatch(/__react/);
        expect(nav).toMatch(/export async function waitForHydration/);

        // Ve gerçekten ÇAĞRILMALI — tanımlanıp kullanılmayan bir yardımcı
        // hiçbir yarışı kapatmaz.
        //
        // İddia FONKSİYON GÖVDESİNE hapsediliyor. İlk hâli
        // `gotoApp[\s\S]*?waitForHydration` diyordu ve kırmızı-kanıt turunda
        // YEŞİL kaldı: `[\s\S]*?` gövdeden çıkıp aşağıdaki `waitForApp`in
        // çağrısına ulaşıyordu. (Aynı sınıf hata bir gün önce A4 kuralında da
        // çıktı — kaynak iddiası, iddia ettiği sınırın içinde kalmalı.)
        const bodyOf = (name: string) => {
            const start = nav.indexOf(`export async function ${name}`);
            if (start < 0) return "";
            const rest = nav.slice(start + 1);
            const end = rest.search(/\nexport /);
            return end < 0 ? rest : rest.slice(0, end);
        };
        for (const fn of ["gotoApp", "waitForApp"]) {
            const body = bodyOf(fn);
            expect(body, `${fn} bulunamadı`).not.toBe("");
            expect(body, `${fn} hidrasyonu beklemeli`).toMatch(/waitForHydration\(page/);
        }
    });

    it("globalSetup rotaları test bütçesinin DIŞINDA derletir", () => {
        const setup = stripComments(read("tests/global-setup.ts"));
        expect(setup).toMatch(/function warmRoutes/);
        expect(setup, "warmRoutes çağrılmalı").toMatch(/await warmRoutes\(/);

        // Isınma listesi suite'in dokunduğu rotaları kapsamalı. Sayı kilidi
        // değil kapsama kilidi: liste boşalırsa kural anlamsızlaşır.
        const routes = setup.match(/"\/dashboard[^"]*"/g) ?? [];
        expect(routes.length, "ısınma listesi çok daraldı").toBeGreaterThanOrEqual(12);
        for (const critical of ["/dashboard/import/excel", "/dashboard/products", "/dashboard/orders"]) {
            expect(routes.join(" "), `${critical} ısıtılmıyor`).toContain(critical);
        }
    });

    it("yerel koşumda retry YOK — flaky test gizlenemez", () => {
        const config = stripComments(read("playwright.config.ts"));
        expect(config).toMatch(/retries:\s*process\.env\.CI\s*\?\s*2\s*:\s*0/);
    });

    it("`FilterChips` yüzeyleri E2E'de TAB rolüyle aranır (buton DEĞİL)", () => {
        // 2026-09-04'te eskime filtresi `FilterChips`e taşındı; bileşen
        // `tablist` üretiyor. `aging.spec` hâlâ `role="button"` arıyordu ve
        // İKİ denemede de düştü — vitest bunu göremezdi, E2E de dönüşümden
        // beri hiç koşmamıştı. Rol, işaretlemeyi izler.
        const aging = read("tests/aging.spec.ts");
        expect(aging).toMatch(/getByRole\("tab", \{ name: \/tümü\/i \}\)/);
        expect(aging).not.toMatch(/getByRole\("button", \{ name: \/tümü\/i \}\)/);
    });
});
