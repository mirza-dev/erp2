/**
 * Faz 12 — gerçek Paraşüt HTTP adapter.
 *
 * Bu dosya iki şeyi kanıtlar:
 *  1. **Tel üzerindeki gövde** spec'e uygun (JSON:API zarfı, ilişki anahtarları,
 *     salt-okunur alanların GÖNDERİLMEMESİ) — çünkü tek bir yanlış alan canlıda
 *     422 demek ve mock bunu asla yakalayamaz.
 *  2. **Sözleşme eşitliği**: HttpParasutAdapter, MockParasutAdapter ile aynı
 *     domain nesnelerini üretir → orkestra katmanı ikisini ayırt edemez.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    HttpParasutAdapter,
    classifyHttpStatus,
    parseRetryAfter,
    extractApiErrorMessage,
    normalizeJobStatus,
    assertSalesInvoiceStockInvariant,
    assertShipmentDocumentInvariant,
} from "@/lib/parasut-http-adapter";
import { ParasutError } from "@/lib/parasut-adapter";
import type { InvoiceInput, ShipmentDocInput } from "@/lib/parasut-adapter";

// ── Test altyapısı ───────────────────────────────────────────────────────────

interface Call { url: string; init: RequestInit }

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json", ...headers },
    });
}

function makeAdapter(responses: Response[] | ((call: Call) => Response)) {
    const calls: Call[] = [];
    let i = 0;
    const fetchImpl = (async (url: unknown, init: unknown) => {
        const call = { url: String(url), init: (init ?? {}) as RequestInit };
        calls.push(call);
        if (typeof responses === "function") return responses(call);
        const r = responses[i++];
        if (!r) throw new Error(`Beklenmeyen ek istek: ${call.url}`);
        return r;
    }) as unknown as typeof fetch;

    const adapter = new HttpParasutAdapter({
        getAccessToken: async () => "TEST_TOKEN",
        companyId:      "999",
        clientId:       "cid",
        clientSecret:   "csecret",
        fetchImpl,
    });
    return { adapter, calls };
}

function bodyOf(call: Call): Record<string, unknown> {
    return JSON.parse(String(call.init.body)) as Record<string, unknown>;
}

/** `data.attributes` kısayolu. */
function attrs(call: Call): Record<string, unknown> {
    const data = (bodyOf(call).data ?? {}) as { attributes?: Record<string, unknown> };
    return data.attributes ?? {};
}

/** `data.relationships` kısayolu. */
function rels(call: Call): Record<string, unknown> {
    const data = (bodyOf(call).data ?? {}) as { relationships?: Record<string, unknown> };
    return data.relationships ?? {};
}

const VALID_INVOICE: InvoiceInput = {
    contact_id:        "c1",
    invoice_series:    "KE",
    invoice_id:        20260042,
    issue_date:        "2026-08-28",
    due_date:          "2026-09-27",
    currency:          "USD",
    shipment_included: false,
    description:       "Roven #ORD-2026-0042",
    details: [{
        quantity: 2, unit_price: 100, vat_rate: 20,
        description: "Küresel Vana (KV-1)", product_id: "p1",
    }],
};

const VALID_SHIPMENT: ShipmentDocInput = {
    contact_id:         "c1",
    issue_date:         "2026-08-28",
    shipment_date:      "2026-08-27",
    inflow:             false,
    procurement_number: "ORD-2026-0042",
    description:        "Roven #ORD-2026-0042",
    details: [{ quantity: 2, product_id: "p1", description: "Küresel Vana (KV-1)" }],
};

// ── Hata sınıflandırma ───────────────────────────────────────────────────────

describe("classifyHttpStatus", () => {
    it("401/403 → auth (retry ile geçmez, OAuth yeniden doğrulama gerekir)", () => {
        expect(classifyHttpStatus(401)).toBe("auth");
        expect(classifyHttpStatus(403)).toBe("auth");
    });

    it("404 → not_found · 429 → rate_limit · 5xx → server", () => {
        expect(classifyHttpStatus(404)).toBe("not_found");
        expect(classifyHttpStatus(429)).toBe("rate_limit");
        expect(classifyHttpStatus(500)).toBe("server");
        expect(classifyHttpStatus(503)).toBe("server");
    });

    it("400/422 ve diğer 4xx → validation (kalıcı hata)", () => {
        expect(classifyHttpStatus(400)).toBe("validation");
        expect(classifyHttpStatus(422)).toBe("validation");
        expect(classifyHttpStatus(409)).toBe("validation");
    });
});

