/**
 * Paraşüt Integration Service — domain-rules §10
 * ERP → Paraşüt fatura sync.
 * Paraşüt muhasebe/fatura durumunun authoritative kaynağıdır (§10.1).
 * ERP stok/sipariş durumunu değiştirmez — sadece fatura durumunu senkronize eder.
 */

import { dbGetOrderById } from "@/lib/supabase/orders";
import { dbGetCustomerById } from "@/lib/supabase/customers";
import { dbGetProductById } from "@/lib/supabase/products";
import { dbCreateSyncLog, dbGetSyncLog, dbUpdateSyncLog } from "@/lib/supabase/sync-log";
import { dbCreateAlert } from "@/lib/supabase/alerts";
import { getParasutAdapter } from "@/lib/parasut";
import { createServiceClient } from "@/lib/supabase/service";
import { ParasutError } from "@/lib/parasut-adapter";
import { parasutApiCall } from "@/lib/services/parasut-api-call";
import {
    ALERT_ENTITY_PARASUT_AUTH,
    ALERT_ENTITY_PARASUT_SHIPMENT,
    ALERT_ENTITY_PARASUT_INVOICE,
    ALERT_ENTITY_PARASUT_E_DOC,
    ALERT_ENTITY_PARASUT_STOCK_INVARIANT,
    PARASUT_INVOICE_SERIES,
} from "@/lib/parasut-constants";
import type { OrderWithLines } from "@/lib/supabase/orders";
import type { SalesOrderRow, ParasutInvoiceType, ParasutEDocStatus } from "@/lib/database.types";
import type { ParasutStep } from "@/lib/database.types";
import type { ParasutShipmentDocument, ParasutInvoice, ParasutEDocument } from "@/lib/parasut-adapter";

// ── Mapping ──────────────────────────────────────────────────

export function mapCurrency(c: string): "TRL" | "USD" | "EUR" | "GBP" {
    if (c === "USD") return "USD";
    if (c === "EUR") return "EUR";
    if (c === "GBP") return "GBP";
    return "TRL";
}

/**
 * "ORD-2026-0042" → 20260042 (deterministik Paraşüt invoice_id)
 * Kural: yıl 4 hane, numara padStart(4,'0'). Kötü format → ParasutError('validation').
 * Date.now() fallback YOK — idempotency bozar.
 */
export function parasutInvoiceNumberInt(orderNumber: string): number {
    const m = orderNumber.match(/^ORD-(\d{4})-(\d+)$/);
    if (!m) {
        throw new ParasutError(
            "validation",
            `order_number formatı Paraşüt için uygun değil: ${orderNumber}`,
        );
    }
    return parseInt(m[1] + m[2].padStart(4, "0"), 10);
}

// ── Enable guard ─────────────────────────────────────────────
function isParasutEnabled(): boolean {
    return process.env.PARASUT_ENABLED === "true";
}

// ── Error classification + backoff ───────────────────────────

/**
 * Maps a ParasutError to a DB patch for the current step.
 * Pure function — no side effects.
 */
export function classifyAndPatch(
    order: Pick<SalesOrderRow, "parasut_retry_count">,
    step: ParasutStep,
    pe: ParasutError,
): Partial<SalesOrderRow> {
    const patch: Partial<SalesOrderRow> = {
        parasut_error:           pe.message,
        parasut_error_kind:      pe.kind,
        parasut_last_failed_step: step,
        parasut_step:            step,
    };

    if (step === "shipment") patch.parasut_shipment_error        = pe.message;
    else if (step === "invoice") patch.parasut_invoice_error     = pe.message;
    else if (step === "edoc")    patch.parasut_e_document_error  = pe.message;

    if (pe.kind === "rate_limit") {
        patch.parasut_next_retry_at = new Date(Date.now() + (pe.retryAfterSec ?? 30) * 1000).toISOString();
    } else if (pe.kind === "auth" || pe.kind === "validation") {
        patch.parasut_next_retry_at = new Date("2099-01-01T00:00:00Z").toISOString();
    } else {
        patch.parasut_retry_count = order.parasut_retry_count + 1;
        if (patch.parasut_retry_count >= 5) {
            patch.parasut_next_retry_at = new Date("2099-01-01T00:00:00Z").toISOString();
        } else {
            const backoff = Math.min(30 * 60, 30 * 2 ** patch.parasut_retry_count);
            patch.parasut_next_retry_at = new Date(
                Date.now() + (backoff + Math.random() * 5) * 1000,
            ).toISOString();
        }
    }
    return patch;
}

// ── Step success ─────────────────────────────────────────────

export async function markStepDone(orderId: string, step: ParasutStep, nextStep: ParasutStep): Promise<void> {
    const supabase = createServiceClient();
    const { error: dbErr } = await supabase
        .from("sales_orders")
        .update({
            parasut_step:             nextStep,
            parasut_error:            null,
            parasut_error_kind:       null,
            parasut_next_retry_at:    null,
            parasut_retry_count:      0,
            parasut_last_failed_step: null,
            ...(step === "shipment" ? { parasut_shipment_error: null, parasut_shipment_synced_at: new Date().toISOString() } : {}),
            ...(step === "invoice"  ? { parasut_invoice_error:  null, parasut_invoice_synced_at:  new Date().toISOString() } : {}),
            ...(step === "edoc"     ? { parasut_e_document_error: null } : {}),
        })
        .eq("id", orderId);

    if (dbErr) throw new Error(`markStepDone DB update failed (order=${orderId}, step=${step}): ${dbErr.message}`);

    await dbCreateSyncLog({
        entity_type: "sales_order",
        entity_id:   orderId,
        direction:   "push",
        status:      "success",
        step,
        metadata:    { next_step: nextStep },
    });
}

// ── Auth alert threshold ─────────────────────────────────────

export async function checkAuthAlertThreshold(): Promise<void> {
    const supabase  = createServiceClient();
    const oneHourAgo = new Date(Date.now() - 3600 * 1000).toISOString();
    const { count } = await supabase
        .from("integration_sync_logs")
        .select("id", { count: "exact", head: true })
        .eq("error_kind", "auth")
        .gte("requested_at", oneHourAgo);

    if ((count ?? 0) >= 3) {
        await dbCreateAlert({
            type:        "sync_issue",
            severity:    "critical",
            title:       "Paraşüt auth hatası",
            description: `Son 1 saatte ${count ?? 0} auth hatası tespit edildi — OAuth yeniden doğrulama gerekebilir.`,
            entity_type: "parasut",
            entity_id:   ALERT_ENTITY_PARASUT_AUTH,
            source:      "system",
        });
    }
}

// ── Contact upsert ───────────────────────────────────────────

/**
 * Ensures the customer has a Paraşüt contact ID.
 * Idempotent: if parasut_contact_id already set, returns immediately.
 * Returns the resolved Paraşüt contact ID.
 */
