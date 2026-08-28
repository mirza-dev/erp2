/**
 * Paraşüt — gerçek HTTP adapter (Faz 12).
 *
 * `MockParasutAdapter` ile AYNI `ParasutAdapter` sözleşmesini gerçek Paraşüt
 * API v4 (JSON:API) üzerinden karşılar. Orkestra katmanı (`parasut-service.ts`),
 * retry/backoff, idempotency marker'ları, alert'ler ve claim/lease mantığı bu
 * dosyayı hiç bilmez — mock ile bire bir değiştirilebilir olması esastır.
 *
 * ── Spec'ten pinlenen davranışlar (swagger v4) ───────────────────────────────
 *  · Base URL          `https://api.parasut.com/v4/{company_id}`
 *  · OAuth             `https://api.parasut.com/oauth/token` (form-encoded)
 *  · access_token      2 saat (7200 sn); refresh HER ÇAĞRIDA yeni refresh_token
 *                      döndürür (rotate) → `getAccessToken` CAS'i bunu saklar
 *  · Rate limit        10 istek / 10 sn → 429 + `Retry-After`; tek-retry
 *                      `parasutApiCall` katmanında (burada değil)
 *  · e-Fatura ilişki   `relationships.invoice`      → type `sales_invoices`
 *  · e-Arşiv ilişki    `relationships.sales_invoice`→ type `sales_invoices`
 *                      (ASİMETRİ SPEC'TE — arayüz uniform, fark burada gizlenir)
 *  · e-belge issue_date `readOnly` → forma KONULMAZ (faturadan miras alır)
 *  · e-arşiv internet_sale spec'te OBJE (boolean değil) → yalnız gerçek
 *                      internet satışında dolar; bizde B2B → alan gönderilmez
 *  · shipment_documents `procurement_number` filtresi YOK → sayfalama + local
 *                      eşleşme (recovery yolu servis katmanında)
 */

import { ParasutError } from "./parasut-adapter";
import type {
    ParasutAdapter,
    OAuthTokens,
    ParasutContact,
    ParasutProduct,
    ParasutInvoice,
    ParasutInvoiceWithEDocument,
    ParasutEDocument,
    ParasutShipmentDocument,
    ParasutPurchaseBill,
    ParasutPaymentState,
    ParasutInventoryLevel,
    ParasutEInvoiceInbox,
    ContactInput,
    ProductInput,
    InvoiceInput,
    PurchaseBillInput,
    StockUpdateDetailInput,
    ShipmentDocInput,
    EInvoiceInput,
    EArchiveInput,
} from "./parasut-adapter";
import type { ParasutErrorKind } from "./parasut-constants";

// ── Sabitler ─────────────────────────────────────────────────────────────────

export const PARASUT_DEFAULT_BASE_URL  = "https://api.parasut.com/v4";
export const PARASUT_DEFAULT_OAUTH_URL = "https://api.parasut.com/oauth/token";
export const PARASUT_DEFAULT_TIMEOUT_MS = 20_000;

// ── Hata sınıflandırma ───────────────────────────────────────────────────────

/**
 * HTTP durum kodu → `ParasutErrorKind`.
 *
 * `classifyAndPatch` bu türlere göre karar verir:
 *   auth/validation → kalıcı (2099 retry-block, operatör müdahalesi)
 *   rate_limit/server/network → geçici (exponential backoff)
 *   not_found → adım bazlı (çağıran yorumlar)
 *
 * 403'ün `auth` sayılması bilinçli: Paraşüt yetki/abonelik sorunlarında 403
 * döner ve bunlar retry ile geçmez — OAuth yeniden doğrulama gerekir
 * (`checkAuthAlertThreshold` bu sınıfla tetiklenir).
 */
export function classifyHttpStatus(status: number): ParasutErrorKind {
    if (status === 401 || status === 403) return "auth";
    if (status === 404)                   return "not_found";
    if (status === 429)                   return "rate_limit";
    if (status >= 500)                    return "server";
    return "validation"; // 400 / 422 ve diğer 4xx
}

/** `Retry-After` saniye olarak; hem sayı hem HTTP-date biçimini kabul eder. */
export function parseRetryAfter(raw: string | null, nowMs = Date.now()): number | undefined {
    if (!raw) return undefined;
    const asNumber = Number(raw.trim());
    if (Number.isFinite(asNumber) && asNumber >= 0) return Math.ceil(asNumber);
    const asDate = Date.parse(raw);
    if (!Number.isNaN(asDate)) return Math.max(0, Math.ceil((asDate - nowMs) / 1000));
    return undefined;
}

