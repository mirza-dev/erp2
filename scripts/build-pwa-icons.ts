/**
 * PWA ikonlarını `src/app/icon.svg`'deki altıgen markadan üretir.
 *
 * Neden script: `icon.svg` içinde `prefers-color-scheme` medya sorgusu var —
 * marka açık temada koyu, koyu temada açık boyanıyor. Rasterleştirmede medya
 * sorgusu UYGULANMAZ, yani ham SVG'yi PNG'ye çevirmek sessizce tek varyantı
 * (koyu marka, şeffaf zemin) üretir ve koyu launcher zemininde kaybolur.
 * Bu yüzden ikon SABİT renklerle yeniden kuruluyor: koyu zemin + açık marka,
 * her iki launcher zemininde okunur.
 *
 * Üretilen PNG'ler COMMIT'LENİR — deploy `sharp`'a bağlı kalmasın.
 *
 * Kullanım: npm run pwa:icons
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

/** globals.css `:root` (varsayılan koyu tema) `--bg-primary` ve marka rengi. */
const BG = "#1a1d23";
const MARK = "#e6edf3";

/** icon.svg'deki altıgen — 24×24 viewBox'taki noktalar birebir. */
const HEX = "12,2.6 20.2,7.3 20.2,16.7 12,21.4 3.8,16.7 3.8,7.3";

/**
 * @param padding markanın kenara oranı. Maskable ikonlarda launcher köşeleri
 *   kırpar; %20 güvenli alan bırakmak marka kesilmesin diye şart.
 */
function svg(size: number, padding: number, rounded: boolean): string {
    const inner = size * (1 - padding * 2);
    const offset = (size - inner) / 2;
    const scale = inner / 24;
    const r = rounded ? size * 0.22 : 0;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${r}" fill="${BG}"/>
  <g transform="translate(${offset} ${offset}) scale(${scale})">
    <polygon points="${HEX}" fill="${MARK}" stroke="${MARK}" stroke-width="2.4" stroke-linejoin="round"/>
  </g>
</svg>`;
}

const TARGETS = [
    // [dosya, boyut, kenar boşluğu oranı, köşe yuvarlama]
    ["public/icons/icon-192.png", 192, 0.16, true],
    ["public/icons/icon-512.png", 512, 0.16, true],
    // maskable: launcher kendi maskesini uygular → köşe yuvarlama YOK, boşluk FAZLA
    ["public/icons/icon-maskable-512.png", 512, 0.26, false],
    // iOS ana ekran: maske uygulamaz, köşeyi kendi yuvarlar → düz kare
    ["public/apple-touch-icon.png", 180, 0.16, false],
] as const;

async function main(): Promise<void> {
    mkdirSync(join(process.cwd(), "public/icons"), { recursive: true });
    for (const [rel, size, padding, rounded] of TARGETS) {
        const png = await sharp(Buffer.from(svg(size, padding, rounded))).png({ compressionLevel: 9 }).toBuffer();
        writeFileSync(join(process.cwd(), rel), png);
        console.log(`  ${rel}  ${size}×${size}  ${(png.byteLength / 1024).toFixed(1)} KB`);
    }
    console.log("[pwa-icons] ✅ üretildi — bu PNG'ler commit'lenir (deploy sharp'a bağlı kalmasın).");
}

void main();
