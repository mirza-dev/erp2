// @vitest-environment jsdom
/**
 * DataTable boş-durum eylemi (onboarding, 2026-09-16).
 *
 * NEDEN VAR: 14 liste yüzeyinin hepsinde boş-durum METNİ vardı ("Henüz müşteri
 * yok.") ama hiçbirinde EYLEM yoktu. Boş sisteme ilk giren kişi ne yapacağını
 * mesajdan çıkaramıyordu. Eylem TEK yerde (DataTable) yaşar; sayfa başına elle
 * buton yazılmaz — sayfa yalnız "gerçek boş durum + yetki + demo dışı"
 * koşulunu hesaplayıp `emptyAction` geçer.
 *
 * Kaynak kilidi (son describe): altı liste sayfası `emptyAction`ı arama/filtre
 * BOŞKEN ve yetkiyle geçmeli — "arama sonucu yok"a "ilk kaydını ekle" demek
 * yanlış yönlendirmedir.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { readFileSync } from "fs";
import { join } from "path";
import DataTable from "@/components/ui/DataTable";

afterEach(cleanup);

const columns = [{ key: "name", header: "Ad", cell: (r: { name: string }) => r.name }];

describe("DataTable.emptyAction", () => {
    it("rows boşken mesajın altında eylem butonu render eder ve tıklanınca çağırır", () => {
        const onClick = vi.fn();
        render(
            <DataTable
                columns={columns}
                rows={[]}
                rowKey={r => r.name}
                emptyMessage="Henüz müşteri yok."
                emptyAction={{ label: "İlk müşterini ekle", onClick }}
            />,
        );
        expect(screen.getByText("Henüz müşteri yok.")).toBeTruthy();
        const btn = screen.getByRole("button", { name: "İlk müşterini ekle" });
        // Dokunma hedefi ailesi: Button `tap-44` taşır (touch-targets kapısıyla tutarlı).
        expect(btn.className).toContain("tap-44");
        fireEvent.click(btn);
        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it("href verilirse buton değil BAĞLANTI (ButtonLink) olur", () => {
        render(
            <DataTable
                columns={columns}
                rows={[]}
                rowKey={r => r.name}
                emptyMessage="Henüz teklif yok."
                emptyAction={{ label: "İlk teklifini oluştur", href: "/dashboard/quotes/new" }}
            />,
        );
        const link = screen.getByRole("link", { name: "İlk teklifini oluştur" });
        expect(link.getAttribute("href")).toBe("/dashboard/quotes/new");
        expect(screen.queryByRole("button")).toBeNull();
    });

    it("emptyAction verilmezse boş durum eskisi gibi yalnız mesajdır", () => {
        render(<DataTable columns={columns} rows={[]} rowKey={r => r.name} />);
        expect(screen.getByText("Kayıt bulunamadı.")).toBeTruthy();
        expect(screen.queryByRole("button")).toBeNull();
        expect(screen.queryByRole("link")).toBeNull();
    });

    it("satır varken eylem HİÇ render edilmez (yalnız boş duruma özgü)", () => {
        render(
            <DataTable
                columns={columns}
                rows={[{ name: "Acme" }]}
                rowKey={r => r.name}
                emptyAction={{ label: "İlk müşterini ekle", onClick: () => {} }}
            />,
        );
        expect(screen.getByText("Acme")).toBeTruthy();
        expect(screen.queryByRole("button", { name: "İlk müşterini ekle" })).toBeNull();
    });
});

describe("liste sayfaları emptyAction'ı yalnız GERÇEK boş durumda ve yetkiyle geçer (kaynak kilidi)", () => {
    const root = process.cwd();
    const read = (p: string) => readFileSync(join(root, p), "utf8");

    const CASES: Array<{ file: string; perm: string; label: string }> = [
        { file: "src/app/dashboard/customers/CustomersClient.tsx", perm: "manage_customers", label: "İlk müşterini ekle" },
        { file: "src/app/dashboard/vendors/VendorsClient.tsx", perm: "manage_vendors", label: "İlk tedarikçini ekle" },
        { file: "src/app/dashboard/quotes/QuotesClient.tsx", perm: "manage_quotes", label: "İlk teklifini oluştur" },
        { file: "src/app/dashboard/orders/OrdersClient.tsx", perm: "manage_sales_orders", label: "İlk siparişini oluştur" },
        { file: "src/app/dashboard/purchase/orders/PurchaseOrdersClient.tsx", perm: "manage_purchase_orders", label: "İlk satın alma siparişini oluştur" },
    ];

    for (const c of CASES) {
        it(`${c.file.split("/").pop()} — ${c.perm} + arama boş + demo dışı`, () => {
            const src = read(c.file);
            const idx = src.indexOf("emptyAction=");
            expect(idx, "emptyAction geçilmiyor").toBeGreaterThan(-1);
            const expr = src.slice(idx, idx + 400);
            expect(expr).toContain(c.label);
            expect(expr).toContain(`has("${c.perm}")`);
            expect(expr).toContain("!isDemo");
            // Arama boşken: doğrudan `!search` ya da onu içeren `*TrulyEmpty` bayrağı.
            expect(/!search|TrulyEmpty/.test(expr), "arama-boş koşulu yok").toBe(true);
        });
    }

    it("product-types — blocked (demo/yetkisiz) değilken openCreate", () => {
        const src = read("src/app/dashboard/settings/product-types/page.tsx");
        const idx = src.indexOf("emptyAction=");
        expect(idx).toBeGreaterThan(-1);
        const expr = src.slice(idx, idx + 200);
        expect(expr).toContain("!blocked");
        expect(expr).toContain("openCreate");
    });

    it("quotes/orders 'gerçek boş' bayrağı tüm filtreleri kapsar (sekme Tümü dahil)", () => {
        const q = read("src/app/dashboard/quotes/QuotesClient.tsx");
        expect(q).toMatch(/quotesTrulyEmpty = !search && tab === "ALL" && !currency && !dateFrom && !dateTo/);
        const o = read("src/app/dashboard/orders/OrdersClient.tsx");
        expect(o).toMatch(/ordersTrulyEmpty = !search && tab === "ALL" && !customerId && !dateFrom && !dateTo && !currency/);
    });
});
