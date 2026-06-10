// @vitest-environment node
/**
 * Genel Bakış panelleri — renderToStaticMarkup smoke (jsdom-free).
 *  - StockPanel: tam-genişlik revize (donut + paylı legend + özet istatistik kolonu)
 *    — Finansal Özet paneli kaldırıldı, bu panel o alanı karşılar.
 *  - ProductionPanel: dolu (good/scrap) ve boş durum.
 *  - AiPanel: idle render (fetch yalnız açılınca; render'da çağrı yok).
 *  - Sabit hex yok (yalnız onaylı CSS var) — finansal tint kontrolü.
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ProductionPanel from "@/components/dashboard/overview/ProductionPanel";
import AiPanel from "@/components/dashboard/overview/AiPanel";
import { StockPanel } from "@/components/dashboard/overview/RealPanels";
import type { CategorySegment } from "@/lib/dashboard-view-model";

describe("StockPanel — tam genişlik revize (Finansal Özet'in yerini karşılar)", () => {
    const SEGS: CategorySegment[] = [
        { name: "Vana", value: 600_000, color: "var(--accent)" },
        { name: "Aktüatör", value: 400_000, color: "var(--success)" },
    ];
    const STATS = { productCount: 42, criticalCount: 3, riskCount: 5 };

    it("dolu: pay yüzdesi + Toplam Stok Değeri + özet istatistikler", () => {
        const html = renderToStaticMarkup(<StockPanel segments={SEGS} currency="USD" canView stats={STATS} />);
        expect(html).toContain("Toplam Stok Değeri");
        expect(html).toContain("%60.0");
        expect(html).toContain("%40.0");
        expect(html).toContain("Aktif ürün");
        expect(html).toContain("Kritik stok");
        expect(html).toContain("Risk bandında");
        expect(html).toContain("2 kategori");
    });
    it("stats verilmezse istatistik kolonu satırları yok ama toplam var", () => {
        const html = renderToStaticMarkup(<StockPanel segments={SEGS} currency="USD" canView />);
        expect(html).toContain("Toplam Stok Değeri");
        expect(html).not.toContain("Aktif ürün");
    });
    it("RBAC: canView=false → değer kilitli mesajı", () => {
        const html = renderToStaticMarkup(<StockPanel segments={SEGS} currency="USD" canView={false} />);
        expect(html).toContain("Stok değerini görüntüleme yetkiniz yok");
        expect(html).not.toContain("Toplam Stok Değeri");
    });
    it("boş segments → boş durum mesajı", () => {
        const html = renderToStaticMarkup(<StockPanel segments={[]} currency="USD" canView stats={STATS} />);
        expect(html).toContain("Stok verisi yok");
    });
    it("sabit hex yok (yalnız var/color-mix)", () => {
        const html = renderToStaticMarkup(<StockPanel segments={SEGS} currency="USD" canView stats={STATS} />);
        expect(html).not.toMatch(/#[0-9a-fA-F]{6}/);
    });
});

describe("ProductionPanel", () => {
    it("dolu: BarChart + Sağlam/Fire legend", () => {
        const html = renderToStaticMarkup(<ProductionPanel days={["1", "2", "3"]} good={[100, 80, 120]} scrap={[3, 0, 5]} />);
        expect(html).toContain("Üretim (Son 14 gün)");
        expect(html).toContain("Sağlam");
        expect(html).toContain("Fire");
        expect(html).toContain("<svg");
    });
    it("boş: kayıt yok mesajı", () => {
        const html = renderToStaticMarkup(<ProductionPanel days={["1", "2"]} good={[0, 0]} scrap={[0, 0]} />);
        expect(html).toContain("Son 14 günde üretim kaydı yok");
    });
});

describe("AiPanel", () => {
    it("idle render crash etmez + başlık/AI rozeti", () => {
        const html = renderToStaticMarkup(<AiPanel />);
        expect(html).toContain("AI Operasyon Özeti");
        expect(html).toContain("AI");
    });
});

describe("StockPanel — değerler para birimi sembolü taşır + milyon-zorlaması yok", () => {
    const SEGS: CategorySegment[] = [
        { name: "Küresel Vanalar", value: 264_000, color: "var(--accent)" },
        { name: "Kelebek Vanalar", value: 19_000, color: "var(--success)" },
    ];
    it("USD → legend + donut merkezi '$' ile (milyon değil, gerçek büyüklük)", () => {
        const html = renderToStaticMarkup(<StockPanel segments={SEGS} currency="USD" canView />);
        expect(html).toContain("$264K");   // legend
        expect(html).toContain("$19K");
        expect(html).toContain("$283K");   // donut merkezi toplam (milyon-zorlama yok)
        expect(html).not.toContain("0.28M");
    });
    it("TRY → '₺' sembolü", () => {
        const html = renderToStaticMarkup(<StockPanel segments={SEGS} currency="TRY" canView />);
        expect(html).toContain("₺264K");
    });
});
