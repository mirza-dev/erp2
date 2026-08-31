/**
 * GATE: hata ve 404 sayfaları.
 *
 * 2026-08-31 denetimi (madde #9): `app/error.tsx` vardı ama iki delik açıktı ve
 * ikisi de SESSİZ — hiçbir test, hiçbir build uyarısı bunları göstermiyordu:
 *
 *   · `not-found.tsx` YOKTU → bulunamayan her rota Next'in stilsiz, İngilizce,
 *     tema-bilmez varsayılanına düşüyordu. Bir ERP'de en sık 404 kaynağı silinmiş
 *     bir kayda giden eski bir yer imi.
 *   · `global-error.tsx` YOKTU → kök LAYOUT'ta patlayan hata hiçbir sınıra
 *     ulaşmıyor; kullanıcı tarayıcının boş ekranını görüyor ve Sentry'ye de
 *     hiçbir şey gitmiyordu.
 *
 * Dosyaların VARLIĞI yeterli değil: `global-error` kendi `<html>`/`<body>`'sini
 * render etmezse Next hatayı yutar, `captureException` çağırmazsa hata izlemeye
 * ulaşmaz. İkisi de ayrıca aranıyor.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");

/**
 * Blok ve satır yorumlarını atar.
 *
 * NEDEN GEREKLİ: enjekte edilen regresyonda (`<html>` → `<div>`) test YANMADI —
 * çünkü dosyanın YORUMU da "kendi `<html>`/`<body>`'sini render etmek zorunda"
 * diyor ve `/<html/` onu yakalıyordu. Yani test, kodun kendisini değil kendi
 * açıklamasını doğruluyordu. Gerçek JSX aranmalı.
 */
function stripComments(src: string): string {
    return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("GATE — hata sayfaları", () => {
    it("404 sayfası var, Türkçe ve panoya dönüş sunuyor", () => {
        expect(existsSync(join(root, "src/app/not-found.tsx"))).toBe(true);
        const src = read("src/app/not-found.tsx");
        expect(src).toMatch(/Sayfa bulunamadı/);
        expect(src).toMatch(/href="\/dashboard"/);
        // Tema token'ı kullanmazsa aydınlık/koyu temada okunmaz hâle gelir.
        expect(src).toMatch(/var\(--/);
    });

    it("kök hata sınırı var VE kendi html/body'sini render ediyor", () => {
        expect(existsSync(join(root, "src/app/global-error.tsx"))).toBe(true);
        const src = read("src/app/global-error.tsx");
        const code = stripComments(src);
        // Kök layout çöktüğü için Next bu bileşenin belgeyi kendisinin
        // kurmasını bekler; olmazsa hata yine yutulur. Yorumlar SOYULUYOR:
        // aksi hâlde dosyanın kendi açıklaması testi yeşil tutuyordu.
        expect(code).toMatch(/<html\b/);
        expect(code).toMatch(/<\/html>/);
        expect(code).toMatch(/<body\b/);
        expect(src).toMatch(/Sentry\.captureException/);
        expect(src).toMatch(/"use client"/);
    });

    it("iki sınır ayrı işler görür — biri diğerinin yerine geçmez", () => {
        // `error.tsx` sayfa/segment hatası, `global-error.tsx` kök layout hatası.
        // Aynı adı taşımaları hangisinin ne yaptığını gizliyordu (eski ad:
        // `error.tsx` içinde `GlobalError`).
        expect(read("src/app/error.tsx")).toMatch(/export default function AppError/);
        expect(read("src/app/global-error.tsx")).toMatch(/export default function GlobalError/);
    });
});