describe("parseRetryAfter", () => {
    it("saniye biçimini okur", () => {
        expect(parseRetryAfter("7")).toBe(7);
        expect(parseRetryAfter(" 12 ")).toBe(12);
    });

    it("HTTP-date biçimini şimdiye göre saniyeye çevirir", () => {
        const now = Date.parse("2026-08-28T10:00:00Z");
        expect(parseRetryAfter("Fri, 28 Aug 2026 10:00:30 GMT", now)).toBe(30);
    });

    it("yok/bozuk değerde undefined (backoff varsayılanı devreye girer)", () => {
        expect(parseRetryAfter(null)).toBeUndefined();
        expect(parseRetryAfter("yakında")).toBeUndefined();
    });
});

describe("extractApiErrorMessage", () => {
    it("JSON:API errors dizisini tek satıra indirger", () => {
        const msg = extractApiErrorMessage(
            { errors: [{ title: "Geçersiz", detail: "tax_number zorunlu" }, { detail: "ikinci" }] },
            "fallback",
        );
        expect(msg).toBe("Geçersiz: tax_number zorunlu | ikinci");
    });

    it("OAuth hata biçimini de anlar", () => {
        expect(extractApiErrorMessage(
            { error: "invalid_grant", error_description: "refresh token expired" },
            "fallback",
        )).toBe("invalid_grant: refresh token expired");
    });

    it("tanımadığı gövdede fallback döner", () => {
        expect(extractApiErrorMessage({ weird: true }, "HTTP 500")).toBe("HTTP 500");
        expect(extractApiErrorMessage(null, "HTTP 500")).toBe("HTTP 500");
    });
});

describe("normalizeJobStatus", () => {
    it("spec enum'unu aynen geçirir", () => {
        expect(normalizeJobStatus("running")).toBe("running");
        expect(normalizeJobStatus("done")).toBe("done");
        expect(normalizeJobStatus("error")).toBe("error");
    });

    it("spec DIŞI değerleri running sayar (poll tekrar bakar — veri kaybı yok)", () => {
        // `pending` Paraşüt narrative'inde geçer ama enum'da yok.
        expect(normalizeJobStatus("pending")).toBe("running");
        expect(normalizeJobStatus("")).toBe("running");
    });
});

// ── HTTP hata yolları ────────────────────────────────────────────────────────

