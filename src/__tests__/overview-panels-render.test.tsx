// @vitest-environment node
/**
 * Genel Bakış panelleri — renderToStaticMarkup smoke (jsdom-free).
 *  - FinancePanel: dolu (brüt kâr + money-flow + aging) ve RBAC-kilitli (null) durumlar.
 *  - ProductionPanel: dolu (good/scrap) ve boş durum.
 *  - AiPanel: idle render (fetch yalnız açılınca; render'da çağrı yok).
 *  - Sabit hex yok (yalnız onaylı CSS var) — finansal tint kontrolü.
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import FinancePanel from "@/components/dashboard/overview/FinancePanel";
import ProductionPanel from "@/components/dashboard/overview/ProductionPanel";
import AiPanel from "@/components/dashboard/overview/AiPanel";
import type { FinanceSummary, ReceivablesView } from "@/lib/dashboard-view-model";

const FIN: FinanceSummary = { revenue: 1_000_000, cost: 710_000, grossProfit: 290_000, marginPct: 29, costPct: 71 };
const RECV: ReceivablesView = {
    buckets: [
        { label: "Vadesi gelmemiş", value: 100_000, tone: "success" },
        { label: "0–30 gün", value: 50_000, tone: "info" },
        { label: "31–60 gün", value: 20_000, tone: "warning" },
        { label: "60+ gün", value: 10_000, tone: "danger" },
    ],
    total: 180_000, overdue60: 10_000, overduePct: 44,
};

describe("FinancePanel", () => {
    it("dolu: brüt kâr + marj + money-flow + alacak yaşlandırma", () => {
        const html = renderToStaticMarkup(<FinancePanel reporting="USD" monthLabel="Haziran 2026" finance={FIN} canViewCosts receivables={RECV} />);
        expect(html).toContain("Brüt Kâr");
        expect(html).toContain("29 marj");
        expect(html).toContain("Maliyet 71%");
        expect(html).toContain("Alacak Yaşlandırma");
        expect(html).toContain("ödeme entegrasyonu beklemede");
    });
    it("yetki yok (canViewCosts=false) → 'yetki yok' mesajı", () => {
        const html = renderToStaticMarkup(<FinancePanel reporting="USD" monthLabel="Haziran 2026" finance={null} canViewCosts={false} receivables={RECV} />);
        expect(html).toContain("Maliyet/kâr görüntüleme yetkiniz yok");
        expect(html).toContain("Alacak Yaşlandırma");
    });
    it("yetki var ama veri yok (cold start) → 'veri henüz hazır değil' (dürüst, yetki demez)", () => {
        const html = renderToStaticMarkup(<FinancePanel reporting="USD" monthLabel="Haziran 2026" finance={null} canViewCosts receivables={RECV} />);
        expect(html).toContain("Maliyet verisi henüz hazır değil");
        expect(html).not.toContain("yetkiniz yok");
    });
    it("RBAC: receivables null → alacak kilitli mesajı", () => {
        const html = renderToStaticMarkup(<FinancePanel reporting="USD" monthLabel="Haziran 2026" finance={FIN} canViewCosts receivables={null} />);
        expect(html).toContain("Alacak özeti görüntüleme yetkiniz yok");
    });
    it("sabit hex yok (yalnız var/color-mix)", () => {
        const html = renderToStaticMarkup(<FinancePanel reporting="USD" monthLabel="Haziran 2026" finance={FIN} canViewCosts receivables={RECV} />);
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
