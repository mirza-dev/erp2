// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// next/link → düz <a> stub (node render)
vi.mock("next/link", () => ({
    default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
        <a href={href} {...rest}>{children}</a>
    ),
}));

import ImportGuide from "@/components/import/ImportGuide";
import { getAiImportOperation } from "@/lib/ai-import-operations";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const render = (opId: string) =>
    renderToStaticMarkup(<ImportGuide selectedOperation={getAiImportOperation(opId)} />);

describe("ImportGuide render", () => {
    it("3 adım şeridini render eder (numara + başlıklar)", () => {
        const html = render("product_update");
        expect(html).toContain("İşlemi seç");
        expect(html).toContain("Dosyayı yükle");
        expect(html).toContain("İncele ve onayla");
    });

    it("seçili işleme göre 'veri nereye gider' özeti gösterir", () => {
        const html = render("customer_upsert");
        // customer → Cariler
        expect(html).toContain("Cariler");
        expect(html).toContain("Müşteri içe aktar/güncelle");
    });

    it("işlem değişince özet hedefi değişir (product → Stok & Ürünler)", () => {
        const html = render("product_create");
        expect(html).toContain("Stok &amp; Ürünler");
    });

    it("collapsible 'Nasıl çalışır' detay + data-testid içerir", () => {
        const html = render("product_update");
        expect(html).toContain('data-testid="import-guide-details"');
        expect(html).toContain("Nasıl çalışır");
        expect(html).toContain("Veri hedefleri");
        // kapalı durumda açılma sinyali (chevron) görünür
        expect(html).toContain("▸");
    });

    it("Excel şablon indirme linkleri /api/import/templates işaret eder", () => {
        const html = render("product_update");
        expect(html).toContain('href="/api/import/templates?kind=product"');
        expect(html).toContain('href="/api/import/templates?kind=stock_count"');
        expect(html).toContain("download");
    });

    it("güven notları render edilir (onay + finansal)", () => {
        const html = render("product_update");
        expect(html).toContain("Verileriniz güvende");
        expect(html.toLowerCase()).toContain("onay");
        expect(html.toLowerCase()).toMatch(/fiyat|maliyet/);
    });

    it("tema-uyumlu: sabit hex renk yok (var(--...) kullanılır)", () => {
        const html = render("product_update");
        expect(html).not.toMatch(/#[0-9a-fA-F]{6}/);
    });
});

describe("ImportGuide entegrasyon (source-regression)", () => {
    it("import sayfası ImportGuide'ı mount eder (selectedAiOperation ile)", () => {
        const src = read("src/app/dashboard/import/page.tsx");
        expect(src).toContain('import ImportGuide from "@/components/import/ImportGuide"');
        expect(src).toContain("<ImportGuide selectedOperation={selectedAiOperation} />");
    });
});