describe("HTTP hataları ParasutError'a çevrilir", () => {
    it("429 Retry-After'ı taşır (parasutApiCall tek-retry'ı buna dayanır)", async () => {
        const { adapter } = makeAdapter([
            jsonResponse({ errors: [{ title: "Rate limited" }] }, 429, { "retry-after": "9" }),
        ]);
        const err = await adapter.findProductsByCode("SKU-1").catch((e: unknown) => e);
        expect(err).toBeInstanceOf(ParasutError);
        expect((err as ParasutError).kind).toBe("rate_limit");
        expect((err as ParasutError).retryAfterSec).toBe(9);
    });

    it("401 → auth ve mesaj Paraşüt'ün gerekçesini içerir", async () => {
        const { adapter } = makeAdapter([
            jsonResponse({ errors: [{ title: "Unauthorized", detail: "token expired" }] }, 401),
        ]);
        const err = await adapter.findProductsByCode("SKU-1").catch((e: unknown) => e) as ParasutError;
        expect(err.kind).toBe("auth");
        expect(err.message).toContain("token expired");
    });

    it("fetch throw → network (geçici sınıf, backoff'a düşer)", async () => {
        const fetchImpl = (async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch;
        const adapter = new HttpParasutAdapter({
            getAccessToken: async () => "T", companyId: "1", clientId: "c", clientSecret: "s", fetchImpl,
        });
        const err = await adapter.findProductsByCode("X").catch((e: unknown) => e) as ParasutError;
        expect(err.kind).toBe("network");
        expect(err.message).toContain("fetch failed");
    });

    it("JSON olmayan gövde adapter'ı çökertmez", async () => {
        const { adapter } = makeAdapter([
            new Response("<html>502 Bad Gateway</html>", { status: 502 }),
        ]);
        const err = await adapter.findProductsByCode("X").catch((e: unknown) => e) as ParasutError;
        expect(err.kind).toBe("server");
    });
});

describe("yapılandırma eksikliği", () => {
    const OLD = process.env.PARASUT_COMPANY_ID;
    afterEach(() => {
        if (OLD === undefined) delete process.env.PARASUT_COMPANY_ID;
        else process.env.PARASUT_COMPANY_ID = OLD;
    });

    it("PARASUT_COMPANY_ID yoksa validation hatası (ağa hiç çıkılmaz)", async () => {
        delete process.env.PARASUT_COMPANY_ID;
        const fetchImpl = vi.fn();
        const adapter = new HttpParasutAdapter({
            getAccessToken: async () => "T",
            clientId: "c", clientSecret: "s",
            fetchImpl: fetchImpl as unknown as typeof fetch,
        });
        const err = await adapter.findProductsByCode("X").catch((e: unknown) => e) as ParasutError;
        expect(err.kind).toBe("validation");
        expect(err.message).toContain("PARASUT_COMPANY_ID");
        expect(fetchImpl).not.toHaveBeenCalled();
    });
});

// ── OAuth ────────────────────────────────────────────────────────────────────

describe("OAuth", () => {
    it("authorization_code form gövdesi spec'e uygun", async () => {
        const { adapter, calls } = makeAdapter([
            jsonResponse({ access_token: "A", refresh_token: "R", expires_in: 7200 }),
        ]);
        await adapter.exchangeAuthCode("CODE", "https://erp.example.com/cb");

        const form = new URLSearchParams(String(calls[0].init.body));
        expect(form.get("grant_type")).toBe("authorization_code");
        expect(form.get("code")).toBe("CODE");
        expect(form.get("redirect_uri")).toBe("https://erp.example.com/cb");
        expect(form.get("client_id")).toBe("cid");
        expect(form.get("client_secret")).toBe("csecret");
        expect((calls[0].init.headers as Record<string, string>)["Content-Type"])
            .toBe("application/x-www-form-urlencoded");
    });

    it("expires_in → mutlak expires_at (lease penceresi buna bakar)", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-08-28T10:00:00.000Z"));
        try {
            const { adapter } = makeAdapter([
                jsonResponse({ access_token: "A", refresh_token: "R", expires_in: 7200 }),
            ]);
            const tokens = await adapter.refreshToken("OLD_R");
            expect(tokens.expires_at).toBe("2026-08-28T12:00:00.000Z");
        } finally {
            vi.useRealTimers();
        }
    });

    it("refresh dönen YENİ refresh_token'ı taşır (Paraşüt rotate eder)", async () => {
        const { adapter, calls } = makeAdapter([
            jsonResponse({ access_token: "A2", refresh_token: "R2", expires_in: 7200 }),
        ]);
        const tokens = await adapter.refreshToken("R1");
        expect(tokens.refresh_token).toBe("R2");
        expect(new URLSearchParams(String(calls[0].init.body)).get("refresh_token")).toBe("R1");
    });

    it("jeton yanıtta yoksa auth hatası (retry anlamsız)", async () => {
        const { adapter } = makeAdapter([jsonResponse({ access_token: "A" })]);
        const err = await adapter.refreshToken("R").catch((e: unknown) => e) as ParasutError;
        expect(err.kind).toBe("auth");
    });

    it("refreshToken jeton sağlayıcıyı ÇAĞIRMAZ (özyineleme koruması)", async () => {
        const getAccessToken = vi.fn(async () => "T");
        const fetchImpl = (async () => jsonResponse({
            access_token: "A", refresh_token: "R", expires_in: 7200,
        })) as unknown as typeof fetch;
        const adapter = new HttpParasutAdapter({
            getAccessToken, companyId: "1", clientId: "c", clientSecret: "s", fetchImpl,
        });
        await adapter.refreshToken("R0");
        expect(getAccessToken).not.toHaveBeenCalled();
    });
});

// ── İstek gövdeleri (tel üzerindeki gerçek) ──────────────────────────────────

