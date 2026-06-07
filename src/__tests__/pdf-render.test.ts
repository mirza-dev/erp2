/**
 * Faz D — pdf-render: pickRenderClip (saf) + renderPdfPageToPng (gerçek mupdf).
 */
import { describe, it, expect } from "vitest";
import {
    pickRenderClip,
    renderPdfPageToPng,
    REGION_CONFIDENCE_THRESHOLD,
} from "@/lib/services/pdf-render";

// Minimal geçerli tek-sayfa PDF (300x400 pt) — doğru xref offset'leriyle.
function buildMinimalPdf(): Buffer {
    const objs = [
        "<</Type/Catalog/Pages 2 0 R>>",
        "<</Type/Pages/Kids[3 0 R]/Count 1>>",
        "<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 400]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>",
        "<</Length 50>>\nstream\nBT /F1 24 Tf 40 200 Td (KATALOG TEST) Tj ET\nendstream",
        "<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>",
    ];
    let pdf = "%PDF-1.4\n";
    const offsets: number[] = [];
    objs.forEach((body, i) => {
        offsets.push(Buffer.byteLength(pdf));
        pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
    });
    const xrefStart = Buffer.byteLength(pdf);
    pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
    offsets.forEach(o => { pdf += `${String(o).padStart(10, "0")} 00000 n \n`; });
    pdf += `trailer\n<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xrefStart}\n%%EOF`;
    return Buffer.from(pdf, "latin1");
}

function pngSize(buf: Buffer): { w: number; h: number; isPng: boolean } {
    const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), isPng };
}

describe("pickRenderClip", () => {
    it("region yok → null (tam sayfa)", () => {
        expect(pickRenderClip(null)).toBeNull();
        expect(pickRenderClip(undefined)).toBeNull();
    });
    it("güven eşiğin altında → null", () => {
        expect(pickRenderClip({ x0: 0.1, y0: 0.1, x1: 0.6, y1: 0.6, confidence: REGION_CONFIDENCE_THRESHOLD - 0.01 })).toBeNull();
    });
    it("güven eşiğin üstünde + geçerli bbox → tuple", () => {
        expect(pickRenderClip({ x0: 0.1, y0: 0.1, x1: 0.6, y1: 0.6, confidence: 0.9 }))
            .toEqual([0.1, 0.1, 0.6, 0.6]);
    });
    it("koordinat 0-1 dışı → null", () => {
        expect(pickRenderClip({ x0: -0.1, y0: 0.1, x1: 0.6, y1: 0.6, confidence: 0.9 })).toBeNull();
        expect(pickRenderClip({ x0: 0.1, y0: 0.1, x1: 1.5, y1: 0.6, confidence: 0.9 })).toBeNull();
    });
    it("x0>=x1 / y0>=y1 → null", () => {
        expect(pickRenderClip({ x0: 0.6, y0: 0.1, x1: 0.6, y1: 0.6, confidence: 0.9 })).toBeNull();
        expect(pickRenderClip({ x0: 0.1, y0: 0.6, x1: 0.6, y1: 0.6, confidence: 0.9 })).toBeNull();
    });
    it("çok küçük alan (eşik altı) → null", () => {
        expect(pickRenderClip({ x0: 0.5, y0: 0.5, x1: 0.51, y1: 0.51, confidence: 0.9 })).toBeNull();
    });
    it("confidence NaN/sayı değil → null", () => {
        expect(pickRenderClip({ x0: 0.1, y0: 0.1, x1: 0.6, y1: 0.6, confidence: NaN })).toBeNull();
    });
});

describe("renderPdfPageToPng (gerçek mupdf)", () => {
    const pdf = buildMinimalPdf();

    it("tam sayfa @2x → geçerli PNG 600x800", async () => {
        const png = await renderPdfPageToPng(pdf, 0);
        const { w, h, isPng } = pngSize(png);
        expect(isPng).toBe(true);
        expect(w).toBe(600);
        expect(h).toBe(800);
    });

    it("clip [0.1,0.1,0.6,0.5] → kırpılmış PNG (tam sayfadan küçük)", async () => {
        const png = await renderPdfPageToPng(pdf, 0, { clip: [0.1, 0.1, 0.6, 0.5] });
        const { w, h, isPng } = pngSize(png);
        expect(isPng).toBe(true);
        // (0.6-0.1)*300*2 = 300 ; (0.5-0.1)*400*2 = 320
        expect(w).toBe(300);
        expect(h).toBe(320);
    });

    it("geçersiz sayfa indexi → throw", async () => {
        await expect(renderPdfPageToPng(pdf, 5)).rejects.toThrow(/Geçersiz sayfa/);
        await expect(renderPdfPageToPng(pdf, -1)).rejects.toThrow(/Geçersiz sayfa/);
    });

    it("scale opsiyonu render boyutunu ölçekler", async () => {
        const png = await renderPdfPageToPng(pdf, 0, { scale: 1 });
        const { w, h } = pngSize(png);
        expect(w).toBe(300);
        expect(h).toBe(400);
    });
});
