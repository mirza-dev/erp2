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

// ── Source-regression tests ───────────────────────────────────

const alertsSource = readFileSync(
    resolve(process.cwd(), "src/app/dashboard/alerts/page.tsx"),
    "utf-8",
);

describe("actionFor + OrderAlertDrawer (source-regression)", () => {
    it("actionFor switch'inde overdue_shipment → 'Sevkiyatı yönet' + /dashboard/orders", () => {
        expect(alertsSource).toMatch(
            /types\.includes\(\s*["']overdue_shipment["']\s*\)[^}]*label\s*:\s*["']Sevkiyatı yönet["']/,
        );
        expect(alertsSource).toMatch(
            /types\.includes\(\s*["']overdue_shipment["']\s*\)[^}]*href\s*:\s*["']\/dashboard\/orders["']/,
        );
    });

    it("OrderAlertDrawer overdue_shipment branch inline ship formu içeriyor", () => {
        // isOverdueShipment flag
        expect(alertsSource).toMatch(/isOverdueShipment\s*=\s*alert\.type\s*===\s*["']overdue_shipment["']/);
        // Sevk Et butonu
        expect(alertsSource).toMatch(/Sevk Et/);
        // Sevkiyat tarihi aria-label
        expect(alertsSource).toMatch(/aria-label\s*=\s*["']Sevkiyat tarihi["']/);
        // POST /api/orders/.../ship çağrısı
        expect(alertsSource).toMatch(/\/api\/orders\/.*\/ship/);
    });

    it("onShipped callback OrderAlertDrawer props'unda mevcut", () => {
        expect(alertsSource).toMatch(/onShipped\s*:/);
        expect(alertsSource).toMatch(/onShipped\s*\(\s*\)/);
    });
});
