/**
 * RBAC Faz 7b — sayfa geneli finansal maskeleme + birincil CTA gating (source-lock).
 *
 * Her finansal render noktası `maskCurrency(..., canView)` ile redact.ts'in AYNI
 * yetkisine bağlandı; birincil mutasyon CTA'ları permission ile gizlendi. Bu test,
 * bir regresyonun maskeyi/gate'i kaldırmasını (yanıltıcı "₺0,00" geri gelmesini)
 * yakalar. Davranış testleri: use-permissions.test.tsx + aging-quotes-redaction.test.ts.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("Faz 7 — liste/detay finansal maskeleme", () => {
    const cases: { file: string; perm: string }[] = [
        { file: "src/components/dashboard/RecentOrders.tsx", perm: "canViewSalesPrices" },
        { file: "src/app/dashboard/orders/page.tsx", perm: "canViewSalesPrices" },
        { file: "src/app/dashboard/orders/[id]/page.tsx", perm: "canViewSalesPrices" },
        { file: "src/app/dashboard/quotes/page.tsx", perm: "canViewSalesPrices" },
        { file: "src/app/dashboard/products/page.tsx", perm: "canViewSalesPrices" },
        { file: "src/app/dashboard/customers/page.tsx", perm: "canViewFinancialSummary" },
        { file: "src/app/dashboard/products/aging/page.tsx", perm: "canViewPurchaseCosts" },
    ];
    for (const { file, perm } of cases) {
        it(`${file} → maskCurrency + ${perm}`, () => {
            const src = read(file);
            expect(src).toMatch(/maskCurrency\(/);
            expect(src).toContain(perm);
            // usePermissions context'inden okumalı
            expect(src).toMatch(/usePermissions/);
        });
    }

    it("orders/[id] + products/[id] detay maskeleme (maskCurrency)", () => {
        expect(read("src/app/dashboard/orders/[id]/page.tsx")).toMatch(/maskCurrency\(line\.unitPrice/);
        expect(read("src/app/dashboard/products/[id]/page.tsx")).toMatch(/canViewPurchaseCosts && product\.costPrice/);
    });
});

describe("Faz 7 — birincil CTA permission gating", () => {
    const ctas: { file: string; perm: string }[] = [
        { file: "src/app/dashboard/page.tsx", perm: "manage_sales_orders" },
        { file: "src/app/dashboard/orders/page.tsx", perm: "manage_sales_orders" },
        { file: "src/app/dashboard/quotes/page.tsx", perm: "manage_quotes" },
        { file: "src/app/dashboard/customers/page.tsx", perm: "manage_customers" },
        { file: "src/app/dashboard/products/page.tsx", perm: "manage_product_master" },
        { file: "src/app/dashboard/purchase/orders/page.tsx", perm: "manage_purchase_orders" },
        { file: "src/app/dashboard/vendors/page.tsx", perm: "manage_vendors" },
    ];
    for (const { file, perm } of ctas) {
        it(`${file} → has("${perm}") ile gizlenir`, () => {
            expect(read(file)).toContain(`has("${perm}")`);
        });
    }

    it("destructive Sil butonları delete_* perm'e bağlı", () => {
        expect(read("src/app/dashboard/orders/page.tsx")).toContain('has("delete_sales_orders")');
        expect(read("src/app/dashboard/customers/page.tsx")).toContain('has("delete_customers")');
        expect(read("src/app/dashboard/quotes/page.tsx")).toMatch(/canDeleteQuotes = has\("delete_quotes"\)/);
    });
});