/** JSON:API `{errors:[{title,detail}]}` gövdesinden okunabilir tek satır üretir. */
export function extractApiErrorMessage(body: unknown, fallback: string): string {
    if (body && typeof body === "object" && Array.isArray((body as { errors?: unknown }).errors)) {
        const parts = ((body as { errors: unknown[] }).errors)
            .map(e => {
                if (!e || typeof e !== "object") return null;
                const { title, detail } = e as { title?: unknown; detail?: unknown };
                const t = typeof title  === "string" ? title  : "";
                const d = typeof detail === "string" ? detail : "";
                const joined = [t, d].filter(Boolean).join(": ");
                return joined || null;
            })
            .filter((s): s is string => !!s);
        if (parts.length > 0) return parts.join(" | ");
    }
    if (body && typeof body === "object") {
        const { error, error_description } = body as { error?: unknown; error_description?: unknown };
        const e = typeof error === "string" ? error : "";
        const d = typeof error_description === "string" ? error_description : "";
        const joined = [e, d].filter(Boolean).join(": ");
        if (joined) return joined;
    }
    return fallback;
}

// ── JSON:API yardımcıları ────────────────────────────────────────────────────

interface JsonApiResource {
    id?: string;
    type?: string;
    attributes?: Record<string, unknown>;
    relationships?: Record<string, unknown>;
}

interface JsonApiDocument {
    data?: JsonApiResource | JsonApiResource[] | null;
    included?: JsonApiResource[];
    meta?: Record<string, unknown>;
}

function asList(doc: JsonApiDocument): JsonApiResource[] {
    if (Array.isArray(doc.data)) return doc.data;
    return doc.data ? [doc.data] : [];
}

function asSingle(doc: JsonApiDocument): JsonApiResource {
    if (Array.isArray(doc.data)) {
        if (doc.data.length === 0) throw new ParasutError("not_found", "Paraşüt yanıtı boş (data)");
        return doc.data[0];
    }
    if (!doc.data) throw new ParasutError("not_found", "Paraşüt yanıtı boş (data)");
    return doc.data;
}

function str(v: unknown): string | null {
    return typeof v === "string" && v.length > 0 ? v : null;
}

function num(v: unknown): number | null {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
        const n = Number(v);
        if (Number.isFinite(n)) return n;
    }
    return null;
}

/** `relationships.<key>.data.id` — tek ilişkili kaynağın id'si. */
function relId(res: JsonApiResource, key: string): string | null {
    const rel = res.relationships?.[key];
    if (!rel || typeof rel !== "object") return null;
    const data = (rel as { data?: unknown }).data;
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;
    return str((data as { id?: unknown }).id);
}

/** `included[]` içinden id+type ile kaynak çözer. */
function findIncluded(doc: JsonApiDocument, id: string, types: string[]): JsonApiResource | null {
    return doc.included?.find(r => r.id === id && !!r.type && types.includes(r.type)) ?? null;
}

// ── Eşleyiciler (JSON:API kaynak → domain tipi) ──────────────────────────────

function toContact(res: JsonApiResource): ParasutContact {
    return {
        id: String(res.id ?? ""),
        attributes: {
            name:       str(res.attributes?.name) ?? "",
            tax_number: str(res.attributes?.tax_number),
            email:      str(res.attributes?.email),
        },
    };
}

function toProduct(res: JsonApiResource): ParasutProduct {
    return {
        id: String(res.id ?? ""),
        attributes: {
            code:        str(res.attributes?.code) ?? "",
            name:        str(res.attributes?.name) ?? "",
            sales_price: num(res.attributes?.sales_price),
        },
    };
}

function toInvoice(res: JsonApiResource): ParasutInvoice {
    return {
        id: String(res.id ?? ""),
        attributes: {
            invoice_no:     str(res.attributes?.invoice_no),
            invoice_series: str(res.attributes?.invoice_series),
            invoice_id:     num(res.attributes?.invoice_id),
            net_total:      num(res.attributes?.net_total)   ?? 0,
            gross_total:    num(res.attributes?.gross_total) ?? 0,
            currency:       str(res.attributes?.currency)    ?? "TRL",
            issue_date:     str(res.attributes?.issue_date)  ?? "",
        },
    };
}