describe("createSalesInvoice payload", () => {
    it("stok invariant: shipment_included=false ve detail'de warehouse YOK", async () => {
        const { adapter, calls } = makeAdapter([jsonResponse({ data: { id: "inv1", attributes: {} } })]);
        await adapter.createSalesInvoice(VALID_INVOICE);

        expect(attrs(calls[0]).shipment_included).toBe(false);
        const details = (rels(calls[0]).details as { data: Array<Record<string, unknown>> }).data;
        expect(details[0].relationships).not.toHaveProperty("warehouse");
        expect(details[0].attributes).not.toHaveProperty("warehouse");
    });

    it("exchange_rate verildiğinde gönderilir, verilmediğinde ALAN HİÇ YOK", async () => {
        const withRate = makeAdapter([jsonResponse({ data: { id: "i", attributes: {} } })]);
        await withRate.adapter.createSalesInvoice({ ...VALID_INVOICE, exchange_rate: 41.2345 });
        expect(attrs(withRate.calls[0]).exchange_rate).toBe(41.2345);

        const noRate = makeAdapter([jsonResponse({ data: { id: "i", attributes: {} } })]);
        await noRate.adapter.createSalesInvoice(VALID_INVOICE);
        // `undefined` göndermek ile alanı hiç göndermemek Paraşüt'te aynı DEĞİL.
        expect(attrs(noRate.calls[0])).not.toHaveProperty("exchange_rate");
    });

    it("ERP sipariş numarası resmî order_no alanına yazılır", async () => {
        const { adapter, calls } = makeAdapter([jsonResponse({ data: { id: "i", attributes: {} } })]);
        await adapter.createSalesInvoice({
            ...VALID_INVOICE, order_no: "ORD-2026-0042", order_date: "2026-08-20",
        });
        expect(attrs(calls[0]).order_no).toBe("ORD-2026-0042");
        expect(attrs(calls[0]).order_date).toBe("2026-08-20");
    });

    it("contact ve details JSON:API ilişki biçiminde", async () => {
        const { adapter, calls } = makeAdapter([jsonResponse({ data: { id: "i", attributes: {} } })]);
        await adapter.createSalesInvoice(VALID_INVOICE);

        expect(rels(calls[0]).contact).toEqual({ data: { id: "c1", type: "contacts" } });
        const details = (rels(calls[0]).details as { data: Array<Record<string, unknown>> }).data;
        expect(details[0].type).toBe("sales_invoice_details");
        expect(details[0].attributes).toMatchObject({ quantity: 2, unit_price: 100, vat_rate: 20 });
        expect(details[0].relationships).toEqual({ product: { data: { id: "p1", type: "products" } } });
    });

    it("item_type=invoice ve seri/numara alanları taşınır", async () => {
        const { adapter, calls } = makeAdapter([jsonResponse({ data: { id: "i", attributes: {} } })]);
        await adapter.createSalesInvoice(VALID_INVOICE);
        expect(attrs(calls[0])).toMatchObject({
            item_type: "invoice", invoice_series: "KE", invoice_id: 20260042, currency: "USD",
        });
    });
});

describe("createShipmentDocument payload", () => {
    it("kalemler stock_movements ilişkisi olarak gider (Paraşüt stok kapısı)", async () => {
        const { adapter, calls } = makeAdapter([jsonResponse({ data: { id: "s1", attributes: {} } })]);
        await adapter.createShipmentDocument(VALID_SHIPMENT);

        const movements = (rels(calls[0]).stock_movements as { data: Array<Record<string, unknown>> }).data;
        expect(movements[0].type).toBe("stock_movements");
        expect(movements[0].attributes).toMatchObject({ quantity: 2 });
        expect(movements[0].relationships).toEqual({ product: { data: { id: "p1", type: "products" } } });
        expect(attrs(calls[0])).toMatchObject({ inflow: false, procurement_number: "ORD-2026-0042" });
    });

    it("adres alanları boşsa gönderilmez", async () => {
        const { adapter, calls } = makeAdapter([jsonResponse({ data: { id: "s", attributes: {} } })]);
        await adapter.createShipmentDocument(VALID_SHIPMENT);
        expect(attrs(calls[0])).not.toHaveProperty("city");
        expect(attrs(calls[0])).not.toHaveProperty("district");
    });
});

