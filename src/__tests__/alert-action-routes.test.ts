/**
 * Tests for alert action route handlers.
 *
 * These are the API endpoints that the alerts page UI calls.
 * Each action now checks res.ok before updating local state — these
 * tests verify the server side of that contract: that the routes return
 * correct HTTP status codes so the UI can distinguish success from failure.
 *
 * Covered routes:
 *   POST /api/alerts/scan        — stock scan trigger (with advisory lock)
 *   POST /api/alerts/ai-suggest  — AI alert generation (with advisory lock)
 *   PATCH /api/alerts/[id]       — single alert status update
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// RBAC Faz 4: route'lara requirePermission guard eklendi → guard'ı allow'a mock'la.
const mockResolveAuthContext = vi.fn();
const mockRequirePermissionFor = vi.fn();
vi.mock("@/lib/auth/role-guard", () => ({
    resolveAuthContext: () => mockResolveAuthContext(),
    requirePermissionFor: (...a: unknown[]) => mockRequirePermissionFor(...a),
    requirePermission: vi.fn().mockResolvedValue(null),
    requireRole: vi.fn().mockResolvedValue(null),
    requireAnyRole: vi.fn().mockResolvedValue(null),
    getCurrentUserPermissions: vi.fn().mockResolvedValue(
        new Set(["view_sales_prices", "view_purchase_costs", "view_financial_summary"])),
    getCurrentUserRoles: vi.fn().mockResolvedValue(["admin"]),
    getCurrentUserRole: vi.fn().mockResolvedValue("admin"),
}));
import { NextRequest, NextResponse } from "next/server";

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

// Advisory lock mock — scan and ai-suggest routes acquire/release locks
const mockRpc = vi.fn();

vi.mock("@/lib/supabase/service", () => ({
    createServiceClient: () => ({
        rpc: (...args: unknown[]) => mockRpc(...args),
    }),
}));

// handleApiError + safeParseJson mock (used by scan and alerts/[id] routes)
vi.mock("@/lib/api-error", () => ({
    handleApiError: (_err: unknown, msg: string) =>
        NextResponse.json({ error: msg }, { status: 500 }),
    safeParseJson: async (req: Request) => {
        try {
            const data = await req.json();
            if (data === null || data === undefined) {
                return { ok: false, response: NextResponse.json({ error: "Boş istek gövdesi." }, { status: 400 }) };
            }
            return { ok: true, data };
        } catch {
            return { ok: false, response: NextResponse.json({ error: "Geçersiz JSON." }, { status: 400 }) };
        }
    },
}));

// createClient mock — scan route uses session auth (fallback when no CRON_SECRET)
vi.mock("@/lib/supabase/server", () => ({
    createClient: () => Promise.resolve({
        auth: {
            getUser: () => Promise.resolve({ data: { user: { id: "test-user" } } }),
        },
    }),
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
    // Default: advisory lock acquired successfully (must return Promise for .catch() chaining)
    mockRpc.mockImplementation((name: string) => {
        if (name === "try_acquire_scan_lock" || name === "try_acquire_ai_suggest_lock") {
            return Promise.resolve({ data: true });
        }
        return Promise.resolve({ data: null });
    });
});

// ── POST /api/alerts/scan ─────────────────────────────────────────────────────

describe("POST /api/alerts/scan — HTTP status contract", () => {
    it("200 + scan result on success", async () => {
        mockServiceScanStockAlerts.mockResolvedValue({ scanned: 10, created: 2, resolved: 1 });

        const res = await scanPost(new NextRequest("http://localhost/api/alerts/scan", { method: "POST" }));
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.scanned).toBe(10);
        expect(body.created).toBe(2);
    });

    it("500 when service throws — UI res.ok check catches this", async () => {
        mockServiceScanStockAlerts.mockRejectedValue(new Error("DB hatası"));

        const res = await scanPost(new NextRequest("http://localhost/api/alerts/scan", { method: "POST" }));

        expect(res.status).toBe(500);
    });

    it("500 body has error field", async () => {
        mockServiceScanStockAlerts.mockRejectedValue(new Error("DB hatası"));

        const res = await scanPost(new NextRequest("http://localhost/api/alerts/scan", { method: "POST" }));
        const body = await res.json();

        expect(body.error).toBeDefined();
    });

    it("409 when advisory lock already held (concurrent scan)", async () => {
        mockRpc.mockImplementation((name: string) => {
            if (name === "try_acquire_scan_lock") return Promise.resolve({ data: false });
            return Promise.resolve({ data: null });
        });

        const res = await scanPost(new NextRequest("http://localhost/api/alerts/scan", { method: "POST" }));

        expect(res.status).toBe(409);
        expect(mockServiceScanStockAlerts).not.toHaveBeenCalled();
    });
});

// ── POST /api/alerts/ai-suggest ───────────────────────────────────────────────

describe("POST /api/alerts/ai-suggest — HTTP status contract", () => {
    it("200 + aiAvailable:true when AI runs successfully", async () => {
        mockServiceGenerateAiAlerts.mockResolvedValue({
            aiAvailable: true,
            dismissed: 1,
            created: 3,
            summary: "AI özeti",
        });

        const res = await aiSuggestPost();
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.aiAvailable).toBe(true);
        expect(body.created).toBe(3);
    });

    it("200 + aiAvailable:false when API key missing — UI shows config warning (not error)", async () => {
        mockServiceGenerateAiAlerts.mockResolvedValue({
            aiAvailable: false,
            dismissed: 0,
            created: 0,
            summary: "",
        });

        const res = await aiSuggestPost();
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.aiAvailable).toBe(false);
    });

    it("500 when service throws — UI res.ok check catches this, shows error toast", async () => {
        mockServiceGenerateAiAlerts.mockRejectedValue(new Error("AI servis hatası"));

        const res = await aiSuggestPost();

        expect(res.status).toBe(500);
    });

    it("500 body does NOT contain aiAvailable — confirms old misleading parse is prevented", async () => {
        mockServiceGenerateAiAlerts.mockRejectedValue(new Error("AI servis hatası"));

        const res = await aiSuggestPost();
        const body = await res.json();

        expect(body.aiAvailable).toBeUndefined();
        expect(body.error).toBeDefined();
    });

    /**
     * 2026-08-24 — Bu uç ÖNCEDEN yalnız cron'du: hem proxy CRON_PATHS'te hem
     * route içinde `requireCronSecret`. Uyarılar sayfasındaki "AI Öner" butonu
     * tarayıcıdan çağırıyor ama Bearer token gönderemiyor → HER TIK 401 →
     * AI bulguları kullanıcıya hiç ulaşmıyordu. Kardeş uç /api/alerts/scan
     * bilinçli olarak çift kimlikli yapılmıştı; bu uç atlanmıştı.
     */
    describe("kimlik doğrulama — UI butonu çalışmalı, uç açık kalmamalı", () => {
        const req = (headers: Record<string, string> = {}) =>
            new NextRequest("http://localhost/api/alerts/ai-suggest", { method: "POST", headers });

        beforeEach(() => {
            mockRpc.mockResolvedValue({ data: true });
            mockServiceGenerateAiAlerts.mockResolvedValue({
                aiAvailable: true, dismissed: 0, created: 2, updated: 0, degraded: false, summary: "",
            });
        });

        it("oturum YOK + cron token YOK → 401", async () => {
            mockResolveAuthContext.mockResolvedValue({ user: null, perms: new Set() });
            const res = await aiSuggestPost(req());
            expect(res.status).toBe(401);
            expect(mockServiceGenerateAiAlerts).not.toHaveBeenCalled();
        });

        it("oturum VAR ama view_alerts YOK → guard'ın döndürdüğü yanıt (403)", async () => {
            mockResolveAuthContext.mockResolvedValue({ user: { id: "u1" }, perms: new Set() });
            mockRequirePermissionFor.mockReturnValue(
                NextResponse.json({ error: "Yetkisiz." }, { status: 403 }),
            );
            const res = await aiSuggestPost(req());
            expect(res.status).toBe(403);
            expect(mockServiceGenerateAiAlerts).not.toHaveBeenCalled();
        });

        it("oturum + view_alerts → 200 (UI butonu ARTIK ÇALIŞIR)", async () => {
            mockResolveAuthContext.mockResolvedValue({ user: { id: "u1" }, perms: new Set(["view_alerts"]) });
            mockRequirePermissionFor.mockReturnValue(null);
            const res = await aiSuggestPost(req());
            expect(res.status).toBe(200);
            expect(mockRequirePermissionFor).toHaveBeenCalledWith(expect.anything(), "view_alerts");
        });

        it("CRON_SECRET Bearer → oturum aranmaz (zamanlanmış koşu korunur)", async () => {
            process.env.CRON_SECRET = "s3cret";
            const res = await aiSuggestPost(req({ authorization: "Bearer s3cret" }));
            expect(res.status).toBe(200);
            expect(mockResolveAuthContext).not.toHaveBeenCalled();
            delete process.env.CRON_SECRET;
        });

        it("YANLIŞ Bearer token → oturum yoluna düşer, oturum yoksa 401", async () => {
            process.env.CRON_SECRET = "s3cret";
            mockResolveAuthContext.mockResolvedValue({ user: null, perms: new Set() });
            const res = await aiSuggestPost(req({ authorization: "Bearer wrong" }));
            expect(res.status).toBe(401);
            delete process.env.CRON_SECRET;
        });
    });

    it("409 when advisory lock already held (concurrent AI generation)", async () => {
        mockRpc.mockImplementation((name: string) => {
            if (name === "try_acquire_ai_suggest_lock") return Promise.resolve({ data: false });
            return Promise.resolve({ data: null });
        });

        const res = await aiSuggestPost();

        expect(res.status).toBe(409);
        expect(mockServiceGenerateAiAlerts).not.toHaveBeenCalled();
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
    });

    it("400 when transition is invalid (e.g. resolved → acknowledged)", async () => {
        mockServiceUpdateAlertStatus.mockResolvedValue({
            success: false,
            error: "'resolved' durumundan 'acknowledged' durumuna geçilemez.",
        });

        const res = await PATCH(makePatchRequest({ status: "acknowledged" }), makeParams());

        expect(res.status).toBe(400);
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
    });

    it("dismiss: 400 → UI does NOT remove alert from list", async () => {
        mockServiceUpdateAlertStatus.mockResolvedValue({ success: false, error: "Hata" });

        const res = await PATCH(makePatchRequest({ status: "dismissed" }), makeParams());
        expect(res.status).toBe(400);
    });

    it("acknowledge: 400 → UI does NOT patch state to acknowledged", async () => {
        mockServiceUpdateAlertStatus.mockResolvedValue({ success: false, error: "Hata" });

        const res = await PATCH(makePatchRequest({ status: "acknowledged" }), makeParams());
        expect(res.status).toBe(400);
    });
});