export async function serviceEnsureParasutContact(customerId: string): Promise<string> {
    const customer = await dbGetCustomerById(customerId);
    if (!customer) throw new ParasutError("not_found", `Customer ${customerId} not found`);

    if (customer.parasut_contact_id) return customer.parasut_contact_id;

    const taxNumber = customer.tax_number?.trim() ?? "";
    if (!taxNumber) {
        throw new ParasutError("validation", `Müşteri ${customer.name} için vergi numarası zorunlu (Paraşüt sync)`);
    }

    const adapter = getParasutAdapter();
    const supabase = createServiceClient();

    // Find-match paths: contact already exists in Paraşüt, just record the ID.
    async function writeContactId(contactId: string): Promise<void> {
        const { error: dbErr } = await supabase.from("customers").update({
            parasut_contact_id: contactId,
            parasut_synced_at:  new Date().toISOString(),
        }).eq("id", customerId);
        if (dbErr) throw new Error(`customers update failed (id=${customerId}): ${dbErr.message}`);
    }

    // Create paths use a DB mutex (TTL lease) to prevent two parallel callers from both
    // reaching createContact. Mirrors the OAuth refresh_lock_until/refresh_lock_owner pattern.
    // parasut_contact_id stays clean: always NULL or a real Paraşüt UUID.
    const LEASE_TTL_MS = 60_000;
    const owner = crypto.randomUUID();

    // Atomically claim the lease (WHERE contact IS NULL AND lease expired-or-absent).
    // Returns { claimed: true } if we own the slot.
    // Returns { claimed: false, existingId } if another caller already finished.
    // Throws ParasutError('server') if another caller holds an active lease → retryable.
    async function claimOrSkip(): Promise<{ claimed: true } | { claimed: false; existingId: string }> {
        const leaseUntil = new Date(Date.now() + LEASE_TTL_MS).toISOString();
        const nowISO     = new Date().toISOString();
        const { data: rows, error } = await supabase
            .from("customers")
            .update({ parasut_contact_creating_until: leaseUntil, parasut_contact_creating_owner: owner })
            .eq("id", customerId)
            .is("parasut_contact_id", null)
            .or(`parasut_contact_creating_until.is.null,parasut_contact_creating_until.lt.${nowISO}`)
            .select("id");
        if (error) throw new Error(`customers claim failed (id=${customerId}): ${error.message}`);
        if (rows && rows.length > 0) return { claimed: true };
        const refreshed = await dbGetCustomerById(customerId);
        if (refreshed?.parasut_contact_id) return { claimed: false, existingId: refreshed.parasut_contact_id };
        // Another worker holds an active lease — CRON will retry
        throw new ParasutError("server", `Contact creation in progress (customer=${customerId}), will retry`);
    }

    // Owner-gated write: only succeeds if our lease is still current.
    // 0 rows → lease was taken over (possible orphan contact in Paraşüt).
    async function finishCreate(contactId: string): Promise<void> {
        const { data: rows, error } = await supabase
            .from("customers")
            .update({
                parasut_contact_id:              contactId,
                parasut_synced_at:               new Date().toISOString(),
                parasut_contact_creating_until:  null,
                parasut_contact_creating_owner:  null,
            })
            .eq("id", customerId)
            .eq("parasut_contact_creating_owner", owner)
            .select("id");
        if (error) throw new Error(`customers finish failed (id=${customerId}): ${error.message}`);
        if (!rows || rows.length === 0) {
            throw new ParasutError("server", `Lease lost for customer=${customerId} during create — possible orphan contact ${contactId}`);
        }
    }

    async function releaseCreate(): Promise<void> {
        // Best-effort: if this fails, the lease will expire via TTL on the next attempt.
        try {
            await supabase
                .from("customers")
                .update({ parasut_contact_creating_until: null, parasut_contact_creating_owner: null })
                .eq("id", customerId)
                .eq("parasut_contact_creating_owner", owner);
        } catch { /* best-effort */ }
    }

    const byTax = await parasutApiCall({ op: "findContactsByTaxNumber", step: "contact" as const }, () =>
        adapter.findContactsByTaxNumber(taxNumber),
    );

    if (byTax.length > 1) {
        throw new ParasutError("validation", `Paraşüt'te ${taxNumber} VKN ile birden fazla kontakt var — manuel inceleme gerekli`);
    }

    if (byTax.length === 1) {
        await writeContactId(byTax[0].id);
        return byTax[0].id;
    }

    // 0 tax matches — email fallback
    if (!customer.email) {
        const claim = await claimOrSkip();
        if (!claim.claimed) return claim.existingId;
        try {
            const created = await parasutApiCall({ op: "createContact", step: "contact" as const }, () =>
                adapter.createContact({
                    name:       customer.name,
                    tax_number: taxNumber,
                    tax_office: customer.tax_office ?? undefined,
                }),
            );
            await finishCreate(created.id);
            return created.id;
        } catch (err) {
            await releaseCreate();
            throw err;
        }
    }

    const byEmail = await parasutApiCall({ op: "findContactsByEmail", step: "contact" as const }, () =>
        adapter.findContactsByEmail(customer.email as string),
    );

    if (byEmail.length > 1) {
        throw new ParasutError("validation", `Paraşüt'te ${customer.email} e-posta ile birden fazla kontakt var — manuel inceleme gerekli`);
    }

    if (byEmail.length === 1) {
        const found = byEmail[0];
        const existingTax = found.attributes.tax_number;
        if (existingTax !== null && existingTax !== "" && existingTax !== taxNumber) {
            throw new ParasutError(
                "validation",
                `E-posta eşleşti (${customer.email}) ama Paraşüt kontağının VKN'si farklı (${existingTax} ≠ ${taxNumber}) — veri bozulma riski, manuel müdahale`,
            );
        }
        await parasutApiCall({ op: "updateContact", step: "contact" as const }, () =>
            adapter.updateContact(found.id, { tax_number: taxNumber }),
        );
        await writeContactId(found.id);
        return found.id;
    }

    // 0 email matches — create new contact
    const claim = await claimOrSkip();
    if (!claim.claimed) return claim.existingId;
    try {
        const created = await parasutApiCall({ op: "createContact", step: "contact" as const }, () =>
            adapter.createContact({
                name:       customer.name,
                tax_number: taxNumber,
                email:      customer.email as string,
                tax_office: customer.tax_office ?? undefined,
            }),
        );
        await finishCreate(created.id);
        return created.id;
    } catch (err) {
        await releaseCreate();
        throw err;
    }
}

// ── Product upsert ───────────────────────────────────────────

/**
 * Ensures the product has a Paraşüt product ID.
 * Idempotent: if parasut_product_id already set, returns immediately.
 * Returns the resolved Paraşüt product ID.
 */