describe("e-belge payload — spec asimetrisi", () => {
    it("e-Fatura ilişki anahtarı `invoice`", async () => {
        const { adapter, calls } = makeAdapter([jsonResponse({ data: { id: "job1", attributes: {} } })]);
        const res = await adapter.createEInvoice("inv1", { issue_date: "2026-08-28", scenario: "commercial" });

        expect(bodyOf(calls[0])).toMatchObject({ data: { type: "e_invoices" } });
        expect(rels(calls[0])).toEqual({ invoice: { data: { id: "inv1", type: "sales_invoices" } } });
        expect(res.trackable_job_id).toBe("job1");
    });

    it("e-Arşiv ilişki anahtarı `sales_invoice` (e-faturadan FARKLI)", async () => {
        const { adapter, calls } = makeAdapter([jsonResponse({ data: { id: "job2", attributes: {} } })]);
        await adapter.createEArchive("inv1", { issue_date: "2026-08-28", internet_sale: false });
        expect(rels(calls[0])).toEqual({ sales_invoice: { data: { id: "inv1", type: "sales_invoices" } } });
    });

    it("issue_date e-belge formuna KONMAZ (spec'te readOnly — faturadan miras)", async () => {
        const inv = makeAdapter([jsonResponse({ data: { id: "j", attributes: {} } })]);
        await inv.adapter.createEInvoice("i1", { issue_date: "2026-08-28", scenario: "basic" });
        expect(attrs(inv.calls[0])).not.toHaveProperty("issue_date");

        const arc = makeAdapter([jsonResponse({ data: { id: "j", attributes: {} } })]);
        await arc.adapter.createEArchive("i1", { issue_date: "2026-08-28", internet_sale: false });
        expect(attrs(arc.calls[0])).not.toHaveProperty("issue_date");
    });

    it("internet_sale gönderilmez — spec'te OBJE, boolean 422 verirdi", async () => {
        const { adapter, calls } = makeAdapter([jsonResponse({ data: { id: "j", attributes: {} } })]);
        await adapter.createEArchive("i1", { issue_date: "2026-08-28", internet_sale: true });
        expect(attrs(calls[0])).not.toHaveProperty("internet_sale");
    });

    it("scenario ve alıcı kutusu (to) taşınır", async () => {
        const { adapter, calls } = makeAdapter([jsonResponse({ data: { id: "j", attributes: {} } })]);
        await adapter.createEInvoice("i1", {
            issue_date: "2026-08-28", scenario: "commercial", to: "urn:mail:defaultpk@x.com",
        });
        expect(attrs(calls[0])).toMatchObject({ scenario: "commercial", to: "urn:mail:defaultpk@x.com" });
    });
});

describe("createContact payload", () => {
    it("varsayılan account_type=customer (satış akışı davranışı korunur)", async () => {
        const { adapter, calls } = makeAdapter([jsonResponse({ data: { id: "c", attributes: {} } })]);
        await adapter.createContact({ name: "Tüpraş", tax_number: "1234567890" });
        expect(attrs(calls[0])).toMatchObject({ account_type: "customer", tax_number: "1234567890" });
    });

    it("tedarikçi için account_type=supplier geçilebilir", async () => {
        const { adapter, calls } = makeAdapter([jsonResponse({ data: { id: "c", attributes: {} } })]);
        await adapter.createContact({ name: "Langge", tax_number: "9999999999", account_type: "supplier" });
        expect(attrs(calls[0]).account_type).toBe("supplier");
    });
});

// ── İstek biçimi (auth header, filtreler) ────────────────────────────────────

describe("istek biçimi", () => {
    it("Bearer jeton ve firma yolu her çağrıda", async () => {
        const { adapter, calls } = makeAdapter([jsonResponse({ data: [] })]);
        await adapter.findContactsByTaxNumber("1234567890");
        expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer TEST_TOKEN");
        expect(calls[0].url).toContain("/v4/999/contacts");
    });

    it("filtreler JSON:API query biçiminde", async () => {
        const { adapter, calls } = makeAdapter([jsonResponse({ data: [] })]);
        await adapter.findContactsByTaxNumber("1234567890");
        expect(decodeURIComponent(calls[0].url)).toContain("filter[tax_number]=1234567890");
    });

    it("shipment listesi page[size] üst sınırı 25'e kırpılır", async () => {
        const { adapter, calls } = makeAdapter([jsonResponse({ data: [] })]);
        await adapter.listRecentShipmentDocuments(2, 100);
        const url = decodeURIComponent(calls[0].url);
        expect(url).toContain("page[number]=2");
        expect(url).toContain("page[size]=25");
    });

    it("e-fatura mükellef sorgusu vkn filtresiyle", async () => {
        const { adapter, calls } = makeAdapter([jsonResponse({ data: [] })]);
        await adapter.listEInvoiceInboxesByVkn("1234567890");
        expect(decodeURIComponent(calls[0].url)).toContain("filter[vkn]=1234567890");
    });
});

// ── Yanıt eşleme ─────────────────────────────────────────────────────────────

