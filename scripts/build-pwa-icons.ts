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
    // iOS ana ekran: maske uygulamaz, köşeyi kendi yuvarlar → düz kare.
    // `src/app/` altında: Next bunu otomatik tanıyıp <link rel="apple-touch-icon">
    // üretir. `public/apple-touch-icon.png` yalnız iOS'un kök-yol TAHMİNİNE
    // güvenirdi — Next oradan link basmaz.
    ["src/app/apple-icon.png", 180, 0.16, false],
] as const;

/**
 * iOS açılış ekranı boyutları: [genişlik, yükseklik, cihaz piksel oranı].
 * Eşleşen bir görsel yoksa iOS ana ekrandan açılışta beyaz bir kare gösterir.
 * Liste modern iPhone ve iPad'leri kapsar; eşleşmeyen cihaz eski davranışa döner.
 */
const SPLASH: [number, number, number][] = [
    [1179, 2556, 3], // iPhone 15/14 Pro
    [1290, 2796, 3], // iPhone 15/14 Pro Max
    [1170, 2532, 3], // iPhone 13/12
    [1284, 2778, 3], // iPhone 13/12 Pro Max
    [1125, 2436, 3], // iPhone X/XS/11 Pro
    [828, 1792, 2],  // iPhone XR/11
    [750, 1334, 2],  // iPhone SE/8
    [1536, 2048, 2], // iPad 9.7"
    [1668, 2224, 2], // iPad Pro 10.5"
    [2048, 2732, 2], // iPad Pro 12.9"
];

/** Açılış ekranı: zemin + ortada marka (ikonun ~%22'si genişliğinde). */
function splashSvg(w: number, h: number): string {
    const mark = Math.round(Math.min(w, h) * 0.22);
    const scale = mark / 24;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="${BG}"/>
  <g transform="translate(${(w - mark) / 2} ${(h - mark) / 2}) scale(${scale})">
    <polygon points="${HEX}" fill="${MARK}" stroke="${MARK}" stroke-width="2.4" stroke-linejoin="round"/>
  </g>
</svg>`;
}

/** `metadata.appleWebApp.startupImage` girdisinin beklediği dosya adı. */
export function splashName(w: number, h: number): string {
    return `apple-splash-${w}x${h}.png`;
}

async function main(): Promise<void> {
    mkdirSync(join(process.cwd(), "public/icons"), { recursive: true });
    mkdirSync(join(process.cwd(), "public/splash"), { recursive: true });

    for (const [rel, size, padding, rounded] of TARGETS) {
        const png = await sharp(Buffer.from(svg(size, padding, rounded))).png({ compressionLevel: 9 }).toBuffer();
        writeFileSync(join(process.cwd(), rel), png);
        console.log(`  ${rel}  ${size}×${size}  ${(png.byteLength / 1024).toFixed(1)} KB`);
    }

    let splashBytes = 0;
    for (const [w, h] of SPLASH) {
        const png = await sharp(Buffer.from(splashSvg(w, h))).png({ compressionLevel: 9, palette: true }).toBuffer();
        writeFileSync(join(process.cwd(), "public/splash", splashName(w, h)), png);
        splashBytes += png.byteLength;
    }
    console.log(`  public/splash/  ${SPLASH.length} açılış ekranı  ${(splashBytes / 1024).toFixed(0)} KB`);
    console.log("[pwa-icons] ✅ üretildi — bu PNG'ler commit'lenir (deploy sharp'a bağlı kalmasın).");
}

// Yalnız doğrudan çağrıldığında koş — testler SPLASH/splashName'i import edebilsin.
if (process.argv[1]?.endsWith("build-pwa-icons.ts")) void main();

export { SPLASH };
