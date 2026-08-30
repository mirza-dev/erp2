/**
 * GATE: PWA kurulabilirliği + service worker'ın zararsızlığı.
 *
 * İki ayrı risk var ve ikincisi çok daha ciddi:
 *
 *  1. Manifest bozulur / bir ikon dosyası kaybolur → "ana ekrana ekle" sessizce
 *     kaybolur. Can sıkıcı ama zararsız.
 *  2. **Service worker API yanıtlarını önbelleğe almaya başlar** → kullanıcı
 *     bayat sipariş listesi, bayat stok bakiyesi görür. Bir ERP'de bu, olmayan
 *     bir hatadan beterdir: yanlış veri "çalışıyor" gibi görünür. `sw.js`
 *     kasten aptal yazıldı; bu test onu aptal tutuyor.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const manifest = JSON.parse(readFileSync(join(root, "public/manifest.webmanifest"), "utf8")) as {
    id?: string;
    name?: string;
    short_name?: string;
    start_url?: string;
    display?: string;
    theme_color?: string;
    background_color?: string;
    icons?: { src: string; sizes: string; type: string; purpose?: string }[];
};
const sw = readFileSync(join(root, "public/sw.js"), "utf8");
const layout = readFileSync(join(root, "src/app/layout.tsx"), "utf8");
const nextConfig = readFileSync(join(root, "next.config.ts"), "utf8");

describe("GATE — PWA", () => {
    it("manifest kurulabilir olmak için gerekenleri taşıyor", () => {
        expect(manifest.name).toBeTruthy();
        expect(manifest.short_name).toBeTruthy();
        expect(manifest.start_url).toBe("/dashboard");
        expect(manifest.display).toBe("standalone");
        expect(manifest.id).toBeTruthy(); // kimlik sabit kalsın (yeniden yayında ikon değişmesin)
        const sizes = (manifest.icons ?? []).map((i) => i.sizes);
        expect(sizes).toContain("192x192");
        expect(sizes).toContain("512x512");
        expect((manifest.icons ?? []).some((i) => i.purpose === "maskable")).toBe(true);
    });

    it("manifest'in işaret ettiği her dosya diskte mevcut", () => {
        for (const icon of manifest.icons ?? []) {
            expect(existsSync(join(root, "public", icon.src))).toBe(true);
        }
        expect(existsSync(join(root, "public/apple-touch-icon.png"))).toBe(true);
    });

    it("service worker API'yi ve navigasyonu ASLA önbelleğe almıyor", () => {
        // En kritik iddia: bayat sipariş/stok servis eden bir ERP gerçek bir hata.
        expect(sw).toMatch(/url\.pathname\.startsWith\("\/api\/"\)/);
        expect(sw).toMatch(/req\.mode === "navigate"/);
        // Önbelleğe alma YALNIZ hash'li statik önekin altında olabilir.
        expect(sw).toMatch(/STATIC_PREFIX = "\/_next\/static\/"/);
        expect(sw).toMatch(/if \(!url\.pathname\.startsWith\(STATIC_PREFIX\)\) return;/);
        // cache.put'tan ÖNCE statik eleme yapılmış olmalı: dosyada tek put var
        // ve o da respondWith bloğunun içinde.
        expect(sw.match(/cache\.put\(/g)?.length ?? 0).toBe(1);
    });

    it("service worker kullanıcıyı eski build'e kilitleyemiyor", () => {
        expect(sw).toMatch(/skipWaiting\(\)/);
        expect(sw).toMatch(/clients\.claim\(\)/);
        expect(sw).toMatch(/caches\.delete/); // activate'te yabancı cache'ler silinir
        expect(sw).toMatch(/KILL SWITCH/); // kurtarma yordamı dosyada yazılı
    });

    it("layout manifest'e bağlı ve İKİ tema için de themeColor veriyor", () => {
        expect(layout).toMatch(/manifest: "\/manifest\.webmanifest"/);
        expect(layout).toMatch(/prefers-color-scheme: light/);
        expect(layout).toMatch(/prefers-color-scheme: dark/);
        expect(layout).toMatch(/ServiceWorkerRegister/);
    });

    it("theme_color globals.css'teki koyu tema zeminiyle aynı", () => {
        // Sapması, uygulama açılırken tarayıcı kabuğunun bir renk, sayfanın
        // başka bir renk olmasına yol açar (görünür flaş).
        const css = readFileSync(join(root, "src/app/globals.css"), "utf8");
        expect(css).toMatch(/--bg-primary:\s*#1a1d23/);
        expect(manifest.theme_color).toBe("#1a1d23");
        expect(manifest.background_color).toBe("#1a1d23");
    });


    it("PWA varlıkları middleware auth kapısını atlıyor", () => {
        // Çapraz dosya bağı: proxy.ts matcher'ı statik uzantıları dışlıyor.
        // Biri `webmanifest` veya `js`'i o listeden çıkarırsa service worker
        // kaydı ve "ana ekrana ekle" oturumu olmayan kullanıcıda SESSİZCE
        // ölür — hiçbir test kırılmadan.
        const proxy = readFileSync(join(root, "src/proxy.ts"), "utf8");
        const matcher = proxy.match(/matcher:\s*\[([\s\S]*?)\]/)?.[1] ?? "";
        expect(matcher).toContain("webmanifest");
        expect(matcher).toMatch(/\|js\|/);
        expect(matcher).toContain("png");
    });

    it("CSP service worker ve manifest'e açıkça izin veriyor", () => {
        expect(nextConfig).toMatch(/"worker-src 'self'"/);
        expect(nextConfig).toMatch(/"manifest-src 'self'"/);
    });
});
