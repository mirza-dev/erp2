/**
 * Blok 4 — tutarlılık geçişi kilitleri.
 *
 * Bu bloğun bulgusu bir a11y açığıydı (20 elle yazılmış dialog, 7'sinde Escape).
 * Buradaki iddialar davranışın DOĞRU YERDE olduğunu korur: çerçeve
 * `ui/Modal`'da, sayfada değil — yoksa bir sonraki sayfa yine kendi backdrop'unu
 * yazar ve Escape'i unutur.
 *
 * Davranışın kendisi `modal-ui.test.tsx`'te gerçek render ile sınanıyor.
 * Kaynak iddiaları yorum-ayıklamalı (`code()`) — Blok 2'de yeşil bir testin
 * aslında bir YORUMA eşleştiğini öğrendik.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/** Yorumları düşürür — iddia açıklamaya değil koda bakmalı. */
function code(src: string): string {
    // Satır yorumları ÖNCE ayıklanır: bir `//` yorumunun içindeki `/**`
    // (ör. "// /dashboard/** erişimi") aksi hâlde blok yorum başlangıcı
    // sanılıp sonraki `*/`e kadar GERÇEK KODU yutuyordu (2026-08).
    return src.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Blok 4'te ortak Modal'a geçirilen altı yüzey. */
const MIGRATED = {
    noteTemplates: "src/components/settings/NoteTemplatesTab.tsx",
    typesList: "src/app/dashboard/settings/product-types/page.tsx",
    typesDetail: "src/app/dashboard/settings/product-types/[id]/page.tsx",
    resetDemo: "src/components/settings/ResetDemoSection.tsx",
    noteForm: "src/components/alerts/NoteFormModal.tsx",
    noteDetail: "src/components/alerts/CalendarNoteDetailModal.tsx",
} as const;

const SETTINGS = code(read("src/app/dashboard/settings/page.tsx"));

describe("Blok 4 — dialog çerçevesi tek yerde", () => {
    it("altı yüzeyin hiçbiri kendi role=dialog'unu yazmaz", () => {
        for (const [ad, path] of Object.entries(MIGRATED)) {
            const src = code(read(path));
            expect(src, `${ad} hâlâ kendi dialog'unu çiziyor`).not.toMatch(/role="dialog"/);
            expect(src, `${ad} hâlâ kendi backdrop'unu çiziyor`).not.toMatch(/aria-modal="true"/);
        }
    });

    it("altısı da ortak Modal'ı kullanır", () => {
        for (const [ad, path] of Object.entries(MIGRATED)) {
            const src = code(read(path));
            expect(src, `${ad} Modal import etmiyor`).toMatch(/from "@\/components\/ui\/Modal"/);
            expect(src, `${ad} Modal render etmiyor`).toMatch(/<Modal|<ConfirmModal/);
        }
    });

    it("ModalFrame repoda hiç kalmadı (iki çerçeve = kaldırılan tekrarın kendisi)", () => {
        const hits: string[] = [];
        const walk = (dir: string) => {
            for (const entry of readdirSync(dir)) {
                if (entry === "node_modules" || entry === ".next") continue;
                const p = join(dir, entry);
                if (statSync(p).isDirectory()) { walk(p); continue; }
                if (!/\.tsx?$/.test(entry)) continue;
                if (p.includes("/ui/Modal.tsx") || p.includes("__tests__")) continue;
                if (/\bModalFrame\b/.test(code(readFileSync(p, "utf8")))) hits.push(p);
            }
        };
        walk(join(process.cwd(), "src"));
        expect(hits).toEqual([]);
    });

    it("yıkıcı onaylar nativ window.confirm kullanmaz", () => {
        for (const path of [MIGRATED.noteTemplates, MIGRATED.typesDetail]) {
            expect(code(read(path)), `${path} hâlâ window.confirm çağırıyor`).not.toMatch(/window\.confirm/);
        }
    });

    it("yıkıcı işlem sürerken modal kazara kapanmaz", () => {
        // ResetDemoSection: sıfırlama sürerken Escape/dış tıklama kilitli.
        expect(code(read(MIGRATED.resetDemo))).toMatch(/dismissible=\{!busy\}/);
        // Form modalları: kaydetme sürerken aynı koruma.
        expect(code(read(MIGRATED.noteTemplates))).toMatch(/dismissible=\{!saving\}/);
        expect(code(read(MIGRATED.typesList))).toMatch(/dismissible=\{!creating\}/);
        expect(code(read(MIGRATED.typesDetail))).toMatch(/dismissible=\{!fieldSaving\}/);
    });
});

describe("Blok 4 — kabuk ve konvansiyon", () => {
    it("Teknik Şablonlar listesi ortak PageHeader kullanır", () => {
        const src = code(read(MIGRATED.typesList));
        expect(src).toMatch(/from "@\/components\/ui\/PageHeader"/);
        expect(src).toMatch(/<PageHeader\s/);
        expect(src).toMatch(/title="Teknik Şablonlar"/);
        // Elle yazılmış şerit geri gelmesin
        expect(src).not.toMatch(/const toolbarStyle/);
    });

    it("Ayarlar render sırasında cookie okumaz (useIsDemo konvansiyonu)", () => {
        expect(SETTINGS).not.toMatch(/isDemoMode\(\)/);
        // Üç sekmenin üçü de hook'u kullanıyor
        expect(SETTINGS.match(/useIsDemo\(\)/g)?.length).toBeGreaterThanOrEqual(3);
    });

    it("kaydedilmemiş değişiklikte çıkış uyarısı dirtyTabs'a bağlı", () => {
        expect(SETTINGS).toMatch(/if \(dirtyTabs\.size === 0\) return;/);
        expect(SETTINGS).toMatch(/window\.addEventListener\("beforeunload", handler\)/);
        expect(SETTINGS).toMatch(/window\.removeEventListener\("beforeunload", handler\)/);
    });
});
