/**
 * Denetim K4+Y3 (2026-06) — teklif rezervasyon reconciler'ı.
 *  - "sent ama bağlı sipariş yok" → send RPC'si yeniden denenir (repaired)
 *  - "rejected/expired ama pending order yaşıyor" → cancel denenir (released)
 *  - ikinci deneme de patlarsa entity-bağlı sync_issue alert (alerted)
 *  + mig.094 kaynak kilitleri (088 regresyonları + cancelled-hariç index)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

const mockMismatches = vi.fn();
const mockSend = vi.fn();
const mockCancel = vi.fn();
const mockCreateAlert = vi.fn();

vi.mock("@/lib/supabase/quotes", () => ({
    dbGetQuote: vi.fn(),
    dbUpdateQuoteStatus: vi.fn(),
    dbListExpiredQuotes: vi.fn(),
    dbCreateQuoteRevision: vi.fn(),
    dbAcceptQuoteAndCreateOrder: vi.fn(),
    dbSendQuoteCreatePendingOrder: (...a: unknown[]) => mockSend(...a),
    dbCancelQuoteLinkedOrder: (...a: unknown[]) => mockCancel(...a),
    dbListQuoteReservationMismatches: () => mockMismatches(),
}));
vi.mock("@/lib/supabase/alerts", () => ({
    dbCreateAlert: (...a: unknown[]) => mockCreateAlert(...a),
    dbResolveAlertsForEntity: vi.fn(),
}));
vi.mock("@/lib/supabase/company-settings", () => ({ dbGetCompanySettings: vi.fn() }));
vi.mock("@/lib/supabase/quote-pdf-archives", () => ({
    dbGetQuoteArchive: vi.fn(), dbCreateQuoteArchive: vi.fn(),
    dbArchiveObjectStatus: vi.fn(), dbDeleteQuoteArchive: vi.fn(),
}));
vi.mock("@/lib/services/email-service", () => ({ sendDirectEmail: vi.fn() }));
vi.mock("@/lib/supabase/email-logs", () => ({ dbCreateEmailLog: vi.fn(), dbUpdateEmailLogStatus: vi.fn() }));

import { serviceReconcileQuoteReservations } from "@/lib/services/quote-service";

beforeEach(() => {
    vi.clearAllMocks();
    mockCreateAlert.mockResolvedValue({ id: "a-1" });
});

describe("serviceReconcileQuoteReservations", () => {
    it("tutarsızlık yoksa hiçbir RPC çağrılmaz", async () => {
        mockMismatches.mockResolvedValue({ sentWithoutOrder: [], terminalWithActiveOrder: [] });
        const r = await serviceReconcileQuoteReservations();
        expect(r).toEqual({ repaired: 0, released: 0, alerted: 0 });
        expect(mockSend).not.toHaveBeenCalled();
        expect(mockCancel).not.toHaveBeenCalled();
    });

    it("sent + sipariş-yok → send RPC'siyle onarılır", async () => {
        mockMismatches.mockResolvedValue({
            sentWithoutOrder: [{ id: "q-1", quote_number: "TKF-1" }],
            terminalWithActiveOrder: [],
        });
        mockSend.mockResolvedValue({ order_number: "ORD-9" });
        const r = await serviceReconcileQuoteReservations();
        expect(r.repaired).toBe(1);
        expect(mockSend).toHaveBeenCalledWith("q-1", null);
        expect(mockCreateAlert).not.toHaveBeenCalled();
    });

    it("terminal + pending-order → cancel ile bırakılır", async () => {
        mockMismatches.mockResolvedValue({
            sentWithoutOrder: [],
            terminalWithActiveOrder: [{ id: "q-2", quote_number: "TKF-2", status: "rejected" }],
        });
        mockCancel.mockResolvedValue(undefined);
        const r = await serviceReconcileQuoteReservations();
        expect(r.released).toBe(1);
        expect(mockCancel).toHaveBeenCalledWith("q-2");
    });

    it("onarım patlarsa entity-bağlı sync_issue alert açılır (taramayı düşürmez)", async () => {
        mockMismatches.mockResolvedValue({
            sentWithoutOrder: [{ id: "q-3", quote_number: "TKF-3" }],
            terminalWithActiveOrder: [{ id: "q-4", quote_number: "TKF-4", status: "expired" }],
        });
        mockSend.mockRejectedValue(new Error("rpc down"));
        mockCancel.mockRejectedValue(new Error("rpc down"));
        const r = await serviceReconcileQuoteReservations();
        expect(r).toEqual({ repaired: 0, released: 0, alerted: 2 });
        expect(mockCreateAlert).toHaveBeenCalledWith(expect.objectContaining({
            type: "sync_issue", entity_type: "quote", entity_id: "q-3",
        }));
        expect(mockCreateAlert).toHaveBeenCalledWith(expect.objectContaining({
            type: "sync_issue", entity_type: "quote", entity_id: "q-4",
        }));
    });

    it("dedup'lu alert (dbCreateAlert null) alerted SAYILMAZ", async () => {
        mockMismatches.mockResolvedValue({
            sentWithoutOrder: [{ id: "q-5", quote_number: "TKF-5" }],
            terminalWithActiveOrder: [],
        });
        mockSend.mockRejectedValue(new Error("x"));
        mockCreateAlert.mockResolvedValue(null); // 23505 aktif-alert dedup
        const r = await serviceReconcileQuoteReservations();
        expect(r.alerted).toBe(0);
    });
});

describe("scan route reconciler kompozisyonu (kaynak kilidi)", () => {
    const route = readFileSync("src/app/api/alerts/scan/route.ts", "utf8");
    it("reconciler aynı lock altında, non-fatal çağrılır", () => {
        expect(route).toMatch(/serviceReconcileQuoteReservations\(\)/);
        expect(route).toMatch(/quoteReconcile/);
    });
});

describe("mig.094 — send fix kaynak kilitleri", () => {
    const mig = readFileSync("supabase/migrations/094_quote_send_fixes.sql", "utf8");

    it("index cancelled'ı dışlar (iptal sonrası yeniden gönderim açılır)", () => {
        expect(mig).toMatch(/WHERE quote_id IS NOT NULL AND commercial_status <> 'cancelled'/);
    });

    it("order_lines INSERT description kopyalar (080 paritesi)", () => {
        expect(mig).toMatch(/qli\.description/);
    });

    it("quantity pre-check <= 0'ı da yakalar (078 paritesi)", () => {
        expect(mig).toMatch(/quantity <= 0 or quantity <> trunc\(quantity\)/);
    });
});
