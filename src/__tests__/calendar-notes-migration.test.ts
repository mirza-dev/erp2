import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/092_calendar_notes.sql"), "utf8");
const alertsRoute = readFileSync(resolve(process.cwd(), "src/app/api/alerts/route.ts"), "utf8");
const scanRoute = readFileSync(resolve(process.cwd(), "src/app/api/alerts/scan/route.ts"), "utf8");
const alertsPage = readFileSync(resolve(process.cwd(), "src/app/dashboard/alerts/page.tsx"), "utf8");
const dayPanel = readFileSync(resolve(process.cwd(), "src/components/alerts/DayDetailPanel.tsx"), "utf8");

describe("092 calendar notes migration", () => {
    it("kişisel/şirket not tablosu, sahiplik ve tarih/saat alanlarını oluşturur", () => {
        expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS calendar_notes/);
        expect(migration).toMatch(/visibility IN \('personal', 'company'\)/);
        expect(migration).toMatch(/owner_id\s+uuid REFERENCES auth\.users\(id\)/);
        expect(migration).toMatch(/note_date\s+date NOT NULL/);
        expect(migration).toMatch(/note_time\s+time/);
    });

    it("eski user_note kayıtlarını idempotent şirket notuna taşır ve alerts'ten siler", () => {
        expect(migration).toMatch(/legacy_alert_id uuid UNIQUE/);
        expect(migration).toMatch(/COALESCE\(a\.due_date, \(a\.created_at AT TIME ZONE 'Europe\/Istanbul'\)::date\)/);
        expect(migration).toMatch(/'company'/);
        expect(migration).toMatch(/ON CONFLICT \(legacy_alert_id\) DO NOTHING/);
        expect(migration).toMatch(/DELETE FROM alerts WHERE type = 'user_note'/);
    });

    it("yeni alert type constraint user_note içermez; alert POST ve scan not davranışı kaldırılmıştır", () => {
        const constraint = migration.slice(migration.lastIndexOf("ADD CONSTRAINT alerts_type_check"));
        expect(constraint).not.toContain("'user_note'");
        expect(alertsRoute).not.toContain("export async function POST");
        expect(scanRoute).not.toContain("noteEscalated");
        expect(scanRoute).not.toContain("dbEscalateOverdueUserNotes");
    });

    it("notlar uyarı occurrence/sayaç/yoksay hattına karışmaz", () => {
        expect(alertsPage).toMatch(/getCalendarStats\(calendarAlerts\)/);
        expect(alertsPage).toMatch(/dayOccurrences[\s\S]*?dismissDay/);
        expect(alertsPage).toMatch(/getCalendarNotesForDate\(filteredNotes/);
        expect(dayPanel).toMatch(/const sorted = sortOccurrences\(occurrences\)/);
        expect(dayPanel).toMatch(/<CalendarNotesSection notes=\{notes\}/);
        expect(dayPanel).toMatch(/data-testid="hourly-alert-timeline"/);
        expect(dayPanel).not.toMatch(/sortOccurrences\(notes/);
    });
});
