/**
 * Faz 9 — PurchaseOrderDocument: print component davranışı
 *
 * Test paterni proje genelinde olduğu gibi:
 *  - Module load smoke
 *  - Pure helper davranış matrisi (formatPoCurrency, formatPoDate)
 *  - Source-regex: A4 print CSS + status labels + conditional render lock
 *
 * JSX render edilmez (vitest node env).
 */
import { describe, it, expect, beforeAll, vi } from "vitest";

describe("Faz 9 — PurchaseOrderDocument: module load", () => {
    it("component default export = function", async () => {
        const mod = await import("@/components/purchase/PurchaseOrderDocument");
        expect(typeof mod.default).toBe("function");
    });

    it("formatPoCurrency ve formatPoDate helper'dan export edilir", async () => {
        const mod = await import("@/lib/po-document-helpers");
        expect(typeof mod.formatPoCurrency).toBe("function");
        expect(typeof mod.formatPoDate).toBe("function");
    });
});

describe("Faz 9 — formatPoCurrency (Intl.NumberFormat tr-TR)", () => {
    it("TRY → ₺ sembolü ile formatlanır", async () => {
        const { formatPoCurrency } = await import("@/lib/po-document-helpers");
        const result = formatPoCurrency(1234.5, "TRY");
        expect(result).toContain("1.234,50");
        expect(result).toMatch(/₺|TRY/);
    });

    it("USD → $ veya USD sembolü", async () => {
        const { formatPoCurrency } = await import("@/lib/po-document-helpers");
        const result = formatPoCurrency(1000, "USD");
        expect(result).toContain("1.000,00");
        expect(result).toMatch(/\$|USD/);
    });

    it("EUR → € veya EUR sembolü", async () => {
        const { formatPoCurrency } = await import("@/lib/po-document-helpers");
        const result = formatPoCurrency(500.25, "EUR");
        expect(result).toContain("500,25");
        expect(result).toMatch(/€|EUR/);
    });

    it("Bilinmeyen currency → fallback (crash etmez)", async () => {
        const { formatPoCurrency } = await import("@/lib/po-document-helpers");
        // Intl bilinmeyen currency'de RangeError throw eder → catch fallback
        expect(() => formatPoCurrency(100, "XXX")).not.toThrow();
    });
});

describe("Faz 9 — formatPoDate (ISO → DD.MM.YYYY)", () => {
    it("'2026-05-18' → '18.05.2026'", async () => {
        const { formatPoDate } = await import("@/lib/po-document-helpers");
        expect(formatPoDate("2026-05-18")).toBe("18.05.2026");
    });

    it("null → '—'", async () => {
        const { formatPoDate } = await import("@/lib/po-document-helpers");
        expect(formatPoDate(null)).toBe("—");
    });

    it("ISO timestamp string (slice 0,10) → DD.MM.YYYY", async () => {
        const { formatPoDate } = await import("@/lib/po-document-helpers");
        expect(formatPoDate("2026-05-18T10:30:00.000Z")).toBe("18.05.2026");
    });
});

