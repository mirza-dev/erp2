/**
 * /dashboard/orders + /dashboard/purchase/orders — sayfa h1 + browser title.
 *
 * 2026-05-27 — Sidebar isim ayrımıyla birlikte sayfa içi h1 ve document.title
 * de hizalandı. Tarayıcı tab başlığı kullanıcının hangi sayfada olduğunu net
 * gösterir; h1 sayfa içinde Sidebar etiketiyle aynı.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SALES_ORDERS = readFileSync(
    join(process.cwd(), "src/app/dashboard/orders/page.tsx"),
    "utf8",
);
const PURCHASE_ORDERS = readFileSync(
    join(process.cwd(), "src/app/dashboard/purchase/orders/page.tsx"),
    "utf8",
);

describe("/dashboard/orders — Satış Siparişleri h1 + title", () => {
    it('h1 metin: "Satış Siparişleri"', () => {
        expect(SALES_ORDERS).toMatch(/<h1[^>]*>\s*Satış Siparişleri\s*<\/h1>/);
    });

    it("document.title 'Satış Siparişleri · KokpitERP' set ediliyor", () => {
        expect(SALES_ORDERS).toMatch(/document\.title\s*=\s*"Satış Siparişleri · KokpitERP"/);
    });

    it('Eski generic "Siparişler" div başlığı YOK (h1\'a yükseltildi)', () => {
        // Eski: <div ...>Siparişler</div>; yenisi h1.
        expect(SALES_ORDERS).not.toMatch(/<div[^>]*>\s*Siparişler\s*<\/div>/);
    });
});

describe("/dashboard/purchase/orders — Satın Alma Siparişleri h1 + title", () => {
    it('h1 metin: "Satın Alma Siparişleri" (zaten vardı)', () => {
        expect(PURCHASE_ORDERS).toMatch(/<h1[^>]*>\s*Satın Alma Siparişleri\s*<\/h1>/);
    });

    it("document.title 'Satın Alma Siparişleri · KokpitERP' set ediliyor", () => {
        expect(PURCHASE_ORDERS).toMatch(/document\.title\s*=\s*"Satın Alma Siparişleri · KokpitERP"/);
    });
});
