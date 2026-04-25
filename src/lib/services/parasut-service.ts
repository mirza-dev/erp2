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
import { ALERT_ENTITY_PARASUT_AUTH, ALERT_ENTITY_PARASUT_SHIPMENT } from "@/lib/parasut-constants";
import type { OrderWithLines } from "@/lib/supabase/orders";
import type { SalesOrderRow } from "@/lib/database.types";
import type { ParasutStep } from "@/lib/database.types";
import type { ParasutShipmentDocument } from "@/lib/parasut-adapter";

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

// ── Faz 9/10 stubs ───────────────────────────────────────────

async function upsertInvoice(_order: OrderWithLines): Promise<void> {
    throw new ParasutError("server", "Not yet implemented — Faz 9");
}

async function upsertEDocument(
    _order: OrderWithLines,
): Promise<{ status: "done" | "skipped" | "running" }> {
    throw new ParasutError("server", "Not yet implemented — Faz 10");
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

        // Step: invoice (stub — Faz 9)
        currentStep = "invoice";
        await upsertInvoice(order);
        await markStepDone(orderId, "invoice", "edoc");
        orderMut.parasut_retry_count = 0;

        // Step: e-doc (stub — Faz 10)
        currentStep = "edoc";
        const eDocResult = await upsertEDocument(order);
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

// ── Retry ────────────────────────────────────────────────────

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
