// @vitest-environment node
/**
 * DashboardReport — yazdırılabilir rapor smoke (renderToStaticMarkup, jsdom-free).
 *  - Boş + dolu veriyle crash etmez.
 *  - Başlıkta seçili dönem (range) görünür → rapor ekranla eşleşir.
 *  - RBAC: canView=false → finansal tutarlar "—" (sızıntı yok).
 *  - `.dashboard-print-report` sınıfı (ekranda gizli, baskıda görünür).
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import DashboardReport from "@/components/dashboard/overview/DashboardReport";
import type {
    DashboardKpi, CategorySegment, ReceivablesView, RecentOrderRow, AlertRow,
} from "@/lib/dashboard-view-model";

const KPIS: DashboardKpi[] = [
    { id: "ciro", label: "Aylık Ciro", value: "$1.50M", tone: "accent", sub: "Haz ayı", delta: "+5%", up: true },
    { id: "stok", label: "Stok Değeri", value: "$0.46M", tone: "success", sub: "Satılabilir $337K · anlık" },
];
const SEGMENTS: CategorySegment[] = [{ name: "Vana", value: 1000, color: "var(--accent)" }];
const RECV: ReceivablesView = {
    buckets: [{ label: "Vadesi gelmemiş", value: 500, tone: "success" }],
    total: 500, overdue60: 0, overduePct: 0,
};
const ORDERS: RecentOrderRow[] = [{ id: "o1", no: "SO-1", customer: "Müşteri", amount: "$10K", status: "Rezerveli", tone: "info" }];
const ALERTS: AlertRow[] = [{ id: "al1", title: "Kritik stok", desc: "Vana DN50", tone: "danger", time: "2 sa önce" }];
const STATS = { productCount: 42, criticalCount: 3, riskCount: 5 };

function render(extra: Partial<React.ComponentProps<typeof DashboardReport>> = {}) {
    return renderToStaticMarkup(
        <DashboardReport
            range="Çeyrek"
            dateStr="10 Haziran 2026"
            reporting="USD"
            preparedBy="Mehmet Test"
            kpis={KPIS}
            trendSub="Son 4 çeyrek"
            labels={["Ç3'25", "Ç4'25", "Ç1'26", "Ç2'26"]}
            revenue={[0, 0, 100, 200]}
            cost={[0, 0, 50, 80]}
            counts={[0, 0, 1, 2]}
            trendEmpty={false}
            stockSegments={SEGMENTS}
            stockStats={STATS}
            receivables={RECV}
            orderRows={ORDERS}
            alertRows={ALERTS}
            canViewPrices
            canViewFinance
            {...extra}
        />,
    );
}

describe("DashboardReport", () => {
    it("dolu veriyle render eder; künye + seçili dönem + bölümler", () => {
        const html = render();
        expect(html).toContain("dashboard-print-report");
        expect(html).toContain("Genel Bakış Raporu");
        // Zengin künye: Roven logo/wordmark + dönem + hazırlayan.
        expect(html).toContain("Roven");
        expect(html).toContain("Dönem:");
        expect(html).toContain("Çeyrek");
        expect(html).toContain("Hazırlayan:");
        expect(html).toContain("Mehmet Test");
        // Bölümler (Detaylı kapsam, sıralı) — Finansal Özet bölümü kaldırıldı,
        // Stok Dağılımı pay yüzdesi + özet istatistiklerle ana bölüm oldu.
        expect(html).toContain("Özet Göstergeler");
        expect(html).not.toContain("Finansal Özet");
        expect(html).toContain("Ciro &amp; Maliyet · Son 4 çeyrek");
        expect(html).toContain("Stok Dağılımı");
        expect(html).toContain("Pay");
        expect(html).toContain("%100");
        expect(html).toContain("Aktif ürün");
        expect(html).toContain("Toplam");
        expect(html).toContain("Alacak Yaşlandırma");
        expect(html).toContain("Son Siparişler");
        expect(html).toContain("Kritik Uyarılar");
    });

    it("preparedBy yoksa Hazırlayan satırı render edilmez", () => {
        expect(render({ preparedBy: null })).not.toContain("Hazırlayan:");
    });

    it("stockStats verilmezse istatistik satırı yok; tablo yine tam", () => {
        const html = render({ stockStats: undefined });
        expect(html).not.toContain("Aktif ürün");
        expect(html).toContain("Stok Dağılımı");
    });

    it("boş veriyle crash etmez (boş-durum metinleri)", () => {
        const html = render({
            revenue: null, cost: null, counts: [], trendEmpty: true,
            stockSegments: [], receivables: null, orderRows: [], alertRows: [],
        });
        expect(html).toContain("Genel Bakış Raporu");
        expect(html).toContain("Sipariş yok.");
        expect(html).toContain("Acil uyarı yok.");
    });

    it("trendEmpty=true → 'Bu dönemde sipariş yok'", () => {
        expect(render({ trendEmpty: true })).toContain("Bu dönemde sipariş yok.");
    });

    it("RBAC: canViewPrices=false → ciro/stok tutarları '—' (maskeli)", () => {
        const html = render({ canViewPrices: false });
        // Stok segment değeri maskeli; ham 1000 sızmaz.
        expect(html).not.toContain("$1K");
        expect(html).toContain("—");
    });
});
