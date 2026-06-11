import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NoteFormModal } from "@/components/alerts/NoteFormModal";
import { CalendarNoteDetailModal } from "@/components/alerts/CalendarNoteDetailModal";
import { ClassificationTabs } from "@/components/alerts/ClassificationTabs";
import type { CalendarNote } from "@/lib/calendar-notes";

const noop = () => {};
const note = (canManage: boolean): CalendarNote => ({
    id: "n1", title: "Şirket toplantısı", description: "Gündem",
    noteDate: "2026-06-11", noteTime: "10:30", visibility: "company",
    ownerLabel: "Ayşe Yılmaz", createdAt: "2026-06-01T08:00:00Z",
    updatedAt: "2026-06-01T08:00:00Z", canManage,
});

describe("calendar note UI", () => {
    it("yeni not formu kişisel görünürlükle açılır; tarih/saat alanları vardır", () => {
        const html = renderToStaticMarkup(<NoteFormModal onClose={noop} onSaved={noop} isDemo={false} initialDate="2026-06-11" />);
        expect(html).toContain('aria-pressed="true"');
        expect(html).toContain("Yalnız ben");
        expect(html).toContain('type="date"');
        expect(html).toContain('type="time"');
        expect(html).not.toContain("Hatırlatma");
    });

    it("sahip olmayan kullanıcı salt okur; sahip düzenle ve sil aksiyonlarını görür", () => {
        const readOnly = renderToStaticMarkup(<CalendarNoteDetailModal note={note(false)} onClose={noop} onEdit={noop} onDeleted={noop} isDemo={false} />);
        expect(readOnly).not.toContain(">Düzenle<");
        expect(readOnly).not.toContain(">Sil<");

        const owner = renderToStaticMarkup(<CalendarNoteDetailModal note={note(true)} onClose={noop} onEdit={noop} onDeleted={noop} isDemo={false} />);
        expect(owner).toContain(">Düzenle<");
        expect(owner).toContain(">Sil<");
        expect(owner).toContain("Ayşe Yılmaz");
        expect(owner).toContain("Oluşturma");
    });

    it("Notlar filtresi ayrı sayılır; Tümü sayısı notları da içerir", () => {
        const html = renderToStaticMarkup(<ClassificationTabs activeClass="all" onSelect={noop} visibleAlerts={[]} visibleNotesCount={3} />);
        expect(html).toContain('aria-label="Tümü (3)"');
        expect(html).toContain('aria-label="Notlar (3)"');
    });
});
