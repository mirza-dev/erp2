/**
 * order_shortage drawer aksiyonları — kaynak regresyonu.
 *
 * TAKVİM GEÇİŞİ (Faz 1): Eski ürün-gruplu drawer + Faz 10 "İLGİLİ SİPARİŞLER"
 * (related-orders fetch + üretim derin-linki) takvim drawer'ına HENÜZ taşınmadı.
 * Bunlar Faz 2 kapsamında AlertCalendarDrawer'a birebir taşınacak (bkz.
 * ALERTS_CALENDAR_PLAN.md Faz 2). Backend ENDPOINT'i (`/api/products/[id]/shortages`)
 * + üretim prefill helper'ı ayrı dosyalarda (products-shortages-route.test.ts,
 * production-prefill.test.ts) hâlâ tam kapsamda — davranış sözleşmesi korunur.
 *
 * Faz 1: order_shortage uyarısı takvim drawer'ında nav linkleriyle ele alınır.
 */
import { describe, it, expect, beforeAll } from "vitest";

describe("order_shortage — takvim drawer (Faz 1) kaynak regresyonu", () => {
    let drawerSrc = "";

    beforeAll(async () => {
        const fs = await import("fs/promises");
        const path = await import("path");
        drawerSrc = await fs.readFile(
            path.resolve(process.cwd(), "src/components/alerts/AlertCalendarDrawer.tsx"),
            "utf-8",
        );
    });

    it("AlertCalendarDrawer order_shortage nav linkleri: 'Siparişleri İncele' + 'Satın Alma Planla'", () => {
        const block = drawerSrc.split("order_shortage:")[1]?.slice(0, 400) ?? "";
        expect(block).toContain("Siparişleri İncele");
        expect(block).toContain("/dashboard/orders");
        expect(block).toContain("Satın Alma Planla");
        expect(block).toContain("/dashboard/purchase/suggested");
    });

    // ── Faz 2'ye taşınacak (drawer zenginliği) ──
    it("Faz 2: İLGİLİ SİPARİŞLER bölümü (/api/products/[id]/shortages fetch + loading/error/empty/list)", () => {
        expect(drawerSrc).toContain("İlgili Siparişler");
        expect(drawerSrc).toContain("isOrderShortage");
        // doğru endpoint
        expect(drawerSrc).toMatch(/\/api\/products\/\$\{entityId\}\/shortages/);
        // 4 durum dalı
        expect(drawerSrc).toContain("shortageLoading");
        expect(drawerSrc).toContain("shortageError");
        expect(drawerSrc).toMatch(/shortageRows && shortageRows\.length === 0/);
        expect(drawerSrc).toMatch(/shortageRows && shortageRows\.length > 0/);
        // response shape (items + totalShortage)
        expect(drawerSrc).toContain("data.items");
        expect(drawerSrc).toContain("data.totalShortage");
    });

    it("Faz 2: üretim derin-linki '/dashboard/production?productId&qty' yeni sekmede", () => {
        expect(drawerSrc).toMatch(/\/dashboard\/production\?productId=\$\{entityId\}/);
        expect(drawerSrc).toMatch(/qty=\$\{shortageTotal\}/);
        expect(drawerSrc).toContain('target="_blank"');
        expect(drawerSrc).toContain('rel="noopener"');
        expect(drawerSrc).toContain("Üretim Emri Başlat");
    });

    it("Faz 2: shortage satırı aria-label + 'Siparişe git' linki + orphan guard", () => {
        // sipariş satırı linki + aria-label
        expect(drawerSrc).toMatch(/\/dashboard\/orders\/\$\{row\.orderId\}/);
        expect(drawerSrc).toMatch(/siparişine git/);
        expect(drawerSrc).toContain("row.shortageQty");
        // orphan guard: entityId yoksa fetch/section render edilmez
        expect(drawerSrc).toMatch(/alert\.type !== "order_shortage" \|\| !entityId/);
        expect(drawerSrc).toMatch(/alert\.type === "order_shortage" && !!entityId/);
    });
});
