/**
 * Voice V3 — production/page.tsx source-regex regression locks.
 *
 * 1. mergeFireIntoNote @/lib/voice-note-helpers'tan import edilir (yeni helper dosyası)
 * 2. VoiceProductionEntry type-only import korunur (voice-service'in Anthropic SDK
 *    + server env client bundle'a sızmasın)
 * 3. handleVoiceResult fireNotes notlar'a entegre eder
 * 4. Ctrl+M useEffect guard'ları (e.repeat, isProcessing, INPUT/TEXTAREA/SELECT,
 *    isDemo) kilitlenir — gelecekte birinin silinmesi regresyon olur
 * 5. addEventListener + removeEventListener pair (cleanup)
 * 6. Mikrofon button title'da "Ctrl+M" hint'i
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const SOURCE = fs.readFileSync(
    path.join(process.cwd(), "src/app/dashboard/production/page.tsx"),
    "utf8",
);

describe("V3 — import boundary", () => {
    it("mergeFireIntoNote @/lib/voice-note-helpers'tan import edilir", () => {
        expect(SOURCE).toMatch(/import\s+\{\s*mergeFireIntoNote\s*\}\s+from\s+"@\/lib\/voice-note-helpers"/);
    });

    it("VoiceProductionEntry type-only import (server bundle leak yok)", () => {
        expect(SOURCE).toMatch(/import\s+type\s+\{\s*VoiceProductionEntry\s*\}\s+from\s+"@\/lib\/services\/voice-service"/);
    });

    it("voice-service'ten value import EDİLMEZ (Anthropic SDK + env leak guard)", () => {
        // Tek izin verilen voice-service referansı `import type` satırı
        const matches = SOURCE.match(/from\s+"@\/lib\/services\/voice-service"/g);
        expect(matches?.length ?? 0).toBe(1);
        // value import pattern'i yok
        expect(SOURCE).not.toMatch(/import\s+\{\s*[a-zA-Z_][a-zA-Z0-9_,\s]*\s*\}\s+from\s+"@\/lib\/services\/voice-service"/);
    });
});

describe("V3 — handleVoiceResult fireNotes entegrasyonu", () => {
    it("mergeFireIntoNote(entry.note || sessionNote, entry.fireNotes) pattern'i var", () => {
        expect(SOURCE).toMatch(/mergeFireIntoNote\(\s*entry\.note\s*\|\|\s*data\.sessionNote[^,]*,\s*entry\.fireNotes\s*\)/);
    });
});

describe("V3 — Ctrl+M keyboard shortcut guard'ları", () => {
    it("addEventListener('keydown', ...) var", () => {
        expect(SOURCE).toMatch(/document\.addEventListener\(\s*"keydown"/);
    });

    it("removeEventListener cleanup var", () => {
        expect(SOURCE).toMatch(/document\.removeEventListener\(\s*"keydown"/);
    });

    it("e.ctrlKey + e.key === 'm' veya 'M' kontrolü var", () => {
        expect(SOURCE).toMatch(/e\.ctrlKey/);
        expect(SOURCE).toMatch(/e\.key\s*!==\s*"m"\s*&&\s*e\.key\s*!==\s*"M"|e\.key\s*===\s*"m"\s*\|\|\s*e\.key\s*===\s*"M"/);
    });

    it("e.repeat held-down spam guard var", () => {
        expect(SOURCE).toMatch(/if\s*\(\s*e\.repeat\s*\)\s*return/);
    });

    it("isProcessing race guard var", () => {
        expect(SOURCE).toMatch(/if\s*\(\s*isProcessing\s*\)\s*return/);
    });

    it("INPUT/TEXTAREA/SELECT focus guard var", () => {
        expect(SOURCE).toMatch(/tag\s*===\s*"INPUT"/);
        expect(SOURCE).toMatch(/tag\s*===\s*"TEXTAREA"/);
        expect(SOURCE).toMatch(/tag\s*===\s*"SELECT"/);
    });

    it("isDemo guard var", () => {
        expect(SOURCE).toMatch(/if\s*\(\s*isDemo\s*\)\s*return/);
    });

    it("Mac Cmd+M (e.metaKey) handle EDİLMEZ (pencere minimize çakışması)", () => {
        // useEffect içinde metaKey kontrolü olmamalı
        const useEffectBlock = SOURCE.match(/useEffect\(\s*\(\)\s*=>\s*\{[\s\S]*?addEventListener\(\s*"keydown"[\s\S]*?\}\s*,\s*\[[^\]]*isProcessing[^\]]*\]\)/);
        expect(useEffectBlock).toBeTruthy();
        expect(useEffectBlock?.[0]).not.toMatch(/e\.metaKey/);
    });
});

describe("V3 — mikrofon button a11y hint", () => {
    it("button title attribute'unda 'Ctrl+M' geçiyor", () => {
        expect(SOURCE).toMatch(/title=\{[^}]*Ctrl\+M/);
    });

    it("hazır/kayıt durumları ortak Button + Lucide ikonlarla render edilir; mikrofon emojisi yok", () => {
        expect(SOURCE).toMatch(/leftIcon=\{<Mic size=\{14\} \/>}/);
        expect(SOURCE).toMatch(/leftIcon=\{<Square size=\{11\} fill="currentColor" \/>}/);
        expect(SOURCE).toMatch(/aria-label="Ses kaydını iptal et"/);
        expect(SOURCE).not.toContain("🎤");
        expect(SOURCE).not.toContain("■ Durdur");
    });
});
