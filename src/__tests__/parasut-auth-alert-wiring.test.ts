/**
 * parasut-service — O1 (2026-06 denetim) auth-alert wiring
 *
 * checkAuthAlertThreshold önceden export+test edilmiş ama HİÇBİR üretim yolundan
 * çağrılmıyordu (orphaned). Bu test, auth hatasıyla biten orchestrator yollarının
 * (serviceSyncOrderToParasut + serviceRetryParasutStep) eşik kontrolünü tetiklediğini
 * — ve auth-DIŞI hataların tetiklemediğini — doğrular.
 *
 * Senaryo: contact adımında adapter.findContactsByTaxNumber bir ParasutError("auth")
 * fırlatır → catch bloğu error log yazar → pe.kind==="auth" → checkAuthAlertThreshold()
 * → integration_sync_logs sayımı ≥3 → critical ALERT_ENTITY_PARASUT_AUTH alert'i açılır.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ParasutError } from "@/lib/parasut-adapter";
import { ALERT_ENTITY_PARASUT_AUTH } from "@/lib/parasut-constants";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockDbGetOrderById   = vi.fn();
const mockDbGetCustomerById = vi.fn();
const mockDbCreateSyncLog  = vi.fn().mockResolvedValue({ id: "log-1" });
const mockDbCreateAlert    = vi.fn().mockResolvedValue({ id: "alert-1" });
const mockEnqueueNotif     = vi.fn().mockResolvedValue(undefined);
const mockRpc              = vi.fn();

// Adapter: contact lookup hatası enjekte edilir (auth veya server).
const mockFindContactsByTaxNumber = vi.fn();
const mockAdapter = { findContactsByTaxNumber: mockFindContactsByTaxNumber };

// integration_sync_logs sayım zinciri: .select().eq().gte() → { count }
let mockAuthLogCount = 3;
const countChain = {
    eq:  vi.fn().mockReturnThis(),
    gte: vi.fn(() => Promise.resolve({ count: mockAuthLogCount, error: null })),
};

// sales_orders update zinciri
const mockUpdateEq = vi.fn().mockResolvedValue({ error: null });
const mockUpdate   = vi.fn(() => ({ eq: mockUpdateEq }));

const mockFrom = vi.fn((table: string) => {
    if (table === "integration_sync_logs") return { select: vi.fn(() => countChain) };
    return { update: mockUpdate };
});

vi.mock("@/lib/parasut", () => ({
    getParasutAdapter: () => mockAdapter,
}));
vi.mock("@/lib/supabase/orders", () => ({
    dbGetOrderById: (...a: unknown[]) => mockDbGetOrderById(...a),
}));
vi.mock("@/lib/supabase/customers", () => ({
    dbGetCustomerById: (...a: unknown[]) => mockDbGetCustomerById(...a),
}));
vi.mock("@/lib/supabase/sync-log", () => ({
    dbCreateSyncLog: (...a: unknown[]) => mockDbCreateSyncLog(...a),
}));
vi.mock("@/lib/supabase/alerts", () => ({
    dbCreateAlert: (...a: unknown[]) => mockDbCreateAlert(...a),
}));
vi.mock("@/lib/services/notification-outbox-service", () => ({
    enqueueInternalNotification: (...a: unknown[]) => mockEnqueueNotif(...a),
}));
vi.mock("@/lib/supabase/service", () => ({
    createServiceClient: () => ({ from: mockFrom, rpc: mockRpc }),
}));

import {
    serviceSyncOrderToParasut,
    serviceRetryParasutStep,
} from "@/lib/services/parasut-service";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeOrder() {
    return {
        id:                  "order-1",
        commercial_status:   "approved",
        fulfillment_status:  "shipped",
        order_number:        "ORD-2026-0001",
        created_at:          new Date().toISOString(),
        currency:            "USD",
        customer_id:         "cust-1",
        discount_amount:     0,
        subtotal:            0,
        grand_total:         0,
        parasut_step:        null,
        parasut_retry_count: 0,
        lines:               [],
    };
}

const customerWithTax = {
    id:                 "cust-1",
    name:               "Test Müşteri",
    tax_number:         "1234567890",
    parasut_contact_id: null,
    email:              null,
    tax_office:         null,
};

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
    vi.clearAllMocks();
    saved.PARASUT_ENABLED = process.env.PARASUT_ENABLED;
    process.env.PARASUT_ENABLED = "true";
    mockAuthLogCount = 3;
    countChain.gte.mockImplementation(() => Promise.resolve({ count: mockAuthLogCount, error: null }));
    mockDbCreateSyncLog.mockResolvedValue({ id: "log-1" });
    mockDbCreateAlert.mockResolvedValue({ id: "alert-1" });
    mockUpdateEq.mockResolvedValue({ error: null });
    mockDbGetOrderById.mockResolvedValue(makeOrder());
    mockDbGetCustomerById.mockResolvedValue(customerWithTax);
    // claim → true, release → ok
    mockRpc.mockImplementation((name: string) =>
        name === "parasut_claim_sync"
            ? Promise.resolve({ data: true, error: null })
            : Promise.resolve({ data: null, error: null }),
    );
});

afterEach(() => {
    process.env.PARASUT_ENABLED = saved.PARASUT_ENABLED;
});

// ─── serviceSyncOrderToParasut ───────────────────────────────────────────────

describe("serviceSyncOrderToParasut — auth hatası eşik alert'ini tetikler", () => {
    it("contact adımı auth hatası + son 1 saatte ≥3 auth → critical PARASUT_AUTH alert", async () => {
        mockFindContactsByTaxNumber.mockRejectedValue(new ParasutError("auth", "Unauthorized"));

        const result = await serviceSyncOrderToParasut("order-1");

        expect(result.success).toBe(false);
        // checkAuthAlertThreshold çağrıldı → integration_sync_logs sayımı yapıldı
        expect(countChain.eq).toHaveBeenCalledWith("error_kind", "auth");
        // eşik aşıldı → critical OAuth re-auth alert'i açıldı
        expect(mockDbCreateAlert).toHaveBeenCalledWith(
            expect.objectContaining({
                type:        "sync_issue",
                severity:    "critical",
                entity_type: "parasut",
                entity_id:   ALERT_ENTITY_PARASUT_AUTH,
                source:      "system",
            }),
        );
    });

    it("auth hatası ama son 1 saatte <3 auth → eşik altı, alert açılmaz", async () => {
        mockFindContactsByTaxNumber.mockRejectedValue(new ParasutError("auth", "Unauthorized"));
        mockAuthLogCount = 2;

        const result = await serviceSyncOrderToParasut("order-1");

        expect(result.success).toBe(false);
        // eşik kontrolü yine yapıldı ama alert açılmadı
        expect(countChain.eq).toHaveBeenCalledWith("error_kind", "auth");
        expect(mockDbCreateAlert).not.toHaveBeenCalled();
    });

    it("auth-DIŞI (server) hata → eşik kontrolü çağrılmaz, PARASUT_AUTH alert açılmaz", async () => {
        mockFindContactsByTaxNumber.mockRejectedValue(new ParasutError("server", "Internal error"));

        const result = await serviceSyncOrderToParasut("order-1");

        expect(result.success).toBe(false);
        // integration_sync_logs sayımı hiç yapılmadı (threshold çağrılmadı)
        expect(countChain.eq).not.toHaveBeenCalledWith("error_kind", "auth");
        expect(mockDbCreateAlert).not.toHaveBeenCalledWith(
            expect.objectContaining({ entity_id: ALERT_ENTITY_PARASUT_AUTH }),
        );
    });
});

// ─── serviceRetryParasutStep ─────────────────────────────────────────────────

describe("serviceRetryParasutStep — auth hatası eşik alert'ini tetikler", () => {
    it("step='contact' auth hatası + ≥3 auth → critical PARASUT_AUTH alert", async () => {
        mockFindContactsByTaxNumber.mockRejectedValue(new ParasutError("auth", "Unauthorized"));

        const result = await serviceRetryParasutStep("order-1", "contact");

        expect(result.success).toBe(false);
        expect(countChain.eq).toHaveBeenCalledWith("error_kind", "auth");
        expect(mockDbCreateAlert).toHaveBeenCalledWith(
            expect.objectContaining({
                severity:  "critical",
                entity_id: ALERT_ENTITY_PARASUT_AUTH,
            }),
        );
    });

    it("step='contact' auth-DIŞI (server) hata → PARASUT_AUTH alert açılmaz", async () => {
        mockFindContactsByTaxNumber.mockRejectedValue(new ParasutError("server", "Internal error"));

        const result = await serviceRetryParasutStep("order-1", "contact");

        expect(result.success).toBe(false);
        expect(mockDbCreateAlert).not.toHaveBeenCalledWith(
            expect.objectContaining({ entity_id: ALERT_ENTITY_PARASUT_AUTH }),
        );
    });
});
