/**
 * MockParasutAdapter — kapsamlı birim testleri
 *
 * Kapsar:
 *   - OAuth metodları
 *   - Contact CRUD + idempotency
 *   - Product CRUD + idempotency
 *   - Sales invoice oluşturma + stok invariant assertions
 *   - Shipment document + inflow=false + procurement_number zorunluluğu
 *   - E-belge tip ayrımı (e_invoice vs e_archive) + getSalesInvoiceWithActiveEDocument
 *   - TrackableJob state machine (running → done → e-doc oluşumu)
 *   - Configurable error injection (setErrorMode)
 *   - reset() sonrası temiz slate
 */
import { describe, it, expect, beforeEach } from "vitest";
import { MockParasutAdapter } from "@/lib/parasut";
import { ParasutError } from "@/lib/parasut-adapter";

// Her test kendi adapter örneğine sahip — singleton kirlenmesi yok
function makeAdapter() {
    const adapter = new MockParasutAdapter();
    adapter.setErrorMode(false); // rastgele %10 hata yok; deterministik
    return adapter;
}

// ── OAuth ────────────────────────────────────────────────────────────────────

describe("OAuth", () => {
    it("exchangeAuthCode returns token set", async () => {
        const adapter = makeAdapter();
        const tokens = await adapter.exchangeAuthCode("code123", "https://example.com/cb");
        expect(tokens.access_token).toBeTruthy();
        expect(tokens.refresh_token).toBeTruthy();
        expect(new Date(tokens.expires_at).getTime()).toBeGreaterThan(Date.now());
    });

    it("refreshToken returns new token set", async () => {
        const adapter = makeAdapter();
        const tokens = await adapter.refreshToken("old_refresh");
        expect(tokens.access_token).toBeTruthy();
        expect(tokens.refresh_token).toBeTruthy();
    });

    it("exchangeAuthCode and refreshToken return distinct tokens", async () => {
        const adapter = makeAdapter();
        const t1 = await adapter.exchangeAuthCode("code", "https://example.com/cb");
        const t2 = await adapter.refreshToken("old");
        expect(t1.access_token).not.toBe(t2.access_token);
        expect(t1.refresh_token).not.toBe(t2.refresh_token);
    });
});

// ── Contact ───────────────────────────────────────────────────────────────────

describe("Contact", () => {
    it("findContactsByTaxNumber returns empty list initially", async () => {
        const adapter = makeAdapter();
        const result = await adapter.findContactsByTaxNumber("1234567890");
        expect(result).toEqual([]);
    });

    it("createContact returns contact with given fields", async () => {
        const adapter = makeAdapter();
        const contact = await adapter.createContact({
            name: "PMT Endüstriyel",
            tax_number: "1234567890",
            email: "info@pmt.com",
        });
        expect(contact.id).toBeTruthy();
        expect(contact.attributes.name).toBe("PMT Endüstriyel");
        expect(contact.attributes.tax_number).toBe("1234567890");
        expect(contact.attributes.email).toBe("info@pmt.com");
    });

    it("findContactsByTaxNumber finds created contact", async () => {
        const adapter = makeAdapter();
        await adapter.createContact({ name: "A", tax_number: "111" });
        await adapter.createContact({ name: "B", tax_number: "222" });
        const found = await adapter.findContactsByTaxNumber("111");
        expect(found).toHaveLength(1);
        expect(found[0].attributes.name).toBe("A");
    });

    it("findContactsByEmail finds by email", async () => {
        const adapter = makeAdapter();
        await adapter.createContact({ name: "X", tax_number: "999", email: "x@test.com" });
        const found = await adapter.findContactsByEmail("x@test.com");
        expect(found).toHaveLength(1);
        expect(found[0].attributes.tax_number).toBe("999");
    });

    it("findContactsByEmail returns empty for unknown email", async () => {
        const adapter = makeAdapter();
        const found = await adapter.findContactsByEmail("nobody@test.com");
        expect(found).toEqual([]);
    });

    it("idempotency: two creates with same tax_number → two entries (adapter doesn't deduplicate — caller responsibility)", async () => {
        const adapter = makeAdapter();
        await adapter.createContact({ name: "A", tax_number: "111" });
        await adapter.createContact({ name: "B", tax_number: "111" });
        const found = await adapter.findContactsByTaxNumber("111");
        expect(found).toHaveLength(2);
    });
});

