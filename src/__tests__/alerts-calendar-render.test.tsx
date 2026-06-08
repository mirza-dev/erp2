/**
 * Takvim bileşenleri gerçek render smoke (renderToStaticMarkup, jsdom-free).
 * DayPopover createPortal + document guard'lı → SSR'da null (sorun yok).
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CalendarGrid } from "@/components/alerts/CalendarGrid";
import { DayDetailPanel } from "@/components/alerts/DayDetailPanel";
import { expandAlertOccurrences, type CalendarAlert } from "@/lib/alert-calendar";

function ca(over: Partial<CalendarAlert>): CalendarAlert {
    return {
        id: "a1", type: "stock_critical", severity: "critical", status: "open",
        title: "Kritik Stok: Vana", reason: "Stok düşük", impact: "~2 gün",
        date: new Date(2026, 5, 7, 15, 25).toISOString(), time: "15:25",
        resolution: null, dueDate: null, dueLabel: null, orderCode: null,
        entityId: "p1", entityType: "product",
        product: { name: "Vana DN50", sku: "KV-50", available: 1, minStock: 5, reserved: 2, unit: "adet", coverageDays: 2 },
        source: null, aiConfidence: null, aiReason: null, aiModelVersion: null,
        ...over,
    };
}

describe("CalendarGrid render", () => {
    it("hafta başlıkları + gün numaraları + olay çubuğu", () => {
        const occ = expandAlertOccurrences([ca({})]);
        const html = renderToStaticMarkup(
            <CalendarGrid year={2026} month={5} occurrences={occ} selectedDate={new Date(2026, 5, 7)} onSelectDate={() => {}} />,
        );
        expect(html).toContain("Pzt");
        expect(html).toContain("Paz");
        expect(html).toContain(">7<"); // 7. gün
        expect(html).toContain("Vana DN50"); // olay çubuğu etiketi
    });

    it("hedef (due) oluşumu kesik-çizgili çubuk + ◷", () => {
        const occ = expandAlertOccurrences([
            ca({ id: "d", type: "overdue_shipment", product: null, orderCode: "SIP-1",
                 date: new Date(2026, 5, 4, 8).toISOString(), dueDate: "2026-06-10", dueLabel: "Planlanan Sevk" }),
        ]);
        const html = renderToStaticMarkup(
            <CalendarGrid year={2026} month={5} occurrences={occ} selectedDate={null} onSelectDate={() => {}} />,
        );
        expect(html).toContain("dashed"); // due çubuk kesik çizgi
        expect(html).toContain("◷");
    });
});

describe("DayDetailPanel render", () => {
    it("gün seçili değil → boş durum", () => {
        const html = renderToStaticMarkup(
            <DayDetailPanel selectedDate={null} occurrences={[]} onDetail={() => {}} onDismiss={() => {}} />,
        );
        expect(html).toContain("Detayları görmek için bir gün seçin");
    });

    it("seçili gün olaysız → 'kayıt yok'", () => {
        const html = renderToStaticMarkup(
            <DayDetailPanel selectedDate={new Date(2026, 5, 9)} occurrences={[]} onDetail={() => {}} onDismiss={() => {}} />,
        );
        expect(html).toContain("Bu gün için kayıt yok");
    });

    it("olay var → zaman çizelgesi + kart (saat + başlık + Detay)", () => {
        const occ = expandAlertOccurrences([ca({})]);
        const html = renderToStaticMarkup(
            <DayDetailPanel selectedDate={new Date(2026, 5, 7)} occurrences={occ} onDetail={() => {}} onDismiss={() => {}} />,
        );
        expect(html).toContain("15:25"); // saat rayı
        expect(html).toContain("Vana DN50");
        expect(html).toContain("Detay");
        expect(html).toContain("1 olay");
    });

    it("bugün rozeti", () => {
        const today = new Date();
        const html = renderToStaticMarkup(
            <DayDetailPanel selectedDate={today} occurrences={[]} onDetail={() => {}} onDismiss={() => {}} />,
        );
        expect(html).toContain("BUGÜN");
    });
});
