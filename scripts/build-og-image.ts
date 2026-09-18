/**
 * Sosyal paylaşım görselini (`public/og.png`, 1200×630) üretir.
 *
 * Neden STATİK PNG, `opengraph-image.tsx` değil: dinamik OG rotası
 * `/opengraph-image` oturum kapısından (`src/proxy.ts`) geçer — WhatsApp,
 * LinkedIn, Slack gibi bağlantı tarayıcıları oturumsuzdur, `/login`'e 307
 * alır ve kart görselsiz çıkar. `.png` ise proxy matcher'ından zaten muaf.
 * Ayrıca çalışma zamanında font izleme (nft) derdi yok; PNG commit'lenir.
 *
 * Neden Playwright, `sharp`+SVG değil: librsvg metni sistem fontconfig'iyle
 * çizer, Geist'i göremez ve Türkçe harflerde sessizce yedek fonta düşer.
 * Chromium tam CSS + gömülü woff2 ile aynı görseli her makinede üretir.
 *
 * Metinler `docs/brand/roven-marka-rehberi.md` §1.3 / §8'den; renkler §4.4
 * tema-muaf sabitleri (`scripts/brand-mark.ts`). Bu görselde ürün ekranı
 * YOK — OG kartı küçük boyutta paylaşılır, ekran görüntüsü orada okunmaz.
 *
 * Politika notu (2026-09-19): "ürün ekranı yayınlanmaz, gerçek veri sızar"
 * kuralı artık MUTLAK değil. Landing gerçek ürün ekranları gösteriyor, ama
 * yalnız `npm run shots` (scripts/build-product-shots.ts) üzerinden: yerel
 * veritabanında adlar kurgusallaştırılır, veritabanı VE ekrandaki metin
 * yasak adlara karşı taranır, bulunursa görsel yazılmaz. Elle alınmış bir
 * ekran görüntüsü yayınlanmaz (rehber §1.5).
 *
 * Kullanım: npm run og:image
 *   İsteğe bağlı: PLAYWRIGHT_CHROMIUM_PATH=<chrome-headless-shell yolu>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import {
    BRAND_ACCENT_DARK,
    BRAND_DARK_GROUND,
    BRAND_DARK_INK,
    BRAND_DARK_INK_2,
    MARK_VIEWBOX,
    markSvgInner,
} from "./brand-mark";

const ROOT = process.cwd();
const OUT = join(ROOT, "public", "og.png");
const WIDTH = 1200;
const HEIGHT = 630;

function fontDataUri(rel: string): string {
    const buf = readFileSync(join(ROOT, "node_modules", "geist", "dist", "fonts", rel));
    return `data:font/woff2;base64,${buf.toString("base64")}`;
}

function mark(size: number, color: string): string {
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${MARK_VIEWBOX} ${MARK_VIEWBOX}" fill="none" aria-hidden="true">${markSvgInner(color)}</svg>`;
}

const PROOFS = ["Aynı stoğu iki kez satmaz", "Riskleri önceden söyler", "Kurulum bir öğleden sonra"];

const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8">
<style>
@font-face{font-family:"Geist";font-weight:500;src:url("${fontDataUri("geist-sans/Geist-Medium.woff2")}") format("woff2")}
@font-face{font-family:"Geist";font-weight:700;src:url("${fontDataUri("geist-sans/Geist-Bold.woff2")}") format("woff2")}
@font-face{font-family:"Geist Mono";font-weight:500;src:url("${fontDataUri("geist-mono/GeistMono-Medium.woff2")}") format("woff2")}
html,body{margin:0;width:${WIDTH}px;height:${HEIGHT}px;overflow:hidden}
body{position:relative;background:${BRAND_DARK_GROUND};color:${BRAND_DARK_INK};font-family:"Geist",system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.mesh{position:absolute;inset:0;background:
  radial-gradient(55% 60% at 82% 10%, rgba(56,139,253,.28), transparent 70%),
  radial-gradient(40% 40% at 8% 0%, rgba(56,139,253,.10), transparent 70%)}
.grid{position:absolute;inset:0;opacity:.45;
  -webkit-mask-image:linear-gradient(180deg,#000,transparent 75%);
  background-image:linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px);
  background-size:64px 64px}
.ghost{position:absolute;right:-60px;top:-40px;opacity:.06}
.wrap{position:absolute;inset:0;padding:64px 72px;display:flex;flex-direction:column;justify-content:space-between}
.lockup{display:flex;align-items:center;gap:12px;font-weight:700;font-size:34px;line-height:1;letter-spacing:0}
.eyebrow{margin-top:44px;display:inline-flex;align-items:center;gap:10px;font-family:"Geist Mono",monospace;font-weight:500;font-size:16px;letter-spacing:.14em;text-transform:uppercase;color:${BRAND_ACCENT_DARK}}
.eyebrow i{width:8px;height:8px;border-radius:50%;background:${BRAND_ACCENT_DARK};box-shadow:0 0 0 4px rgba(56,139,253,.35)}
h1{margin:22px 0 0;font-weight:700;font-size:82px;line-height:1.02;letter-spacing:-.035em;max-width:900px}
h1 span{background:linear-gradient(110deg,#79c0ff,${BRAND_ACCENT_DARK} 55%,#9fd0ff);-webkit-background-clip:text;background-clip:text;color:transparent}
.sub{margin:26px 0 0;font-weight:500;font-size:28px;line-height:1.35;color:${BRAND_DARK_INK_2};max-width:880px}
.proofs{display:flex;gap:14px}
.proofs span{display:inline-flex;align-items:center;gap:10px;padding:12px 18px;border-radius:999px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);font-weight:500;font-size:19px;color:${BRAND_DARK_INK_2}}
.proofs svg{color:#3fb950}
</style></head><body>
<div class="mesh"></div><div class="grid"></div>
<div class="ghost">${mark(560, BRAND_DARK_INK)}</div>
<div class="wrap">
  <div>
    <div class="lockup">${mark(38, BRAND_DARK_INK)}<span>Roven</span></div>
    <div class="eyebrow"><i></i>Yapay zeka destekli ERP</div>
    <h1>İşletmenin tamamı,<br><span>tek ekranda.</span></h1>
    <p class="sub">Teklif, sipariş, stok, üretim ve muhasebe tek akışta.</p>
  </div>
  <div class="proofs">${PROOFS.map((p) => `<span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>${p}</span>`).join("")}</div>
</div>
</body></html>`;

async function main() {
    const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;
    const browser = await chromium.launch({ executablePath });
    try {
        const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
        await page.setContent(html, { waitUntil: "domcontentloaded" });
        await page.evaluate(() => document.fonts.ready);
        const png = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
        writeFileSync(OUT, png);
        console.log(`✓ public/og.png (${WIDTH}×${HEIGHT}, ${(png.length / 1024).toFixed(0)} KB)`);
    } finally {
        await browser.close();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