export async function serviceEnsureParasutProduct(productId: string): Promise<string> {
    const product = await dbGetProductById(productId);
    if (!product) throw new ParasutError("not_found", `Product ${productId} not found`);

    if (product.parasut_product_id) return product.parasut_product_id;

    const sku = product.sku?.trim() ?? "";
    if (!sku) {
        throw new ParasutError("validation", `Ürün ${product.name} için SKU zorunlu (Paraşüt sync)`);
    }

    const adapter = getParasutAdapter();
    const supabase = createServiceClient();

    // Find-match path: product already exists in Paraşüt, just record the ID.
    async function writeProductId(parasutId: string): Promise<void> {
        const { error: dbErr } = await supabase.from("products").update({
            parasut_product_id: parasutId,
            parasut_synced_at:  new Date().toISOString(),
        }).eq("id", productId);
        if (dbErr) throw new Error(`products update failed (id=${productId}): ${dbErr.message}`);
    }

    // TTL lease mutex — mirrors the contact pattern in serviceEnsureParasutContact.
    // parasut_product_id stays clean: always NULL or a real Paraşüt UUID.
    const LEASE_TTL_MS = 60_000;
    const owner = crypto.randomUUID();

    async function claimOrSkip(): Promise<{ claimed: true } | { claimed: false; existingId: string }> {
        const leaseUntil = new Date(Date.now() + LEASE_TTL_MS).toISOString();
        const nowISO     = new Date().toISOString();
        const { data: rows, error } = await supabase
            .from("products")
            .update({ parasut_product_creating_until: leaseUntil, parasut_product_creating_owner: owner })
            .eq("id", productId)
            .is("parasut_product_id", null)
            .or(`parasut_product_creating_until.is.null,parasut_product_creating_until.lt.${nowISO}`)
            .select("id");
        if (error) throw new Error(`products claim failed (id=${productId}): ${error.message}`);
        if (rows && rows.length > 0) return { claimed: true };
        const refreshed = await dbGetProductById(productId);
        if (refreshed?.parasut_product_id) return { claimed: false, existingId: refreshed.parasut_product_id };
        throw new ParasutError("server", `Product creation in progress (product=${productId}), will retry`);
    }

    async function finishCreate(parasutId: string): Promise<void> {
        const { data: rows, error } = await supabase
            .from("products")
            .update({
                parasut_product_id:              parasutId,
                parasut_synced_at:               new Date().toISOString(),
                parasut_product_creating_until:  null,
                parasut_product_creating_owner:  null,
            })
            .eq("id", productId)
            .eq("parasut_product_creating_owner", owner)
            .select("id");
        if (error) throw new Error(`products finish failed (id=${productId}): ${error.message}`);
        if (!rows || rows.length === 0) {
            throw new ParasutError("server", `Lease lost for product=${productId} during create — possible orphan product ${parasutId}`);
        }
    }

    async function releaseCreate(): Promise<void> {
        try {
            await supabase
                .from("products")
                .update({ parasut_product_creating_until: null, parasut_product_creating_owner: null })
                .eq("id", productId)
                .eq("parasut_product_creating_owner", owner);
        } catch { /* best-effort */ }
    }

    const byCode = await parasutApiCall({ op: "findProductsByCode", step: "product" as const }, () =>
        adapter.findProductsByCode(sku),
    );

    if (byCode.length > 1) {
        throw new ParasutError("validation", `Paraşüt'te ${sku} kodu ile birden fazla ürün var — manuel inceleme gerekli`);
    }

    if (byCode.length === 1) {
        await writeProductId(byCode[0].id);
        return byCode[0].id;
    }

    // 0 matches — create new product
    const claim = await claimOrSkip();
    if (!claim.claimed) return claim.existingId;
    try {
        const created = await parasutApiCall({ op: "createProduct", step: "product" as const }, () =>
            adapter.createProduct({
                code:        sku,
                name:        product.name,
                sales_price: product.price ?? undefined,
                vat_rate:    20,
            }),
        );
        await finishCreate(created.id);
        return created.id;
    } catch (err) {
        await releaseCreate();
        throw err;
    }
}

// ── Faz 8: Shipment document ─────────────────────────────────

async function dbWriteShipmentMeta(orderId: string, ship: ParasutShipmentDocument): Promise<void> {
    const supabase = createServiceClient();
    const { error } = await supabase
        .from("sales_orders")
        .update({
            parasut_shipment_document_id: ship.id,
            parasut_shipment_synced_at:   new Date().toISOString(),
            parasut_shipment_error:       null,
        })
        .eq("id", orderId);
    if (error) throw new Error(`dbWriteShipmentMeta hatası: ${error.message}`);
}

async function upsertShipment(order: OrderWithLines): Promise<void> {
    if (order.parasut_shipment_document_id) return; // idempotent

    const orderId  = order.id;
    const supabase = createServiceClient();
    const adapter  = getParasutAdapter();

    // Re-fetch customer for fresh city/district/address (order object may be stale)
    const customer = await dbGetCustomerById(order.customer_id!);
    if (!customer) {
        throw new ParasutError("not_found", `Müşteri bulunamadı: ${order.customer_id}`);
    }
    if (!customer.parasut_contact_id) {
        throw new ParasutError(
            "validation",
            "Müşteri Paraşüt contact ID eksik — önce contact upsert gerekli",
        );
    }

    const hasAttemptedBefore = !!order.parasut_shipment_create_attempted_at;

    // Remote recovery — Paraşüt API'sinde procurement_number filtresi yok
    // → tüm son belgeler listelenir, local filter uygulanır (max 5 sayfa, env ile artırılabilir)
    const maxPages = Math.min(20, parseInt(process.env.PARASUT_SHIPMENT_RECOVERY_MAX_PAGES ?? "5", 10));
    let found: ParasutShipmentDocument | null = null;
    for (let p = 1; p <= maxPages; p++) {
        const list = await parasutApiCall(
            { op: "listRecentShipmentDocuments", orderId, step: "shipment" as const },
            () => adapter.listRecentShipmentDocuments(p, 25),
        );
        if (list.length === 0) break;
        const hit = list.find(s => s.attributes.procurement_number === order.order_number);
        if (hit) { found = hit; break; }
        if (list.length < 25) break;
    }

    if (found) {
        await dbWriteShipmentMeta(orderId, found);
        return;
    }

    if (hasAttemptedBefore) {
        // Alert best-effort — yazım hatası manual review semantiğini maskelemez
        try {
            await dbCreateAlert({
                type:        "sync_issue",
                severity:    "critical",
                title:       "Shipment belgesi manuel inceleme gerekli",
                description: `Shipment create attempted ${order.parasut_shipment_create_attempted_at} ama DB ID yok + local recovery negatif → duplicate riski, manuel inceleme gerekli`,
                entity_type: "parasut",
                entity_id:   ALERT_ENTITY_PARASUT_SHIPMENT,
                source:      "system",
            });
        } catch (alertErr) {
            console.error(JSON.stringify({ parasut_alert_fail: String(alertErr), orderId }));
        }
        throw new ParasutError(
            "validation",
            "Shipment manual review gerekli — duplicate riski (önceki attempt marker + recovery negatif)",
        );
    }

    // Ürün Paraşüt ID'lerini yükle (OrderLineRow'da yok — her satır için re-fetch)
    // Tüm validasyonlar create çağrısından ÖNCE tamamlanmalı; marker sadece gerçekten
    // create'e gidileceği noktada yazılır (eksik product_id gibi kalıcı hatalar marker bırakmaz)
    const details: Array<{ quantity: number; product_id: string; description: string }> = [];
    for (const line of order.lines) {
        const product = await dbGetProductById(line.product_id);
        if (!product) {
            throw new ParasutError("not_found", `Ürün bulunamadı: ${line.product_id}`);
        }
        if (!product.parasut_product_id) {
            throw new ParasutError(
                "validation",
                `Ürün Paraşüt product ID eksik: ${line.product_sku}`,
            );
        }
        details.push({
            quantity:    line.quantity,
            product_id:  product.parasut_product_id,
            description: `${line.product_name} (${line.product_sku})`,
        });
    }

    const shippedAt = (order.shipped_at ?? order.created_at).slice(0, 10);
    const issueDate = new Date().toISOString().slice(0, 10);

    // Durable attempted marker — tüm validasyonlar geçtikten sonra, create çağrısından hemen önce yazılır.
    // Crash-before-DB-write senaryosu: sonraki retry hasAttemptedBefore=true görür, recovery pagination çalışır.
    // Marker bu noktada çünkü product/customer validation hatası create'i engellemez — marker kalsa
    // sonraki retry yanlışlıkla manual review'a düşer.
    const { error: markerErr } = await supabase
        .from("sales_orders")
        .update({ parasut_shipment_create_attempted_at: new Date().toISOString() })
        .eq("id", orderId);
    if (markerErr) throw new Error(`Shipment attempted marker yazılamadı: ${markerErr.message}`);

    const ship = await parasutApiCall(
        { op: "createShipmentDocument", orderId, step: "shipment" as const },
        () => adapter.createShipmentDocument({
            contact_id:         customer.parasut_contact_id!,
            issue_date:         issueDate,
            shipment_date:      shippedAt,
            inflow:             false,
            procurement_number: order.order_number,
            description:        `KokpitERP #${order.order_number}`,
            city:               customer.city     ?? undefined,
            district:           customer.district ?? undefined,
            address:            customer.address  ?? undefined,
            details,
        }),
    );

    await dbWriteShipmentMeta(orderId, ship);
}