function toShipment(res: JsonApiResource): ParasutShipmentDocument {
    return {
        id: String(res.id ?? ""),
        attributes: {
            inflow:             res.attributes?.inflow === true,
            procurement_number: str(res.attributes?.procurement_number),
            shipment_date:      str(res.attributes?.shipment_date),
            issue_date:         str(res.attributes?.issue_date) ?? "",
        },
    };
}

function toPurchaseBill(res: JsonApiResource): ParasutPurchaseBill {
    return {
        id: String(res.id ?? ""),
        attributes: {
            invoice_no:  str(res.attributes?.invoice_no),
            description: str(res.attributes?.description),
            net_total:   num(res.attributes?.net_total)   ?? 0,
            gross_total: num(res.attributes?.gross_total) ?? 0,
            currency:    str(res.attributes?.currency)    ?? "TRL",
            issue_date:  str(res.attributes?.issue_date)  ?? "",
        },
    };
}

const PAYMENT_STATUSES = new Set(["paid", "overdue", "unpaid", "partially_paid"]);

function toPaymentState(res: JsonApiResource): ParasutPaymentState {
    const raw = str(res.attributes?.payment_status);
    return {
        id:               String(res.id ?? ""),
        // Tanınmayan durum null'a iner: uydurma bir değeri "ödendi" sanmaktansa
        // "bilinmiyor" demek doğrudur (CHECK kısıtı da yalnız 4 değeri kabul eder).
        payment_status:   raw && PAYMENT_STATUSES.has(raw)
            ? (raw as ParasutPaymentState["payment_status"])
            : null,
        remaining:        num(res.attributes?.remaining),
        remaining_in_trl: num(res.attributes?.remaining_in_trl),
        currency:         str(res.attributes?.currency),
        due_date:         str(res.attributes?.due_date),
    };
}

function toInventoryLevel(res: JsonApiResource): ParasutInventoryLevel {
    return {
        id:           String(res.id ?? ""),
        warehouse_id: relId(res, "warehouse"),
        stock_count:  num(res.attributes?.stock_count) ?? 0,
    };
}

function toInbox(res: JsonApiResource): ParasutEInvoiceInbox {
    return {
        id: String(res.id ?? ""),
        attributes: {
            vkn:   str(res.attributes?.vkn)   ?? "",
            alias: str(res.attributes?.alias) ?? "",
        },
    };
}

// ── Yapılandırma ─────────────────────────────────────────────────────────────

export interface HttpParasutAdapterConfig {
    /** Erişim jetonu sağlayıcı. Fabrika (`getParasutAdapter`) enjekte eder. */
    getAccessToken: () => Promise<string>;
    baseUrl?:   string;
    oauthUrl?:  string;
    companyId?: string;
    clientId?:  string;
    clientSecret?: string;
    timeoutMs?: number;
    /** Test enjeksiyonu; verilmezse global `fetch`. */
    fetchImpl?: typeof fetch;
}

// ── Adapter ──────────────────────────────────────────────────────────────────

export class HttpParasutAdapter implements ParasutAdapter {
    constructor(private readonly cfg: HttpParasutAdapterConfig) {}

    // Env okumaları ÇAĞRI ANINDA yapılır (modül yüklenme anında değil) —
    // test ve Next.js server başlatma sıralamasında env sonradan set edilebiliyor.
    private get baseUrl(): string   { return this.cfg.baseUrl  ?? process.env.PARASUT_BASE_URL  ?? PARASUT_DEFAULT_BASE_URL; }
    private get oauthUrl(): string  { return this.cfg.oauthUrl ?? process.env.PARASUT_TOKEN_URL ?? PARASUT_DEFAULT_OAUTH_URL; }
    private get timeoutMs(): number { return this.cfg.timeoutMs ?? PARASUT_DEFAULT_TIMEOUT_MS; }
    private get doFetch(): typeof fetch { return this.cfg.fetchImpl ?? fetch; }

    private requiredEnv(name: string, override: string | undefined): string {
        const value = (override ?? process.env[name] ?? "").trim();
        if (!value) {
            // validation = kalıcı hata: retry ile geçmez, operatör env'i düzeltmeli.
            throw new ParasutError("validation", `Paraşüt yapılandırması eksik: ${name}`);
        }
        return value;
    }

    private get companyId(): string    { return this.requiredEnv("PARASUT_COMPANY_ID",    this.cfg.companyId); }
    private get clientId(): string     { return this.requiredEnv("PARASUT_CLIENT_ID",     this.cfg.clientId); }
    private get clientSecret(): string { return this.requiredEnv("PARASUT_CLIENT_SECRET", this.cfg.clientSecret); }

