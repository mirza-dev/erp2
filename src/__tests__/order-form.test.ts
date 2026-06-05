/**
 * OrderForm (paylaşılan new + edit) — synthesizeProductStub davranışı +
 * mode-koşullu submit/buton source-regress + new/edit page wiring.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { synthesizeProductStub } from "@/app/dashboard/orders/OrderForm";

const ORDER_FORM = readFileSync(join(process.cwd(), "src/app/dashboard/orders/OrderForm.tsx"), "utf8");
const NEW_PAGE   = readFileSync(join(process.cwd(), "src/app/dashboard/orders/new/page.tsx"), "utf8");
const EDIT_PAGE  = readFileSync(join(process.cwd(), "src/app/dashboard/orders/[id]/edit/page.tsx"), "utf8");
const DETAIL     = readFileSync(join(process.cwd(), "src/app/dashboard/orders/[id]/page.tsx"), "utf8");

describe("synthesizeProductStub", () => {
    it("satır verisinden pasif Product stub üretir (satır kaybı önlenir)", () => {
        const stub = synthesizeProductStub({
            productId: "p-x", productName: "Eski Vana", productSku: "EV-1",
            unit: "adet", quantity: 3, unitPrice: 250, discountPct: 0,
        });
        expect(stub.id).toBe("p-x");
        expect(stub.name).toBe("Eski Vana");
        expect(stub.sku).toBe("EV-1");
        expect(stub.unit).toBe("adet");
        expect(stub.price).toBe(250);
        expect(stub.isActive).toBe(false);
        // Stok alanları 0 → uyarı tetiklenmez (promisable null değil 0 ama satır korunur)
        expect(stub.on_hand).toBe(0);
        expect(stub.promisable).toBe(0);
    });
});

describe("OrderForm — mode-koşullu davranış", () => {
    it("new mode addOrder (POST) kullanır; edit mode PUT /api/orders/[id]", () => {
        expect(ORDER_FORM).toMatch(/const isEdit = mode === "edit"/);
        expect(ORDER_FORM).toMatch(/method: "PUT"/);
        expect(ORDER_FORM).toMatch(/`\/api\/orders\/\$\{orderId\}`/);
        expect(ORDER_FORM).toMatch(/await addOrder\(/);
    });
    it("edit'te tek 'Değişiklikleri Kaydet' aksiyonu; new'de Taslak/Gönder", () => {
        expect(ORDER_FORM).toMatch(/Değişiklikleri Kaydet/);
        expect(ORDER_FORM).toMatch(/Taslak Kaydet/);
        expect(ORDER_FORM).toMatch(/Siparişi Oluştur ve Gönder/);
    });
    it("pasif satır ürünleri için productOptions + extraProducts stub merge", () => {
        expect(ORDER_FORM).toMatch(/productOptions/);
        expect(ORDER_FORM).toMatch(/setExtraProducts/);
        expect(ORDER_FORM).toMatch(/synthesizeProductStub/);
    });
    it("demo guard her iki kayıt yolunda", () => {
        expect(ORDER_FORM).toMatch(/if \(isDemo\) \{ toast\(\{ type: "info", message: DEMO_BLOCK_TOAST \}\); return; \}/);
    });
    it("geri/vazgeç ve satır komutları Button sistemine bağlıdır", () => {
        expect(ORDER_FORM).toMatch(/Button, \{ ButtonLink \}/);
        expect(ORDER_FORM).toMatch(/<ButtonLink href=\{backHref\}/);
        expect(ORDER_FORM).not.toMatch(/<Link href=\{backHref\}>/);
        expect(ORDER_FORM).toMatch(/leftIcon=\{<Trash2/);
        expect(ORDER_FORM).toMatch(/leftIcon=\{<Plus/);
    });
});

describe("new/edit page wiring", () => {
    it("new sayfası OrderForm mode=new (Suspense)", () => {
        expect(NEW_PAGE).toMatch(/<OrderForm mode="new"\s*\/>/);
        expect(NEW_PAGE).toMatch(/<Suspense>/);
    });
    it("edit sayfası OrderForm mode=edit + taslak guard", () => {
        expect(EDIT_PAGE).toMatch(/mode="edit"/);
        expect(EDIT_PAGE).toMatch(/order\.commercial_status !== "draft"/);
        expect(EDIT_PAGE).toMatch(/Yalnızca taslak siparişler düzenlenebilir/);
    });
    it("detay sayfasında taslakta 'Düzenle' linki (manage_sales_orders gate)", () => {
        expect(DETAIL).toMatch(/has\("manage_sales_orders"\)/);
        expect(DETAIL).toMatch(/\/edit`/);
        expect(DETAIL).toMatch(/Düzenle/);
    });
});
