/**
 * Genel Bakış — AI Operasyon Özeti collapsible + lazy fetch (TAM-SADIK yeniden kurulum).
 *
 * Tasarım AiPanel'i: collapsible (defaultOpen=false), açılınca ops-summary'yi LAZY fetch eder
 * (her dashboard yüklemesinde AI çağrısı YOK), headline + 2-kolon tonlu maddeler + "Tüm analizi gör".
 * Faz 1'in page-içi CollapsibleSection + AISummaryCard'ı yerini `AiPanel` bileşenine bıraktı.
 * AlertsPanel uyarıları collapsible olarak korur. AISummaryCard dosyası repoda kalır (silinmedi).
 *
 * Source-regex yöntemi.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const PAGE = readFileSync(join(root, "src/app/dashboard/page.tsx"), "utf8");
const AIPANEL = readFileSync(join(root, "src/components/dashboard/overview/AiPanel.tsx"), "utf8");
const REALPANELS = readFileSync(join(root, "src/components/dashboard/overview/RealPanels.tsx"), "utf8");

describe("AiPanel — collapsible + lazy fetch", () => {
    it("sayfa <AiPanel /> render eder", () => {
        expect(PAGE).toMatch(/<AiPanel\s*\/>/);
    });
    it("AiPanel collapsible + defaultOpen={false}", () => {
        expect(AIPANEL).toMatch(/collapsible/);
        expect(AIPANEL).toMatch(/defaultOpen=\{false\}/);
    });
    it("lazy: yalnız açılınca (onToggle + idle guard) ops-summary fetch", () => {
        expect(AIPANEL).toMatch(/onToggle=\{onToggle\}/);
        expect(AIPANEL).toMatch(/if \(open && state === "idle"\) fetchSummary\(\)/);
        expect(AIPANEL).toMatch(/fetch\("\/api\/ai\/ops-summary", \{ method: "POST" \}\)/);
    });
    it("başlık 'AI Operasyon Özeti' + AI rozeti", () => {
        expect(AIPANEL).toMatch(/title="AI Operasyon Özeti"/);
        expect(AIPANEL).toMatch(/badge badge-info/);
    });
    it("ops-summary {summary,insights,anomalies} → aiPointsFromOpsSummary", () => {
        expect(AIPANEL).toMatch(/aiPointsFromOpsSummary/);
    });
    it("ops-summary önbelleğini (15dk) korur — tekrar AI çağrısı engellenir", () => {
        expect(AIPANEL).toMatch(/kokpit_ops_summary/);
    });
});

describe("Uyarılar — AlertsPanel collapsible (kapalı başlar)", () => {
    it("sayfa <AlertsPanel render eder", () => {
        expect(PAGE).toMatch(/<AlertsPanel/);
    });
    it("AlertsPanel OverviewPanel collapsible + defaultOpen={false}", () => {
        expect(REALPANELS).toMatch(/export function AlertsPanel/);
        expect(REALPANELS).toMatch(/collapsible[\s\S]*?defaultOpen=\{false\}/);
    });
});
