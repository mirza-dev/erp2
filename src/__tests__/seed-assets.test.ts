/**
 * seed-assets — sentetik PDF/PNG üreticilerinin format geçerliliği.
 * (Storage'a yüklenen dosyaların tarayıcı/önizlemede açılabilir olması için
 * imza + yapı kontrolleri; gerçek render testi tarayıcı smoke'unda.)
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { buildMiniHtml, buildMiniPdf, buildPlaceholderPng } from "@/lib/seed/seed-assets";

describe("buildMiniPdf", () => {
    it("geçerli PDF imzasıyla başlar ve EOF ile biter", () => {
        const pdf = buildMiniPdf("Test Belgesi", ["satır 1", "satır 2"]);
        expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
        expect(pdf.toString("latin1")).toContain("%%EOF");
        expect(pdf.length).toBeGreaterThan(300);
    });

    it("xref ve trailer içerir (okuyucular için zorunlu yapı)", () => {
        const s = buildMiniPdf("Başlık").toString("latin1");
        expect(s).toContain("xref");
        expect(s).toContain("trailer");
        expect(s).toContain("/Root 1 0 R");
    });

    it("Türkçe karakterleri WinAnsi-güvenli sadeleştirir, parantezleri kaçışlar", () => {
        const s = buildMiniPdf("Çelik Şartname (İhracat)").toString("latin1");
        expect(s).toContain("Celik Sartname \\(Ihracat\\)");
    });
});

describe("buildMiniHtml — teklif arşivi formatı", () => {
    it("geçerli UTF-8 HTML üretir, içeriği escape'ler", () => {
        const html = buildMiniHtml("Teklif <TKL-001> & Co", ["satır <1>"]).toString("utf-8");
        expect(html).toContain("<!doctype html>");
        expect(html).toContain('<meta charset="utf-8">');
        expect(html).toContain("Teklif &lt;TKL-001&gt; &amp; Co");
        expect(html).toContain("satır &lt;1&gt;");
    });

    it("runner teklif arşivini text/html olarak yükler — quote-pdfs bucket'ı (076) PDF KABUL ETMEZ", () => {
        const runner = readFileSync("src/lib/seed/seed-runner.ts", "utf8");
        const archiveBlock = runner.slice(runner.indexOf("Teklif arşivleri"), runner.indexOf("// ── 8."));
        expect(archiveBlock).toContain('"text/html"');
        expect(archiveBlock).toContain("buildMiniHtml");
        expect(archiveBlock).not.toContain('"application/pdf"');
    });
});

describe("buildPlaceholderPng", () => {
    it("geçerli PNG imzası + IHDR/IDAT/IEND chunk'ları", () => {
        const png = buildPlaceholderPng();
        expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        const s = png.toString("latin1");
        expect(s).toContain("IHDR");
        expect(s).toContain("IDAT");
        expect(s).toContain("IEND");
        expect(png.length).toBeGreaterThan(50);
    });

    it("renk parametresi çıktıyı değiştirir", () => {
        const a = buildPlaceholderPng([10, 20, 30]);
        const b = buildPlaceholderPng([200, 100, 50]);
        expect(a.equals(b)).toBe(false);
    });
});