// ── Product ───────────────────────────────────────────────────────────────────

describe("Product", () => {
    it("findProductsByCode returns empty initially", async () => {
        const adapter = makeAdapter();
        expect(await adapter.findProductsByCode("SKU-001")).toEqual([]);
    });

    it("createProduct returns product", async () => {
        const adapter = makeAdapter();
        const product = await adapter.createProduct({
            code: "SKU-001",
            name: "Vana DN25",
            sales_price: 150,
        });
        expect(product.id).toBeTruthy();
        expect(product.attributes.code).toBe("SKU-001");
        expect(product.attributes.name).toBe("Vana DN25");
        expect(product.attributes.sales_price).toBe(150);
    });

    it("findProductsByCode finds created product", async () => {
        const adapter = makeAdapter();
        await adapter.createProduct({ code: "SKU-001", name: "A" });
        await adapter.createProduct({ code: "SKU-002", name: "B" });
        const found = await adapter.findProductsByCode("SKU-001");
        expect(found).toHaveLength(1);
        expect(found[0].attributes.name).toBe("A");
    });
});

// ── Sales invoice — stok invariant ────────────────────────────────────────────

describe("SalesInvoice — stok invariant", () => {
    function validInvoiceInput() {
        return {
            contact_id:        "contact-1",
            invoice_series:    "KE",
            invoice_id:        20260042,
            issue_date:        "2026-04-25",
            due_date:          "2026-05-25",
            currency:          "TRL" as const,
            shipment_included: false as const,
            description:       "KokpitERP #ORD-2026-0042",
            details: [{
                quantity:    10,
                unit_price:  100,
                vat_rate:    20,
                description: "DN25 Vana",
            }],
        };
    }

    it("creates invoice with correct attributes", async () => {
        const adapter = makeAdapter();
        const inv = await adapter.createSalesInvoice(validInvoiceInput());
        expect(inv.id).toBeTruthy();
        expect(inv.attributes.invoice_series).toBe("KE");
        expect(inv.attributes.invoice_id).toBe(20260042);
        expect(inv.attributes.currency).toBe("TRL");
    });

    it("throws validation error when shipment_included is not false", async () => {
        const adapter = makeAdapter();
        const input = { ...validInvoiceInput(), shipment_included: true as unknown as false };
        await expect(adapter.createSalesInvoice(input)).rejects.toThrow(ParasutError);
        await expect(adapter.createSalesInvoice(input)).rejects.toMatchObject({ kind: "validation" });
    });

    it("throws validation error when a detail contains warehouse", async () => {
        const adapter = makeAdapter();
        const input = validInvoiceInput();
        (input.details[0] as Record<string, unknown>)["warehouse"] = "wh-001";
        await expect(adapter.createSalesInvoice(input)).rejects.toThrow(ParasutError);
        await expect(adapter.createSalesInvoice(input)).rejects.toMatchObject({ kind: "validation" });
    });

    it("findSalesInvoicesByNumber finds by series + number", async () => {
        const adapter = makeAdapter();
        await adapter.createSalesInvoice(validInvoiceInput());
        const found = await adapter.findSalesInvoicesByNumber("KE", 20260042);
        expect(found).toHaveLength(1);
    });

    it("findSalesInvoicesByNumber returns empty for unknown number", async () => {
        const adapter = makeAdapter();
        const found = await adapter.findSalesInvoicesByNumber("KE", 99999);
        expect(found).toEqual([]);
    });

    it("getSalesInvoiceWithActiveEDocument returns null e-doc before job completes", async () => {
        const adapter = makeAdapter();
        const inv = await adapter.createSalesInvoice(validInvoiceInput());
        const result = await adapter.getSalesInvoiceWithActiveEDocument(inv.id);
        expect(result.active_e_document).toBeNull();
    });

    it("throws not_found for unknown invoice id", async () => {
        const adapter = makeAdapter();
        await expect(adapter.getSalesInvoiceWithActiveEDocument("unknown")).rejects.toMatchObject({
            kind: "not_found",
        });
    });
});

// ── Shipment document ────────────────────────────────────────────────────────

