/**
 * Kullanıcı notları / hatırlatmalar (mig.090) — POST /api/alerts + escalation + UI kilitleri.
 *
 * Sözleşme:
 *  - POST yalnız type=user_note yazar (source=ui damgalı); sistem/AI tipi enjekte edilemez
 *  - RBAC: view_alerts yeter (uyarı sayfasını gören herkes not ekler)
 *  - Validasyon: başlık zorunlu ≤200; açıklama ≤2000; due_date YYYY-MM-DD ve bugünden ileri
 *  - created_by session kullanıcısından snapshot (full_name || email)
 *  - Escalation: due_date geçmiş aktif info notlar warning'e yükselir (scan içinde, non-fatal)
 *  - Takvim: "Notlar" sekmesi; user_note due_date enrichment satırın kendi kolonundan
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const mockRequirePermission = vi.fn();
vi.mock("@/lib/auth/role-guard", () => ({
    requirePermission: (...a: unknown[]) => mockRequirePermission(...a),
}));

const mockDbCreateAlert = vi.fn();
vi.mock("@/lib/supabase/alerts", () => ({
    dbCreateAlert: (...a: unknown[]) => mockDbCreateAlert(...a),
}));

vi.mock("@/lib/services/alert-service", () => ({
    serviceListAlerts: vi.fn().mockResolvedValue([]),
}));

const mockGetUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
    createClient: () => Promise.resolve({ auth: { getUser: () => mockGetUser() } }),
}));

import { POST } from "@/app/api/alerts/route";

function req(body: unknown): NextRequest {
    return new NextRequest("http://localhost/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
}

const TOMORROW = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); })();
const YESTERDAY = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); })();

beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue(null); // yetkili
    mockDbCreateAlert.mockResolvedValue({ id: "note-1", type: "user_note" });
    mockGetUser.mockResolvedValue({ data: { user: { email: "ali@pmt.com", user_metadata: { full_name: "Ali Veli" } } } });
});

describe("POST /api/alerts — kullanıcı notu", () => {
    it("geçerli body → 201; type=user_note + source=ui + created_by snapshot DAMGALI", async () => {
        const res = await POST(req({ title: "Tedarikçiyi ara", description: "DN80 termin", due_date: TOMORROW }));
        expect(res.status).toBe(201);
        expect(mockDbCreateAlert).toHaveBeenCalledWith(expect.objectContaining({
            type: "user_note",
            severity: "info",
            source: "ui",
            title: "Tedarikçiyi ara",
            description: "DN80 termin",
            due_date: TOMORROW,
            created_by: "Ali Veli",
        }));
    });

    it("full_name yoksa created_by = email", async () => {
        mockGetUser.mockResolvedValue({ data: { user: { email: "ali@pmt.com", user_metadata: {} } } });
        await POST(req({ title: "Not" }));
        expect(mockDbCreateAlert).toHaveBeenCalledWith(expect.objectContaining({ created_by: "ali@pmt.com" }));
    });

    it("RBAC: view_alerts guard'ı response dönerse o döner, servis çağrılmaz", async () => {
        mockRequirePermission.mockResolvedValue(NextResponse.json({ error: "forbidden" }, { status: 403 }));
        const res = await POST(req({ title: "Not" }));
        expect(res.status).toBe(403);
        expect(mockDbCreateAlert).not.toHaveBeenCalled();
        expect(mockRequirePermission).toHaveBeenCalledWith(expect.anything(), "view_alerts");
    });

    it("başlık boş → 400; 200+ karakter → 400", async () => {
        expect((await POST(req({ title: "   " }))).status).toBe(400);
        expect((await POST(req({ title: "x".repeat(201) }))).status).toBe(400);
        expect(mockDbCreateAlert).not.toHaveBeenCalled();
    });

    it("açıklama 2000+ → 400", async () => {
        expect((await POST(req({ title: "Not", description: "x".repeat(2001) }))).status).toBe(400);
    });

    it("due_date geçmiş tarih → 400; bozuk format → 400", async () => {
        expect((await POST(req({ title: "Not", due_date: YESTERDAY }))).status).toBe(400);
        expect((await POST(req({ title: "Not", due_date: "12/06/2026" }))).status).toBe(400);
        expect(mockDbCreateAlert).not.toHaveBeenCalled();
    });

    it("type/severity/source body'den ENJEKTE EDİLEMEZ (her zaman user_note/info/ui)", async () => {
        await POST(req({ title: "Not", type: "stock_critical", severity: "critical", source: "system" }));
        expect(mockDbCreateAlert).toHaveBeenCalledWith(expect.objectContaining({
            type: "user_note", severity: "info", source: "ui",
        }));
    });
});

describe("kaynak kilitleri (source-lock)", () => {
    it("scan route escalation'ı non-fatal çağırır", () => {
        const src = readFileSync(join(process.cwd(), "src/app/api/alerts/scan/route.ts"), "utf8");
        expect(src).toMatch(/dbEscalateOverdueUserNotes/);
        expect(src).toMatch(/catch \(noteErr\)/);
    });

    it("escalation sorgusu: yalnız aktif info notlar, due_date < bugün → warning", () => {
        const src = readFileSync(join(process.cwd(), "src/lib/supabase/alerts.ts"), "utf8");
        expect(src).toMatch(/\.eq\("type", "user_note"\)/);
        expect(src).toMatch(/\.eq\("severity", "info"\)/);
        expect(src).toMatch(/\.lt\("due_date", today\)/);
        expect(src).toMatch(/update\(\{ severity: "warning" \}\)/);
    });

    it("user_note due_date enrichment satırın kendi kolonundan (entity join yok)", () => {
        const src = readFileSync(join(process.cwd(), "src/lib/services/alert-due-dates.ts"), "utf8");
        expect(src).toMatch(/a\.type === "user_note"/);
        expect(src).toMatch(/due_label: a\.due_date \? "Hatırlatma" : null/);
    });

    it("takvim sayfası: + Not butonu + NoteFormModal + demo guard", () => {
        const page = readFileSync(join(process.cwd(), "src/app/dashboard/alerts/page.tsx"), "utf8");
        expect(page).toMatch(/NoteFormModal/);
        expect(page).toMatch(/onAddNote=\{/);
        const header = readFileSync(join(process.cwd(), "src/components/alerts/CalendarHeader.tsx"), "utf8");
        expect(header).toMatch(/✎ Not/);
    });

    it("drawer: user_note için Oluşturan satırı", () => {
        const src = readFileSync(join(process.cwd(), "src/components/alerts/AlertCalendarDrawer.tsx"), "utf8");
        expect(src).toMatch(/alert\.type === "user_note" && alert\.createdBy/);
        expect(src).toMatch(/Oluşturan/);
    });

    it("scan'ler kullanıcı notlarına dokunmaz: orphan hedef tipleri user_note içermez", () => {
        const src = readFileSync(join(process.cwd(), "src/lib/services/alert-service.ts"), "utf8");
        const orphan = src.match(/ORPHAN_TARGET_TYPES = \[([^\]]+)\]/)?.[1] ?? "";
        expect(orphan).not.toContain("user_note");
    });
});

describe("Notlar sekmesi", () => {
    it("ALERT_CLASSES'ta note sekmesi user_note tipiyle var", async () => {
        const { ALERT_CLASSES, matchesAlertClass } = await import("@/lib/alert-calendar");
        const note = ALERT_CLASSES.find((c) => c.id === "note");
        expect(note).toBeDefined();
        expect(note!.types).toEqual(["user_note"]);
        // ui kaynaklı not, note sekmesine girer; AI sekmesine girmez
        const a = { type: "user_note" as const, source: "ui" };
        expect(matchesAlertClass(a, note!)).toBe(true);
        const ai = ALERT_CLASSES.find((c) => c.id === "ai")!;
        expect(matchesAlertClass(a, ai)).toBe(false);
    });
});
