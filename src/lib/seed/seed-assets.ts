/**
 * seed-assets — seed'in storage'a yüklediği SENTETİK mini dosyaların saf üreticileri.
 *
 * Neden sentetik: repo public — pmt/ klasöründeki gerçek datasheet/sertifika/teklif
 * dosyaları (tedarikçi fiyatları içerir) repo'ya veya seed koduna KONMAZ. Bu üreticiler
 * geçerli, küçük (1-3 KB) PDF/PNG byte'ları üretir; önizleme/indirme uçtan uca test edilir.
 *
 * DIŞ ETKİ YOK: bu modül yalnız Buffer üretir; ağ/disk erişimi yapmaz.
 */
import { deflateSync } from "node:zlib";

// ── Mini PDF ─────────────────────────────────────────────────────────────────
// Tek sayfalık, Helvetica metinli, xref offset'leri doğru hesaplanmış geçerli PDF.

function escapePdfText(s: string): string {
    // Latin-1 dışı karakterleri sadeleştir (WinAnsi: Türkçe İıŞş vs. sorun çıkarabilir)
    const ascii = s
        .replace(/[İ]/g, "I").replace(/[ı]/g, "i")
        .replace(/[Şş]/g, m => (m === "Ş" ? "S" : "s"))
        .replace(/[Ğğ]/g, m => (m === "Ğ" ? "G" : "g"))
        .replace(/[Üü]/g, m => (m === "Ü" ? "U" : "u"))
        .replace(/[Öö]/g, m => (m === "Ö" ? "O" : "o"))
        .replace(/[Çç]/g, m => (m === "Ç" ? "C" : "c"));
    return ascii.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export function buildMiniPdf(title: string, lines: string[] = []): Buffer {
    const content = [
        "BT /F1 16 Tf 50 780 Td (" + escapePdfText(title) + ") Tj ET",
        ...lines.map((l, i) =>
            "BT /F1 10 Tf 50 " + (750 - i * 16) + " Td (" + escapePdfText(l) + ") Tj ET"),
    ].join("\n");

    const objects = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
        "<< /Length " + content.length + " >>\nstream\n" + content + "\nendstream",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ];

    let body = "%PDF-1.4\n";
    const offsets: number[] = [];
    objects.forEach((obj, i) => {
        offsets.push(body.length);
        body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
    });
    const xrefStart = body.length;
    let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const off of offsets) xref += String(off).padStart(10, "0") + " 00000 n \n";
    const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
    return Buffer.from(body + xref + trailer, "latin1");
}

// ── Mini HTML (teklif arşivi — quote-pdfs bucket'ı YALNIZ text/html kabul eder, 076) ──

export function buildMiniHtml(title: string, lines: string[] = []): Buffer {
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const html = `<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><title>${esc(title)}</title></head>
<body style="font-family:sans-serif;max-width:720px;margin:40px auto;color:#1a2230">
<h1 style="font-size:20px">${esc(title)}</h1>
${lines.map(l => `<p style="font-size:13px;margin:6px 0">${esc(l)}</p>`).join("\n")}
</body></html>
`;
    return Buffer.from(html, "utf-8");
}

// ── Placeholder PNG ──────────────────────────────────────────────────────────
// 48×48 düz renkli geçerli PNG (CRC32 + zlib deflate ile elle kurulur).

const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c >>> 0;
    }
    return t;
})();

function crc32(buf: Buffer): number {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typeAndData));
    return Buffer.concat([len, typeAndData, crc]);
}

export function buildPlaceholderPng(rgb: [number, number, number] = [42, 98, 154]): Buffer {
    const size = 48;
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(size, 0);          // width
    ihdr.writeUInt32BE(size, 4);          // height
    ihdr[8] = 8;                          // bit depth
    ihdr[9] = 2;                          // color type: truecolor
    // satır başına 1 filter byte + RGB pikseller
    const raw = Buffer.alloc(size * (1 + size * 3));
    for (let y = 0; y < size; y++) {
        const rowStart = y * (1 + size * 3);
        raw[rowStart] = 0;
        for (let x = 0; x < size; x++) {
            // kenarlık: dış 2 piksel koyu — düz karenin "görsel" olduğu belli olsun
            const edge = x < 2 || y < 2 || x >= size - 2 || y >= size - 2;
            const [r, g, b] = edge ? [20, 32, 48] : rgb;
            const p = rowStart + 1 + x * 3;
            raw[p] = r; raw[p + 1] = g; raw[p + 2] = b;
        }
    }
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        pngChunk("IHDR", ihdr),
        pngChunk("IDAT", deflateSync(raw)),
        pngChunk("IEND", Buffer.alloc(0)),
    ]);
}