describe("ShipmentDocument", () => {
    function validShipmentInput() {
        return {
            contact_id:         "contact-1",
            issue_date:         "2026-04-25",
            shipment_date:      "2026-04-24",
            inflow:             false as const,
            procurement_number: "ORD-2026-0042",
            description:        "KokpitERP #ORD-2026-0042",
            details: [{
                quantity:    10,
                product_id:  "product-uuid-1",
                description: "DN25 Vana",
            }],
        };
    }

    it("creates shipment document", async () => {
        const adapter = makeAdapter();
        const ship = await adapter.createShipmentDocument(validShipmentInput());
        expect(ship.id).toBeTruthy();
        expect(ship.attributes.inflow).toBe(false);
        expect(ship.attributes.procurement_number).toBe("ORD-2026-0042");
    });

    it("throws when inflow is not false", async () => {
        const adapter = makeAdapter();
        const input = { ...validShipmentInput(), inflow: true as unknown as false };
        await expect(adapter.createShipmentDocument(input)).rejects.toMatchObject({ kind: "validation" });
    });

    it("throws when procurement_number is empty", async () => {
        const adapter = makeAdapter();
        const input = { ...validShipmentInput(), procurement_number: "" };
        await expect(adapter.createShipmentDocument(input)).rejects.toMatchObject({ kind: "validation" });
    });

    it("listRecentShipmentDocuments paginates", async () => {
        const adapter = makeAdapter();
        for (let i = 0; i < 5; i++) {
            await adapter.createShipmentDocument({ ...validShipmentInput(), procurement_number: `ORD-${i}` });
        }
        const page1 = await adapter.listRecentShipmentDocuments(1, 3);
        const page2 = await adapter.listRecentShipmentDocuments(2, 3);
        expect(page1).toHaveLength(3);
        expect(page2).toHaveLength(2);
    });

    it("listRecentShipmentDocuments local filter finds by procurement_number", async () => {
        const adapter = makeAdapter();
        await adapter.createShipmentDocument({ ...validShipmentInput(), procurement_number: "ORD-AAA" });
        await adapter.createShipmentDocument({ ...validShipmentInput(), procurement_number: "ORD-BBB" });
        const all = await adapter.listRecentShipmentDocuments(1, 50);
        const found = all.find(s => s.attributes.procurement_number === "ORD-AAA");
        expect(found).toBeDefined();
    });
});

// ── E-belge tip ayrımı ────────────────────────────────────────────────────────

describe("E-document type tracking", () => {
    async function makeInvoice(adapter: MockParasutAdapter) {
        return adapter.createSalesInvoice({
            contact_id:        "c1",
            invoice_series:    "KE",
            invoice_id:        1,
            issue_date:        "2026-04-25",
            due_date:          "2026-05-25",
            currency:          "TRL",
            shipment_included: false,
            description:       "test",
            details: [{ quantity: 1, unit_price: 100, vat_rate: 20, description: "x" }],
        });
    }

    async function runJobToDone(adapter: MockParasutAdapter, jobId: string) {
        // TrackableJob: ilk 2 çağrı running, 3. çağrı done
        await adapter.getTrackableJob(jobId);
        await adapter.getTrackableJob(jobId);
        await adapter.getTrackableJob(jobId);
    }

    it("createEArchive → getSalesInvoiceWithActiveEDocument returns type e_archives", async () => {
        const adapter = makeAdapter();
        const inv = await makeInvoice(adapter);
        const { trackable_job_id } = await adapter.createEArchive(inv.id, { issue_date: "2026-04-25", internet_sale: false });
        await runJobToDone(adapter, trackable_job_id);
        const result = await adapter.getSalesInvoiceWithActiveEDocument(inv.id);
        expect(result.active_e_document).not.toBeNull();
        expect(result.active_e_document!.type).toBe("e_archives");
    });

    it("createEInvoice → getSalesInvoiceWithActiveEDocument returns type e_invoices", async () => {
        const adapter = makeAdapter();
        const inv = await makeInvoice(adapter);
        const { trackable_job_id } = await adapter.createEInvoice(inv.id, { issue_date: "2026-04-25", scenario: "commercial" });
        await runJobToDone(adapter, trackable_job_id);
        const result = await adapter.getSalesInvoiceWithActiveEDocument(inv.id);
        expect(result.active_e_document).not.toBeNull();
        expect(result.active_e_document!.type).toBe("e_invoices");
    });

    it("active_e_document is null before job is done", async () => {
        const adapter = makeAdapter();
        const inv = await makeInvoice(adapter);
        await adapter.createEArchive(inv.id, { issue_date: "2026-04-25", internet_sale: false });
        // Job başlatıldı ama done değil
        const result = await adapter.getSalesInvoiceWithActiveEDocument(inv.id);
        expect(result.active_e_document).toBeNull();
    });
});

