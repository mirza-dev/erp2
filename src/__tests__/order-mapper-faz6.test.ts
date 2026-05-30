/**
 * Faz 6 (V7-A9) — sales_orders 4 yeni alanın TS + mapper kilidi.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { mapOrderDetail } from "@/lib/api-mappers";
import type { SalesOrderWithLines } from "@/lib/database.types";

function makeRow(overrides: Partial<SalesOrderWithLines> = {}): SalesOrderWithLines {
    return {
        id: "ord-1", order_number: "SIP-2026-001", customer_id: "c1",
        customer_name: "Acme", customer_email: null, customer_country: null,
        customer_tax_office: null, customer_tax_number: null,
        commercial_status: "draft", fulfillment_status: "unallocated",
        currency: "USD", subtotal: 1000, vat_total: 200, grand_total: 1100,
        notes: null, item_count: 1,
        parasut_invoice_id: null, parasut_sent_at: null, parasut_error: null,
        created_at: "2026-05-30T00:00:00Z", updated_at: "2026-05-30T00:00:00Z",
        created_by: null, ai_confidence: null, ai_reason: null,
        ai_model_version: null, ai_risk_level: null,
        incoterm: null, planned_shipment_date: null, quote_id: "q1",
        original_order_number: null, quote_valid_until: null,
        discount_amount: 100, vat_rate: 20,
        source_quote_revision_no: 2, quote_pdf_archive_id: "arch-1",
        shipped_at: null, shipment_tracking_number: null, shipment_carrier: null,
        parasut_invoice_series: null, parasut_invoice_number_int: null,
        parasut_invoice_no: null, parasut_invoice_error: null,
        parasut_invoice_synced_at: null, parasut_invoice_create_attempted_at: null,
        parasut_invoice_type: null, parasut_shipment_document_id: null,
        parasut_shipment_synced_at: null, parasut_shipment_error: null,
        parasut_shipment_create_attempted_at: null, parasut_trackable_job_id: null,
        parasut_e_document_id: null, parasut_e_document_status: null,
        parasut_e_document_error: null,
        lines: [],
        ...overrides,
    } as SalesOrderWithLines;
}

describe("mapOrderDetail — Faz 6 alanları (V7-A9)", () => {
    it("4 yeni alan map edilir", () => {
        const d = mapOrderDetail(makeRow());
        expect(d.discountAmount).toBe(100);
        expect(d.vatRate).toBe(20);
        expect(d.sourceQuoteRevisionNo).toBe(2);
        expect(d.quotePdfArchiveId).toBe("arch-1");
    });

    it("null source_quote_revision_no/archive → undefined", () => {
        const d = mapOrderDetail(makeRow({ source_quote_revision_no: null, quote_pdf_archive_id: null }));
        expect(d.sourceQuoteRevisionNo).toBeUndefined();
        expect(d.quotePdfArchiveId).toBeUndefined();
    });

    it("discount_amount/vat_rate Number'a normalize", () => {
        const d = mapOrderDetail(makeRow({ discount_amount: 0, vat_rate: 18 }));
        expect(d.discountAmount).toBe(0);
        expect(d.vatRate).toBe(18);
    });
});

describe("SalesOrderRow / OrderDetail TS kilidi", () => {
    it("database.types SalesOrderRow 4 alan içerir", () => {
        const src = readFileSync(join(process.cwd(), "src/lib/database.types.ts"), "utf8");
        expect(src).toMatch(/discount_amount: number/);
        expect(src).toMatch(/source_quote_revision_no: number \| null/);
        expect(src).toMatch(/quote_pdf_archive_id: string \| null/);
    });
});

describe("Sipariş detay finansal özet — Bulgu #2 (iskonto + dinamik KDV)", () => {
    const PAGE = readFileSync(join(process.cwd(), "src/app/dashboard/orders/[id]/page.tsx"), "utf8");
    it("hardcoded 'KDV (%20)' kaldırıldı → dinamik vatRate", () => {
        expect(PAGE).not.toMatch(/KDV \(%20\)/);
        expect(PAGE).toMatch(/KDV \(%\$\{vatRate\}\)/);
        expect(PAGE).toMatch(/order\.vatRate \?\? 20/);
    });
    it("İskonto satırı koşullu (discountAmount > 0) + KDV Matrahı", () => {
        expect(PAGE).toMatch(/order\.discountAmount \?\? 0/);
        expect(PAGE).toMatch(/İskonto/);
        expect(PAGE).toMatch(/KDV Matrahı/);
        expect(PAGE).toMatch(/order\.subtotal - discount/);
    });
});

describe("Sipariş detay arşiv PDF linki — Bulgu #3", () => {
    const PAGE = readFileSync(join(process.cwd(), "src/app/dashboard/orders/[id]/page.tsx"), "utf8");
    it("quotePdfArchiveId varsa arşiv belgesi linki + handleViewArchive", () => {
        expect(PAGE).toMatch(/order\.quoteId && order\.quotePdfArchiveId/);
        expect(PAGE).toMatch(/const handleViewArchive = useCallback/);
        expect(PAGE).toMatch(/fetch\(`\/api\/quotes\/\$\{quoteId\}\/archive`\)/);
        expect(PAGE).toMatch(/Arşivlenmiş Teklif/);
    });
});
