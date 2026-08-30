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
    shortcuts?: { name: string; url: string }[];
    categories?: string[];
    display_override?: string[];
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
        // apple ikonu artık src/app/apple-icon.png (Next <link>'i oradan üretir) —
        // ayrı testte doğrulanıyor.
    });

    it("service worker API'yi ve navigasyonu ASLA önbelleğe almıyor", () => {
        // En kritik iddia: bayat sipariş/stok servis eden bir ERP gerçek bir hata.
        expect(sw).toMatch(/url\.pathname\.startsWith\("\/api\/"\)/);
        expect(sw).toMatch(/req\.mode === "navigate"/);
        // Önbelleğe alma YALNIZ hash'li statik önekin altında olabilir.
        expect(sw).toMatch(/STATIC_PREFIX = "\/_next\/static\/"/);
        expect(sw).toMatch(/if \(!url\.pathname\.startsWith\(STATIC_PREFIX\)\) return;/);
        // cache.put'tan ÖNCE eleme yapılmış olmalı. Eskiden "dosyada tek put var"
        // diye sayılıyordu; çevrimdışı precache ikinci meşru put'u getirince sayı
        // kuralı işe yaramaz oldu. Sayı yerine HER put'un izinli iki biçimden biri
        // olduğunu doğruluyoruz: ya sabit çevrimdışı sayfa, ya da STATIC_PREFIX
        // elemesinden geçmiş `req`. Üçüncü bir biçim (ör. bir API yanıtı) kırar.
        const puts = sw.match(/cache\.put\([^;]*\);/g) ?? [];
        expect(puts.length).toBeGreaterThan(0);
        for (const put of puts) {
            expect(put).toMatch(/^cache\.put\((OFFLINE_URL, res|req, res\.clone\(\))\);$/);
        }
    });

    it("service worker kullanıcıyı eski build'e kilitleyemiyor", () => {
        // install'da skipWaiting() ÇAĞRILMAZ: yeni worker "waiting"te beklemeli ki
        // ServiceWorkerUpdatePrompt kullanıcıya sorabilsin. Onay gelince mesajla aktive olur.
        expect(sw).not.toMatch(/install[\s\S]{0,200}self\.skipWaiting\(\)/);
        expect(sw).toMatch(/type === "SKIP_WAITING"/);
        expect(sw).toMatch(/clients\.claim\(\)/);
        expect(sw).toMatch(/caches\.delete/); // activate'te yabancı cache'ler silinir
        expect(sw).toMatch(/KILL SWITCH/); // kurtarma yordamı dosyada yazılı
    });

    it("önbellek sınırsız büyüyemiyor", () => {
        // Her deploy yeni hash'li chunk üretir; tavan olmazsa önbellek aylar
        // içinde sınırsız büyür ve hiçbir şey onu küçültmez.
        expect(sw).toMatch(/MAX_ENTRIES\s*=\s*\d+/);
        expect(sw).toMatch(/async function trim\(/);
        expect(sw).toMatch(/void trim\(cache\)/);
    });

    it("çevrimdışı yedek sayfa precache'te ve gezinme YAKALAMASINDA", () => {
        expect(existsSync(join(root, "src/app/offline/page.tsx"))).toBe(true);
        expect(sw).toMatch(/OFFLINE_URL = "\/offline"/);
        expect(sw).toMatch(/fetch\(OFFLINE_URL, \{ cache: "reload" \}\)/); // install'da precache
        // Gezinme ağa gider; SADECE hata olursa yedek döner — yanıt önbelleğe YAZILMAZ.
        expect(sw).toMatch(/fetch\(req\)\.catch\(/);
        expect(sw).toMatch(/caches\.match\(OFFLINE_URL\)/);
    });

    it("precache YÖNLENDİRİLMİŞ yanıtı önbelleğe yazamıyor", () => {
        // `cache.add` bunu yapamaz: yönlendirmeyi izler ve HEDEFİ /offline anahtarına
        // yazar. Yönlendirilmiş bir yanıt ise bir GEZİNME isteğini karşılayamaz (SW
        // spec) → respondWith TypeError atar, kullanıcı yedek sayfa yerine tarayıcının
        // ağ hatası ekranını görür. 2026-08-31'de ölçülen gerçek arıza buydu.
        expect(sw).toMatch(/res\.ok && !res\.redirected/);
        expect(sw).toMatch(/cache\.put\(OFFLINE_URL, res\)/);
        expect(sw).not.toMatch(/cache\.add\(/); // add() koşulsuz yazar — geri gelmesin
    });

    it("çevrimdışı sayfa oturumsuz ziyaretçide de erişilebilir", () => {
        // Kapının arkasındayken /login'e 307 dönüyordu; service worker kurulumu
        // yönlendirmeyi izleyip GİRİŞ SAYFASINI /offline anahtarına yazıyordu.
        // Sayfa sunucu verisi okumaz, istemci mantığı içermez — public olması güvenli.
        const proxy = readFileSync(join(root, "src/proxy.ts"), "utf8");
        const list = proxy.match(/const ALWAYS_PUBLIC = \[([\s\S]*?)\];/)?.[1] ?? "";
        expect(list).toContain('"/offline"');
    });

    it("çevrimdışı sayfa next/link KULLANMIYOR (linter'ın 'düzeltmesine' karşı)", () => {
        // Link istemci-taraflı gezinme yapar ve RSC yükü ister — çevrimdışıyken
        // olmayan şey tam olarak bu. Düz <a> tam belge isteği zorlar = "ağı tekrar
        // dene". react-doctor burayı nextjs-no-a-element diye işaretliyor; bilinçli.
        const offline = readFileSync(join(root, "src/app/offline/page.tsx"), "utf8");
        expect(offline).not.toMatch(/from "next\/link"/);
        expect(offline).toMatch(/<a\s/);
        expect(offline).toMatch(/next\/link DEĞİL, bilinçli/); // gerekçe kodda kalsın
    });

    it("service worker development'ta kaydolmuyor, mevcut kaydı söküyor", () => {
        // Guard yetmez: SW kaydı kalıcıdır. Bir kez dev'de koşan geliştiricide
        // kayıtlı kalır ve /_next/static/ chunk'larını cache-first servis eder
        // → kod değiştiği halde eski JS çalışır.
        const reg = readFileSync(join(root, "src/components/ServiceWorkerRegister.tsx"), "utf8");
        expect(reg).toMatch(/process\.env\.NODE_ENV !== "production"/);
        expect(reg).toMatch(/getRegistrations\(\)/);
        expect(reg).toMatch(/\.unregister\(\)/);
        expect(reg).toMatch(/caches\.delete\(/);
    });

    it("güncelleme istemi Toast sağlayıcısının İÇİNDE mount edilmiş", () => {
        // ToastProvider kök layout'ta DEĞİL (dashboard layout'ta) — useToast()
        // kökten çağrılsaydı çalışma zamanında patlardı.
        const dash = readFileSync(join(root, "src/app/dashboard/layout.tsx"), "utf8");
        expect(dash).toMatch(/<ServiceWorkerUpdatePrompt \/>/);
        const providerAt = dash.indexOf("<ToastProvider>");
        const promptAt = dash.indexOf("<ServiceWorkerUpdatePrompt />");
        expect(providerAt).toBeGreaterThanOrEqual(0);
        expect(promptAt).toBeGreaterThan(providerAt);
        expect(layout).not.toMatch(/ServiceWorkerUpdatePrompt/); // kök layout'ta OLMAMALI

        const prompt = readFileSync(join(root, "src/components/ServiceWorkerUpdatePrompt.tsx"), "utf8");
        expect(prompt).toMatch(/duration: 0/); // 3 saniyede kaybolan istem sorulmamış sayılır
        expect(prompt).toMatch(/SKIP_WAITING/);
    });

    it("iOS: apple-icon Next'in tanıdığı yerde, açılış ekranları eksiksiz", () => {
        // public/apple-touch-icon.png yalnız iOS'un kök-yol TAHMİNİNE güvenirdi;
        // src/app/apple-icon.png'yi Next tanıyıp <link rel="apple-touch-icon"> basar.
        expect(existsSync(join(root, "src/app/apple-icon.png"))).toBe(true);
        // Next `capable: true` için yalnız `mobile-web-app-capable` basıyor
        // (tarayıcıda ölçüldü); iOS 16.4 öncesi Apple'ın metasını istiyor.
        expect(layout).toMatch(/"apple-mobile-web-app-capable": "yes"/);
        expect(existsSync(join(root, "public/apple-touch-icon.png"))).toBe(false);

        // layout'taki her startupImage girdisinin dosyası diskte olmalı.
        const urls = [...layout.matchAll(/apple-splash-(\d+)x(\d+)\.png/g)];
        const declared = [...layout.matchAll(/\[(\d+), (\d+), (\d)\]/g)];
        expect(declared.length).toBeGreaterThanOrEqual(10);
        for (const [, w, h] of declared.map((m) => [m[0], m[1], m[2]])) {
            expect(existsSync(join(root, `public/splash/apple-splash-${w}x${h}.png`))).toBe(true);
        }
        expect(urls.length + declared.length).toBeGreaterThan(0);
    });

    it("manifest kısayolları GERÇEK rotalara işaret ediyor", () => {
        const shortcuts = (manifest.shortcuts ?? []) as { url: string }[];
        expect(shortcuts.length).toBeGreaterThanOrEqual(3);
        for (const sc of shortcuts) {
            const route = sc.url.replace(/^\/dashboard/, "src/app/dashboard");
            expect(existsSync(join(root, route, "page.tsx"))).toBe(true);
        }
        expect(manifest.categories).toBeDefined();
        expect(manifest.display_override).toContain("standalone");
    });

    it("mobil çekmece iOS ana ekran çizgisinin altında kalmıyor", () => {
        const dash = readFileSync(join(root, "src/app/dashboard/layout.tsx"), "utf8");
        expect(dash).toMatch(/env\(safe-area-inset-bottom\)/);
        // viewport-fit: cover EKLENMEMELİ — statusBarStyle "default" ile birlikte
        // üst tarafta bugün olmayan bir sorun yaratır.
        expect(layout).not.toMatch(/viewportFit/);
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

    it("dar ekranda girdiler 16px — iOS otomatik yakınlaştırması", () => {
        // iOS Safari 16px altındaki bir alana dokunulduğunda sayfayı yakınlaştırır ve
        // geri uzaklaştırmaz. 2026-08-31 ölçümü: 69 görünür alanın 68'i 12–13.5px'ti,
        // giriş ekranındaki e-posta alanı dahil. Kural yalnız dar ekranda geçerli —
        // masaüstü yoğunluğu korunur. `!important` şart: alanlar inline style ile
        // boyutlanıyor ve inline style normal kuralı yener.
        const css = readFileSync(join(root, "src/app/globals.css"), "utf8");
        expect(css).toMatch(
            /@media \(max-width: 768px\) \{[\s\S]{0,200}?input:not\(\[type="checkbox"\]\)[\s\S]{0,200}?font-size: 16px !important;/,
        );
    });

    it("CSP service worker ve manifest'e açıkça izin veriyor", () => {
        expect(nextConfig).toMatch(/"worker-src 'self'"/);
        expect(nextConfig).toMatch(/"manifest-src 'self'"/);
    });
});