// ── TrackableJob state machine ────────────────────────────────────────────────

describe("TrackableJob state machine", () => {
    it("running → running → done (3-call pattern)", async () => {
        const adapter = makeAdapter();
        const inv = await adapter.createSalesInvoice({
            contact_id: "c", invoice_series: "KE", invoice_id: 1,
            issue_date: "2026-04-25", due_date: "2026-05-25",
            currency: "TRL", shipment_included: false, description: "x",
            details: [{ quantity: 1, unit_price: 1, vat_rate: 20, description: "x" }],
        });
        const { trackable_job_id } = await adapter.createEArchive(inv.id, { issue_date: "2026-04-25", internet_sale: false });
        expect((await adapter.getTrackableJob(trackable_job_id)).status).toBe("running");
        expect((await adapter.getTrackableJob(trackable_job_id)).status).toBe("running");
        expect((await adapter.getTrackableJob(trackable_job_id)).status).toBe("done");
    });

    it("throws not_found for unknown job id", async () => {
        const adapter = makeAdapter();
        await expect(adapter.getTrackableJob("nonexistent")).rejects.toMatchObject({ kind: "not_found" });
    });

    it("listEInvoiceInboxesByVkn returns empty (mock default)", async () => {
        const adapter = makeAdapter();
        const result = await adapter.listEInvoiceInboxesByVkn("1234567890");
        expect(result).toEqual([]);
    });
});

// ── Error injection ───────────────────────────────────────────────────────────

describe("Error injection (setErrorMode)", () => {
    it("setErrorMode(true) causes createContact to throw server error", async () => {
        const adapter = makeAdapter();
        adapter.setErrorMode(true);
        await expect(
            adapter.createContact({ name: "X", tax_number: "1" })
        ).rejects.toMatchObject({ kind: "server" });
    });

    it("setErrorMode(false) allows createContact to succeed", async () => {
        const adapter = makeAdapter();
        adapter.setErrorMode(false);
        const contact = await adapter.createContact({ name: "Y", tax_number: "2" });
        expect(contact.id).toBeTruthy();
    });

    it("setErrorMode(true) causes createSalesInvoice to throw (after invariant pass)", async () => {
        const adapter = makeAdapter();
        adapter.setErrorMode(true);
        await expect(
            adapter.createSalesInvoice({
                contact_id: "c", invoice_series: "KE", invoice_id: 1,
                issue_date: "2026-04-25", due_date: "2026-05-25",
                currency: "TRL", shipment_included: false, description: "x",
                details: [{ quantity: 1, unit_price: 1, vat_rate: 20, description: "x" }],
            })
        ).rejects.toMatchObject({ kind: "server" });
    });

    it("setErrorMode(true) causes createShipmentDocument to throw (after invariant pass)", async () => {
        const adapter = makeAdapter();
        adapter.setErrorMode(true);
        await expect(
            adapter.createShipmentDocument({
                contact_id: "c", issue_date: "2026-04-25", shipment_date: "2026-04-24",
                inflow: false, procurement_number: "ORD-001", description: "x",
                details: [{ quantity: 1, product_id: "p1", description: "x" }],
            })
        ).rejects.toMatchObject({ kind: "server" });
    });
});

// ── reset() ───────────────────────────────────────────────────────────────────

describe("reset()", () => {
    it("clears all state", async () => {
        const adapter = makeAdapter();
        await adapter.createContact({ name: "A", tax_number: "111" });
        await adapter.createProduct({ code: "SKU-1", name: "P" });
        adapter.reset();
        expect(await adapter.findContactsByTaxNumber("111")).toEqual([]);
        expect(await adapter.findProductsByCode("SKU-1")).toEqual([]);
    });

    it("restores 'random' error mode after reset — re-disable for determinism", async () => {
        const adapter = makeAdapter();
        adapter.setErrorMode(true);
        adapter.reset();
        // reset() 'random' moduna döner; deterministic test için tekrar disable et
        adapter.setErrorMode(false);
        const contact = await adapter.createContact({ name: "Z", tax_number: "9" });
        expect(contact.id).toBeTruthy();
    });
});
