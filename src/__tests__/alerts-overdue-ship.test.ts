/**
 * Faz 7 — overdue_shipment alert inline ship form + POST /api/orders/[id]/ship endpoint.
 *
 * Covers:
 *   POST /api/orders/[id]/ship
 *     - shipDate eksik → 400
 *     - shipDate geçersiz format → 400
 *     - shipDate takvim overflow (2026-02-31, 2026-99-99) → 400 (P2 fix)
 *     - trackingNumber 101 karakter → 400 (length validation)
 *     - sipariş yok (service error pass-through) → 400
 *     - sipariş approved değil → 400
 *     - happy path → 200, revalidateTag("products","max") çağrıldı
 *     - happy path → dbBatchResolveAlerts overdue_shipment fire-and-forget (P3 fix)
 *
 *   source-regression:
 *     - actionFor overdue_shipment case → "Sevkiyatı yönet" + "/dashboard/orders"
 *     - OrderAlertDrawer overdue_shipment branch → inline ship form mevcudiyeti
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// RBAC Faz 4: route'lara requirePermission guard eklendi → bu test guard'ı allow'a
// mock'lar (gerçek guard logic role-guard.test.ts + page-access.test.ts'te test edilir).
vi.mock("@/lib/auth/role-guard", () => ({
    requirePermission: vi.fn().mockResolvedValue(null),
    requirePermissionFor: vi.fn().mockReturnValue(null),
    requireRole: vi.fn().mockResolvedValue(null),
    requireAnyRole: vi.fn().mockResolvedValue(null),
    getCurrentUserPermissions: vi.fn().mockResolvedValue(
        new Set(["view_sales_prices", "view_purchase_costs", "view_financial_summary"])),
    getCurrentUserRoles: vi.fn().mockResolvedValue(["admin"]),
    getCurrentUserRole: vi.fn().mockResolvedValue("admin"),
    resolveAuthContext: vi.fn().mockResolvedValue({ user: { id: "actor-1" }, userId: "actor-1", roles: ["admin"], perms: new Set(["ship_sales_orders", "view_sales_prices"]) }),
    actorFromAuthContext: (ctx: { userId?: string | null }) => ({ userId: ctx.userId ?? null, label: null }),
}));
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NextRequest } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockServiceTransitionOrder = vi.fn();
const mockServiceGetOrder        = vi.fn();
const mockServiceSyncOrder       = vi.fn();
const mockNotifyUsers            = vi.fn();
const mockRevalidateTag          = vi.fn();
const mockDbBatchResolveAlerts   = vi.fn();

vi.mock("@/lib/services/order-service", () => ({
    serviceTransitionOrder: (...a: unknown[]) => mockServiceTransitionOrder(...a),
    serviceGetOrder:        (...a: unknown[]) => mockServiceGetOrder(...a),
}));

vi.mock("@/lib/services/parasut-service", () => ({
    serviceSyncOrderToParasut: (...a: unknown[]) => mockServiceSyncOrder(...a),
}));

vi.mock("@/lib/services/email-service", () => ({
    notifyUsersByEmail: (...a: unknown[]) => mockNotifyUsers(...a),
}));

vi.mock("@/lib/supabase/alerts", () => ({
    dbBatchResolveAlerts: (...a: unknown[]) => mockDbBatchResolveAlerts(...a),
}));

vi.mock("next/cache", () => ({
    revalidateTag: (...a: unknown[]) => mockRevalidateTag(...a),
    unstable_cache: (_fn: () => unknown) => _fn,
}));

vi.mock("next/headers", () => ({
    cookies: () => Promise.resolve({ get: () => undefined, getAll: () => [] }),
}));

// ── Imports ───────────────────────────────────────────────────

import { POST } from "@/app/api/orders/[id]/ship/route";

// ── Helpers ───────────────────────────────────────────────────

const ORDER_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";

function makeReq(body: unknown) {
    return new NextRequest(`http://localhost/api/orders/${ORDER_ID}/ship`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
}

function makeParams(id = ORDER_ID) {
    return { params: Promise.resolve({ id }) };
}

const validBody = {
    shipDate: "2026-05-16",
};

const mockOrder = {
    id: ORDER_ID,
    order_number: "ORD-2026-0001",
    customer_name: "Tüpraş",
    commercial_status: "approved",
};

beforeEach(() => {
    mockServiceTransitionOrder.mockReset();
    mockServiceGetOrder.mockReset().mockResolvedValue(mockOrder);
    mockServiceSyncOrder.mockReset().mockResolvedValue(undefined);
    mockNotifyUsers.mockReset().mockResolvedValue(undefined);
    mockRevalidateTag.mockReset();
    mockDbBatchResolveAlerts.mockReset().mockResolvedValue(1);
});

// ── Endpoint tests ────────────────────────────────────────────

describe("POST /api/orders/[id]/ship", () => {
    it("shipDate eksik → 400", async () => {
        const res = await POST(makeReq({}), makeParams());
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toMatch(/shipDate/);
        expect(mockServiceTransitionOrder).not.toHaveBeenCalled();
    });

    it("shipDate geçersiz format (eğik çizgi) → 400", async () => {
        const res = await POST(makeReq({ shipDate: "2026/05/16" }), makeParams());
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toMatch(/shipDate/);
        expect(mockServiceTransitionOrder).not.toHaveBeenCalled();
    });

    it("shipDate olmayan gün (2026-02-31) → 400 (takvim normalizasyon koruması)", async () => {
        const res = await POST(makeReq({ shipDate: "2026-02-31" }), makeParams());
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toMatch(/takvim|geçersiz/);
        expect(mockServiceTransitionOrder).not.toHaveBeenCalled();
    });

    it("shipDate geçersiz ay/gün (2026-99-99) → 400 (RangeError öncesi guard)", async () => {
        const res = await POST(makeReq({ shipDate: "2026-99-99" }), makeParams());
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toMatch(/takvim|geçersiz/);
        expect(mockServiceTransitionOrder).not.toHaveBeenCalled();
    });

    it("trackingNumber 101 karakter → 400 (length guard)", async () => {
        const res = await POST(
            makeReq({ ...validBody, trackingNumber: "A".repeat(101) }),
            makeParams(),
        );
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toMatch(/trackingNumber/);
        expect(mockServiceTransitionOrder).not.toHaveBeenCalled();
    });

    it("carrier 101 karakter → 400 (length guard)", async () => {
        const res = await POST(
            makeReq({ ...validBody, carrier: "B".repeat(101) }),
            makeParams(),
        );
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toMatch(/carrier/);
        expect(mockServiceTransitionOrder).not.toHaveBeenCalled();
    });

    it("serviceTransitionOrder 'sipariş bulunamadı' döndürünce → 404", async () => {
        mockServiceTransitionOrder.mockResolvedValue({
            success: false,
            error: "Sipariş bulunamadı.",
        });
        const res = await POST(makeReq(validBody), makeParams());
        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.error).toMatch(/bulunamadı/);
    });

    it("sipariş approved değil → 400 (transition error pass-through)", async () => {
        mockServiceTransitionOrder.mockResolvedValue({
            success: false,
            error: "Yalnızca onaylanmış siparişler sevk edilebilir.",
        });
        const res = await POST(makeReq(validBody), makeParams());
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toMatch(/onaylanmış/);
    });

    it("happy path → 200, ShipMeta iletildi, revalidateTag('products','max') çağrıldı", async () => {
        mockServiceTransitionOrder.mockResolvedValue({ success: true });

        const res = await POST(
            makeReq({ shipDate: "2026-05-16", trackingNumber: "1Z123456", carrier: "UPS" }),
            makeParams(),
        );
        expect(res.status).toBe(200);

        // ShipMeta doğru iletildi
        expect(mockServiceTransitionOrder).toHaveBeenCalledWith(
            ORDER_ID,
            "shipped",
            expect.objectContaining({
                shipDate:      "2026-05-16",
                trackingNumber: "1Z123456",
                carrier:        "UPS",
            }),
            { userId: "actor-1", label: null },
        );

        // Cache invalidation
        expect(mockRevalidateTag).toHaveBeenCalledWith("products", "max");
    });

    it("happy path boş tracking/carrier → shipMeta'da null iletilir", async () => {
        mockServiceTransitionOrder.mockResolvedValue({ success: true });

        await POST(makeReq({ shipDate: "2026-05-20" }), makeParams());

        expect(mockServiceTransitionOrder).toHaveBeenCalledWith(
            ORDER_ID,
            "shipped",
            expect.objectContaining({
                shipDate:      "2026-05-20",
                trackingNumber: null,
                carrier:        null,
            }),
            { userId: "actor-1", label: null },
        );
    });

    it("happy path → Paraşüt sync fire-and-forget çağrılır", async () => {
        mockServiceTransitionOrder.mockResolvedValue({ success: true });
        await POST(makeReq(validBody), makeParams());
        expect(mockServiceSyncOrder).toHaveBeenCalledWith(ORDER_ID);
    });

    it("happy path → dbBatchResolveAlerts overdue_shipment fire-and-forget çağrılır (P3)", async () => {
        mockServiceTransitionOrder.mockResolvedValue({ success: true });
        await POST(makeReq(validBody), makeParams());
        expect(mockDbBatchResolveAlerts).toHaveBeenCalledWith([
            expect.objectContaining({ type: "overdue_shipment", entityId: ORDER_ID }),
        ]);
    });
});

// ── Source-regression (takvim drawer, Faz 1) ───────────────────
// TAKVİM GEÇİŞİ: Faz 7 inline sevk formu takvim drawer'ına Faz 2'de taşınacak
// (ALERTS_CALENDAR_PLAN.md Faz 2). Endpoint testleri (yukarıda) tam kapsamda kalır.
// Faz 1: overdue_shipment uyarısı drawer'da "Sevkiyatı Yönet" nav linkiyle ele alınır.

const drawerSource = readFileSync(
    resolve(process.cwd(), "src/components/alerts/AlertCalendarDrawer.tsx"),
    "utf-8",
);

describe("overdue_shipment — takvim drawer (Faz 1) kaynak regresyonu", () => {
    it("AlertCalendarDrawer overdue_shipment nav linki: 'Sevkiyatı Yönet' + /dashboard/orders", () => {
        const block = drawerSource.split("overdue_shipment:")[1]?.slice(0, 300) ?? "";
        expect(block).toContain("Sevkiyatı Yönet");
        expect(block).toContain("/dashboard/orders");
    });

    // ── Faz 2: drawer zenginliği — inline sevk formu drawer'a taşındı ──
    it("Faz 2: overdue_shipment inline sevk formu (shipDate/tracking/carrier → POST /api/orders/[id]/ship)", () => {
        expect(drawerSource).toContain("isOverdueShipment");
        expect(drawerSource).toContain("Sevkiyatı Kaydet");
        expect(drawerSource).toContain("const handleShip");
        expect(drawerSource).toContain("shipDate");
        expect(drawerSource).toContain("trackingNumber");
        expect(drawerSource).toContain("carrier");
        expect(drawerSource).toMatch(/\/api\/orders\/\$\{entityId\}\/ship/);
        expect(drawerSource).toMatch(/method:\s*["']POST["']/);
        // opsiyonel alanlar 100 karakter sınırı (endpoint validation paritesi)
        expect(drawerSource).toMatch(/maxLength=\{100\}/);
    });

    it("Faz 2: başarılı sevk → onShipped callback (parent refetch; endpoint Faz 7'de alert resolve eder)", () => {
        expect(drawerSource).toContain("onShipped?.()");
        const pageSource = readFileSync(
            resolve(process.cwd(), "src/app/dashboard/alerts/page.tsx"),
            "utf-8",
        );
        const block = pageSource.split("onShipped={")[1]?.slice(0, 200) ?? "";
        expect(block).toContain("refetch()");
        expect(block).toMatch(/Sevkiyat kaydedildi/);
    });
});