    // ── Alt seviye istek ─────────────────────────────────────────────────────

    private async send(
        url: string,
        init: RequestInit,
        opLabel: string,
    ): Promise<{ status: number; body: unknown; headers: Headers }> {
        let response: Response;
        try {
            response = await this.doFetch(url, {
                ...init,
                signal: AbortSignal.timeout(this.timeoutMs),
            });
        } catch (err) {
            // Ağ/timeout → geçici sınıf; backoff ile yeniden denenir.
            const reason = err instanceof Error ? err.message : String(err);
            throw new ParasutError("network", `Paraşüt ağ hatası (${opLabel}): ${reason}`);
        }

        const text = await response.text().catch(() => "");
        let body: unknown = null;
        if (text) {
            try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 500) }; }
        }

        if (!response.ok) {
            const kind = classifyHttpStatus(response.status);
            const message = extractApiErrorMessage(body, `HTTP ${response.status}`);
            const retryAfter = kind === "rate_limit"
                ? parseRetryAfter(response.headers.get("retry-after"))
                : undefined;
            throw new ParasutError(kind, `Paraşüt ${opLabel} başarısız (${response.status}): ${message}`, retryAfter);
        }

        return { status: response.status, body, headers: response.headers };
    }

    /** Kimlik doğrulamalı JSON:API isteği. */
    private async api(
        method: "GET" | "POST" | "PUT" | "DELETE",
        path: string,
        opts: { query?: Record<string, string | number | undefined>; payload?: unknown; op: string },
    ): Promise<JsonApiDocument> {
        const token = await this.cfg.getAccessToken();
        const url = new URL(`${this.baseUrl}/${this.companyId}${path}`);
        for (const [k, v] of Object.entries(opts.query ?? {})) {
            if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
        }

        const headers: Record<string, string> = {
            Authorization: `Bearer ${token}`,
            Accept:        "application/json",
        };
        if (opts.payload !== undefined) headers["Content-Type"] = "application/json";

        const { body } = await this.send(
            url.toString(),
            { method, headers, body: opts.payload === undefined ? undefined : JSON.stringify(opts.payload) },
            opts.op,
        );
        return (body ?? {}) as JsonApiDocument;
    }

    // ── OAuth ────────────────────────────────────────────────────────────────

    private async tokenRequest(form: Record<string, string>, op: string): Promise<OAuthTokens> {
        const params = new URLSearchParams({
            client_id:     this.clientId,
            client_secret: this.clientSecret,
            ...form,
        });

        const { body } = await this.send(
            this.oauthUrl,
            {
                method:  "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
                body:    params.toString(),
            },
            op,
        );

        const payload = (body ?? {}) as {
            access_token?: unknown; refresh_token?: unknown; expires_in?: unknown;
        };
        const accessToken  = str(payload.access_token);
        const refreshToken = str(payload.refresh_token);
        if (!accessToken || !refreshToken) {
            // Jeton gelmediyse yeniden denemek fayda etmez → auth sınıfı.
            throw new ParasutError("auth", `Paraşüt ${op}: access_token/refresh_token yanıtta yok`);
        }
        const expiresInSec = num(payload.expires_in) ?? 7200;

        return {
            access_token:  accessToken,
            refresh_token: refreshToken,
            expires_at:    new Date(Date.now() + expiresInSec * 1000).toISOString(),
        };
    }

    async exchangeAuthCode(code: string, redirectUri: string): Promise<OAuthTokens> {
        return this.tokenRequest(
            { grant_type: "authorization_code", code, redirect_uri: redirectUri },
            "exchangeAuthCode",
        );
    }

    async refreshToken(refreshToken: string): Promise<OAuthTokens> {
        // DİKKAT: burada getAccessToken ÇAĞRILMAZ — sonsuz özyineleme olurdu.
        // Jeton yenileme yalnız client_id/secret + refresh_token ile yapılır.
        return this.tokenRequest(
            { grant_type: "refresh_token", refresh_token: refreshToken },
            "refreshToken",
        );
    }

    // ── Contact ──────────────────────────────────────────────────────────────

    async findContactsByTaxNumber(taxNumber: string): Promise<ParasutContact[]> {
        const doc = await this.api("GET", "/contacts", {
            query: { "filter[tax_number]": taxNumber, "page[size]": 25 },
            op:    "findContactsByTaxNumber",
        });
        return asList(doc).map(toContact);
    }

    async findContactsByEmail(email: string): Promise<ParasutContact[]> {
        const doc = await this.api("GET", "/contacts", {
            query: { "filter[email]": email, "page[size]": 25 },
            op:    "findContactsByEmail",
        });
        return asList(doc).map(toContact);
    }

    async createContact(input: ContactInput): Promise<ParasutContact> {
        const doc = await this.api("POST", "/contacts", {
            op: "createContact",
            payload: {
                data: {
                    type: "contacts",
                    attributes: {
                        name:         input.name,
                        tax_number:   input.tax_number,
                        tax_office:   input.tax_office,
                        email:        input.email,
                        // Müşteri/tedarikçi ayrımı Paraşüt'te contact üzerinde;
                        // varsayılan müşteri, tedarikçi Faz 13'te override eder.
                        account_type: input.account_type ?? "customer",
                        contact_type: "company",
                    },
                },
            },
        });
        return toContact(asSingle(doc));
    }

    async updateContact(id: string, patch: Partial<ContactInput>): Promise<ParasutContact> {
        const doc = await this.api("PUT", `/contacts/${encodeURIComponent(id)}`, {
            op: "updateContact",
            payload: {
                data: {
                    id,
                    type: "contacts",
                    attributes: {
                        ...(patch.name       !== undefined ? { name:       patch.name }       : {}),
                        ...(patch.tax_number !== undefined ? { tax_number: patch.tax_number } : {}),
                        ...(patch.tax_office !== undefined ? { tax_office: patch.tax_office } : {}),
                        ...(patch.email      !== undefined ? { email:      patch.email }      : {}),
                    },
                },
            },
        });
        return toContact(asSingle(doc));
    }

    // ── Product ──────────────────────────────────────────────────────────────

    async findProductsByCode(code: string): Promise<ParasutProduct[]> {
        const doc = await this.api("GET", "/products", {
            query: { "filter[code]": code, "page[size]": 25 },
            op:    "findProductsByCode",
        });
        return asList(doc).map(toProduct);
    }

    async createProduct(input: ProductInput): Promise<ParasutProduct> {
        const doc = await this.api("POST", "/products", {
            op: "createProduct",
            payload: {
                data: {
                    type: "products",
                    attributes: {
                        code:        input.code,
                        name:        input.name,
                        sales_price: input.sales_price,
                        vat_rate:    input.vat_rate,
                    },
                },
            },
        });
        return toProduct(asSingle(doc));
    }

    // ── Sales invoice ────────────────────────────────────────────────────────

    async findSalesInvoicesByNumber(series: string, numberInt: number): Promise<ParasutInvoice[]> {
        const doc = await this.api("GET", "/sales_invoices", {
            query: {
                "filter[invoice_series]": series,
                "filter[invoice_id]":     numberInt,
                "page[size]":             25,
            },
            op: "findSalesInvoicesByNumber",
        });
        // Filtreler sunucuda uygulanır; yine de yerel doğrulama yapılır —
        // yanlış eşleşen bir kaydı "mevcut fatura" sanmak mükerrer/eksik
        // faturaya yol açardı (deterministik numara sözleşmesi burada korunur).
        return asList(doc)
            .map(toInvoice)
            .filter(inv => inv.attributes.invoice_series === series && inv.attributes.invoice_id === numberInt);
    }

    async createSalesInvoice(input: InvoiceInput): Promise<ParasutInvoice> {
        assertSalesInvoiceStockInvariant(input);

        const doc = await this.api("POST", "/sales_invoices", {
            op: "createSalesInvoice",
            payload: {
                data: {
                    type: "sales_invoices",
                    attributes: {
                        item_type:         "invoice",
                        description:       input.description,
                        issue_date:        input.issue_date,
                        due_date:          input.due_date,
                        invoice_series:    input.invoice_series,
                        invoice_id:        input.invoice_id,
                        currency:          input.currency,
                        // Dövizli faturada ERP'nin TCMB kuru; çözülemezse alan
                        // hiç gönderilmez → Paraşüt kendi kurunu uygular.
                        ...(input.exchange_rate !== undefined ? { exchange_rate: input.exchange_rate } : {}),
                        // ERP sipariş numarası resmî alanda (yalnız description'da değil).
                        ...(input.order_no   !== undefined ? { order_no:   input.order_no }   : {}),
                        ...(input.order_date !== undefined ? { order_date: input.order_date } : {}),
                        // STOK INVARIANT: irsaliye ayrı belgede kesilir.
                        shipment_included: false,
                    },
                    relationships: {
                        contact: { data: { id: input.contact_id, type: "contacts" } },
                        details: {
                            data: input.details.map(d => ({
                                type: "sales_invoice_details",
                                attributes: {
                                    quantity:       d.quantity,
                                    unit_price:     d.unit_price,
                                    vat_rate:       d.vat_rate,
                                    description:    d.description,
                                    ...(d.discount_type  !== undefined ? { discount_type:  d.discount_type }  : {}),
                                    ...(d.discount_value !== undefined ? { discount_value: d.discount_value } : {}),
                                },
                                relationships: d.product_id
                                    ? { product: { data: { id: d.product_id, type: "products" } } }
                                    : {},
                                // warehouse: KASITLI OLARAK YOK — stok invariant
                            })),
                        },
                    },
                },
            },
        });
        return toInvoice(asSingle(doc));
    }

    async getSalesInvoiceWithActiveEDocument(id: string): Promise<ParasutInvoiceWithEDocument> {
        const doc = await this.api("GET", `/sales_invoices/${encodeURIComponent(id)}`, {
            query: { include: "active_e_document" },
            op:    "getSalesInvoiceWithActiveEDocument",
        });
        const res = asSingle(doc);
        const invoice = toInvoice(res);

        const eDocId = relId(res, "active_e_document");
        let activeEDocument: ParasutEDocument | null = null;
        if (eDocId) {
            const included = findIncluded(doc, eDocId, ["e_invoices", "e_archives"]);
            activeEDocument = {
                id:   eDocId,
                // `included` gelmezse tip çözülemez; e-arşiv varsayılanı orkestrada
                // zaten güvenli taraf (yanlış tip yalnız rozet metnini etkiler).
                type: (included?.type as "e_invoices" | "e_archives") ?? "e_archives",
                attributes: { status: str(included?.attributes?.status) ?? "done" },
            };
        }

        return { ...invoice, active_e_document: activeEDocument };
    }

    // ── Shipment document ────────────────────────────────────────────────────

    async listRecentShipmentDocuments(page: number, pageSize: number): Promise<ParasutShipmentDocument[]> {
        const doc = await this.api("GET", "/shipment_documents", {
            query: {
                "page[number]": page,
                // Paraşüt page[size] üst sınırı 25.
                "page[size]":   Math.min(Math.max(pageSize, 1), 25),
                sort:           "-id",
            },
            op: "listRecentShipmentDocuments",
        });
        return asList(doc).map(toShipment);
    }

    async createShipmentDocument(input: ShipmentDocInput): Promise<ParasutShipmentDocument> {
        assertShipmentDocumentInvariant(input);

        const doc = await this.api("POST", "/shipment_documents", {
            op: "createShipmentDocument",
            payload: {
                data: {
                    type: "shipment_documents",
                    attributes: {
                        inflow:             input.inflow,
                        issue_date:         input.issue_date,
                        shipment_date:      input.shipment_date,
                        procurement_number: input.procurement_number,
                        description:        input.description,
                        ...(input.city     ? { city:     input.city }     : {}),
                        ...(input.district ? { district: input.district } : {}),
                        ...(input.address  ? { address:  input.address }  : {}),
                    },
                    relationships: {
                        contact: { data: { id: input.contact_id, type: "contacts" } },
                        // İrsaliye kalemleri Paraşüt'te stok hareketidir —
                        // Paraşüt stoğu TEK KAPIDAN buradan hareket eder.
                        stock_movements: {
                            data: input.details.map(d => ({
                                type: "stock_movements",
                                attributes: {
                                    quantity:    d.quantity,
                                    description: d.description,
                                },
                                relationships: {
                                    product: { data: { id: d.product_id, type: "products" } },
                                    ...(d.warehouse_id
                                        ? { warehouse: { data: { id: d.warehouse_id, type: "warehouses" } } }
                                        : {}),
                                },
                            })),
                        },
                    },
                },
            },
        });
        return toShipment(asSingle(doc));
    }

    // ── Purchase bill (alış faturası) ────────────────────────────────────────

    async listPurchaseBillsBySupplier(
        supplierId: string, page: number, pageSize: number,
    ): Promise<ParasutPurchaseBill[]> {
        const doc = await this.api("GET", "/purchase_bills", {
            query: {
                "filter[supplier_id]": supplierId,
                "page[number]":        page,
                "page[size]":          Math.min(Math.max(pageSize, 1), 25),
                sort:                  "-id",
            },
            op: "listPurchaseBillsBySupplier",
        });
        return asList(doc).map(toPurchaseBill);
    }

    async createPurchaseBill(input: PurchaseBillInput): Promise<ParasutPurchaseBill> {
        assertPurchaseBillStockInvariant(input);

        // `#detailed` biçimi: kalemler `details` ilişkisinde; toplamlar Paraşüt'te
        // hesaplanır (basic biçimde net_total/total_vat elle verilirdi).
        const doc = await this.api("POST", "/purchase_bills", {
            op: "createPurchaseBill",
            payload: {
                data: {
                    type: "purchase_bills",
                    attributes: {
                        item_type:   "purchase_bill",
                        description: input.description,
                        issue_date:  input.issue_date,
                        due_date:    input.due_date,
                        currency:    input.currency,
                        ...(input.invoice_no    ? { invoice_no:    input.invoice_no }    : {}),
                        ...(input.exchange_rate !== undefined ? { exchange_rate: input.exchange_rate } : {}),
                    },
                    relationships: {
                        supplier: { data: { id: input.supplier_id, type: "contacts" } },
                        details: {
                            data: input.details.map(d => ({
                                type: "purchase_bill_details",
                                attributes: {
                                    quantity:    d.quantity,
                                    unit_price:  d.unit_price,
                                    vat_rate:    d.vat_rate,
                                    description: d.description,
                                    ...(d.discount_type  !== undefined ? { discount_type:  d.discount_type }  : {}),
                                    ...(d.discount_value !== undefined ? { discount_value: d.discount_value } : {}),
                                },
                                relationships: d.product_id
                                    ? { product: { data: { id: d.product_id, type: "products" } } }
                                    : {},
                                // warehouse: KASITLI OLARAK YOK — stok invariant
                            })),
                        },
                    },
                },
            },
        });
        return toPurchaseBill(asSingle(doc));
    }

    // ── Stok mutabakatı ──────────────────────────────────────────────────────

    async listInventoryLevels(productId: string): Promise<ParasutInventoryLevel[]> {
        // Not: bu uç `/{company}/product/{id}/inventory_levels` (tekil "product")
        // — diğer uçlardaki "products" çoğulundan FARKLI. Spec böyle.
        const doc = await this.api("GET", `/product/${encodeURIComponent(productId)}/inventory_levels`, {
            query: { "page[size]": 25 },
            op:    "listInventoryLevels",
        });
        return asList(doc).map(toInventoryLevel);
    }

    async createStockUpdate(details: StockUpdateDetailInput[]): Promise<{ id: string }> {
        if (details.length === 0) {
            throw new ParasutError("validation", "createStockUpdate: en az bir kalem gerekli");
        }
        const doc = await this.api("POST", "/stock_updates", {
            op: "createStockUpdate",
            payload: {
                data: {
                    type: "stock_updates",
                    attributes: {},
                    relationships: {
                        details: {
                            data: details.map(d => ({
                                type: "stock_update_details",
                                // MUTLAK atama — Paraşüt stoğu bu değere EŞİTLENİR.
                                attributes: { new_total_inventory: d.new_total_inventory },
                                relationships: {
                                    product: { data: { id: d.product_id, type: "products" } },
                                    ...(d.warehouse_id
                                        ? { warehouse: { data: { id: d.warehouse_id, type: "warehouses" } } }
                                        : {}),
                                },
                            })),
                        },
                    },
                },
            },
        });
        return { id: String(asSingle(doc).id ?? "") };
    }

    // ── Tahsilat / ödeme durumu ──────────────────────────────────────────────

    async getSalesInvoicePaymentState(id: string): Promise<ParasutPaymentState> {
        const doc = await this.api("GET", `/sales_invoices/${encodeURIComponent(id)}`, {
            op: "getSalesInvoicePaymentState",
        });
        return toPaymentState(asSingle(doc));
    }

    async getPurchaseBillPaymentState(id: string): Promise<ParasutPaymentState> {
        const doc = await this.api("GET", `/purchase_bills/${encodeURIComponent(id)}`, {
            op: "getPurchaseBillPaymentState",
        });
        return toPaymentState(asSingle(doc));
    }

    // ── E-fatura mükellef kontrolü ───────────────────────────────────────────

    async listEInvoiceInboxesByVkn(vkn: string): Promise<ParasutEInvoiceInbox[]> {
        const doc = await this.api("GET", "/e_invoice_inboxes", {
            query: { "filter[vkn]": vkn },
            op:    "listEInvoiceInboxesByVkn",
        });
        return asList(doc).map(toInbox);
    }

    // ── E-belge ──────────────────────────────────────────────────────────────

    async createEInvoice(salesInvoiceId: string, input: EInvoiceInput): Promise<{ trackable_job_id: string }> {
        const doc = await this.api("POST", "/e_invoices", {
            op: "createEInvoice",
            payload: {
                data: {
                    type: "e_invoices",
                    // issue_date SPEC'TE readOnly — forma konmaz, faturadan miras alınır.
                    attributes: { scenario: input.scenario, ...(input.to ? { to: input.to } : {}) },
                    // e-Fatura ilişki anahtarı: `invoice` (e-arşivde `sales_invoice`).
                    relationships: { invoice: { data: { id: salesInvoiceId, type: "sales_invoices" } } },
                },
            },
        });
        return { trackable_job_id: String(asSingle(doc).id ?? "") };
    }

    async createEArchive(salesInvoiceId: string, _input: EArchiveInput): Promise<{ trackable_job_id: string }> {
        const doc = await this.api("POST", "/e_archives", {
            op: "createEArchive",
            payload: {
                data: {
                    type: "e_archives",
                    // `internet_sale` spec'te OBJE (url/payment_type/…) ve yalnız
                    // gerçek internet satışında zorunlu. B2B vana satışında
                    // gönderilmez — boolean gönderilseydi 422 alınırdı.
                    attributes: {},
                    relationships: { sales_invoice: { data: { id: salesInvoiceId, type: "sales_invoices" } } },
                },
            },
        });
        return { trackable_job_id: String(asSingle(doc).id ?? "") };
    }

    async getTrackableJob(id: string): Promise<{ status: "running" | "done" | "error"; errors?: string[] }> {
        const doc = await this.api("GET", `/trackable_jobs/${encodeURIComponent(id)}`, {
            op: "getTrackableJob",
        });
        const res = asSingle(doc);
        const raw = str(res.attributes?.status) ?? "running";
        const errors = Array.isArray(res.attributes?.errors)
            ? (res.attributes.errors as unknown[]).map(e => (typeof e === "string" ? e : JSON.stringify(e)))
            : undefined;
        return { status: normalizeJobStatus(raw), ...(errors && errors.length > 0 ? { errors } : {}) };
    }
}

