/**
 * Regression guard: PARASUT_ENABLED gate.
 *
 * When PARASUT_ENABLED is not "true", all sync operations must return early
 * without writing to the database or calling sendInvoiceToParasut.
 *
 * Covers:
 *   - serviceSyncOrderToParasut — disabled guard
 *   - serviceRetrySyncLog      — disabled guard
 *   - serviceSyncAllPending    — disabled guard
 *   - GET /api/parasut/config  — enabled flag in response
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Simulate authenticated request (no demo_mode cookie)
vi.mock("next/headers", () => ({
    cookies: () => Promise.resolve({ get: () => undefined }),
}));

// ─── DB / parasut mocks ───────────────────────────────────────────────────────

const mockSendInvoice = vi.fn();
const mockDbGetOrderById = vi.fn();
const mockDbGetSyncLog = vi.fn();
const mockDbUpdateSyncLog = vi.fn();
const mockDbCreateSyncLog = vi.fn();
const mockSupabaseUpdate = vi.fn(() => ({ eq: vi.fn() }));
const mockSupabaseSelect = vi.fn(() => ({
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
}));

vi.mock("@/lib/parasut", () => ({
    sendInvoiceToParasut: (...args: unknown[]) => mockSendInvoice(...args),
}));

vi.mock("@/lib/supabase/orders", () => ({
    dbGetOrderById: (...args: unknown[]) => mockDbGetOrderById(...args),
}));

vi.mock("@/lib/supabase/sync-log", () => ({
    dbGetSyncLog: (...args: unknown[]) => mockDbGetSyncLog(...args),
    dbUpdateSyncLog: (...args: unknown[]) => mockDbUpdateSyncLog(...args),
    dbCreateSyncLog: (...args: unknown[]) => mockDbCreateSyncLog(...args),
}));

vi.mock("@/lib/supabase/service", () => ({
    createServiceClient: () => ({
        from: () => ({
            update: mockSupabaseUpdate,
            select: mockSupabaseSelect,
        }),
    }),
}));

import {
    serviceSyncOrderToParasut,
    serviceRetrySyncLog,
    serviceSyncAllPending,
} from "@/lib/services/parasut-service";
import { GET as configGET } from "@/app/api/parasut/config/route";

// ─── Env helpers ─────────────────────────────────────────────────────────────

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
    vi.clearAllMocks();
    saved.PARASUT_ENABLED = process.env.PARASUT_ENABLED;
});

afterEach(() => {
    process.env.PARASUT_ENABLED = saved.PARASUT_ENABLED;
});

// ─── serviceSyncOrderToParasut ────────────────────────────────────────────────

describe("serviceSyncOrderToParasut — PARASUT_ENABLED guard", () => {
    it("returns disabled error and never calls sendInvoiceToParasut when PARASUT_ENABLED is unset", async () => {
        delete process.env.PARASUT_ENABLED;
        const result = await serviceSyncOrderToParasut("order-1");
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/devre dışı/i);
        expect(mockSendInvoice).not.toHaveBeenCalled();
        expect(mockDbGetOrderById).not.toHaveBeenCalled();
    });

    it("returns disabled error when PARASUT_ENABLED is empty string", async () => {
        process.env.PARASUT_ENABLED = "";
        const result = await serviceSyncOrderToParasut("order-1");
        expect(result.success).toBe(false);
        expect(mockSendInvoice).not.toHaveBeenCalled();
    });

    it("returns disabled error when PARASUT_ENABLED=false", async () => {
        process.env.PARASUT_ENABLED = "false";
        const result = await serviceSyncOrderToParasut("order-1");
        expect(result.success).toBe(false);
        expect(mockSendInvoice).not.toHaveBeenCalled();
    });

    it("proceeds to sendInvoiceToParasut when PARASUT_ENABLED=true", async () => {
        process.env.PARASUT_ENABLED = "true";
        mockDbGetOrderById.mockResolvedValue({
            id: "order-1",
            commercial_status: "approved",
            fulfillment_status: "shipped",
            order_number: "ORD-2026-0001",
            created_at: new Date().toISOString(),
            currency: "USD",
            customer_id: "cust-1",
            customer_name: "Test",
            lines: [{ quantity: 1, unit_price: 100, product_name: "Test Ürün", product_sku: "SKU-001", product_id: "prod-1", discount_pct: 0 }],
        });
        mockSendInvoice.mockResolvedValue({ success: true, invoiceId: "F-2026-9999", sentAt: new Date().toISOString() });

        await serviceSyncOrderToParasut("order-1");
        expect(mockSendInvoice).toHaveBeenCalledOnce();
    });
});

// ─── serviceRetrySyncLog ──────────────────────────────────────────────────────

describe("serviceRetrySyncLog — PARASUT_ENABLED guard", () => {
    it("returns disabled error without fetching sync log when disabled", async () => {
        delete process.env.PARASUT_ENABLED;
        const result = await serviceRetrySyncLog("log-1");
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/devre dışı/i);
        expect(mockDbGetSyncLog).not.toHaveBeenCalled();
    });
});

// ─── serviceSyncAllPending ────────────────────────────────────────────────────

describe("serviceSyncAllPending — PARASUT_ENABLED guard", () => {
    it("returns zeroes without querying DB when disabled", async () => {
        delete process.env.PARASUT_ENABLED;
        const result = await serviceSyncAllPending();
        expect(result.synced).toBe(0);
        expect(result.failed).toBe(0);
        expect(result.errors).toHaveLength(0);
        expect(mockSupabaseSelect).not.toHaveBeenCalled();
    });
});

// ─── GET /api/parasut/config ─────────────────────────────────────────────────

describe("GET /api/parasut/config — enabled field", () => {
    it("returns enabled: false when PARASUT_ENABLED is unset", async () => {
        delete process.env.PARASUT_ENABLED;
        const res = await configGET();
        const body = await res.json();
        expect(body.enabled).toBe(false);
    });

    it("returns enabled: false when PARASUT_ENABLED is empty", async () => {
        process.env.PARASUT_ENABLED = "";
        const res = await configGET();
        const body = await res.json();
        expect(body.enabled).toBe(false);
    });

    it("returns enabled: true when PARASUT_ENABLED=true", async () => {
        process.env.PARASUT_ENABLED = "true";
        const res = await configGET();
        const body = await res.json();
        expect(body.enabled).toBe(true);
    });
});