// ── Faz 9: Sales invoice (stok invariant) ────────────────────

function computeDueDate(issueDate: string, paymentTermsDays: number): string {
    const d = new Date(issueDate + "T00:00:00.000Z");
    d.setUTCDate(d.getUTCDate() + paymentTermsDays);
    return d.toISOString().slice(0, 10);
}

async function dbWriteInvoiceMeta(
    orderId: string,
    invoice: ParasutInvoice,
    series: string,
    numberInt: number,
): Promise<void> {
    const supabase = createServiceClient();
    const nowISO   = new Date().toISOString();
    const { error } = await supabase
        .from("sales_orders")
        .update({
            parasut_invoice_id:         invoice.id,
            parasut_invoice_no:         invoice.attributes.invoice_no,
            parasut_invoice_series:     series,
            parasut_invoice_number_int: numberInt,
            parasut_invoice_synced_at:  nowISO,
            parasut_invoice_error:      null,
            parasut_sent_at:            nowISO, // legacy alan — UI api-mappers.ts hâlâ okuyor
        })
        .eq("id", orderId);
    if (error) throw new Error(`dbWriteInvoiceMeta hatası: ${error.message}`);
}

async function upsertInvoice(order: OrderWithLines): Promise<void> {
    if (order.parasut_invoice_id) return; // idempotent

    const orderId  = order.id;
    const supabase = createServiceClient();
    const adapter  = getParasutAdapter();

    const customer = await dbGetCustomerById(order.customer_id!);
    if (!customer) {
        throw new ParasutError("not_found", `Müşteri bulunamadı: ${order.customer_id}`);
    }
    if (!customer.parasut_contact_id) {
        throw new ParasutError(
            "validation",
            "Müşteri Paraşüt contact ID eksik — önce contact upsert gerekli",
        );
    }

    const series                    = PARASUT_INVOICE_SERIES;
    const numberInt                 = parasutInvoiceNumberInt(order.order_number);
    const hasInvoiceAttemptedBefore = !!order.parasut_invoice_create_attempted_at;

    // Fast remote lookup — series+number deterministik unique (Paraşüt spec onaylı filter)
    const existing = await parasutApiCall(
        { op: "findSalesInvoicesByNumber", orderId, step: "invoice" as const },
        () => adapter.findSalesInvoicesByNumber(series, numberInt),
    );
    if (existing.length > 0) {
        await dbWriteInvoiceMeta(orderId, existing[0], series, numberInt);
        return;
    }

    if (hasInvoiceAttemptedBefore) {
        // Alert best-effort — yazım hatası manual review semantiğini maskelemez
        try {
            await dbCreateAlert({
                type:        "sync_issue",
                severity:    "critical",
                title:       "Sales invoice manuel inceleme gerekli",
                description: `Invoice create attempted ${order.parasut_invoice_create_attempted_at} ama remote lookup negatif (series=${series}, number=${numberInt}) → beklenmedik durum, manuel kontrol`,
                entity_type: "parasut",
                entity_id:   ALERT_ENTITY_PARASUT_INVOICE,
                source:      "system",
            });
        } catch (alertErr) {
            console.error(JSON.stringify({ parasut_alert_fail: String(alertErr), orderId }));
        }
        throw new ParasutError(
            "validation",
            "Invoice manual review gerekli — attempted marker + lookup negatif (duplicate riski)",
        );
    }

    // Ürün Paraşüt ID'lerini yükle (OrderLineRow'da yok — her satır için re-fetch)
    // Tüm validasyonlar create öncesi tamamlanır; marker sadece create'e gidileceği noktada yazılır
    const details: Array<{
        quantity:       number;
        unit_price:     number;
        vat_rate:       number;
        discount_type:  "percentage";
        discount_value: number;
        description:    string;
        product_id:     string;
    }> = [];
    for (const line of order.lines) {
        const product = await dbGetProductById(line.product_id);
        if (!product) {
            throw new ParasutError("not_found", `Ürün bulunamadı: ${line.product_id}`);
        }
        if (!product.parasut_product_id) {
            throw new ParasutError(
                "validation",
                `Ürün Paraşüt product ID eksik: ${line.product_sku}`,
            );
        }
        details.push({
            quantity:       line.quantity,
            unit_price:     line.unit_price,
            vat_rate:       line.vat_rate ?? 20,
            discount_type:  "percentage",
            discount_value: line.discount_pct,
            description:    `${line.product_name} (${line.product_sku})`,
            product_id:     product.parasut_product_id,
            // warehouse: KASITLI OLARAK YOK — stok invariant
        });
    }

    const issueDate = new Date().toISOString().slice(0, 10);
    const dueDate   = computeDueDate(issueDate, customer.payment_terms_days ?? 30);

    // Durable attempted marker — create çağrısından hemen önce, validasyonlar geçtikten sonra
    const { error: markerErr } = await supabase
        .from("sales_orders")
        .update({ parasut_invoice_create_attempted_at: new Date().toISOString() })
        .eq("id", orderId);
    if (markerErr) throw new Error(`Invoice attempted marker yazılamadı: ${markerErr.message}`);

    let invoice: ParasutInvoice;
    try {
        invoice = await parasutApiCall(
            { op: "createSalesInvoice", orderId, step: "invoice" as const },
            () => adapter.createSalesInvoice({
                contact_id:        customer.parasut_contact_id!,
                invoice_series:    series,
                invoice_id:        numberInt,
                issue_date:        issueDate,
                due_date:          dueDate,
                currency:          mapCurrency(order.currency),
                shipment_included: false, // KESIN false — shipment ayrı belgede (stok invariant)
                description:       `KokpitERP #${order.order_number}`,
                details,
            }),
        );
    } catch (err) {
        // Stok invariant ihlali (shipment_included=true veya warehouse alanı detail'de var) →
        // adapter validation error fırlatır. Critical alert: muhasebe sync, üretim stok'unu çift düşürür.
        const msg = err instanceof Error ? err.message : String(err);
        if (/shipment_included|warehouse|stok invariant/i.test(msg)) {
            try {
                await dbCreateAlert({
                    type:        "sync_issue",
                    severity:    "critical",
                    title:       "Paraşüt stok invariant ihlali",
                    description: `Order ${order.order_number} createSalesInvoice payload'unda stok invariant ihlali: ${msg}`,
                    entity_type: "parasut",
                    entity_id:   ALERT_ENTITY_PARASUT_STOCK_INVARIANT,
                    source:      "system",
                });
            } catch (alertErr) {
                console.error(JSON.stringify({ parasut_alert_fail: String(alertErr), orderId, kind: "stock_invariant" }));
            }
        }
        throw err;
    }

    await dbWriteInvoiceMeta(orderId, invoice, series, numberInt);
}

// ── Faz 10: E-Belge ──────────────────────────────────────────