// ── Paylaşılan invariant guard'ları ──────────────────────────────────────────
//
// Mock adapter aynı kuralları kendi içinde uyguluyordu; gerçek adapter'da da
// AYNI hata mesajları üretilmeli — `upsertInvoice` catch bloğu bu metinleri
// regex ile tanıyıp critical "stok invariant ihlali" alert'i açıyor.

export function assertSalesInvoiceStockInvariant(input: InvoiceInput): void {
    if (input.shipment_included !== false) {
        throw new ParasutError("validation", "createSalesInvoice: shipment_included MUST be false");
    }
    for (const d of input.details) {
        if ("warehouse" in d || "warehouse_id" in d) {
            throw new ParasutError("validation", "createSalesInvoice: detail must NOT contain warehouse (stok invariant)");
        }
    }
}

export function assertPurchaseBillStockInvariant(input: PurchaseBillInput): void {
    for (const d of input.details) {
        if ("warehouse" in d || "warehouse_id" in d) {
            throw new ParasutError("validation", "createPurchaseBill: detail must NOT contain warehouse (stok invariant)");
        }
    }
}

export function assertShipmentDocumentInvariant(input: ShipmentDocInput): void {
    if (input.inflow !== false) {
        throw new ParasutError("validation", "createShipmentDocument: inflow MUST be false for sales");
    }
    if (!input.procurement_number) {
        throw new ParasutError("validation", "createShipmentDocument: procurement_number is required");
    }
}

/**
 * TrackableJob durumu. Spec enum'u `running|done|error` — ama Paraşüt pratikte
 * `pending` de döndürebiliyor (narrative'de geçer, enum'da yok). Bilinmeyen her
 * değer `running` sayılır: poll CRON tekrar bakar, veri kaybı olmaz.
 */
export function normalizeJobStatus(raw: string): "running" | "done" | "error" {
    if (raw === "done" || raw === "error" || raw === "running") return raw;
    return "running";
}
