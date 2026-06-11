/**
 * Takvim bileşenleri gerçek render smoke (renderToStaticMarkup, jsdom-free).
 * DayPopover createPortal + document guard'lı → SSR'da null (sorun yok).
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CalendarGrid } from "@/components/alerts/CalendarGrid";
import { DayDetailPanel } from "@/components/alerts/DayDetailPanel";
import { AlertCalendarDrawer } from "@/components/alerts/AlertCalendarDrawer";
import { expandAlertOccurrences, type CalendarAlert } from "@/lib/alert-calendar";
import type { CalendarNote } from "@/lib/calendar-notes";

const noop = () => {};
function renderDrawer(over: Partial<CalendarAlert>) {
    return renderToStaticMarkup(
        <AlertCalendarDrawer
            alert={ca(over)}
            onClose={noop} onAcknowledge={noop} onResolve={noop} onDismiss={noop}
            onSyncRetry={noop} onDismissProduct={noop} onExtended={noop} onShipped={noop}
            isDemo={false} syncRetrying={false}
        />,
    );
}

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

function note(over: Partial<CalendarNote> = {}): CalendarNote {
    return {
        id: "n1", title: "Yönetim toplantısı", description: "Bütçe gözden geçirilecek",
        noteDate: "2026-06-07", noteTime: null, visibility: "company",
        ownerLabel: "Ayşe Yılmaz", createdAt: "2026-06-01T08:00:00Z",
        updatedAt: "2026-06-01T08:00:00Z", canManage: true, ...over,
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

    it("notları nötr önizleme olarak gösterir; uyarı occurrence listesine karıştırmaz", () => {
        const occ = expandAlertOccurrences([ca({})]);
        const html = renderToStaticMarkup(
            <CalendarGrid year={2026} month={5} occurrences={occ} notes={[note()]} selectedDate={null} onSelectDate={() => {}} />,
        );
        expect(occ).toHaveLength(1);
        expect(html).toContain("Yönetim toplantısı");
        expect(html).toContain("1 uyarı, 1 not");
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
        expect(html).toContain("1 uyarı");
    });

    it("bugün rozeti", () => {
        const today = new Date();
        const html = renderToStaticMarkup(
            <DayDetailPanel selectedDate={today} occurrences={[]} onDetail={() => {}} onDismiss={() => {}} />,
        );
        expect(html).toContain("BUGÜN");
    });

    it("not bölümü uyarı çizelgesinin üstündedir ve uyarı saat/sırası değişmez", () => {
        const occurrences = expandAlertOccurrences([
            ca({ id: "later", severity: "warning", time: "16:00", date: new Date(2026, 5, 7, 16).toISOString(), title: "Geç uyarı" }),
            ca({ id: "early", severity: "critical", time: "08:15", date: new Date(2026, 5, 7, 8, 15).toISOString(), title: "Erken uyarı" }),
        ]);
        const html = renderToStaticMarkup(
            <DayDetailPanel
                selectedDate={new Date(2026, 5, 7)}
                occurrences={occurrences}
                notes={[note({ noteTime: "09:00" }), note({ id: "all-day", title: "Tüm gün notu" })]}
                onDetail={() => {}} onDismiss={() => {}} onAddNote={() => {}} onNoteDetail={() => {}}
            />,
        );
        expect(html.indexOf("Notlar")).toBeLessThan(html.indexOf("Saat Bazlı Uyarılar"));
        expect(html.indexOf("08:15")).toBeLessThan(html.indexOf("16:00"));
        expect(html).toContain('data-testid="hourly-alert-timeline"');
        expect(html).toContain("TÜM GÜN");
    });
});

// Faz 2: tip-özel zengin bölümler gerçekten render ediliyor mu (gating doğru mu)
describe("AlertCalendarDrawer render — Faz 2 zengin bölümler", () => {
    it("quote_expired (open) → süre uzatma formu render", () => {
        const html = renderDrawer({
            type: "quote_expired", product: null, orderCode: "TKL-1", status: "open",
            entityId: "ord-1", entityType: "order",
        });
        expect(html).toContain("Teklif Süresini Uzat");
        expect(html).toContain("Süreyi Uzat");
        expect(html).toContain('type="date"');
    });

    it("overdue_shipment (open) → inline sevk formu render (3 alan)", () => {
        const html = renderDrawer({
            type: "overdue_shipment", product: null, orderCode: "SIP-1", status: "open",
            entityId: "ord-2", entityType: "order",
        });
        expect(html).toContain("Sevkiyatı Kaydet");
        expect(html).toContain("SEVK TARİHİ");
        expect(html).toContain("TAKİP NUMARASI");
        expect(html).toContain("TAŞIYICI");
        expect(html).toContain("Sevk Et");
    });

    it("order_shortage (open) → İlgili Siparişler + üretim derin-linki render", () => {
        const html = renderDrawer({
            type: "order_shortage", status: "open", entityId: "p1", entityType: "product",
        });
        expect(html).toContain("İlgili Siparişler");
        expect(html).toContain("Üretim Emri Başlat");
        expect(html).toContain("/dashboard/production?productId=p1");
    });

    it("resolved quote_expired → süre uzatma formu GİZLİ (isResolved gating)", () => {
        const html = renderDrawer({
            type: "quote_expired", product: null, orderCode: "TKL-1", status: "resolved",
            entityId: "ord-1", entityType: "order",
        });
        expect(html).not.toContain("Teklif Süresini Uzat");
        expect(html).toContain("Çözüldü"); // footer resolved durumu
    });

    it("entityId null (orphaned) → zengin form render edilmez, nav linki kalır", () => {
        const html = renderDrawer({
            type: "overdue_shipment", product: null, orderCode: "SIP-1", status: "open",
            entityId: null, entityType: "order",
        });
        expect(html).not.toContain("Sevkiyatı Kaydet");
        expect(html).toContain("Sevkiyatı Yönet"); // DRAWER_LINKS nav fallback
    });
});