async function dbWriteEDocMeta(orderId: string, eDoc: ParasutEDocument, jobId?: string): Promise<void> {
    // Idempotent guard: Poll CRON `parasut_claim_sync` kullanmadığı için sync ile paralel çalışabilir.
    // .select("id") ile güncellenen satırları döndür — 0 satır = guard nedeniyle atlandı.
    // SQL'de `NULL != 'done'` NULL'a eval olur (FALSE değil) → NULL satırlar `.neq` ile eşleşmez.
    // Recovery 1'de status sıklıkla NULL → IS DISTINCT FROM semantiği için OR ile NULL'u kapsa.
    const supabase = createServiceClient();
    const base = supabase
        .from("sales_orders")
        .update({
            parasut_e_document_id:     eDoc.id,
            parasut_e_document_status: "done" as ParasutEDocStatus,
            parasut_e_document_error:  null,
        })
        .eq("id", orderId)
        .or("parasut_e_document_status.is.null,parasut_e_document_status.neq.done");
    const filtered = jobId ? base.eq("parasut_trackable_job_id", jobId) : base;
    const { data, error } = await filtered.select("id");
    if (error) throw new Error(`dbWriteEDocMeta hatası: ${error.message}`);

    if (!data || data.length === 0) {
        // 0 satır güncellendi — guard nedeniyle atlandı. Beklenen tek durum: poll zaten 'done' yazdı.
        const { data: current, error: readErr } = await supabase
            .from("sales_orders")
            .select("parasut_e_document_status")
            .eq("id", orderId)
            .single();
        if (readErr) throw new Error(`dbWriteEDocMeta re-read hatası: ${readErr.message}`);
        if (current?.parasut_e_document_status !== "done") {
            throw new ParasutError(
                "server",
                `dbWriteEDocMeta: 0 satır güncellendi, beklenen 'done' değil (mevcut status=${current?.parasut_e_document_status})`,
            );
        }
        // status='done' → poll bizi geçti; markStepDone step='done' yazacak, idempotent, güvenli.
    }
}

async function upsertEDocument(
    order: OrderWithLines,
): Promise<{ status: "done" | "skipped" | "running" }> {
    if (!order.parasut_invoice_id) {
        throw new ParasutError(
            "validation",
            "E-doc oluşturulamaz: parasut_invoice_id eksik (Faz 9 tamamlanmamış)",
        );
    }

    const orderId  = order.id;
    const supabase = createServiceClient();
    const adapter  = getParasutAdapter();
    const invoiceId = order.parasut_invoice_id;

    // Idempotent: e_document_id zaten dolu → status'a göre erken dön
    // (skipped → markStepDone'u orchestrator çağırır; running → poll CRON bitirir; done → done)
    if (order.parasut_e_document_id) {
        return { status: "done" };
    }
    if (order.parasut_e_document_status === "skipped") {
        return { status: "skipped" };
    }

    // Crash recovery 1: Paraşüt tarafında active_e_document zaten var mı?
    {
        const fresh = await parasutApiCall(
            { op: "getSalesInvoiceWithActiveEDocument", orderId, step: "edoc" as const },
            () => adapter.getSalesInvoiceWithActiveEDocument(invoiceId),
        );
        if (fresh.active_e_document) {
            await dbWriteEDocMeta(orderId, fresh.active_e_document);
            return { status: "done" };
        }
    }

    // Crash recovery 2: Job başlatılmış (e_document_id hâlâ yok — yukarıda erken dönüldü)
    if (order.parasut_trackable_job_id) {
        const job = await parasutApiCall(
            { op: "getTrackableJob", orderId, step: "edoc" as const },
            () => adapter.getTrackableJob(order.parasut_trackable_job_id!),
        );

        if (job.status === "done") {
            const fresh = await parasutApiCall(
                { op: "getSalesInvoiceWithActiveEDocument", orderId, step: "edoc" as const },
                () => adapter.getSalesInvoiceWithActiveEDocument(invoiceId),
            );
            if (!fresh.active_e_document) {
                throw new ParasutError(
                    "server",
                    "TrackableJob done döndü ama active_e_document yok — beklenmedik durum",
                );
            }
            await dbWriteEDocMeta(orderId, fresh.active_e_document, order.parasut_trackable_job_id!);
            return { status: "done" };
        }

        if (job.status === "running") {
            // Idempotent guard: poll CRON paralel çalışıp 'done' yazmış olabilir → 'done'u 'running'e ezme.
            // NULL satırları kapsamak için OR (NULL != 'done' → NULL → WHERE false).
            const { error: dbErr } = await supabase
                .from("sales_orders")
                .update({ parasut_e_document_status: "running" as ParasutEDocStatus })
                .eq("id", orderId)
                .eq("parasut_trackable_job_id", order.parasut_trackable_job_id!)
                .or("parasut_e_document_status.is.null,parasut_e_document_status.neq.done");
            if (dbErr) throw new Error(`e-doc running update hatası: ${dbErr.message}`);
            return { status: "running" };
        }

        // job.status === 'error'
        const errMsg = (job.errors ?? []).join("; ") || "Trackable job error (detay yok)";
        try {
            await dbCreateAlert({
                type:        "sync_issue",
                severity:    "critical",
                title:       "E-belge oluşturma hatası",
                description: `Order ${order.order_number}: trackable_job ${order.parasut_trackable_job_id} → error: ${errMsg}`,
                entity_type: "parasut",
                entity_id:   ALERT_ENTITY_PARASUT_E_DOC,
                source:      "system",
            });
        } catch (alertErr) {
            console.error(JSON.stringify({ parasut_alert_fail: String(alertErr), orderId }));
        }
        // Idempotent guard: done state'i ezmesin; NULL'u kapsa (NULL != 'done' → NULL).
        const { error: dbErr } = await supabase
            .from("sales_orders")
            .update({
                parasut_e_document_status: "error" as ParasutEDocStatus,
                parasut_e_document_error:  errMsg,
            })
            .eq("id", orderId)
            .eq("parasut_trackable_job_id", order.parasut_trackable_job_id!)
            .or("parasut_e_document_status.is.null,parasut_e_document_status.neq.done");
        if (dbErr) throw new Error(`e-doc error update hatası: ${dbErr.message}`);
        throw new ParasutError("server", `E-belge job hatası: ${errMsg}`);
    }

    // Yeni job
    // Customer re-fetch (order stale olabilir; tax_number güncel olmalı)
    const customer = await dbGetCustomerById(order.customer_id!);
    if (!customer) {
        throw new ParasutError("not_found", `Müşteri bulunamadı: ${order.customer_id}`);
    }

    // Tip seçimi: order.parasut_invoice_type override > VKN inbox lookup > e_archive (TC kimlik / no-tax)
    // Türkiye: VKN=10 hane, TC kimlik=11 hane. Ham veri boşluk/tire içerebilir → numerik filtreleyip ölç.
    let type: ParasutInvoiceType;
    if (order.parasut_invoice_type) {
        type = order.parasut_invoice_type;
    } else {
        const digits = (customer.tax_number ?? "").replace(/\D/g, "");
        if (digits.length === 10) {
            const inboxes = await parasutApiCall(
                { op: "listEInvoiceInboxesByVkn", orderId, step: "edoc" as const },
                () => adapter.listEInvoiceInboxesByVkn(digits),
            );
            type = inboxes.length > 0 ? "e_invoice" : "e_archive";
        } else {
            // TC kimlik (11), yok, veya bilinmeyen format → e_archive
            type = "e_archive";
        }
    }

    if (type === "manual") {
        // "skipped" semantiği: e-belge hiç oluşturulmadı (done ile karıştırma)
        const { error: dbErr } = await supabase
            .from("sales_orders")
            .update({
                parasut_invoice_type:      "manual" as ParasutInvoiceType,
                parasut_e_document_status: "skipped" as ParasutEDocStatus,
            })
            .eq("id", orderId);
        if (dbErr) throw new Error(`e-doc manual update hatası: ${dbErr.message}`);
        return { status: "skipped" };
    }

    // Durable attempted marker — trackable_job_id DB'ye yazılmadan önce crash olsa bile
    // bir sonraki denemede active_e_document yoksa ve marker varsa: otomatik yeni job AÇMA → manual review
    const hasEDocAttemptedBefore = !!order.parasut_e_document_create_attempted_at;
    if (hasEDocAttemptedBefore && !order.parasut_trackable_job_id) {
        // Önceki create çağrısı başarılı dönmüş ama trackable_job_id yazılamadı olabilir.
        // Recovery 1 (active_e_document) yukarıda boş döndü → güvenli tarafa çek.
        try {
            await dbCreateAlert({
                type:        "sync_issue",
                severity:    "critical",
                title:       "E-belge manuel inceleme gerekli",
                description: `E-doc create attempted ${order.parasut_e_document_create_attempted_at} ama trackable_job_id yok + active_e_document yok → duplicate riski, manuel inceleme`,
                entity_type: "parasut",
                entity_id:   ALERT_ENTITY_PARASUT_E_DOC,
                source:      "system",
            });
        } catch (alertErr) {
            console.error(JSON.stringify({ parasut_alert_fail: String(alertErr), orderId }));
        }
        throw new ParasutError(
            "validation",
            "E-doc manual review gerekli — attempted marker + tracking bilgisi eksik (duplicate riski)",
        );
    }

    // Marker yaz (create çağrısından hemen önce); type da burada persist edilir
    const { error: markerErr } = await supabase
        .from("sales_orders")
        .update({
            parasut_e_document_create_attempted_at: new Date().toISOString(),
            parasut_invoice_type:                   type,
        })
        .eq("id", orderId);
    if (markerErr) throw new Error(`E-doc attempted marker yazılamadı: ${markerErr.message}`);

    const issueDate = new Date().toISOString().slice(0, 10);

    const job = type === "e_invoice"
        ? await parasutApiCall(
            { op: "createEInvoice", orderId, step: "edoc" as const },
            () => adapter.createEInvoice(invoiceId, { issue_date: issueDate, scenario: "commercial" }),
        )
        : await parasutApiCall(
            { op: "createEArchive", orderId, step: "edoc" as const },
            () => adapter.createEArchive(invoiceId, { issue_date: issueDate, internet_sale: false }),
        );

    // Idempotent guard: paralel poll CRON arada done yazmış olabilir → done'u ezme.
    // KRİTİK: Yeni job yazımında order.parasut_e_document_status NULL (fresh) → `.neq('done')`
    // satırı eşleştirmez (SQL: NULL != 'done' → NULL). NULL'u kapsamak için OR.
    const { error: jobErr } = await supabase
        .from("sales_orders")
        .update({
            parasut_trackable_job_id:  job.trackable_job_id,
            parasut_e_document_status: "running" as ParasutEDocStatus,
        })
        .eq("id", orderId)
        .or("parasut_e_document_status.is.null,parasut_e_document_status.neq.done");
    if (jobErr) throw new Error(`e-doc trackable_job_id yazılamadı: ${jobErr.message}`);

    return { status: "running" };
}

