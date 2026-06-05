/**
 * Dashboard — "AI Operasyon Özeti" + "Aktif Uyarılar" tıklanınca açılır (collapsible).
 *
 * Kullanıcı kararları:
 *   - Her iki bölüm varsayılan KAPALI başlar (useState(false)) — "tıklanınca görünsün".
 *   - Kapalıyken başlık + özet rozet görünür ([AI] / "N açık").
 *   - AISummaryCard kapalıyken MOUNT olmaz (open && <AISummaryCard>) → AI ops-summary
 *     çağrısı yalnız ilk açılışta yapılır (her dashboard yüklemesinde değil).
 *
 * Kaynak okuma yöntemi (customers-ui / vendors-ui aynası): JSX davranışı jsdom render
 * etmeden source-regex ile kilitlenir.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PAGE_SRC = readFileSync(
    join(process.cwd(), "src/app/dashboard/page.tsx"),
    "utf8",
);
const ALERTS_SRC = readFileSync(
    join(process.cwd(), "src/components/dashboard/AIAlerts.tsx"),
    "utf8",
);
const SUMMARY_SRC = readFileSync(
    join(process.cwd(), "src/components/dashboard/AISummaryCard.tsx"),
    "utf8",
);

// ── 1. Varsayılan kapalı ────────────────────────────────────

describe("Dashboard collapsible — varsayılan kapalı başlar", () => {
    it("showAiSummary ve showAlerts state'leri useState(false) ile başlar", () => {
        expect(PAGE_SRC).toMatch(/const \[showAiSummary, setShowAiSummary\] = useState\(false\)/);
        expect(PAGE_SRC).toMatch(/const \[showAlerts, setShowAlerts\] = useState\(false\)/);
    });
});

// ── 2. Lazy mount (kapalıyken bileşen mount olmaz) ──────────

describe("Dashboard collapsible — lazy mount", () => {
    it("CollapsibleSection 'open && children' ile yalnız açıkken render eder", () => {
        expect(PAGE_SRC).toMatch(/\{open && <div[^>]*>\{children\}<\/div>\}/);
    });

    it("AISummaryCard ve AIAlerts CollapsibleSection içine sarılır", () => {
        expect(PAGE_SRC).toMatch(/<CollapsibleSection[\s\S]*?<AISummaryCard \/>[\s\S]*?<\/CollapsibleSection>/);
        expect(PAGE_SRC).toMatch(/<CollapsibleSection[\s\S]*?<AIAlerts \/>[\s\S]*?<\/CollapsibleSection>/);
    });
});

// ── 3. Toggle erişilebilirliği ──────────────────────────────

describe("Dashboard collapsible — a11y toggle", () => {
    it("CollapsibleSection başlık butonu aria-expanded={open} taşır", () => {
        expect(PAGE_SRC).toMatch(/aria-expanded=\{open\}/);
    });

    it("onToggle setShowAiSummary / setShowAlerts'i ters çevirir", () => {
        expect(PAGE_SRC).toMatch(/onToggle=\{\(\) => setShowAiSummary\(o => !o\)\}/);
        expect(PAGE_SRC).toMatch(/onToggle=\{\(\) => setShowAlerts\(o => !o\)\}/);
    });
});

// ── 4. Kapalı görünüm rozetleri ─────────────────────────────

describe("Dashboard collapsible — özet rozetler", () => {
    it("Uyarılar rozeti openAlerts.length + 'açık' gösterir (loading değilken)", () => {
        expect(PAGE_SRC).toMatch(/!loading && openAlerts\.length > 0/);
        expect(PAGE_SRC).toMatch(/\{openAlerts\.length\} açık/);
    });

    it("AI bölümü 'AI' rozeti taşır", () => {
        expect(PAGE_SRC).toMatch(/title="AI Operasyon Özeti"/);
        expect(PAGE_SRC).toMatch(/title="Aktif Uyarılar"/);
    });

    it("useData openAlerts ve loading'i çeker (rozet için)", () => {
        expect(PAGE_SRC).toMatch(/const \{ products, refetchAll, openAlerts, loading \} = useData\(\)/);
    });
});

// ── 5. Çift başlık olmaz (advisor fix — wrapper tek başlık kaynağı) ─────

describe("Dashboard collapsible — iç bileşenler başlığı tekrarlamaz", () => {
    it("AIAlerts artık kendi 'Aktif Uyarılar' başlığını render etmez", () => {
        // Başlık + "N açık" rozeti wrapper'a taşındı. Footer linki ("N açık uyarı")
        // kasıtlı korunur — duplicate olan başlık satırıdır.
        expect(ALERTS_SRC).not.toMatch(/Aktif Uyarılar/);
    });

    it("AISummaryCard artık 'Operasyon Özeti' başlığını render etmez", () => {
        // "AI Operasyon Özeti" ve "Operasyon Özeti" başlıklarının ikisi de kalkmalı
        expect(SUMMARY_SRC).not.toMatch(/Operasyon Özeti/);
    });

    it("AISummaryCard 'Yenile' aksiyonunu korur (başlık kalkarken silinmemeli)", () => {
        expect(SUMMARY_SRC).toMatch(/Yenile/);
        expect(SUMMARY_SRC).toMatch(/fetchSummary\(true\)/);
    });
});