describe("yanıt eşleme", () => {
    it("contact/product/invoice alanları domain tipine iner", async () => {
        const { adapter } = makeAdapter([
            jsonResponse({ data: [{ id: "c1", attributes: { name: "Tüpraş", tax_number: "1", email: "a@b.com" } }] }),
        ]);
        const [contact] = await adapter.findContactsByTaxNumber("1");
        expect(contact).toEqual({ id: "c1", attributes: { name: "Tüpraş", tax_number: "1", email: "a@b.com" } });
    });

    it("boş string alanlar null'a iner (tri-state korunur)", async () => {
        const { adapter } = makeAdapter([
            jsonResponse({ data: [{ id: "c1", attributes: { name: "X", tax_number: "", email: null } }] }),
        ]);
        const [contact] = await adapter.findContactsByTaxNumber("1");
        expect(contact.attributes.tax_number).toBeNull();
        expect(contact.attributes.email).toBeNull();
    });

    it("sayısal alanlar string gelse bile number'a çevrilir", async () => {
        const { adapter } = makeAdapter([
            jsonResponse({ data: [{ id: "i1", attributes: {
                invoice_series: "KE", invoice_id: "20260042",
                net_total: "200.50", gross_total: "240.60", currency: "USD", issue_date: "2026-08-28",
            } }] }),
        ]);
        const [inv] = await adapter.findSalesInvoicesByNumber("KE", 20260042);
        expect(inv.attributes.invoice_id).toBe(20260042);
        expect(inv.attributes.net_total).toBe(200.5);
    });

    it("findSalesInvoicesByNumber sunucu yanlış satır dönerse YEREL olarak eler", async () => {
        // Deterministik numara sözleşmesi: yanlış eşleşme "fatura zaten var"
        // sanılırsa sipariş faturasız kalırdı.
        const { adapter } = makeAdapter([
            jsonResponse({ data: [
                { id: "wrong", attributes: { invoice_series: "KE", invoice_id: 20260099 } },
                { id: "right", attributes: { invoice_series: "KE", invoice_id: 20260042 } },
            ] }),
        ]);
        const found = await adapter.findSalesInvoicesByNumber("KE", 20260042);
        expect(found).toHaveLength(1);
        expect(found[0].id).toBe("right");
    });
});

describe("getSalesInvoiceWithActiveEDocument", () => {
    it("included'dan e-belge tipini ve durumunu çözer", async () => {
        const { adapter, calls } = makeAdapter([
            jsonResponse({
                data: {
                    id: "inv1",
                    attributes: { invoice_series: "KE", invoice_id: 1, currency: "TRL", issue_date: "2026-08-28" },
                    relationships: { active_e_document: { data: { id: "ed1", type: "e_invoices" } } },
                },
                included: [{ id: "ed1", type: "e_invoices", attributes: { status: "done" } }],
            }),
        ]);
        const result = await adapter.getSalesInvoiceWithActiveEDocument("inv1");
        expect(decodeURIComponent(calls[0].url)).toContain("include=active_e_document");
        expect(result.active_e_document).toEqual({ id: "ed1", type: "e_invoices", attributes: { status: "done" } });
    });

    it("e-belge yoksa null (orkestra bunu 'henüz kesilmedi' olarak okur)", async () => {
        const { adapter } = makeAdapter([
            jsonResponse({ data: { id: "inv1", attributes: { currency: "TRL", issue_date: "2026-08-28" } } }),
        ]);
        const result = await adapter.getSalesInvoiceWithActiveEDocument("inv1");
        expect(result.active_e_document).toBeNull();
    });
});

describe("getTrackableJob", () => {
    it("durum ve hata listesini taşır", async () => {
        const { adapter } = makeAdapter([
            jsonResponse({ data: { id: "j1", attributes: { status: "error", errors: ["GİB reddetti"] } } }),
        ]);
        expect(await adapter.getTrackableJob("j1")).toEqual({ status: "error", errors: ["GİB reddetti"] });
    });

    it("spec dışı `pending` running'e normalize edilir", async () => {
        const { adapter } = makeAdapter([
            jsonResponse({ data: { id: "j1", attributes: { status: "pending" } } }),
        ]);
        expect(await adapter.getTrackableJob("j1")).toEqual({ status: "running" });
    });
});

// ── Invariant guard'ları ─────────────────────────────────────────────────────

