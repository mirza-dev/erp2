import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mockListAlerts = vi.fn();
const mockEnrich = vi.fn();

vi.mock("@/lib/services/alert-service", () => ({
    serviceListAlerts: (...a: unknown[]) => mockListAlerts(...a),
}));

const mockCalendarList = vi.fn();
vi.mock("@/lib/supabase/alerts", () => ({
    dbListAlertsForCalendar: (...a: unknown[]) => mockCalendarList(...a),
}));
vi.mock("@/lib/services/alert-due-dates", () => ({
    enrichAlertsWithDueMeta: (...a: unknown[]) => mockEnrich(...a),
}));

import { GET } from "@/app/api/alerts/calendar/route";

function req(qs = ""): NextRequest {
    return new NextRequest(`http://localhost/api/alerts/calendar${qs}`);
}

// ── Denetim Y1 (2026-06): route artık view_alerts şartı arar (demo-dostu requirePermissionFor) ──
const mockResolveAuthContext = vi.fn();
const mockRequirePermissionFor = vi.fn();

vi.mock("@/lib/auth/role-guard", () => ({
    resolveAuthContext: (...a: unknown[]) => mockResolveAuthContext(...a),
    requirePermissionFor: (...a: unknown[]) => mockRequirePermissionFor(...a),
}));

beforeEach(() => {
    mockResolveAuthContext.mockResolvedValue({
        user: { id: "u-1" }, userId: "u-1", roles: ["admin"], perms: new Set(["view_alerts"]),
    });
    mockRequirePermissionFor.mockReturnValue(null);
    mockListAlerts.mockReset().mockResolvedValue([{ id: "a1", type: "stock_critical" }]);
    mockCalendarList.mockReset().mockResolvedValue([{ id: "a1", type: "stock_critical" }]);
    mockEnrich.mockReset().mockImplementation((alerts) =>
        Promise.resolve(alerts.map((a: object) => ({ ...a, due_date: null, due_label: null, order_code: null }))),
    );
});

describe("GET /api/alerts/calendar", () => {
    it("parametresiz çağrı pencereli takvim fetch'i kullanır → enrich → zengin dizi", async () => {
        const res = await GET(req());
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(Array.isArray(body)).toBe(true);
        expect(body[0]).toMatchObject({ id: "a1", due_date: null, due_label: null, order_code: null });
        // Sınırsız serviceListAlerts DEĞİL — 1000 satır tavanında sessiz kesilme fix'i
        expect(mockCalendarList).toHaveBeenCalledTimes(1);
        expect(mockListAlerts).not.toHaveBeenCalled();
        expect(mockEnrich).toHaveBeenCalledWith([{ id: "a1", type: "stock_critical" }]);
    });

    it("query filtreleri serviceListAlerts'e geçer", async () => {
        await GET(req("?status=open&severity=critical&type=stock_critical"));
        expect(mockListAlerts).toHaveBeenCalledWith(
            expect.objectContaining({ status: "open", severity: "critical", type: "stock_critical" }),
        );
    });

    it("hata → 500", async () => {
        mockCalendarList.mockRejectedValue(new Error("boom"));
        const res = await GET(req());
        expect(res.status).toBe(500);
    });
});

describe("Y1 RBAC guard", () => {
    it("izin yoksa 403 döner ve DB'ye inmez", async () => {
        mockRequirePermissionFor.mockReturnValue(
            NextResponse.json({ error: "Yetkiniz yok." }, { status: 403 }),
        );
        const res = await GET(new NextRequest("http://test/api/alerts/calendar"));
        expect(res.status).toBe(403);
        expect(mockCalendarList).not.toHaveBeenCalled();
    });
});
