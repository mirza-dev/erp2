/**
 * 2026-09-16 — RBAC Faz 6 "bilinen refinement" kapanışı: RESTRICT/NO ACTION FK'ler
 * silmeden ÖNCE sayılır → dürüst 500 yerine temiz 409.
 *
 * FK grafiği (kaynaktan, migration'lardan):
 *   customers    ← sales_orders.customer_id (RESTRICT, 001)  → zaten sayılıyordu
 *                ← invoices.customer_id     (RESTRICT, 012)  → YENİ
 *                ← quotes.customer_id       (034: SET NULL)  → bloklamaz, sayılmaz
 *   sales_orders ← shipments.order_id       (RESTRICT, 012)  → YENİ
 *                ← invoices.order_id        (RESTRICT, 012)  → YENİ
 *                ← production_entries.related_order_id (ON DELETE yazılmamış = NO ACTION, 001)
 *                  → YENİ; kayıtlı listede YOKTU, ölçümle bulundu
 *
 * Sıra sözleşmesi: guard → varlık/durum kapısı → FK ön-kontrol → silme. Authz-önce
 * korunur; durum kapısı 409 verirse sayaçlar hiç çağrılmaz (gereksiz sorgu yok).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/role-guard", () => ({
    requirePermission: vi.fn().mockResolvedValue(null),
    requireRole: vi.fn().mockResolvedValue(null),
    requireAnyRole: vi.fn().mockResolvedValue(null),
    getCurrentUserPermissions: vi.fn().mockResolvedValue(new Set(["view_sales_prices"])),
    getCurrentUserRoles: vi.fn().mockResolvedValue(["admin"]),
    getCurrentUserRole: vi.fn().mockResolvedValue("admin"),
    getCurrentUserId: vi.fn().mockResolvedValue("user-1"),
    resolveAuthContext: vi.fn(),
    requirePermissionFor: vi.fn().mockReturnValue(null),
    actorFromAuthContext: vi.fn().mockReturnValue({ userId: "user-1", label: "u" }),
}));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("@/lib/realtime/broadcast", () => ({ broadcastDataChange: vi.fn().mockResolvedValue(undefined) }));

const mockDeleteCustomer   = vi.fn();
const mockOrdersByCustomer = vi.fn();
const mockInvByCustomer    = vi.fn();
const mockInvByOrder       = vi.fn();
const mockShipByOrder      = vi.fn();
const mockProdByOrder      = vi.fn();
const mockGetOrderById     = vi.fn();
const mockHardDeleteOrder  = vi.fn();

vi.mock("@/lib/supabase/customers", () => ({
    dbUpdateCustomer: vi.fn(),
    dbDeleteCustomer: (...a: unknown[]) => mockDeleteCustomer(...a),
}));
vi.mock("@/lib/supabase/orders", () => ({
    dbCountOrdersByCustomer: (...a: unknown[]) => mockOrdersByCustomer(...a),
    dbGetOrderById: (...a: unknown[]) => mockGetOrderById(...a),
    dbHardDeleteOrder: (...a: unknown[]) => mockHardDeleteOrder(...a),
}));
vi.mock("@/lib/supabase/invoices", () => ({
    dbCountInvoicesByCustomer: (...a: unknown[]) => mockInvByCustomer(...a),
    dbCountInvoicesByOrder: (...a: unknown[]) => mockInvByOrder(...a),
}));
vi.mock("@/lib/supabase/shipments", () => ({
    dbCountShipmentsByOrder: (...a: unknown[]) => mockShipByOrder(...a),
}));
vi.mock("@/lib/supabase/production", () => ({
    dbCountProductionEntriesByOrder: (...a: unknown[]) => mockProdByOrder(...a),
}));
vi.mock("@/lib/services/order-service", () => ({
    serviceGetOrder: vi.fn(),
    serviceTransitionOrder: vi.fn(),
    serviceUpdateQuoteDeadline: vi.fn(),
    serviceUpdateOrderLines: vi.fn(),
    serviceLinkOrderCustomer: vi.fn(),
}));
vi.mock("@/lib/services/parasut-service", () => ({
    serviceSyncOrderToParasut: vi.fn().mockResolvedValue(undefined),
}));

import { DELETE as deleteCustomer } from "@/app/api/customers/[id]/route";
import { DELETE as deleteOrder } from "@/app/api/orders/[id]/route";

const CID = "11111111-1111-4111-8111-111111111111";
const OID = "22222222-2222-4222-8222-222222222222";
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
    vi.clearAllMocks();
    mockOrdersByCustomer.mockResolvedValue(0);
    mockInvByCustomer.mockResolvedValue(0);
    mockInvByOrder.mockResolvedValue(0);
    mockShipByOrder.mockResolvedValue(0);
    mockProdByOrder.mockResolvedValue(0);
    mockDeleteCustomer.mockResolvedValue(undefined);
    mockHardDeleteOrder.mockResolvedValue(undefined);
    mockGetOrderById.mockResolvedValue({ id: OID, commercial_status: "draft" });
});

describe("DELETE /api/customers/[id] — invoices.customer_id RESTRICT ön-kontrolü", () => {
    const req = () => new NextRequest(`http://localhost/api/customers/${CID}`, { method: "DELETE" });

    it("faturası olan cari → 409, mesaj fatura SAYISINI taşır, silme çağrılmaz", async () => {
        mockInvByCustomer.mockResolvedValue(3);
        const res = await deleteCustomer(req(), params(CID));
        expect(res.status).toBe(409);
        const body = await res.json();
        expect(body.error).toMatch(/3 fatura/);
        expect(mockInvByCustomer).toHaveBeenCalledWith(CID);
        expect(mockDeleteCustomer).not.toHaveBeenCalled();
    });

    it("sipariş kapısı ÖNCE: siparişi varsa fatura sayacı hiç sorulmaz (409 sipariş mesajı)", async () => {
        mockOrdersByCustomer.mockResolvedValue(2);
        mockInvByCustomer.mockResolvedValue(9);
        const res = await deleteCustomer(req(), params(CID));
        expect(res.status).toBe(409);
        expect((await res.json()).error).toMatch(/2 sipariş/);
        expect(mockInvByCustomer).not.toHaveBeenCalled();
        expect(mockDeleteCustomer).not.toHaveBeenCalled();
    });

    it("sipariş 0 + fatura 0 → silinir (regresyon: yeni sayaç boş kümede engel değil)", async () => {
        const res = await deleteCustomer(req(), params(CID));
        expect(res.status).toBe(200);
        expect(mockDeleteCustomer).toHaveBeenCalledWith(CID, "user-1");
    });
});

describe("DELETE /api/orders/[id]?permanent=1 — shipments/invoices/production_entries ön-kontrolü", () => {
    const req = () => new NextRequest(`http://localhost/api/orders/${OID}?permanent=1`, { method: "DELETE" });

    it("sevkiyatı olan taslak → 409, mesaj '1 sevkiyat', hard delete çağrılmaz", async () => {
        mockShipByOrder.mockResolvedValue(1);
        const res = await deleteOrder(req(), params(OID));
        expect(res.status).toBe(409);
        expect((await res.json()).error).toMatch(/1 sevkiyat/);
        expect(mockHardDeleteOrder).not.toHaveBeenCalled();
    });

    it("fatura + üretim kaydı birlikte → tek 409, mesaj İKİSİNİ de sayar (sevkiyat geçmez)", async () => {
        mockInvByOrder.mockResolvedValue(2);
        mockProdByOrder.mockResolvedValue(3);
        const res = await deleteOrder(req(), params(OID));
        expect(res.status).toBe(409);
        const { error } = await res.json();
        expect(error).toMatch(/2 fatura/);
        expect(error).toMatch(/3 üretim kaydı/);
        expect(error).not.toMatch(/sevkiyat/);
        expect(mockHardDeleteOrder).not.toHaveBeenCalled();
    });

    it("üç sayaç da 0 → hard delete çağrılır (sayaçların üçü de sorulmuş olmalı)", async () => {
        const res = await deleteOrder(req(), params(OID));
        expect(res.status).toBe(200);
        expect(mockShipByOrder).toHaveBeenCalledWith(OID);
        expect(mockInvByOrder).toHaveBeenCalledWith(OID);
        expect(mockProdByOrder).toHaveBeenCalledWith(OID);
        expect(mockHardDeleteOrder).toHaveBeenCalledWith(OID, "user-1");
    });

    it("durum kapısı ÖNCE: onaylı siparişte sayaçlar hiç sorulmaz (409 durum mesajı)", async () => {
        mockGetOrderById.mockResolvedValue({ id: OID, commercial_status: "approved" });
        mockShipByOrder.mockResolvedValue(5);
        const res = await deleteOrder(req(), params(OID));
        expect(res.status).toBe(409);
        expect((await res.json()).error).toMatch(/taslak veya iptal/);
        expect(mockShipByOrder).not.toHaveBeenCalled();
        expect(mockHardDeleteOrder).not.toHaveBeenCalled();
    });
});

describe("Sayaç yardımcıları — sorgu şekli (head+count, doğru FK kolonu)", () => {
    // Gerçek helper'lar mock'lu service client ile: yanlış kolona sayım (ör. customer_id
    // yerine id) yeşil kalırdı; burada zincir birebir kilitlenir.
    it("invoices/shipments/production sayaçları doğru kolonla head+count sorgular", async () => {
        vi.resetModules();
        const calls: Array<{ table: string; select: unknown[]; eq: unknown[] }> = [];
        vi.doMock("@/lib/supabase/service", () => ({
            createServiceClient: () => ({
                from: (table: string) => ({
                    select: (...select: unknown[]) => ({
                        eq: (...eq: unknown[]) => {
                            calls.push({ table, select, eq });
                            return Promise.resolve({ count: 7, error: null });
                        },
                    }),
                }),
            }),
        }));
        // Bu dosyanın tepesindeki vi.mock'lar helper modüllerini sahteliyor; burada GERÇEK
        // gövdeler istenir (importActual) — yalnız `./service` bağımlılığı sahte kalır.
        const inv = await vi.importActual<typeof import("@/lib/supabase/invoices")>("@/lib/supabase/invoices");
        const shp = await vi.importActual<typeof import("@/lib/supabase/shipments")>("@/lib/supabase/shipments");
        const prd = await vi.importActual<typeof import("@/lib/supabase/production")>("@/lib/supabase/production");
        expect(await inv.dbCountInvoicesByCustomer("c1")).toBe(7);
        expect(await inv.dbCountInvoicesByOrder("o1")).toBe(7);
        expect(await shp.dbCountShipmentsByOrder("o1")).toBe(7);
        expect(await prd.dbCountProductionEntriesByOrder("o1")).toBe(7);
        expect(calls).toEqual([
            { table: "invoices",           select: ["id", { count: "exact", head: true }], eq: ["customer_id", "c1"] },
            { table: "invoices",           select: ["id", { count: "exact", head: true }], eq: ["order_id", "o1"] },
            { table: "shipments",          select: ["id", { count: "exact", head: true }], eq: ["order_id", "o1"] },
            { table: "production_entries", select: ["id", { count: "exact", head: true }], eq: ["related_order_id", "o1"] },
        ]);
        vi.doUnmock("@/lib/supabase/service");
    });
});