// ── Sync ─────────────────────────────────────────────────────

export interface SyncOrderResult {
    success: boolean;
    invoice_id?: string;
    sent_at?: string;
    error?: string;
    skipped?: boolean;
    reason?: string;
}

export async function serviceSyncOrderToParasut(orderId: string): Promise<SyncOrderResult> {
    if (!isParasutEnabled()) return { success: false, error: "Paraşüt entegrasyonu devre dışı." };

    const order = await dbGetOrderById(orderId);
    if (!order) return { success: false, error: "Sipariş bulunamadı." };
    if (order.commercial_status !== "approved") {
        return { success: false, error: "Yalnızca onaylı siparişler Paraşüt'e gönderilebilir." };
    }
    if (order.fulfillment_status !== "shipped") {
        return { success: false, error: "Yalnızca sevk edilmiş siparişler Paraşüt'e gönderilebilir." };
    }
    if (!order.customer_id) {
        return { success: false, error: "Müşteri bilgisi eksik — Paraşüt sync için zorunlu." };
    }

    const supabase = createServiceClient();
    const owner    = crypto.randomUUID();

    const { data: claimed, error: claimErr } = await supabase.rpc("parasut_claim_sync", {
        p_order_id:   orderId,
        p_owner:      owner,
        p_lease_secs: 300,
    });
    if (claimErr) {
        const pe       = new ParasutError("server", `parasut_claim_sync RPC hatası (order=${orderId}): ${claimErr.message}`);
        const failStep = (order.parasut_step ?? "contact") as ParasutStep;
        const patch    = classifyAndPatch(order, failStep, pe);
        try {
            const { error: patchErr } = await supabase.from("sales_orders").update(patch).eq("id", orderId);
            if (patchErr) console.error(JSON.stringify({ parasut_patch_fail: patchErr.message, orderId }));
        } catch (e) { console.error(String(e)); }
        try {
            await dbCreateSyncLog({
                entity_type:   "sales_order",
                entity_id:     orderId,
                direction:     "push",
                status:        "error",
                step:          failStep,
                error_kind:    pe.kind,
                error_message: pe.message,
            });
        } catch { /* best-effort */ }
        return { success: false, error: pe.message };
    }
    if (!claimed) return { success: false, skipped: true, reason: "not_eligible_or_locked" };

    let currentStep: ParasutStep = "contact";
    // Local mutable copy to avoid stale read after markStepDone resets DB parasut_retry_count=0.
    const orderMut = { parasut_retry_count: order.parasut_retry_count };

    try {
        // Step: contact
        currentStep = "contact";
        await serviceEnsureParasutContact(order.customer_id);
        await markStepDone(orderId, "contact", "product");
        orderMut.parasut_retry_count = 0;

        // Step: product (all order lines)
        currentStep = "product";
        for (const line of order.lines) {
            if (line.product_id) {
                await serviceEnsureParasutProduct(line.product_id);
            }
        }
        await markStepDone(orderId, "product", "shipment");
        orderMut.parasut_retry_count = 0;

        // Step: shipment
        currentStep = "shipment";
        await upsertShipment(order);
        await markStepDone(orderId, "shipment", "invoice");
        orderMut.parasut_retry_count = 0;

        // Step: invoice
        currentStep = "invoice";
        await upsertInvoice(order);
        await markStepDone(orderId, "invoice", "edoc");
        orderMut.parasut_retry_count = 0;

        // Step: e-doc
        // Order DB'de güncel — upsertInvoice/Shipment kendi alanlarını yazdı; in-memory snapshot stale.
        // upsertEDocument parasut_invoice_id okuduğu için re-fetch zorunlu (aksi halde yeni invoice
        // sonrası validation fail → 2099 retry block'a düşer).
        currentStep = "edoc";
        const refreshedOrder = await dbGetOrderById(orderId);
        if (!refreshedOrder) {
            throw new ParasutError("not_found", "Sipariş edoc adımı öncesi bulunamadı (race condition)");
        }
        const eDocResult = await upsertEDocument(refreshedOrder);
        if (eDocResult.status === "done" || eDocResult.status === "skipped") {
            await markStepDone(orderId, "edoc", "done");
        }
        // 'running' → parasut_step='edoc' stays; poll CRON will call markStepDone when done

        return { success: true };
    } catch (err) {
        const pe = err instanceof ParasutError ? err : new ParasutError("server", String(err));
        const patch = classifyAndPatch(orderMut, currentStep, pe);
        try {
            const { error: patchErr } = await supabase.from("sales_orders").update(patch).eq("id", orderId);
            if (patchErr) console.error(JSON.stringify({ parasut_patch_fail: patchErr.message, orderId }));
        } catch (e) { console.error(String(e)); }
        try {
            await dbCreateSyncLog({
                entity_type:   "sales_order",
                entity_id:     orderId,
                direction:     "push",
                status:        "error",
                step:          currentStep,
                error_kind:    pe.kind,
                error_message: pe.message,
            });
        } catch { /* best-effort */ }
        return { success: false, error: pe.message };
    } finally {
        try {
            await supabase.rpc("parasut_release_sync", { p_order_id: orderId, p_owner: owner });
        } catch { /* best-effort */ }
    }
}