describe("stok invariant guard'ları (mock ile AYNI mesajlar)", () => {
    // upsertInvoice catch bloğu bu metinleri regex ile tanıyıp critical
    // "Paraşüt stok invariant ihlali" alert'i açıyor → metin sözleşmedir.
    it("shipment_included=true reddedilir", () => {
        expect(() => assertSalesInvoiceStockInvariant(
            { ...VALID_INVOICE, shipment_included: true as unknown as false },
        )).toThrow(/shipment_included MUST be false/);
    });

    it("detail'de warehouse reddedilir", () => {
        expect(() => assertSalesInvoiceStockInvariant({
            ...VALID_INVOICE,
            details: [{ ...VALID_INVOICE.details[0], warehouse: "w1" } as never],
        })).toThrow(/warehouse.*stok invariant/);
    });

    it("warehouse_id de reddedilir (mock yalnız `warehouse`'a bakıyordu)", () => {
        expect(() => assertSalesInvoiceStockInvariant({
            ...VALID_INVOICE,
            details: [{ ...VALID_INVOICE.details[0], warehouse_id: "w1" } as never],
        })).toThrow(/stok invariant/);
    });

    it("satış irsaliyesinde inflow=true reddedilir", () => {
        expect(() => assertShipmentDocumentInvariant(
            { ...VALID_SHIPMENT, inflow: true as unknown as false },
        )).toThrow(/inflow MUST be false/);
    });

    it("procurement_number zorunlu (recovery'nin tek dayanağı)", () => {
        expect(() => assertShipmentDocumentInvariant(
            { ...VALID_SHIPMENT, procurement_number: "" },
        )).toThrow(/procurement_number is required/);
    });

    it("guard ihlalinde AĞA HİÇ ÇIKILMAZ", async () => {
        const fetchImpl = vi.fn();
        const adapter = new HttpParasutAdapter({
            getAccessToken: async () => "T", companyId: "1", clientId: "c", clientSecret: "s",
            fetchImpl: fetchImpl as unknown as typeof fetch,
        });
        await expect(adapter.createSalesInvoice(
            { ...VALID_INVOICE, shipment_included: true as unknown as false },
        )).rejects.toThrow(/shipment_included/);
        expect(fetchImpl).not.toHaveBeenCalled();
    });
});

