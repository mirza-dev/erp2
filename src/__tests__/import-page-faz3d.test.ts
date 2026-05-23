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
        expect(SOURCE).toMatch(/onOpenClassicMode=\{?\(?\)?\s*=>\s*setShowClassic\(true\)/);
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
});
