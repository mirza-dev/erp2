/**
 * Faz 1 — Alert sync_issue retry endpoint + actionFor sync_issue case.
 *
 * Covers:
 *   POST /api/alerts/[id]/sync-retry
 *     - 404 when alert not found
 *     - 400 when alert type !== 'sync_issue'
 *     - 400 when alert already resolved/dismissed
 *     - ALERT_ENTITY_PARASUT_AUTH → serviceParasutOAuthRefresh çağrılır + alert resolved
 *     - Diğer parasut entity → serviceSyncAllPending çağrılır + alert resolved
 *     - serviceSyncAllPending tamamen başarısız → 502, alert açık kalır
 *
 *   actionFor (source-regression): sync_issue case '/dashboard/parasut' linki üretir.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ALERT_ENTITY_PARASUT_AUTH } from "@/lib/parasut-constants";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockDbGetAlertById     = vi.fn();
const mockDbUpdateAlertStatus = vi.fn();
const mockServiceSyncAllPending = vi.fn();
const mockServiceParasutOAuthRefresh = vi.fn();

vi.mock("@/lib/supabase/alerts", () => ({
    dbGetAlertById:        (...a: unknown[]) => mockDbGetAlertById(...a),
    dbUpdateAlertStatus:   (...a: unknown[]) => mockDbUpdateAlertStatus(...a),
}));

vi.mock("@/lib/services/parasut-service", () => ({
    serviceSyncAllPending: (...a: unknown[]) => mockServiceSyncAllPending(...a),
}));

vi.mock("@/lib/services/parasut-oauth", () => ({
    serviceParasutOAuthRefresh: (...a: unknown[]) => mockServiceParasutOAuthRefresh(...a),
}));

import { POST } from "@/app/api/alerts/[id]/sync-retry/route";

function makeReq() {
    return undefined as unknown as Parameters<typeof POST>[0];
}

function makeParams(id: string) {
    return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
    mockDbGetAlertById.mockReset();
    mockDbUpdateAlertStatus.mockReset().mockResolvedValue(undefined);
    mockServiceSyncAllPending.mockReset();
    mockServiceParasutOAuthRefresh.mockReset();
});

describe("POST /api/alerts/[id]/sync-retry", () => {
    it("alert bulunamazsa 404 döner", async () => {
        mockDbGetAlertById.mockResolvedValue(null);
        const res = await POST(makeReq(), makeParams("a-1"));
        expect(res.status).toBe(404);
        expect(mockDbUpdateAlertStatus).not.toHaveBeenCalled();
        expect(mockServiceSyncAllPending).not.toHaveBeenCalled();
        expect(mockServiceParasutOAuthRefresh).not.toHaveBeenCalled();
    });

    it("alert.type !== 'sync_issue' ise 400 döner", async () => {
        mockDbGetAlertById.mockResolvedValue({
            id: "a-1", type: "stock_critical", status: "open", entity_id: "p-1",
        });
        const res = await POST(makeReq(), makeParams("a-1"));
        expect(res.status).toBe(400);
        expect(mockDbUpdateAlertStatus).not.toHaveBeenCalled();
    });

    it("alert zaten resolved → 400, retry yapılmaz", async () => {
        mockDbGetAlertById.mockResolvedValue({
            id: "a-1", type: "sync_issue", status: "resolved",
            entity_type: "parasut",
            entity_id: ALERT_ENTITY_PARASUT_AUTH,
        });
        const res = await POST(makeReq(), makeParams("a-1"));
        expect(res.status).toBe(400);
        expect(mockServiceParasutOAuthRefresh).not.toHaveBeenCalled();
    });

    it("ALERT_ENTITY_PARASUT_AUTH → serviceParasutOAuthRefresh çağrılır + alert resolved", async () => {
        mockDbGetAlertById.mockResolvedValue({
            id: "a-1", type: "sync_issue", status: "open",
            entity_type: "parasut",
            entity_id: ALERT_ENTITY_PARASUT_AUTH,
        });
        mockServiceParasutOAuthRefresh.mockResolvedValue({
            success: true, expiresAt: "2099-01-01T00:00:00Z", tokenVersion: 2,
        });

        const res = await POST(makeReq(), makeParams("a-1"));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.action).toBe("oauth_refresh");
        expect(mockServiceParasutOAuthRefresh).toHaveBeenCalledTimes(1);
        expect(mockServiceSyncAllPending).not.toHaveBeenCalled();
        expect(mockDbUpdateAlertStatus).toHaveBeenCalledWith("a-1", "resolved", "sync-retry-from-alert");
    });

    it("OAuth refresh notConnected → 409, alert açık kalır", async () => {
        mockDbGetAlertById.mockResolvedValue({
            id: "a-1", type: "sync_issue", status: "open",
            entity_type: "parasut",
            entity_id: ALERT_ENTITY_PARASUT_AUTH,
        });
        mockServiceParasutOAuthRefresh.mockResolvedValue({ success: false, notConnected: true });

        const res = await POST(makeReq(), makeParams("a-1"));
        expect(res.status).toBe(409);
        expect(mockDbUpdateAlertStatus).not.toHaveBeenCalled();
    });

    it("Diğer parasut entity → serviceSyncAllPending çağrılır + alert resolved", async () => {
        mockDbGetAlertById.mockResolvedValue({
            id: "a-2", type: "sync_issue", status: "open",
            entity_type: "parasut",
            entity_id: "00000000-0000-0000-0000-00000000a003", // ALERT_ENTITY_PARASUT_SHIPMENT
        });
        mockServiceSyncAllPending.mockResolvedValue({ synced: 3, failed: 0, errors: [] });

        const res = await POST(makeReq(), makeParams("a-2"));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.action).toBe("sync_all");
        expect(mockServiceSyncAllPending).toHaveBeenCalledTimes(1);
        expect(mockServiceParasutOAuthRefresh).not.toHaveBeenCalled();
        expect(mockDbUpdateAlertStatus).toHaveBeenCalledWith("a-2", "resolved", "sync-retry-from-alert");
    });

    it("P2: parasut_auth entity_type (CAS çakışma alerti) AUTH entity_id ile → oauth_refresh", async () => {
        // parasut-oauth.ts:118 — token CAS çakışmasında entity_type='parasut_auth' yazılıyor.
        // Endpoint hem entity_type listesi hem entity_id whitelist ile bunları kabul eder.
        mockDbGetAlertById.mockResolvedValue({
            id: "a-cas", type: "sync_issue", status: "open",
            entity_type: "parasut_auth",
            entity_id: ALERT_ENTITY_PARASUT_AUTH,
        });
        mockServiceParasutOAuthRefresh.mockResolvedValue({
            success: true, expiresAt: "2099-01-01T00:00:00Z", tokenVersion: 3,
        });

        const res = await POST(makeReq(), makeParams("a-cas"));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.action).toBe("oauth_refresh");
        expect(mockServiceParasutOAuthRefresh).toHaveBeenCalledTimes(1);
        expect(mockDbUpdateAlertStatus).toHaveBeenCalledWith("a-cas", "resolved", "sync-retry-from-alert");
    });

    it("P3: type=sync_issue ama Paraşüt entity_id whitelist DIŞINDA → 400, retry yapılmaz", async () => {
        // Gelecekte sync_issue tipi başka entegrasyonlar için de kullanılırsa, bu endpoint
        // bilinmeyen entity_id'lerde Paraşüt sync-all'i tetiklememeli (yan etki!).
        mockDbGetAlertById.mockResolvedValue({
            id: "a-x", type: "sync_issue", status: "open",
            entity_type: "shopify",                                // Hipotetik gelecek entegrasyon
            entity_id: "00000000-0000-0000-0000-000000000999",    // Whitelist'te yok
        });

        const res = await POST(makeReq(), makeParams("a-x"));
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toMatch(/Paraşüt sync alanına ait değil/i);
        expect(mockServiceSyncAllPending).not.toHaveBeenCalled();
        expect(mockServiceParasutOAuthRefresh).not.toHaveBeenCalled();
        expect(mockDbUpdateAlertStatus).not.toHaveBeenCalled();
    });

    it("P3: entity_type doğru ('parasut') ama entity_id whitelist dışı → 400 (defans katmanı)", async () => {
        // Defense-in-depth: entity_type 'parasut' ama entity_id rastgele bir UUID
        // (manuel insert / migration kalıntısı). Yine de retry yapma.
        mockDbGetAlertById.mockResolvedValue({
            id: "a-y", type: "sync_issue", status: "open",
            entity_type: "parasut",
            entity_id: "11111111-1111-1111-1111-111111111111",    // Whitelist'te yok
        });

        const res = await POST(makeReq(), makeParams("a-y"));
        expect(res.status).toBe(400);
        expect(mockServiceSyncAllPending).not.toHaveBeenCalled();
        expect(mockDbUpdateAlertStatus).not.toHaveBeenCalled();
    });

    it("syncAll tamamen başarısız (failed>0, synced=0) → 502, alert açık kalır", async () => {
        mockDbGetAlertById.mockResolvedValue({
            id: "a-3", type: "sync_issue", status: "open",
            entity_type: "parasut",
            entity_id: "00000000-0000-0000-0000-00000000a003",
        });
        mockServiceSyncAllPending.mockResolvedValue({
            synced: 0, failed: 2, errors: ["Network error", "Timeout"],
        });

        const res = await POST(makeReq(), makeParams("a-3"));
        expect(res.status).toBe(502);
        const body = await res.json();
        expect(body.error).toMatch(/başarısız/i);
        expect(body.details).toEqual(["Network error", "Timeout"]);
        expect(mockDbUpdateAlertStatus).not.toHaveBeenCalled();
    });
});

// ─── actionFor — source-regression test ────────────────────────────────────
//
// actionFor pure helper page.tsx içinde tanımlı (export edilmiyor); davranışı
// değiştirmemek için source-level pattern matching ile doğrulanır.

const pageSource = readFileSync(
    resolve(process.cwd(), "src/app/dashboard/purchase/suggested/page.tsx"),
    "utf-8",
).slice(0, 0) + readFileSync(
    resolve(process.cwd(), "src/app/dashboard/alerts/page.tsx"),
    "utf-8",
);

describe("actionFor + UI filter (source-regression) — sync_issue case", () => {
    it("actionFor switch'inde sync_issue case mevcut", () => {
        // Pattern: types.includes("sync_issue") ... href: "/dashboard/parasut"
        expect(pageSource).toMatch(
            /types\.includes\(\s*["']sync_issue["']\s*\)[^}]*href\s*:\s*["']\/dashboard\/parasut["']/,
        );
    });

    it("Paraşüt sync alert kartı SystemAlertCard component'ine ayrılmış", () => {
        expect(pageSource).toMatch(/function SystemAlertCard\b/);
    });

    it("systemAlerts useMemo PARASUT_ALERT_ENTITY_TYPES VEYA PARASUT_SYNC_ALERT_ENTITY_IDS kullanıyor", () => {
        // P2 fix: hem entity_type listesi hem entity_id whitelist kombinasyonu
        expect(pageSource).toMatch(/PARASUT_ALERT_ENTITY_TYPES\.has/);
        expect(pageSource).toMatch(/PARASUT_SYNC_ALERT_ENTITY_IDS\.has/);
        // type === 'sync_issue' kontrolü hâlâ var
        expect(pageSource).toMatch(/a\.type\s*!==\s*["']sync_issue["']/);
    });

    it("productSysAlerts filter Paraşüt alertlerini whitelist üzerinden dışlıyor", () => {
        // P2 fix: entity_type listesi + entity_id whitelist iki katmanlı dışlama
        expect(pageSource).toMatch(/PARASUT_ALERT_ENTITY_TYPES\.has\(\s*a\.entity_type/);
        expect(pageSource).toMatch(/PARASUT_SYNC_ALERT_ENTITY_IDS\.has\(\s*a\.entity_id/);
    });

    it("parasut-constants.ts whitelist sabitleri export ediyor (parasut_auth dahil)", () => {
        const constantsSource = readFileSync(
            resolve(process.cwd(), "src/lib/parasut-constants.ts"),
            "utf-8",
        );
        // P2 fix: parasut_auth entity_type'ı whitelist'e dahil
        expect(constantsSource).toMatch(/PARASUT_ALERT_ENTITY_TYPES[^=]*=\s*new Set\(\[[^\]]*["']parasut_auth["']/);
        // 5 bilinen Paraşüt entity_id whitelist'te
        expect(constantsSource).toMatch(/PARASUT_SYNC_ALERT_ENTITY_IDS[^=]*=\s*new Set\(\[/);
    });
});