// ── Faz 11.2: Step-granular manual retry ─────────────────────
//
// Step state machine — her step öncekinin tamamlanmasını gerektirir:
//   contact:  no dep
//   product:  customer.parasut_contact_id != null
//   shipment: tüm ürünlerin parasut_product_id != null
//   invoice:  parasut_shipment_document_id != null
//   edoc:     parasut_invoice_id != null
//
// step='all' → tüm orchestrator'ı çağırır (idempotent helper'lar zaten skip yapar).
// step='X'   → dep guard + claim + sadece o step + markStepDone(next) + release.

export type RetryableParasutStep = Exclude<ParasutStep, "done">;

const NEXT_STEP: Record<RetryableParasutStep, ParasutStep> = {
    contact:  "product",
    product:  "shipment",
    shipment: "invoice",
    invoice:  "edoc",
    edoc:     "done",
};

async function checkStepDeps(
    step: RetryableParasutStep,
    order: OrderWithLines,
): Promise<{ ok: true } | { ok: false; error: string }> {
    if (step === "contact") return { ok: true };

    if (step === "product") {
        if (!order.customer_id) return { ok: false, error: "Müşteri bilgisi eksik." };
        const customer = await dbGetCustomerById(order.customer_id);
        if (!customer?.parasut_contact_id) {
            return { ok: false, error: "'product' adımı için önce 'contact' tamamlanmalı." };
        }
        return { ok: true };
    }

    if (step === "shipment") {
        for (const line of order.lines) {
            if (!line.product_id) continue;
            const product = await dbGetProductById(line.product_id);
            if (!product?.parasut_product_id) {
                return { ok: false, error: "'shipment' adımı için önce tüm 'product' adımları tamamlanmalı." };
            }
        }
        return { ok: true };
    }

    if (step === "invoice") {
        if (!order.parasut_shipment_document_id) {
            return { ok: false, error: "'invoice' adımı için önce 'shipment' tamamlanmalı." };
        }
        return { ok: true };
    }

    // edoc
    if (!order.parasut_invoice_id) {
        return { ok: false, error: "'edoc' adımı için önce 'invoice' tamamlanmalı." };
    }
    return { ok: true };
}

export async function serviceRetryParasutStep(
    orderId: string,
    step: RetryableParasutStep | "all",
): Promise<SyncOrderResult> {
    if (!isParasutEnabled()) return { success: false, error: "Paraşüt entegrasyonu devre dışı." };

    if (step === "all") {
        return serviceSyncOrderToParasut(orderId);
    }

    const order = await dbGetOrderById(orderId);
    if (!order) return { success: false, error: "Sipariş bulunamadı." };
    if (order.commercial_status !== "approved") {
        return { success: false, error: "Yalnızca onaylı siparişler için retry yapılabilir." };
    }
    if (order.fulfillment_status !== "shipped") {
        return { success: false, error: "Yalnızca sevk edilmiş siparişler için retry yapılabilir." };
    }
    if (!order.customer_id) {
        return { success: false, error: "Müşteri bilgisi eksik — Paraşüt sync için zorunlu." };
    }

    const dep = await checkStepDeps(step, order);
    if (!dep.ok) return { success: false, error: dep.error };

    const supabase = createServiceClient();
    const owner    = crypto.randomUUID();

    const { data: claimed, error: claimErr } = await supabase.rpc("parasut_claim_sync", {
        p_order_id:   orderId,
        p_owner:      owner,
        p_lease_secs: 300,
    });
    if (claimErr) {
        return { success: false, error: `parasut_claim_sync RPC hatası: ${claimErr.message}` };
    }
    if (!claimed) return { success: false, skipped: true, reason: "not_eligible_or_locked" };

    try {
        if (step === "contact") {
            await serviceEnsureParasutContact(order.customer_id);
        } else if (step === "product") {
            for (const line of order.lines) {
                if (line.product_id) {
                    await serviceEnsureParasutProduct(line.product_id);
                }
            }
        } else if (step === "shipment") {
            await upsertShipment(order);
        } else if (step === "invoice") {
            await upsertInvoice(order);
        } else {
            // edoc — invoice_id zaten dep guard ile garantili; recovery branch'leri içeride.
            const refreshed = await dbGetOrderById(orderId);
            if (!refreshed) {
                throw new ParasutError("not_found", "Sipariş edoc retry öncesi bulunamadı.");
            }
            const eDocResult = await upsertEDocument(refreshed);
            if (eDocResult.status === "running") {
                // Poll CRON markStepDone yapacak — orchestrator burada step=edoc bırakır
                return { success: true };
            }
        }

        await markStepDone(orderId, step, NEXT_STEP[step]);
        return { success: true };
    } catch (err) {
        const pe = err instanceof ParasutError ? err : new ParasutError("server", String(err));
        const patch = classifyAndPatch({ parasut_retry_count: order.parasut_retry_count }, step, pe);
        try {
            const { error: patchErr } = await supabase.from("sales_orders").update(patch).eq("id", orderId);
            if (patchErr) console.error(JSON.stringify({ parasut_patch_fail: patchErr.message, orderId }));
        } catch (e) { console.error(String(e)); }
        try {
            await dbCreateSyncLog({
                entity_type:   "sales_order",
                entity_id:     orderId,
                direction:     "push",
                status:        "error",
                step,
                error_kind:    pe.kind,
                error_message: pe.message,
            });
        } catch { /* best-effort */ }
        return { success: false, error: pe.message };
    } finally {
        try {
            await supabase.rpc("parasut_release_sync", { p_order_id: orderId, p_owner: owner });
        } catch { /* best-effort */ }
    }
}

// ── Retry (sync log bazlı — eski API geriye dönük) ───────────

export async function serviceRetrySyncLog(syncLogId: string): Promise<SyncOrderResult> {
    if (!isParasutEnabled()) return { success: false, error: "Paraşüt entegrasyonu devre dışı." };
    const log = await dbGetSyncLog(syncLogId);
    if (!log) return { success: false, error: "Sync log bulunamadı." };
    if (!log.entity_id) return { success: false, error: "entity_id eksik." };
    if (log.retry_count >= 3) return { success: false, error: "Maks. deneme sayısı (3) aşıldı." };

    // Mark as retrying
    await dbUpdateSyncLog(syncLogId, {
        status: "retrying",
        retry_count: log.retry_count + 1,
    });

    const result = await serviceSyncOrderToParasut(log.entity_id);

    if (result.skipped) {
        // Claim couldn't be obtained — leave log in "retrying"; CRON will pick it up again.
        return result;
    }

    // Update the original log based on result
    await dbUpdateSyncLog(syncLogId, {
        status: result.success ? "success" : "error",
        error_message: result.success ? null : (result.error ?? null),
        completed_at: result.success ? new Date().toISOString() : null,
        external_id: result.invoice_id ?? null,
    });

    return result;
}