describe("createPurchaseBill payload (Faz 13)", () => {
    const BILL = {
        supplier_id: "c9", issue_date: "2026-08-28", due_date: "2026-09-27",
        currency: "TRL" as const, description: "Roven #PO-2026-0007",
        invoice_no: "FTR-2026-1188",
        details: [{
            quantity: 5, unit_price: 250, vat_rate: 10,
            description: "Flanş (FL-1)", product_id: "p9",
        }],
    };

    it("#detailed biçimi: supplier + details ilişkisi, item_type=purchase_bill", async () => {
        const { adapter, calls } = makeAdapter([jsonResponse({ data: { id: "b1", attributes: {} } })]);
        await adapter.createPurchaseBill(BILL);

        expect(bodyOf(calls[0])).toMatchObject({ data: { type: "purchase_bills" } });
        expect(attrs(calls[0])).toMatchObject({ item_type: "purchase_bill", currency: "TRL" });
        expect(rels(calls[0]).supplier).toEqual({ data: { id: "c9", type: "contacts" } });

        const details = (rels(calls[0]).details as { data: Array<Record<string, unknown>> }).data;
        expect(details[0].type).toBe("purchase_bill_details");
        expect(details[0].attributes).toMatchObject({ quantity: 5, unit_price: 250, vat_rate: 10 });
        expect(details[0].relationships).toEqual({ product: { data: { id: "p9", type: "products" } } });
    });

    it("STOK INVARIANT: detail'de warehouse ilişkisi YOK", async () => {
        const { adapter, calls } = makeAdapter([jsonResponse({ data: { id: "b1", attributes: {} } })]);
        await adapter.createPurchaseBill(BILL);
        const details = (rels(calls[0]).details as { data: Array<Record<string, unknown>> }).data;
        expect(details[0].relationships).not.toHaveProperty("warehouse");
    });

    it("tedarikçi fatura numarası invoice_no alanına gider (KDV künyesi)", async () => {
        const { adapter, calls } = makeAdapter([jsonResponse({ data: { id: "b1", attributes: {} } })]);
        await adapter.createPurchaseBill(BILL);
        expect(attrs(calls[0]).invoice_no).toBe("FTR-2026-1188");
    });

    it("künye yoksa alan HİÇ gönderilmez (boş string değil)", async () => {
        const { adapter, calls } = makeAdapter([jsonResponse({ data: { id: "b1", attributes: {} } })]);
        const { invoice_no: _omit, ...noInvoice } = BILL;
        void _omit;
        await adapter.createPurchaseBill(noInvoice);
        expect(attrs(calls[0])).not.toHaveProperty("invoice_no");
    });

    it("guard ihlalinde ağa çıkılmaz", async () => {
        const fetchImpl = vi.fn();
        const adapter = new HttpParasutAdapter({
            getAccessToken: async () => "T", companyId: "1", clientId: "c", clientSecret: "s",
            fetchImpl: fetchImpl as unknown as typeof fetch,
        });
        await expect(adapter.createPurchaseBill({
            ...BILL, details: [{ ...BILL.details[0], warehouse: "w1" } as never],
        })).rejects.toThrow(/stok invariant/);
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("kurtarma listesi tedarikçiye göre filtreler (invoice_no filtresi YOK)", async () => {
        const { adapter, calls } = makeAdapter([jsonResponse({ data: [] })]);
        await adapter.listPurchaseBillsBySupplier("c9", 2, 100);
        const url = decodeURIComponent(calls[0].url);
        expect(url).toContain("filter[supplier_id]=c9");
        expect(url).toContain("page[number]=2");
        expect(url).toContain("page[size]=25");
    });

    it("kurtarma yanıtı açıklamayı taşır (yerel eşleşme anahtarı)", async () => {
        const { adapter } = makeAdapter([jsonResponse({ data: [
            { id: "b1", attributes: { description: "Roven #PO-2026-0007", invoice_no: "FTR-1", currency: "TRL", issue_date: "2026-08-28" } },
        ] })]);
        const [bill] = await adapter.listPurchaseBillsBySupplier("c9", 1, 25);
        expect(bill.attributes.description).toBe("Roven #PO-2026-0007");
        expect(bill.attributes.invoice_no).toBe("FTR-1");
    });
});

// ── Sözleşme eşitliği: mock ≡ http ───────────────────────────────────────────

describe("sözleşme eşitliği (mock ≡ http)", () => {
    let mock: typeof import("@/lib/parasut").mockParasutAdapter;

    beforeEach(async () => {
        mock = (await import("@/lib/parasut")).mockParasutAdapter;
        mock.reset();
        mock.setErrorMode(false);
    });

    it("createContact iki adapter'da da aynı ŞEKİLDE nesne döner", async () => {
        const input = { name: "Tüpraş", tax_number: "1234567890", email: "a@b.com" };
        const fromMock = await mock.createContact(input);

        const { adapter } = makeAdapter([jsonResponse({
            data: { id: "c1", attributes: { name: "Tüpraş", tax_number: "1234567890", email: "a@b.com" } },
        })]);
        const fromHttp = await adapter.createContact(input);

        expect(Object.keys(fromHttp).sort()).toEqual(Object.keys(fromMock).sort());
        expect(Object.keys(fromHttp.attributes).sort()).toEqual(Object.keys(fromMock.attributes).sort());
        expect(fromHttp.attributes).toEqual(fromMock.attributes);
    });

    it("createShipmentDocument dönüşü aynı şekilde", async () => {
        const fromMock = await mock.createShipmentDocument(VALID_SHIPMENT);
        const { adapter } = makeAdapter([jsonResponse({
            data: { id: "s1", attributes: {
                inflow: false, procurement_number: "ORD-2026-0042",
                shipment_date: "2026-08-27", issue_date: "2026-08-28",
            } },
        })]);
        const fromHttp = await adapter.createShipmentDocument(VALID_SHIPMENT);

        expect(Object.keys(fromHttp.attributes).sort()).toEqual(Object.keys(fromMock.attributes).sort());
        expect(fromHttp.attributes.inflow).toBe(false);
    });

    it("iki adapter da aynı invariant ihlalinde aynı hata sınıfını üretir", async () => {
        const bad = { ...VALID_INVOICE, shipment_included: true as unknown as false };
        const mockErr = await mock.createSalesInvoice(bad).catch((e: unknown) => e) as ParasutError;

        const { adapter } = makeAdapter([]);
        const httpErr = await adapter.createSalesInvoice(bad).catch((e: unknown) => e) as ParasutError;

        expect(httpErr.kind).toBe(mockErr.kind);
        expect(httpErr.message).toBe(mockErr.message);
    });
});
