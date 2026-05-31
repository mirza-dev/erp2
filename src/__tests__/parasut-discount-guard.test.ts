/**
 * Faz 8e (V7-A4 evrimi) — serviceSyncOrderToParasut header iskonto reconciliation.
 * discount_amount > 0 → orantılı per-satır yüzde faturaya taşınır; claim ÖNCESİ
 * reconciliation: orantılı toplam donmuş grand_total ile tolerans dahilinde
 * uyuşmazsa (veya subtotal=0) early return + ZORUNLU sync_issue alert (blok, throw
 * değil). Uyuşursa normal akış (claim çağrılır). order_lines MUTATE EDİLMEZ.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockGetOrder    = vi.fn();
const mockCreateAlert = vi.fn();
const mockRpc         = vi.fn();
const mockFrom        = vi.fn();
const mockCreateSyncLog = vi.fn();

vi.mock("@/lib/supabase/orders", () => ({ dbGetOrderById: (...a: unknown[]) => mockGetOrder(...a) }));
vi.mock("@/lib/supabase/alerts", () => ({ dbCreateAlert: (...a: unknown[]) => mockCreateAlert(...a) }));
vi.mock("@/lib/supabase/sync-log", () => ({
    dbCreateSyncLog: (...a: unknown[]) => mockCreateSyncLog(...a),
    dbGetSyncLog: vi.fn(),
    dbUpdateSyncLog: vi.fn(),
}));
vi.mock("@/lib/supabase/service", () => ({
    createServiceClient: () => ({ rpc: mockRpc, from: mockFrom }),
}));
vi.mock("@/lib/supabase/customers", () => ({ dbGetCustomerById: vi.fn() }));
vi.mock("@/lib/supabase/products", () => ({ dbGetProductById: vi.fn() }));
vi.mock("@/lib/services/email-service", () => ({ notifyUsersByEmail: vi.fn() }));
vi.mock("@/lib/parasut", () => ({ getParasutAdapter: vi.fn() }));

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
    serviceSyncOrderToParasut,
    computeHeaderDiscountPct,
    reconcileParasutDiscount,
} from "@/lib/services/parasut-service";

const OID = "00000000-0000-4000-8000-0000000000aa";

// 2×50 = 100 subtotal, %20 iskonto (disc 20), net 80, vat %20 = 16 → grand 96.
const okLines = [{ quantity: 2, unit_price: 50, vat_rate: 20, discount_pct: 0 }];
const baseOrder = (over: Record<string, unknown> = {}) => ({
    id: OID, order_number: "SIP-2026-001",
    commercial_status: "approved", fulfillment_status: "shipped", customer_id: "cust-1",
    discount_amount: 0, subtotal: 0, grand_total: 0,
    parasut_step: null, parasut_retry_count: 0, lines: [],
    ...over,
});

beforeEach(() => {
    vi.clearAllMocks();
    process.env.PARASUT_ENABLED = "true";
    mockCreateAlert.mockResolvedValue({ id: "alert-1" });
});
afterEach(() => { delete process.env.PARASUT_ENABLED; });

// ── Pure helpers ─────────────────────────────────────────────────

describe("computeHeaderDiscountPct", () => {
    it("discount/subtotal*100 (tam precision)", () => {
        expect(computeHeaderDiscountPct(20, 100)).toBeCloseTo(20, 6);
        expect(computeHeaderDiscountPct(33.33, 100)).toBeCloseTo(33.33, 6);
    });
    it("subtotal ≤ 0 veya discount ≤ 0 → 0", () => {
        expect(computeHeaderDiscountPct(20, 0)).toBe(0);
        expect(computeHeaderDiscountPct(0, 100)).toBe(0);
        expect(computeHeaderDiscountPct(-5, 100)).toBe(0);
    });
});

// Builder source-regex: discount_value satırı reconcile'dan BAĞIMSIZ (reconcile
// builder'dan önce, kendi toplamını kurar) → integration testi (claim=null)
// builder'a hiç varmıyor. Bu satır regrese olursa (bare line.discount_pct'ye
// dönerse) reconcile yine geçer, Paraşüt iskontosuz fatura alır = tam da bu fazın
// önlediği sessiz hata. Bu yüzden builder'ın headerPct'yi yazdığını kilitle.
describe("Paraşüt fatura builder — header iskonto orantılı (drift-guard)", () => {
    const SRC = readFileSync(join(process.cwd(), "src/lib/services/parasut-service.ts"), "utf8");
    it("builder headerDiscountPct'yi computeHeaderDiscountPct ile hesaplar", () => {
        expect(SRC).toMatch(/const headerDiscountPct = computeHeaderDiscountPct\(/);
    });
    it("details discount_value = line.discount_pct + headerDiscountPct (bare line.discount_pct DEĞİL)", () => {
        expect(SRC).toMatch(/discount_value:\s*Number\(line\.discount_pct[^)]*\)\s*\+\s*headerDiscountPct/);
        // Regression: eski bare form geri gelmesin.
        expect(SRC).not.toMatch(/discount_value:\s*line\.discount_pct,/);
    });
});

describe("reconcileParasutDiscount", () => {
    it("orantılı toplam grand_total ile uyuşur → ok", () => {
        const r = reconcileParasutDiscount({ subtotal: 100, discount_amount: 20, grand_total: 96, lines: okLines });
        expect(r.ok).toBe(true);
        expect(r.expected).toBeCloseTo(96, 2);
    });
    it("subtotal=0 & discount>0 → ok:false reason subtotal_zero", () => {
        const r = reconcileParasutDiscount({ subtotal: 0, discount_amount: 20, grand_total: 0, lines: [] });
        expect(r.ok).toBe(false);
        expect(r.reason).toBe("subtotal_zero");
    });
    it("grand_total drift toleransı aşar → ok:false", () => {
        const r = reconcileParasutDiscount({ subtotal: 100, discount_amount: 20, grand_total: 200, lines: okLines });
        expect(r.ok).toBe(false);
    });
});

// ── Integration ──────────────────────────────────────────────────

describe("serviceSyncOrderToParasut — iskonto reconciliation (V7-A4 evrimi)", () => {
    it("discount>0 & reconcile OK → guard'ı geçer, parasut_claim_sync ÇAĞRILIR", async () => {
        mockGetOrder.mockResolvedValue(baseOrder({ discount_amount: 20, subtotal: 100, grand_total: 96, lines: okLines }));
        mockRpc.mockResolvedValue({ data: null, error: null }); // claim null → erken çıkış (amaç: guard'ı geçtiğini doğrula)
        const r = await serviceSyncOrderToParasut(OID);
        expect(mockCreateAlert).not.toHaveBeenCalled();        // reconcile alert'i yok
        expect(mockRpc).toHaveBeenCalledWith("parasut_claim_sync", expect.objectContaining({ p_order_id: OID }));
        expect(r.reason).toBe("not_eligible_or_locked");
    });

    it("discount>0 & subtotal=0 → skipped (reconcile_failed) + claim ÇAĞRILMAZ + alert", async () => {
        mockGetOrder.mockResolvedValue(baseOrder({ discount_amount: 150, subtotal: 0, grand_total: 0 }));
        const r = await serviceSyncOrderToParasut(OID);
        expect(r.success).toBe(false);
        expect(r.skipped).toBe(true);
        expect(r.reason).toBe("discount_reconcile_failed");
        expect(mockRpc).not.toHaveBeenCalled();
        expect(mockFrom).not.toHaveBeenCalled();
        expect(mockCreateSyncLog).not.toHaveBeenCalled();
        expect(mockCreateAlert).toHaveBeenCalledTimes(1);
        const arg = mockCreateAlert.mock.calls[0][0];
        expect(arg.type).toBe("sync_issue");
        expect(arg.entity_type).toBe("sales_order");
        expect(arg.entity_id).toBe(OID);
        expect(arg.description).toMatch(/iskonto/i);
    });

    it("discount>0 & toplam drift → skipped (reconcile_failed) + alert + claim yok", async () => {
        mockGetOrder.mockResolvedValue(baseOrder({ discount_amount: 20, subtotal: 100, grand_total: 999, lines: okLines }));
        const r = await serviceSyncOrderToParasut(OID);
        expect(r.reason).toBe("discount_reconcile_failed");
        expect(mockRpc).not.toHaveBeenCalled();
        expect(mockCreateAlert).toHaveBeenCalledTimes(1);
    });

    it("discount=0 → reconciliation atlanır, normal akış (claim çağrılır, alert yok)", async () => {
        mockGetOrder.mockResolvedValue(baseOrder({ discount_amount: 0 }));
        mockRpc.mockResolvedValue({ data: null, error: null });
        const r = await serviceSyncOrderToParasut(OID);
        expect(mockCreateAlert).not.toHaveBeenCalled();
        expect(mockRpc).toHaveBeenCalledWith("parasut_claim_sync", expect.objectContaining({ p_order_id: OID }));
        expect(r.skipped).toBe(true);
        expect(r.reason).toBe("not_eligible_or_locked");
    });
});