// ── Sync All Pending ─────────────────────────────────────────

export async function serviceSyncAllPending(): Promise<{
    synced: number;
    failed: number;
    errors: string[];
}> {
    if (!isParasutEnabled()) return { synced: 0, failed: 0, errors: [] };
    const supabase = createServiceClient();

    const nowISO = new Date().toISOString();
    const { data: pendingOrders, error } = await supabase
        .from("sales_orders")
        .select("id, order_number")
        .not("parasut_step", "is", null)
        .neq("parasut_step", "done")
        .or("parasut_error_kind.is.null,parasut_error_kind.not.in.(validation,auth)")
        .or(`parasut_next_retry_at.is.null,parasut_next_retry_at.lte.${nowISO}`)
        .limit(50);

    if (error) throw new Error(error.message);

    let synced = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const order of pendingOrders ?? []) {
        const result = await serviceSyncOrderToParasut(order.id);
        if (result.skipped) {
            // Claim lost or not eligible — do not count; another worker owns it
        } else if (result.success) {
            synced++;
        } else {
            failed++;
            errors.push(`${order.order_number}: ${result.error ?? "Unknown error"}`);
        }
    }

    return { synced, failed, errors };
}

// ── Poll CRON: e-belge trackable_job durumu ──────────────────

export interface PollEDocumentsResult {
    polled:  number;
    done:    number;
    running: number;
    error:   number;
    errors:  string[];
}

/**
 * Bağımsız Poll CRON — running e-document'ları tarar, trackable_job sonuçlarını işler.
 * orchestrator (`serviceSyncOrderToParasut`) `parasut_claim_sync` ile tek-yazıcı koruması altında
 * çalışır; bu poll CRON ise claim KULLANMAZ → idempotent DB guard'lar zorunludur:
 *   `.eq("parasut_trackable_job_id", jobId).neq("parasut_e_document_status", "done")`
 * (yarış: poll'un done yazımı orchestrator'ın yeni job_id yazımını ezmesin).
 */
export async function serviceParasutPollEDocuments(): Promise<PollEDocumentsResult> {
    if (!isParasutEnabled()) return { polled: 0, done: 0, running: 0, error: 0, errors: [] };

    const supabase = createServiceClient();
    const adapter  = getParasutAdapter();

    const { data: pendingRows, error } = await supabase
        .from("sales_orders")
        .select("id, order_number, parasut_invoice_id, parasut_trackable_job_id, parasut_e_document_status")
        .eq("parasut_step", "edoc")
        .eq("parasut_e_document_status", "running")
        .not("parasut_trackable_job_id", "is", null)
        .limit(100);
    if (error) throw new Error(`poll-e-documents query hatası: ${error.message}`);

    const result: PollEDocumentsResult = { polled: 0, done: 0, running: 0, error: 0, errors: [] };

    for (const row of pendingRows ?? []) {
        const orderId   = row.id as string;
        const invoiceId = row.parasut_invoice_id as string | null;
        const jobId     = row.parasut_trackable_job_id as string | null;
        if (!invoiceId || !jobId) continue;

        result.polled++;

        try {
            const job = await parasutApiCall(
                { op: "getTrackableJob", orderId, step: "edoc" as const },
                () => adapter.getTrackableJob(jobId),
            );

            // raw_status metadata: bilinmeyen / pending durumları integration_sync_logs.metadata'ya yansıt
            // (running'e map edilir). Adapter şu an 'running' | 'done' | 'error' döner; gerçek HTTP adapter
            // pending'i running'e map eder ve raw_status'u alanda taşırsa (Faz 12) bu log onu yakalar.
            const rawStatus = (job as { status: string; errors?: string[] }).status;
            if (rawStatus !== "done" && rawStatus !== "running" && rawStatus !== "error") {
                console.log(JSON.stringify({
                    parasut_poll_unknown_status: rawStatus,
                    orderId,
                    jobId,
                }));
                try {
                    await dbCreateSyncLog({
                        entity_type: "sales_order",
                        entity_id:   orderId,
                        direction:   "push",
                        status:      "success",
                        step:        "edoc" as ParasutStep,
                        metadata:    { raw_status: rawStatus, source: "poll", note: "unknown_status_mapped_to_running" },
                    });
                } catch { /* best-effort */ }
            }

            if (job.status === "done") {
                const fresh = await parasutApiCall(
                    { op: "getSalesInvoiceWithActiveEDocument", orderId, step: "edoc" as const },
                    () => adapter.getSalesInvoiceWithActiveEDocument(invoiceId),
                );
                if (!fresh.active_e_document) {
                    result.error++;
                    result.errors.push(`${row.order_number}: job done ama active_e_document yok`);
                    continue;
                }

                // Idempotent yazım: aynı job_id + status henüz done değilse yaz
                const { error: updErr } = await supabase
                    .from("sales_orders")
                    .update({
                        parasut_e_document_id:     fresh.active_e_document.id,
                        parasut_e_document_status: "done" as ParasutEDocStatus,
                        parasut_e_document_error:  null,
                        parasut_step:              "done",
                        parasut_error:             null,
                        parasut_error_kind:        null,
                        parasut_next_retry_at:     null,
                        parasut_retry_count:       0,
                        parasut_last_failed_step:  null,
                    })
                    .eq("id", orderId)
                    .eq("parasut_trackable_job_id", jobId)
                    .neq("parasut_e_document_status", "done");
                if (updErr) {
                    result.error++;
                    result.errors.push(`${row.order_number}: done update hatası: ${updErr.message}`);
                    continue;
                }

                try {
                    await dbCreateSyncLog({
                        entity_type: "sales_order",
                        entity_id:   orderId,
                        direction:   "push",
                        status:      "success",
                        step:        "edoc" as ParasutStep,
                        metadata:    { next_step: "done", source: "poll" },
                    });
                } catch { /* best-effort */ }

                result.done++;
            } else if (job.status === "error") {
                const errMsg = (job.errors ?? []).join("; ") || "Trackable job error (detay yok)";
                try {
                    await dbCreateAlert({
                        type:        "sync_issue",
                        severity:    "critical",
                        title:       "E-belge oluşturma hatası",
                        description: `Order ${row.order_number}: trackable_job ${jobId} → error: ${errMsg}`,
                        entity_type: "parasut",
                        entity_id:   ALERT_ENTITY_PARASUT_E_DOC,
                        source:      "system",
                    });
                } catch (alertErr) {
                    console.error(JSON.stringify({ parasut_alert_fail: String(alertErr), orderId }));
                }

                const { error: updErr } = await supabase
                    .from("sales_orders")
                    .update({
                        parasut_e_document_status: "error" as ParasutEDocStatus,
                        parasut_e_document_error:  errMsg,
                    })
                    .eq("id", orderId)
                    .eq("parasut_trackable_job_id", jobId)
                    .neq("parasut_e_document_status", "done");
                if (updErr) {
                    result.errors.push(`${row.order_number}: error update hatası: ${updErr.message}`);
                }
                result.error++;
            } else {
                // running — DB'de zaten running; gereksiz update yapma
                result.running++;
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            result.errors.push(`${row.order_number}: ${msg}`);
            result.error++;
        }
    }

    return result;
}