describe("Faz 9 — Document source-regex: print CSS + key sections", () => {
    let src = "";

    beforeAll(async () => {
        const fs = await import("fs/promises");
        const path = await import("path");
        src = await fs.readFile(
            path.resolve(process.cwd(), "src/components/purchase/PurchaseOrderDocument.tsx"),
            "utf-8",
        );
    });

    it("@page A4 portrait rule mevcut", () => {
        expect(src).toMatch(/@page\s*\{\s*size:\s*A4\s+portrait/);
    });

    it("@media print kuralı ve po-no-print class'ı tanımlı", () => {
        expect(src).toMatch(/@media print/);
        expect(src).toContain(".po-no-print");
        expect(src).toContain("display: none !important");
    });

    it("Tüm 6 PurchaseOrderStatus TR label'ı tanımlı", () => {
        expect(src).toContain("draft:");
        expect(src).toContain("\"Taslak\"");
        expect(src).toContain("\"Gönderildi\"");
        expect(src).toContain("\"Onaylandı\"");
        expect(src).toContain("\"Kısmen Kabul Edildi\"");
        expect(src).toContain("\"Tamamlandı\"");
        expect(src).toContain("\"İPTAL EDİLDİ\"");
    });

    it("İPTAL EDİLDİ badge sadece isCancelled koşulunda render edilir", () => {
        expect(src).toMatch(/\{isCancelled && \(/);
        expect(src).toContain("İPTAL EDİLDİ");
    });

    it("Logo fallback: logo_url yok → 'LOGO' placeholder div", () => {
        expect(src).toMatch(/company\?\.logo_url \?/);
        expect(src).toMatch(/>LOGO</);
    });

    it("next/image yerine bilinçli <img> kullanımı + eslint-disable yorumu", () => {
        expect(src).toContain("eslint-disable-next-line @next/next/no-img-element");
        expect(src).toMatch(/<img\s+src=\{company\.logo_url\}/);
    });

    it("Notes section sadece po.notes varsa render edilir", () => {
        expect(src).toMatch(/\{po\.notes && \(/);
    });

    it("Cancel reason sadece isCancelled && cancel_reason ile render edilir", () => {
        expect(src).toMatch(/\{isCancelled && po\.cancel_reason && \(/);
    });

    it("Güvenlik: created_by ve audit_log DOM'a yazılmaz", () => {
        // Plan §12 satır 1321 — vendor email belge için gerekli ancak iç alanlar render edilmez
        expect(src).not.toContain("po.created_by");
        expect(src).not.toContain("auditEntries");
        expect(src).not.toContain("received_qty"); // iç muhasebe — tedarikçi belgesinde yok
    });

    it("Totals: Ara Toplam + KDV + Genel Toplam üç satır", () => {
        expect(src).toContain("Ara Toplam");
        expect(src).toContain("KDV");
        expect(src).toContain("Genel Toplam");
        expect(src).toContain("po.subtotal");
        expect(src).toContain("po.vat_total");
        expect(src).toContain("po.grand_total");
    });

    it("Toolbar: 'Yazdır / PDF Olarak Kaydet' button + window.print()", () => {
        expect(src).toContain("Yazdır / PDF Olarak Kaydet");
        expect(src).toContain("window.print()");
    });
});

// ── Real render smoke via renderToStaticMarkup ──────────────────────────────
// Vitest is configured with `environment: "node"`; no jsdom is available.
// React's server-side renderer (`react-dom/server`) works in pure Node, so we
// exercise the actual component output without DOM APIs. This catches:
//   - conditional render bugs (cancelled badge, notes section, logo fallback)
//   - leak regressions (sensitive product fields must not appear in HTML)
//   - JSX/render-time errors that source-regex tests would miss.

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type {
    PurchaseOrderRow,
    PurchaseOrderLineRow,
    VendorRow,
    CompanySettingsRow,
    PurchaseOrderStatus,
} from "@/lib/database.types";
import type { ProductRef } from "@/lib/supabase/products";

// Stub `next/link` for renderToStaticMarkup — render as a plain <a>.
vi.mock("next/link", () => ({
    default: ({ href, children, ...rest }: { href: string; children: React.ReactNode } & Record<string, unknown>) =>
        React.createElement("a", { href, ...rest }, children),
}));

function makePoFixture(overrides: {
    status?: PurchaseOrderStatus;
    notes?: string | null;
    cancel_reason?: string | null;
    lines?: Partial<PurchaseOrderLineRow>[];
} = {}): PurchaseOrderRow & { lines: PurchaseOrderLineRow[] } {
    const baseLines: PurchaseOrderLineRow[] = (overrides.lines ?? [
        { quantity: 100, unit_price: 50, discount_pct: 5, line_total: 4750, notes: null, product_id: "p-1" },
        { quantity: 25, unit_price: 200, discount_pct: 0, line_total: 5000, notes: "Acil teslim", product_id: "p-2" },
    ]).map((l, i) => ({
        id: `l-${i + 1}`,
        po_id: "po-1",
        product_id: l.product_id ?? `p-${i + 1}`,
        quantity: l.quantity ?? 1,
        unit_price: l.unit_price ?? 0,
        discount_pct: l.discount_pct ?? 0,
        line_total: l.line_total ?? 0,
        received_qty: 0,
        notes: l.notes ?? null,
    }));
    return {
        id: "po-1",
        po_number: "PO-2026-0123",
        vendor_id: "v-1",
        status: overrides.status ?? "confirmed",
        order_date: "2026-05-18",
        expected_date: "2026-05-25",
        currency: "TRY",
        subtotal: 9750,
        vat_rate: 20,
        vat_total: 1950,
        grand_total: 11700,
        notes: overrides.notes !== undefined ? overrides.notes : "Test notu",
        sent_at: null,
        confirmed_at: "2026-05-18T10:00:00Z",
        cancelled_at: null,
        cancel_reason: overrides.cancel_reason ?? null,
        created_by: "secret-user-uuid-leakage-test",
        created_at: "2026-05-18T09:00:00Z",
        updated_at: "2026-05-18T10:00:00Z",
        lines: baseLines,
    };
}

function makeVendorFixture(): VendorRow {
    return {
        id: "v-1",
        name: "ACME Vana Tedarik A.Ş.",
        contact_email: "satis@acme.example",
        contact_phone: "+90 212 555 1234",
        contact_person: "Ayşe Yılmaz",
        tax_number: "1234567890",
        address: "Atatürk Cad. No:42, İstanbul",
        currency: "TRY",
        payment_terms_days: 30,
        lead_time_days: 14,
        notes: "VENDOR_INTERNAL_NOTES_SHOULD_NOT_LEAK",
        is_active: true,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
    };
}

function makeCompanyFixture(overrides: { logo_url?: string | null } = {}): CompanySettingsRow {
    return {
        id: "c-1",
        name: "Test Şirket A.Ş.",
        tax_office: "Mecidiyeköy",
        tax_no: "9876543210",
        address: "Test Mah. Test Cad. No:1",
        phone: "+90 212 999 0000",
        email: "info@test.example",
        website: "https://test.example",
        logo_url: overrides.logo_url !== undefined ? overrides.logo_url : "https://cdn.example/logo.png",
        currency: "TRY",
        quote_number_prefix: "TKL",
        quote_number_separator: "-",
        updated_at: "2026-01-01T00:00:00Z",
    };
}

function makeProductRefs(): ProductRef[] {
    return [
        { id: "p-1", sku: "GV-DN50", name: "Gate Valve DN50", unit: "adet" },
        { id: "p-2", sku: "BV-DN80", name: "Ball Valve DN80", unit: "adet" },
    ];
}

async function renderDoc(props: {
    po?: ReturnType<typeof makePoFixture>;
    vendor?: VendorRow | null;
    company?: CompanySettingsRow | null;
    products?: ProductRef[];
} = {}): Promise<string> {
    const { default: PurchaseOrderDocument } = await import("@/components/purchase/PurchaseOrderDocument");
    return renderToStaticMarkup(
        React.createElement(PurchaseOrderDocument, {
            po: props.po ?? makePoFixture(),
            vendor: props.vendor !== undefined ? props.vendor : makeVendorFixture(),
            company: props.company !== undefined ? props.company : makeCompanyFixture(),
            products: props.products ?? makeProductRefs(),
        }),
    );
}

describe("Faz 9 — Real render: PO numarası, vendor, satırlar, totaller HTML çıktıda", () => {
    it("PO numarası ve vendor adı render edilir", async () => {
        const html = await renderDoc();
        expect(html).toContain("PO-2026-0123");
        expect(html).toContain("ACME Vana Tedarik A.Ş.");
    });

    it("Vendor iletişim/VKN/ödeme vadesi render edilir", async () => {
        const html = await renderDoc();
        expect(html).toContain("Ayşe Yılmaz");
        expect(html).toContain("satis@acme.example");
        expect(html).toContain("1234567890");
        expect(html).toContain("30 gün");
    });

    it("Şirket header bilgisi render edilir (logo + V.D. + VKN)", async () => {
        const html = await renderDoc();
        expect(html).toContain("Test Şirket A.Ş.");
        expect(html).toContain("Mecidiyeköy V.D.");
        expect(html).toContain("9876543210");
        expect(html).toContain("https://cdn.example/logo.png");
    });

    it("Lines table: SKU + product name + qty + line_total formatlı", async () => {
        const html = await renderDoc();
        expect(html).toContain("GV-DN50");
        expect(html).toContain("Gate Valve DN50");
        expect(html).toContain("BV-DN80");
        expect(html).toContain("Ball Valve DN80");
        // qty + unit
        expect(html).toContain("100");
        expect(html).toContain("adet");
        // line note inline
        expect(html).toContain("Acil teslim");
    });

    it("Totals: ara toplam + KDV + Genel Toplam render", async () => {
        const html = await renderDoc();
        expect(html).toContain("Ara Toplam");
        expect(html).toContain("KDV");
        expect(html).toContain("Genel Toplam");
        // 9.750,00 TRY veya 9750
        expect(html).toMatch(/9\.750/);
        expect(html).toMatch(/11\.700/);
    });
});

describe("Faz 9 — Real render: conditional branches", () => {
    it("Status confirmed (default) → İPTAL EDİLDİ badge YOK", async () => {
        const html = await renderDoc();
        expect(html).not.toContain("İPTAL EDİLDİ");
    });

    it("Status cancelled → İPTAL EDİLDİ badge VAR", async () => {
        const po = makePoFixture({ status: "cancelled" });
        const html = await renderDoc({ po });
        expect(html).toContain("İPTAL EDİLDİ");
    });

    it("Cancelled + cancel_reason → 'İptal Sebebi' bloğu render edilir", async () => {
        const po = makePoFixture({ status: "cancelled", cancel_reason: "Vendor stoğu kalmadı" });
        const html = await renderDoc({ po });
        expect(html).toContain("İptal Sebebi");
        expect(html).toContain("Vendor stoğu kalmadı");
    });

    it("Cancelled fakat cancel_reason yok → 'İptal Sebebi' bloğu YOK", async () => {
        const po = makePoFixture({ status: "cancelled", cancel_reason: null });
        const html = await renderDoc({ po });
        expect(html).toContain("İPTAL EDİLDİ");
        expect(html).not.toContain("İptal Sebebi");
    });

    it("notes dolu → 'NOTLAR' bölüm + içerik HTML'de", async () => {
        const html = await renderDoc();
        expect(html).toContain("Notlar");
        expect(html).toContain("Test notu");
    });

    it("notes null → 'NOTLAR' bölümü render edilmez", async () => {
        const po = makePoFixture({ notes: null });
        const html = await renderDoc({ po });
        // Etiket bloğu yoksa "Notlar" sadece diğer "İptal/Logo/..." gibi alanlarda olmamalı
        // Düzenli sınır: NOTLAR başlığını uppercase 'NOTLAR' aramayalım — kapsayıcı div etiketi 'Notlar'
        // ama belge başlığında bu kelime başka yerde geçmiyor → güvenli regex.
        expect(html).not.toContain("Notlar");
    });

    it("company.logo_url dolu → <img> tag VAR, 'LOGO' placeholder YOK", async () => {
        const html = await renderDoc();
        expect(html).toMatch(/<img\s+[^>]*src="https:\/\/cdn\.example\/logo\.png"/);
        expect(html).not.toMatch(/>LOGO</);
    });

    it("company.logo_url null → 'LOGO' placeholder VAR, <img> YOK", async () => {
        const company = makeCompanyFixture({ logo_url: null });
        const html = await renderDoc({ company });
        expect(html).toContain(">LOGO<");
        expect(html).not.toContain('src="https://cdn.example/logo.png"');
    });

    it("company null → crash etmez, '—' placeholder render", async () => {
        const html = await renderDoc({ company: null });
        expect(html).toContain("—");
    });

    it("vendor null → vendor bölümünde '—' placeholder render", async () => {
        const html = await renderDoc({ vendor: null });
        expect(html).toContain("Tedarikçi");
        expect(html).toContain("—");
    });
});

describe("Faz 9 — Real render: toolbar print-gizleme + window.print()", () => {
    it("Toolbar 'po-no-print' class'ı render edilir → @media print'te gizlenir", async () => {
        const html = await renderDoc();
        // Toolbar wrapper bu class'ı taşır
        expect(html).toMatch(/class="po-no-print"/);
    });

    it("'Yazdır / PDF Olarak Kaydet' button HTML'de", async () => {
        const html = await renderDoc();
        expect(html).toContain("Yazdır / PDF Olarak Kaydet");
    });

    it("'Siparişe Dön' navigation linki HTML'de + href doğru", async () => {
        const html = await renderDoc();
        expect(html).toContain("Siparişe Dön");
        expect(html).toMatch(/href="\/dashboard\/purchase\/orders\/po-1"/);
    });
});

describe("Faz 9 — Real render: hassas alan leak yok (defense-in-depth)", () => {
    // F9-P2 — sadece id/sku/name/unit alanları client'a geçer.
    // Component prop tipinde sensitive alanlar yok; ama PO/vendor/company'de var.
    // Render edilen HTML'de bu alanların değerlerinin substring olarak görünmemesi
    // sızıntı olmadığını canlı doğrular.

    it("po.created_by HTML'de YOK (kullanıcı UUID iç bilgi)", async () => {
        const html = await renderDoc();
        expect(html).not.toContain("secret-user-uuid-leakage-test");
    });

    it("vendor.notes HTML'de YOK (iç notlar)", async () => {
        const html = await renderDoc();
        expect(html).not.toContain("VENDOR_INTERNAL_NOTES_SHOULD_NOT_LEAK");
    });

    it("lines[].received_qty HTML'de YOK (iç muhasebe)", async () => {
        const html = await renderDoc();
        expect(html).not.toContain("received_qty");
    });

    it("Hassas product alan substring'leri HTML'de YOK (P2 — view model dar)", async () => {
        const html = await renderDoc();
        // ProductRef yalnızca id/sku/name/unit içerir; component bunları kullanır
        // → cost_price, parasut_*, on_hand, reserved, product_notes, daily_usage gibi
        //   key'ler renderToStaticMarkup çıktısında hiçbir biçimde olmamalı.
        expect(html).not.toContain("cost_price");
        expect(html).not.toContain("parasut_product_id");
        expect(html).not.toContain("on_hand");
        expect(html).not.toContain("reserved");
        expect(html).not.toContain("product_notes");
        expect(html).not.toContain("daily_usage");
    });
});
