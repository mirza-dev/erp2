/**
 * G11 audit 6. tur Fix 3 — page.tsx'te sort/mostUrgent/AI drawer hesapları
 * pickStock helper'ı üzerinden promisable bazlı çalışır.
 *
 * Kaynak dosyada `p.available_now`, `a.available_now`, `b.available_now` gibi
 * doğrudan stok hesaplarında kullanım kalmamalı (gösterim/label hariç).
 *
 * Display değerleri (örn. p.available_now.toLocaleString) tablo/drawer'da
 * şu anda yok — UI promisable (stock) gösteriyor. Bu test source-regression
 * olarak available_now'un yanlışlıkla yeniden eklenmesine karşı koruma sağlar.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const pageSource = readFileSync(
    resolve(process.cwd(), "src/app/dashboard/purchase/suggested/page.tsx"),
    "utf-8",
);

describe("page.tsx — sort/mostUrgent/drawer pickStock kullanır", () => {
    it("computeRowStock'tan başka satır hesaplarında p.available_now kullanılmaz", () => {
        // İzin verilenler:
        //  - pickStock helper içinde p.available_now (fallback)
        //  - reorderSignature içinde p.available_now (state imzası)
        //  - mockAvailableNow gibi test/log string'leri (kod yok)
        // Match: a.available_now, b.available_now, mostUrgent.available_now,
        //        aiDrawerProduct.available_now (eski kullanımlar)
        const offenders = pageSource.match(/(?:^|[^a-zA-Z_])(a|b|mostUrgent|aiDrawerProduct)\.available_now/g) ?? [];
        expect(offenders).toEqual([]);
    });

    it("sort fallback pickStock kullanır", () => {
        // Sort comparator block: `pickStock(a)` ve `pickStock(b)` çağrıları olmalı
        expect(pageSource).toMatch(/pickStock\(\s*a\s*\)/);
        expect(pageSource).toMatch(/pickStock\(\s*b\s*\)/);
    });

    it("mostUrgent ve mostUrgentDays pickStock kullanır", () => {
        // En azından mostUrgent context'inde pickStock çağrısı
        expect(pageSource).toMatch(/pickStock\(\s*mostUrgent\s*\)/);
    });

    it("aiDrawerCoverageDays pickStock kullanır", () => {
        expect(pageSource).toMatch(/pickStock\(\s*aiDrawerProduct\s*\)/);
    });

    it("Drawer 'Stok Durumu' gridi promisable bazlı drawerStock kullanır", () => {
        // const drawerStock = pickStock(aiDrawerProduct);
        expect(pageSource).toMatch(/drawerStock\s*=\s*pickStock\(aiDrawerProduct\)/);
    });
});
