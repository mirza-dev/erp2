import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { suggestVendorsForProducts, type VendorLinkLite } from "@/lib/rfq-suggest";
import { redactVendorLinksForPerms, redactPriceHistoryForPerms } from "@/lib/auth/redact";
import { permissionsForRoles } from "@/lib/auth/permissions";
import { ALERT_TYPE_LABEL } from "@/lib/alert-labels";
import { ALERT_CLASSES } from "@/lib/alert-calendar";

describe("rfq-suggest — suggestVendorsForProducts", () => {
    const links: VendorLinkLite[] = [
        { product_id: "p1", vendor_id: "v1", last_unit_price: 10, last_price_currency: "TRY" },
        { product_id: "p2", vendor_id: "v1", last_unit_price: null, last_price_currency: null },
        { product_id: "p1", vendor_id: "v2", last_unit_price: 20, last_price_currency: "USD" },
        { product_id: "p3", vendor_id: "v3", last_unit_price: 5, last_price_currency: "TRY" },
    ];

    it("seçili ürünleri tedarik eden tedarikçileri öner + kapsanan ürün sayısı", () => {
        const m = suggestVendorsForProducts(links, ["p1", "p2"]);
        expect(m.get("v1")?.coveredProducts).toBe(2);
        expect(m.get("v2")?.coveredProducts).toBe(1);
        expect(m.has("v3")).toBe(false); // p3 seçili değil
    });
    it("temsilî son fiyatı taşır (ilk non-null)", () => {
        const m = suggestVendorsForProducts(links, ["p1", "p2"]);
        expect(m.get("v1")?.lastUnitPrice).toBe(10);
        expect(m.get("v2")?.lastPriceCurrency).toBe("USD");
    });
    it("ürün seçilmemişse boş (form tüm tedarikçileri gösterir)", () => {
        expect(suggestVendorsForProducts(links, []).size).toBe(0);
    });
});

describe("redaction — vendor links + price history (view_purchase_costs)", () => {
    it("yetki yoksa last_unit_price/unit_price null", () => {
        const links = redactVendorLinksForPerms([{ vendor_id: "v", last_unit_price: 10 }], new Set()) as { last_unit_price: number | null }[];
        expect(links[0].last_unit_price).toBeNull();
        const hist = redactPriceHistoryForPerms([{ id: "h", unit_price: 5 }], new Set()) as { unit_price: number | null }[];
        expect(hist[0].unit_price).toBeNull();
    });
    it("purchasing rolü fiyatları görür", () => {
        const perms = permissionsForRoles(["purchasing"]);
        const links = redactVendorLinksForPerms([{ vendor_id: "v", last_unit_price: 10 }], perms) as { last_unit_price: number | null }[];
        expect(links[0].last_unit_price).toBe(10);
    });
});

describe("rfq_response_due — alert kayıtları", () => {
    it("etiket tanımlı", () => {
        expect(ALERT_TYPE_LABEL.rfq_response_due).toBe("Yanıt Bekleyen Talep");
    });
    it("Vadeler sekmesine dahil", () => {
        const shipment = ALERT_CLASSES.find(c => c.id === "shipment");
        expect(shipment?.types).toContain("rfq_response_due");
    });
});

describe("migration 101 — alerts type CHECK genişletme", () => {
    const SQL = readFileSync(join(process.cwd(), "supabase/migrations/101_rfq_response_due_alert.sql"), "utf8");
    it("rfq_response_due CHECK listesine eklenir", () => {
        expect(SQL).toMatch(/alters?_type_check|alerts_type_check/i);
        expect(SQL).toMatch(/'rfq_response_due'/);
        expect(SQL).toMatch(/'po_overdue'/); // mevcut tipler korunur
    });
});
