/**
 * Tests for alert action route handlers.
 *
 * These are the API endpoints that the alerts page UI calls.
 * Each action now checks res.ok before updating local state — these
 * tests verify the server side of that contract: that the routes return
 * correct HTTP status codes so the UI can distinguish success from failure.
 *
 * Covered routes:
 *   POST /api/alerts/scan        — stock scan trigger
 *   POST /api/alerts/ai-suggest  — AI alert generation
 *   PATCH /api/alerts/[id]       — single alert status update
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockServiceScanStockAlerts  = vi.fn();
const mockServiceGenerateAiAlerts = vi.fn();
const mockServiceGetAlert         = vi.fn();
const mockServiceUpdateAlertStatus = vi.fn();

vi.mock("@/lib/services/alert-service", () => ({
    serviceScanStockAlerts:   () => mockServiceScanStockAlerts(),
    serviceGenerateAiAlerts:  () => mockServiceGenerateAiAlerts(),
    serviceGetAlert:          (id: string) => mockServiceGetAlert(id),
    serviceUpdateAlertStatus: (...args: unknown[]) => mockServiceUpdateAlertStatus(...args),
}));

import { POST as scanPost }      from "@/app/api/alerts/scan/route";
import { POST as aiSuggestPost } from "@/app/api/alerts/ai-suggest/route";
import { GET, PATCH }            from "@/app/api/alerts/[id]/route";

// ── Helpers ───────────────────────────────────────────────────────────────────

const ALERT_ID = "alert-test-1";

function makePatchRequest(body: unknown): NextRequest {
    return new NextRequest(`http://localhost/api/alerts/${ALERT_ID}`, {
        method: "PATCH",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
    });
}

function makeParams(id = ALERT_ID): { params: Promise<{ id: string }> } {
    return { params: Promise.resolve({ id }) };
}

const stubAlert = {
    id: ALERT_ID,
    type: "stock_critical",
    severity: "critical",
    status: "open",
    entity_id: "prod-1",
    entity_type: "product",
    source: "system",
    created_at: "2024-01-01T00:00:00Z",
};

beforeEach(() => {
    vi.clearAllMocks();
});

// ── POST /api/alerts/scan ─────────────────────────────────────────────────────

describe("POST /api/alerts/scan — HTTP status contract", () => {
    it("200 + scan result on success", async () => {
        mockServiceScanStockAlerts.mockResolvedValue({ scanned: 10, created: 2, resolved: 1 });

        const res = await scanPost();
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.scanned).toBe(10);
        expect(body.created).toBe(2);
    });

    it("500 when service throws — UI res.ok check catches this", async () => {
        mockServiceScanStockAlerts.mockRejectedValue(new Error("DB hatası"));

        const res = await scanPost();

        expect(res.status).toBe(500);
        // UI: if (!res.ok) throw → error toast shown, success toast suppressed
    });

    it("500 body has error field", async () => {
        mockServiceScanStockAlerts.mockRejectedValue(new Error("DB hatası"));

        const res = await scanPost();
        const body = await res.json();

        expect(body.error).toBeDefined();
    });
});

// ── POST /api/alerts/ai-suggest ───────────────────────────────────────────────

describe("POST /api/alerts/ai-suggest — HTTP status contract", () => {
    it("200 + ai_available:true when AI runs successfully", async () => {
        mockServiceGenerateAiAlerts.mockResolvedValue({
            ai_available: true,
            dismissed: 1,
            created: 3,
            summary: "AI özeti",
        });

        const res = await aiSuggestPost();
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.ai_available).toBe(true);
        expect(body.created).toBe(3);
    });

    it("200 + ai_available:false when API key missing — UI shows config warning (not error)", async () => {
        mockServiceGenerateAiAlerts.mockResolvedValue({
            ai_available: false,
            dismissed: 0,
            created: 0,
            summary: "",
        });

        const res = await aiSuggestPost();
        const body = await res.json();

        expect(res.status).toBe(200);
        // res.ok is true → UI parses body → sees ai_available:false → shows warning toast
        expect(body.ai_available).toBe(false);
    });

    it("500 when service throws — UI res.ok check catches this, shows error toast", async () => {
        mockServiceGenerateAiAlerts.mockRejectedValue(new Error("AI servis hatası"));

        const res = await aiSuggestPost();

        // res.ok false → UI throws before trying to read ai_available
        // (old bug: would parse { error: "..." }, ai_available=undefined → wrong warning)
        expect(res.status).toBe(500);
    });

    it("500 body does NOT contain ai_available — confirms old misleading parse is prevented", async () => {
        mockServiceGenerateAiAlerts.mockRejectedValue(new Error("AI servis hatası"));

        const res = await aiSuggestPost();
        const body = await res.json();

        expect(body.ai_available).toBeUndefined();
        expect(body.error).toBeDefined();
    });
});

// ── GET /api/alerts/[id] ──────────────────────────────────────────────────────

describe("GET /api/alerts/[id] — HTTP status contract", () => {
    it("200 + alert data on success", async () => {
        mockServiceGetAlert.mockResolvedValue(stubAlert);

        const req = new NextRequest(`http://localhost/api/alerts/${ALERT_ID}`);
        const res = await GET(req, makeParams());

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.id).toBe(ALERT_ID);
    });

    it("404 when alert not found", async () => {
        mockServiceGetAlert.mockResolvedValue(null);

        const req = new NextRequest(`http://localhost/api/alerts/${ALERT_ID}`);
        const res = await GET(req, makeParams());

        expect(res.status).toBe(404);
    });
});

// ── PATCH /api/alerts/[id] ────────────────────────────────────────────────────

describe("PATCH /api/alerts/[id] — HTTP status contract", () => {
    it("200 + updated alert when transition is valid", async () => {
        mockServiceUpdateAlertStatus.mockResolvedValue({ success: true });
        mockServiceGetAlert.mockResolvedValue({ ...stubAlert, status: "acknowledged" });

        const res = await PATCH(makePatchRequest({ status: "acknowledged" }), makeParams());

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.status).toBe("acknowledged");
    });

    it("400 when status missing from body", async () => {
        const res = await PATCH(makePatchRequest({}), makeParams());

        expect(res.status).toBe(400);
        // UI: res.ok false → stays in catch block → error toast shown
    });

    it("400 when transition is invalid (e.g. resolved → acknowledged)", async () => {
        mockServiceUpdateAlertStatus.mockResolvedValue({
            success: false,
            error: "'resolved' durumundan 'acknowledged' durumuna geçilemez.",
        });

        const res = await PATCH(makePatchRequest({ status: "acknowledged" }), makeParams());

        expect(res.status).toBe(400);
        // UI: res.ok false → state NOT updated → no ghost data
    });

    it("400 body has error message for invalid transition", async () => {
        mockServiceUpdateAlertStatus.mockResolvedValue({
            success: false,
            error: "Geçilemez",
        });

        const res = await PATCH(makePatchRequest({ status: "acknowledged" }), makeParams());
        const body = await res.json();

        expect(body.error).toBe("Geçilemez");
    });

    it("400 when alert not found", async () => {
        mockServiceUpdateAlertStatus.mockResolvedValue({
            success: false,
            error: "Alert bulunamadı.",
        });

        const res = await PATCH(makePatchRequest({ status: "resolved" }), makeParams());

        expect(res.status).toBe(400);
    });

    it("resolve: 200 → UI updates state; 400 → UI keeps original state", async () => {
        // Success path
        mockServiceUpdateAlertStatus.mockResolvedValue({ success: true });
        mockServiceGetAlert.mockResolvedValue({ ...stubAlert, status: "resolved" });

        const successRes = await PATCH(makePatchRequest({ status: "resolved" }), makeParams());
        expect(successRes.status).toBe(200);

        // Failure path
        mockServiceUpdateAlertStatus.mockResolvedValue({ success: false, error: "Hata" });
        const failRes = await PATCH(makePatchRequest({ status: "resolved" }), makeParams());
        expect(failRes.status).toBe(400);
        // UI: if (!res.ok) throw → state NOT updated to "resolved"
    });

    it("dismiss: 400 → UI does NOT remove alert from list", async () => {
        mockServiceUpdateAlertStatus.mockResolvedValue({ success: false, error: "Hata" });

        const res = await PATCH(makePatchRequest({ status: "dismissed" }), makeParams());
        expect(res.status).toBe(400);
        // UI: if (!res.ok) throw → setRawAlerts filter NOT called
    });

    it("acknowledge: 400 → UI does NOT patch state to acknowledged", async () => {
        mockServiceUpdateAlertStatus.mockResolvedValue({ success: false, error: "Hata" });

        const res = await PATCH(makePatchRequest({ status: "acknowledged" }), makeParams());
        expect(res.status).toBe(400);
        // UI: if (!res.ok) throw → status NOT updated in local state
    });
});
