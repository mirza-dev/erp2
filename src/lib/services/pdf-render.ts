/**
 * Faz D — Katalog PDF sayfası → PNG render (mupdf WASM).
 *
 * mupdf (Artifex MuPDF.js) native bağımlılık içermez (WASM) → Coolify
 * `node:20-alpine` standalone'da çalışır. WASM init maliyetli olduğundan
 * import LAZY (`await import("mupdf")`) — build graph + cold-start temiz kalır
 * (quote-archive `react-dom/server` dinamik import paterni).
 *
 * Hibrit kırpma (kullanıcı kararı): AI normalize bbox + güven verir;
 * `pickRenderClip` eşiği geçerse mupdf clip ile ürün görseli kırpılır,
 * aksi halde tam sayfa render edilir (review önizleme + apply-onay güvenlik ağı).
 */

/** AI'dan gelen normalize (0-1) bölge + güven. */
export interface NormalizedImageRegion {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    confidence: number;
}

/** Kırpma için minimum güven — altındaysa tam sayfa render edilir. */
export const REGION_CONFIDENCE_THRESHOLD = 0.6;

/** Dejenere/çok küçük bbox koruması: sayfa alanının en az %2'si olmalı. */
export const MIN_REGION_AREA = 0.02;

/**
 * Saf helper — AI bölgesinden geçerli normalize clip [x0,y0,x1,y1] döndürür
 * veya null (tam sayfa). Test edilebilir; render'dan ayrı.
 *  - confidence eşiğin altında → null
 *  - koordinat 0-1 dışı / finite değil → null
 *  - x0<x1 ve y0<y1 değilse → null
 *  - alan eşiğin altında → null
 */
export function pickRenderClip(
    region: NormalizedImageRegion | null | undefined,
): [number, number, number, number] | null {
    if (!region || typeof region !== "object") return null;
    const { x0, y0, x1, y1, confidence } = region;
    if (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < REGION_CONFIDENCE_THRESHOLD) {
        return null;
    }
    const coords = [x0, y0, x1, y1];
    if (coords.some(v => typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1)) return null;
    if (!(x0 < x1) || !(y0 < y1)) return null;
    if ((x1 - x0) * (y1 - y0) < MIN_REGION_AREA) return null;
    return [x0, y0, x1, y1];
}

export interface RenderPdfPageOptions {
    /** Normalize (0-1) clip; null/yoksa tam sayfa. */
    clip?: [number, number, number, number] | null;
    /** Render ölçeği (DPI çarpanı); varsayılan 2 (≈144dpi). */
    scale?: number;
}

/**
 * PDF buffer'ından `pageIndex` (0-tabanlı) sayfasını PNG Buffer olarak render eder.
 * `clip` verilirse o normalize bölge kırpılır (DrawDevice), yoksa tam sayfa.
 * Hata/geçersiz sayfa → throw (caller non-fatal yakalar; görsel apply'ı bozmaz).
 */
export async function renderPdfPageToPng(
    buffer: Buffer,
    pageIndex: number,
    opts?: RenderPdfPageOptions,
): Promise<Buffer> {
    const mupdf = await import("mupdf");
    const scale = opts?.scale ?? 2;
    const clip = opts?.clip ?? null;

    const doc = mupdf.Document.openDocument(buffer, "application/pdf");
    let page: ReturnType<typeof doc.loadPage> | null = null;
    try {
        const total = doc.countPages();
        if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= total) {
            throw new Error(`Geçersiz sayfa indexi ${pageIndex} (toplam ${total})`);
        }
        page = doc.loadPage(pageIndex);
        const matrix = mupdf.Matrix.scale(scale, scale);

        if (!clip) {
            const pix = page.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB, false);
            try {
                return Buffer.from(pix.asPNG());
            } finally {
                pix.destroy();
            }
        }

        // Kırpma: normalize clip'i sayfa-pt koordinatına, sonra device-pixel'e çevir.
        const [bx0, by0, bx1, by1] = page.getBounds();
        const w = bx1 - bx0;
        const h = by1 - by0;
        const [nx0, ny0, nx1, ny1] = clip;
        const clipPage: [number, number, number, number] = [
            bx0 + nx0 * w,
            by0 + ny0 * h,
            bx0 + nx1 * w,
            by0 + ny1 * h,
        ];
        const devClip = mupdf.Rect.transform(clipPage, matrix).map(Math.round) as [number, number, number, number];
        const pix = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, devClip, false);
        const dev = new mupdf.DrawDevice(matrix, pix);
        try {
            pix.clear(255); // beyaz zemin
            page.run(dev, mupdf.Matrix.identity);
            dev.close();
            return Buffer.from(pix.asPNG());
        } finally {
            dev.destroy();
            pix.destroy();
        }
    } finally {
        page?.destroy();
        doc.destroy();
    }
}
