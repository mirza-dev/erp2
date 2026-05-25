/**
 * Faz 3d (2026-05-23) — Import sayfası klasik mod accordion + AI default akış.
 *
 * Tab toggle ("AI ile Aktar" / "Klasik Mod") kaldırıldı; AI akışı her zaman
 * görünür, klasik mod alt <details> accordion'da fallback. migration_excel
 * tespit edilirse ClassifierQueue onOpenClassicMode callback'i ile parent
 * accordion'u açar.
 *
 * Source-regex tarzı: tam jsdom render'ı kompleks (DataContext + multiple state
 * dependency); kritik yapısal kararları kilitleyen pattern check'leri.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE = readFileSync(
    join(process.cwd(), "src/app/dashboard/import/page.tsx"),
    "utf8",
);

describe("Faz 3d — import page klasik mod accordion + AI polish", () => {
    it("ImportMode = 'ai' | 'classic' type union KALDIRILDI (artık kullanılmıyor)", () => {
        // Eski toggle tipinin tanımı silindi; sadece açıklayıcı yorum kalır.
        expect(SOURCE).not.toMatch(/^type ImportMode = "ai" \| "classic";?$/m);
    });

    it("useState<ImportMode> KALDIRILDI; yerine showClassic boolean state'i var", () => {
        expect(SOURCE).not.toMatch(/useState<ImportMode>/);
        expect(SOURCE).toMatch(/const \[showClassic, setShowClassic\] = useState\(false\)/);
    });

    it("Tab toggle (role='tablist' AI/Klasik) KALDIRILDI", () => {
        // Eski tab toggle aria-label'ı "İçe aktarım modu" idi
        expect(SOURCE).not.toMatch(/aria-label="İçe aktarım modu"/);
        // setMode("ai") / setMode("classic") çağrıları kalmamalı
        expect(SOURCE).not.toMatch(/setMode\("ai"\)/);
        expect(SOURCE).not.toMatch(/setMode\("classic"\)/);
    });

    it("AI akışı (DropZone + ClassifierQueue) her zaman render — mode==='ai' guard kalmadı", () => {
        // mode === "ai" koşullu render kaldırıldı
        expect(SOURCE).not.toMatch(/mode === "ai" &&/);
        // DropZone import + render var
        expect(SOURCE).toMatch(/<DropZone/);
        expect(SOURCE).toMatch(/<ClassifierQueue/);
    });

    it("ClassifierQueue'ya onOpenClassicMode prop'u geçer (migration_excel CTA)", () => {
        // Faz 3d Review (2026-05-23): inline arrow yerine openClassicFromCta
        // helper'a bağlı (scroll/focus için wrapper). Aşağıdaki P3 scroll
        // testi tam davranışı kontrol eder; burada yalnız prop bağlı mı.
        expect(SOURCE).toMatch(/onOpenClassicMode=\{openClassicFromCta\}/);
    });

    it("AI empty state — aiFiles.length === 0 ise yardım metni render edilir", () => {
        expect(SOURCE).toMatch(/aiFiles\.length === 0 &&/);
        expect(SOURCE).toMatch(/Henüz dosya yüklenmedi/);
        // Migration Excel için fallback yönergesi metinde
        expect(SOURCE).toMatch(/Migration Excel|Klasik Mod/);
    });

    it("Klasik mod <details> accordion içine alındı, default kapalı (showClassic=false)", () => {
        // <details> elementi + open binding
        expect(SOURCE).toMatch(/<details/);
        expect(SOURCE).toMatch(/open=\{showClassic\}/);
        // onToggle ile state senkron
        expect(SOURCE).toMatch(/onToggle=\{.*setShowClassic/);
        // Summary etiketinde "Klasik Mod" ve "Gelişmiş"
        expect(SOURCE).toMatch(/Gelişmiş.*Klasik Mod|Klasik Mod.*Gelişmiş/i);
    });

    it("Klasik wizard içeriği accordion'ın içinde — mode==='classic' guard kalmadı", () => {
        // Eski {mode === "classic" && ...} koşulu kaldırıldı
        expect(SOURCE).not.toMatch(/mode === "classic" &&/);
        // showClassic ile tek conditional reset button
        expect(SOURCE).toMatch(/showClassic && \(state !== "idle"/);
    });

    it("Header açıklama metni AI akışını anlatır (eski tab-aware metin kaldırıldı)", () => {
        // Eski koşullu metin "mode === ai ? ... : ..." kalmadı
        expect(SOURCE).not.toMatch(/mode === "ai"\s*\?\s*"Belge bırak/);
        // Yeni tek satır AI odaklı
        expect(SOURCE).toMatch(/Belge bırak, AI sınıflandırsın/);
    });

    // ── Faz 3d Review (2026-05-23) — 3 bulgu kapatma ──────────────────────────

    it("P3 typo fix: 'ürün katalogları' (eski 'kataloğları' kaldırıldı)", () => {
        expect(SOURCE).toMatch(/ürün katalogları/);
        expect(SOURCE).not.toMatch(/ürün kataloğları/);
    });

    it("P3 scroll/focus: openClassicFromCta wrapper helper'ı tanımlandı (CTA'dan açılırsa smooth scroll)", () => {
        // useRef classicDetailsRef + handler
        expect(SOURCE).toMatch(/classicDetailsRef\s*=\s*useRef<HTMLDetailsElement/);
        expect(SOURCE).toMatch(/openClassicFromCta/);
        expect(SOURCE).toMatch(/scrollIntoView.*behavior.*smooth/);
        // ClassifierQueue.onOpenClassicMode artık doğrudan setShowClassic değil
        expect(SOURCE).toMatch(/onOpenClassicMode=\{openClassicFromCta\}/);
        // <details ref={classicDetailsRef} ile bağlı
        expect(SOURCE).toMatch(/<details[\s\S]{0,200}ref=\{classicDetailsRef\}/);
    });

    it("P2 E2E adaptasyon: klasik wizard input'una data-testid='classic-import-file' eklendi", () => {
        expect(SOURCE).toMatch(/data-testid="classic-import-file"/);
    });

    // ── Faz 3d Review 2.tur (2026-05-23) — alert + accordion testid ──────

    it("Review 2 P2: error banner role='alert' + aria-live (a11y + E2E stability)", () => {
        // parseError JSX bloğu role="alert" ile başlar
        expect(SOURCE).toMatch(/parseError &&[\s\S]{0,300}role="alert"/);
        // Yumuşak aria-live (polite) — duplicate announce yok
        expect(SOURCE).toMatch(/aria-live="polite"/);
        // Close button (×) screen reader için aria-label
        expect(SOURCE).toMatch(/aria-label="Hata mesajını kapat"/);
    });

    it("Review 2 P3: <details> accordion'a data-testid='classic-mode-accordion' eklendi (locator stability)", () => {
        expect(SOURCE).toMatch(/<details[\s\S]{0,300}data-testid="classic-mode-accordion"/);
    });

    // ── E2E fix (2026-05-25) — import-error-banner testid scope ─────────────

    it("E2E fix: error banner div'inde data-testid='import-error-banner' var (route announcer çakışmasını engeller)", () => {
        // parseError JSX bloğu içinde testid bulunmalı — getByRole('alert')
        // Next.js prod build route announcer ile çakışıyor; testid scope çözer.
        expect(SOURCE).toMatch(/parseError &&[\s\S]{0,400}data-testid="import-error-banner"/);
    });

    it("E2E fix: tests/import.spec.ts getByTestId kullanır, eski getByRole('alert') geri gelmez", () => {
        const E2E_SRC = readFileSync(
            join(process.cwd(), "tests/import.spec.ts"),
            "utf8",
        );
        expect(E2E_SRC).toMatch(/getByTestId\("import-error-banner"\)/);
        // Defense-in-depth — eski selector geri gelirse strict-mode collision döner
        expect(E2E_SRC).not.toMatch(/getByRole\("alert"\)/);
    });
});
