import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockListAlerts = vi.fn();
const mockEnrich = vi.fn();

vi.mock("@/lib/services/alert-service", () => ({
    serviceListAlerts: (...a: unknown[]) => mockListAlerts(...a),
}));
vi.mock("@/lib/services/alert-due-dates", () => ({
    enrichAlertsWithDueMeta: (...a: unknown[]) => mockEnrich(...a),
}));

import { GET } from "@/app/api/alerts/calendar/route";

function req(qs = ""): NextRequest {
    return new NextRequest(`http://localhost/api/alerts/calendar${qs}`);
}

beforeEach(() => {
    mockListAlerts.mockReset().mockResolvedValue([{ id: "a1", type: "stock_critical" }]);
    mockEnrich.mockReset().mockImplementation((alerts) =>
        Promise.resolve(alerts.map((a: object) => ({ ...a, due_date: null, due_label: null, order_code: null }))),
    );
});

describe("GET /api/alerts/calendar", () => {
    it("listAlerts → enrich → zengin dizi döner", async () => {
        const res = await GET(req());
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(Array.isArray(body)).toBe(true);
        expect(body[0]).toMatchObject({ id: "a1", due_date: null, due_label: null, order_code: null });
        expect(mockEnrich).toHaveBeenCalledWith([{ id: "a1", type: "stock_critical" }]);
    });

    it("query filtreleri serviceListAlerts'e geçer", async () => {
        await GET(req("?status=open&severity=critical&type=stock_critical"));
        expect(mockListAlerts).toHaveBeenCalledWith(
            expect.objectContaining({ status: "open", severity: "critical", type: "stock_critical" }),
        );
    });

    it("hata → 500", async () => {
        mockListAlerts.mockRejectedValue(new Error("boom"));
        const res = await GET(req());
        expect(res.status).toBe(500);
    });
});
