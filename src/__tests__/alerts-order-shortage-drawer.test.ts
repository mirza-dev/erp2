/**
 * Faz 10 — order_shortage drawer enhancements
 *
 * Source-regex doğrulamaları:
 *  - drawerActionLinks order_shortage: "Üretim emri başlat (yeni sekmede)"
 *    + newTab flag + ?productId&qty paramları
 *  - AlertDetailDrawer: fetch /api/products/[id]/shortages
 *  - YENİ "İLGİLİ SİPARİŞLER" bölümü (loading/error/empty/list)
 *  - Link render: target="_blank" + rel="noopener" + "↗" işareti newTab için
 *
 * Test paterni alerts page için standart: JSX render edilmez (page çok ağır,
 * useData global state lazım). Source-regex + helper davranış matrisi yeterli.
 */
import { describe, it, expect, beforeAll } from "vitest";

describe("Faz 10 — alerts page source-regex (drawer + actionLinks)", () => {
    let src = "";

    beforeAll(async () => {
        const fs = await import("fs/promises");
        const path = await import("path");
        src = await fs.readFile(
            path.resolve(process.cwd(), "src/app/dashboard/alerts/page.tsx"),
            "utf-8",
        );
    });

    it("drawerActionLinks order_shortage: 'Üretim emri başlat (yeni sekmede)' primary + newTab=true", () => {
        expect(src).toContain("Üretim emri başlat (yeni sekmede)");
        // newTab: true ile birlikte
        expect(src).toMatch(/newTab:\s*true/);
        // /dashboard/production?productId=...&qty=... pattern
        expect(src).toMatch(/\/dashboard\/production\?productId=\$\{group\.entityId\}/);
        expect(src).toMatch(/qtyParam/); // qty query string conditional
    });

    it("drawerActionLinks order_shortage: ikincil link 'Satın alma planla'", () => {
        expect(src).toMatch(/order_shortage[\s\S]*?Satın alma planla/);
    });

    it("drawerActionLinks: eski 'Siparişleri incele' (primary order_shortage) kaldırıldı", () => {
        // Önceki davranış: order_shortage → "Siparişleri incele" primary. Plan §9.4.4 ile değişti.
        // Şu an order_shortage scope'unda "Siparişleri incele" primary olmamalı.
        const orderShortageBlock = src.split(/if \(types\.includes\("order_shortage"\)\)/)[1] ?? "";
        const firstActionLinkBlock = orderShortageBlock.slice(0, 800);
        expect(firstActionLinkBlock).not.toMatch(/"Siparişleri incele"[^]*?primary:\s*true/);
    });

    it("AlertDetailDrawer: hasOrderShortage state + shortage fetch useEffect", () => {
        expect(src).toContain("hasOrderShortage");
        expect(src).toContain("shortageDetails");
        expect(src).toContain("shortageLoading");
        expect(src).toContain("shortageError");
        expect(src).toMatch(/fetch\(`\/api\/products\/\$\{group\.entityId\}\/shortages`\)/);
    });

    it("İLGİLİ SİPARİŞLER bölümü yalnız order_shortage'da render (group.isOrphaned hariç)", () => {
        expect(src).toContain("İLGİLİ SİPARİŞLER");
        expect(src).toMatch(/\{hasOrderShortage && !group\.isOrphaned && \(/);
    });

    it("İLGİLİ SİPARİŞLER: loading + error + empty + list 4 dal", () => {
        expect(src).toMatch(/\{shortageLoading && \(/);
        expect(src).toMatch(/\{shortageError && \(/);
        expect(src).toMatch(/shortageDetails\.length === 0/);
        expect(src).toMatch(/shortageDetails\.length > 0/);
    });

    it("İLGİLİ SİPARİŞLER list: order_number + customer_name + shortage_qty + 'Siparişe git' link", () => {
        expect(src).toMatch(/row\.orderNumber/);
        expect(src).toMatch(/row\.customerName/);
        expect(src).toMatch(/row\.shortageQty/);
        expect(src).toMatch(/href=\{`\/dashboard\/orders\/\$\{row\.orderId\}`\}/);
    });

    it("İLGİLİ SİPARİŞLER list satırlarında aria-label tanımlı (a11y)", () => {
        expect(src).toMatch(/aria-label=\{`\$\{row\.orderNumber\} siparişine git/);
    });

    it("actionLinks render: link.newTab → target='_blank' + rel='noopener' + '↗'", () => {
        expect(src).toMatch(/target=\{link\.newTab \? "_blank" : undefined\}/);
        expect(src).toMatch(/rel=\{link\.newTab \? "noopener" : undefined\}/);
        // "↗" işareti yeni-sekme link'lerinde
        expect(src).toContain("↗");
    });

    it("Güvenlik: shortage fetch sadece order_shortage tipi varsa + ürün silinmemişse", () => {
        // group.isOrphaned guard
        expect(src).toMatch(/if \(!hasOrderShortage \|\| group\.isOrphaned\) return/);
    });
});
