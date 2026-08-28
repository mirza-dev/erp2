/**
 * Paraşüt alış tarafı — PO → alış faturası (Faz 13).
 *
 * NEDEN: Faz 1-11 boyunca Paraşüt'e YALNIZ satış gidiyordu. Alış faturası hiç
 * oluşmadığı için **indirilecek KDV** muhasebeye ulaşmıyordu — yani entegrasyon
 * vergilendirmenin sadece yarısını taşıyordu.
 *
 * AKIŞ (satış orkestrasının aynası):
 *   PO `received`
 *     → (1) tedarikçi contact upsert   (vendors.parasut_contact_id, TTL lease)
 *     → (2) ürün upsert                (products.parasut_product_id — satışla ORTAK)
 *     → (3) purchase_bill              (details'te warehouse YOK — stok invariant)
 *
 * NE ZAMAN: yalnız `received` (tamamen mal kabul). Kısmi kabulde fatura
 * kesilmez — PO toplamını gider yazmak, malın bir kısmı gelmişken muhasebeyi
 * yanıltırdı. 051 `received`'i tüm satırlar tam alındığında set eder.
 *
 * IDEMPOTENCY: Paraşüt `listPurchaseBills`'te `invoice_no` FİLTRESİ YOK
 * (yalnız supplier_id/issue_date/due_date/item_type). Bu yüzden satış
 * faturasındaki "hızlı uzak arama" yapılamaz; shipment_document kalıbı
 * uygulanır: durable `parasut_bill_create_attempted_at` marker + tedarikçi
 * bazlı sayfalama + YEREL eşleşme (açıklamadaki PO numarası).
 */

import crypto from "crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { dbCreateSyncLog } from "@/lib/supabase/sync-log";
import { dbCreateAlert } from "@/lib/supabase/alerts";
import { dbGetVendorById } from "@/lib/supabase/vendors";
import { dbGetPurchaseOrderById } from "@/lib/supabase/purchase-orders";
import { dbGetProductById } from "@/lib/supabase/products";
import { getParasutAdapter } from "@/lib/parasut";
import { ParasutError } from "@/lib/parasut-adapter";
import type { ParasutPurchaseBill, PurchaseBillInput } from "@/lib/parasut-adapter";
import { parasutApiCall } from "@/lib/services/parasut-api-call";
import { resolveInvoiceExchangeRate } from "@/lib/services/parasut-exchange-rate";
import { checkAuthAlertThreshold, mapCurrency } from "@/lib/services/parasut-service";
import { ALERT_ENTITY_PARASUT_INVOICE } from "@/lib/parasut-constants";
import { localISODate } from "@/lib/stock-utils";
import type { PurchaseOrderRow, PurchaseOrderLineRow } from "@/lib/database.types";

// ── Tipler ───────────────────────────────────────────────────

/** PO akışının adımları — satıştaki `ParasutStep`'in alış karşılığı. */
export type ParasutPoStep = "contact" | "product" | "bill" | "done";

export interface SyncPurchaseOrderResult {
    success:  boolean;
    error?:   string;
    skipped?: boolean;
    reason?:  string;
}

interface PurchaseOrderWithLines extends PurchaseOrderRow {
    lines: PurchaseOrderLineRow[];
}

const LEASE_SECS      = 300;
const CONTACT_LEASE_MS = 60_000;

function isParasutEnabled(): boolean {
    return process.env.PARASUT_ENABLED === "true";
}

// ── Saf yardımcılar ──────────────────────────────────────────

/**
 * Satırın KDV YÜZDESİ.
 *
 * `purchase_order_lines.vat_rate` YÜZDE tutar (20 = %20) ve migration 107'de
 * eklendi → mevcut satırlarda NULL'dır. `purchase_orders.vat_rate` ise ORAN
 * tutar (0.20). NULL satır başlık oranına düşer; böylece eski PO'lar bugünkü
 * davranışlarını aynen korur, yeni PO'lar satır bazlı karışık KDV taşıyabilir.
 */
export function poLineVatRate(
    line: Pick<PurchaseOrderLineRow, "vat_rate">,
    po: Pick<PurchaseOrderRow, "vat_rate">,
): number {
    if (line.vat_rate !== null && line.vat_rate !== undefined) return Number(line.vat_rate);
    return Math.round(Number(po.vat_rate ?? 0.2) * 10000) / 100;
}

/**
 * Satırın net birim fiyatı — iskonto uygulanmış.
 * `discount_pct` Paraşüt'e `discount_type: percentage` olarak ayrıca gider;
 * bu yardımcı yalnız tutar doğrulaması (reconciliation) için kullanılır.
 */
export function poLineNetTotal(line: Pick<PurchaseOrderLineRow, "quantity" | "unit_price" | "discount_pct">): number {
    const gross = Number(line.quantity) * Number(line.unit_price);
    return gross * (1 - Number(line.discount_pct ?? 0) / 100);
}

/** Alış faturası açıklamasındaki deterministik PO referansı (yerel eşleşme anahtarı). */
export function purchaseBillDescription(poNumber: string): string {
    return `Roven #${poNumber}`;
}

/** ParasutError → PO tablosu yaması (satıştaki `classifyAndPatch`'in ikizi). */
export function classifyAndPatchPo(
    po: Pick<PurchaseOrderRow, "parasut_retry_count">,
    step: ParasutPoStep,
    pe: ParasutError,
): Record<string, unknown> {
    const patch: Record<string, unknown> = {
        parasut_error_kind:       pe.kind,
        parasut_last_failed_step: step,
        parasut_step:             step,
    };
    if (step === "bill") patch.parasut_bill_error = pe.message;

    if (pe.kind === "rate_limit") {
        patch.parasut_next_retry_at = new Date(Date.now() + (pe.retryAfterSec ?? 30) * 1000).toISOString();
    } else if (pe.kind === "auth" || pe.kind === "validation") {
        // Kalıcı hata: operatör müdahale etmeden tekrar denemek anlamsız.
        patch.parasut_next_retry_at = new Date("2099-01-01T00:00:00Z").toISOString();
    } else {
        const next = Number(po.parasut_retry_count ?? 0) + 1;
        patch.parasut_retry_count = next;
        if (next >= 5) {
            patch.parasut_next_retry_at = new Date("2099-01-01T00:00:00Z").toISOString();
        } else {
            const backoff = Math.min(30 * 60, 30 * 2 ** next);
            patch.parasut_next_retry_at = new Date(Date.now() + (backoff + Math.random() * 5) * 1000).toISOString();
        }
    }
    return patch;
}

async function markPoStepDone(poId: string, step: ParasutPoStep, nextStep: ParasutPoStep): Promise<void> {
    const supabase = createServiceClient();
    const { error } = await supabase
        .from("purchase_orders")
        .update({
            parasut_step:             nextStep,
            parasut_error_kind:       null,
            parasut_next_retry_at:    null,
            parasut_retry_count:      0,
            parasut_last_failed_step: null,
            ...(step === "bill" ? { parasut_bill_error: null, parasut_bill_synced_at: new Date().toISOString() } : {}),
        })
        .eq("id", poId);
    if (error) throw new Error(`markPoStepDone DB update failed (po=${poId}, step=${step}): ${error.message}`);

    await dbCreateSyncLog({
        entity_type: "purchase_order",
        entity_id:   poId,
        direction:   "push",
        status:      "success",
        step,
        metadata:    { next_step: nextStep },
    });
}

// ── Tedarikçi contact upsert ─────────────────────────────────

/**
 * Tedarikçinin Paraşüt contact ID'sini garanti eder.
 *
 * `serviceEnsureParasutContact`'ın (müşteri) aynası; üç fark:
 *  · `account_type: "supplier"` — Paraşüt'te müşteri/tedarikçi TEK havuzda
 *  · e-posta alanı `contact_email` (müşteride `email`)
 *  · `tax_office` kolonu vendors'ta YOK → gönderilmez
 *
 * MÜŞTERİ-TEDARİKÇİ ÇAKIŞMASI: aynı VKN hem müşteri hem tedarikçi olabilir
 * (Paraşüt bunu tek contact'ta `account_type` ile taşır). VKN eşleşmesi
 * bulunursa MEVCUT contact yeniden kullanılır — ikinci bir kayıt açılmaz.
 */
export async function serviceEnsureParasutVendorContact(vendorId: string): Promise<string> {
    const vendor = await dbGetVendorById(vendorId);
    if (!vendor) throw new ParasutError("not_found", `Tedarikçi bulunamadı: ${vendorId}`);
    if (vendor.parasut_contact_id) return vendor.parasut_contact_id;

    const taxNumber = vendor.tax_number?.trim() ?? "";
    if (!taxNumber) {
        throw new ParasutError(
            "validation",
            `Tedarikçi ${vendor.name} için vergi numarası zorunlu (Paraşüt alış faturası)`,
        );
    }

    const adapter  = getParasutAdapter();
    const supabase = createServiceClient();
    const owner    = crypto.randomUUID();

    async function writeContactId(contactId: string): Promise<void> {
        const { error } = await supabase.from("vendors").update({
            parasut_contact_id: contactId,
            parasut_synced_at:  new Date().toISOString(),
        }).eq("id", vendorId);
        if (error) throw new Error(`vendors update failed (id=${vendorId}): ${error.message}`);
    }

    async function claimOrSkip(): Promise<{ claimed: true } | { claimed: false; existingId: string }> {
        const leaseUntil = new Date(Date.now() + CONTACT_LEASE_MS).toISOString();
        const nowISO     = new Date().toISOString();
        const { data: rows, error } = await supabase
            .from("vendors")
            .update({ parasut_contact_creating_until: leaseUntil, parasut_contact_creating_owner: owner })
            .eq("id", vendorId)
            .is("parasut_contact_id", null)
            .or(`parasut_contact_creating_until.is.null,parasut_contact_creating_until.lt.${nowISO}`)
            .select("id");
        if (error) throw new Error(`vendors claim failed (id=${vendorId}): ${error.message}`);
        if (rows && rows.length > 0) return { claimed: true };
        const refreshed = await dbGetVendorById(vendorId);
        if (refreshed?.parasut_contact_id) return { claimed: false, existingId: refreshed.parasut_contact_id };
        throw new ParasutError("server", `Tedarikçi contact oluşturma sürüyor (vendor=${vendorId}), tekrar denenecek`);
    }

    async function finishCreate(contactId: string): Promise<void> {
        const { data: rows, error } = await supabase
            .from("vendors")
            .update({
                parasut_contact_id:             contactId,
                parasut_synced_at:              new Date().toISOString(),
                parasut_contact_creating_until: null,
                parasut_contact_creating_owner: null,
            })
            .eq("id", vendorId)
            .eq("parasut_contact_creating_owner", owner)
            .select("id");
        if (error) throw new Error(`vendors finish failed (id=${vendorId}): ${error.message}`);
        if (!rows || rows.length === 0) {
            throw new ParasutError(
                "server",
                `Lease kaybedildi (vendor=${vendorId}) — Paraşüt'te sahipsiz contact olabilir: ${contactId}`,
            );
        }
    }

    async function releaseCreate(): Promise<void> {
        try {
            await supabase
                .from("vendors")
                .update({ parasut_contact_creating_until: null, parasut_contact_creating_owner: null })
                .eq("id", vendorId)
                .eq("parasut_contact_creating_owner", owner);
        } catch { /* best-effort — TTL zaten düşürür */ }
    }

    const byTax = await parasutApiCall({ op: "findContactsByTaxNumber", step: "contact" as const }, () =>
        adapter.findContactsByTaxNumber(taxNumber),
    );
    if (byTax.length > 1) {
        throw new ParasutError(
            "validation",
            `Paraşüt'te ${taxNumber} VKN ile birden fazla kontakt var — manuel inceleme gerekli`,
        );
    }
    if (byTax.length === 1) {
        // Aynı VKN müşteri olarak da kayıtlı olabilir; Paraşüt tek contact'ta
        // taşır → mevcut kayıt kullanılır, mükerrer cari açılmaz.
        await writeContactId(byTax[0].id);
        return byTax[0].id;
    }

    const claim = await claimOrSkip();
    if (!claim.claimed) return claim.existingId;
    try {
        const created = await parasutApiCall({ op: "createContact", step: "contact" as const }, () =>
            adapter.createContact({
                name:         vendor.name,
                tax_number:   taxNumber,
                email:        vendor.contact_email ?? undefined,
                account_type: "supplier",
            }),
        );
        await finishCreate(created.id);
        return created.id;
    } catch (err) {
        await releaseCreate();
        throw err;
    }
}

// ── Alış faturası ────────────────────────────────────────────

async function dbWriteBillMeta(poId: string, bill: ParasutPurchaseBill): Promise<void> {
    const supabase = createServiceClient();
    const { error } = await supabase.from("purchase_orders").update({
        parasut_bill_id:        bill.id,
        parasut_bill_no:        bill.attributes.invoice_no,
        parasut_bill_synced_at: new Date().toISOString(),
        parasut_bill_error:     null,
    }).eq("id", poId);
    if (error) throw new Error(`purchase_orders bill meta yazılamadı (po=${poId}): ${error.message}`);
}

async function upsertPurchaseBill(po: PurchaseOrderWithLines): Promise<void> {
    if (po.parasut_bill_id) return; // idempotent

    const poId     = po.id;
    const supabase = createServiceClient();
    const adapter  = getParasutAdapter();

    const vendor = await dbGetVendorById(po.vendor_id);
    if (!vendor) throw new ParasutError("not_found", `Tedarikçi bulunamadı: ${po.vendor_id}`);
    if (!vendor.parasut_contact_id) {
        throw new ParasutError("validation", "Tedarikçi Paraşüt contact ID eksik — önce contact upsert gerekli");
    }

    const marker      = purchaseBillDescription(po.po_number);
    const attempted   = !!po.parasut_bill_create_attempted_at;

    // Uzak kurtarma: `invoice_no` filtresi olmadığından tedarikçi bazlı
    // sayfalama + açıklamada PO numarası eşleşmesi. Tedarikçi filtresi arama
    // uzayını daralttığı için shipment'taki 5 sayfadan daha güvenilir.
    const maxPages = Math.min(20, parseInt(process.env.PARASUT_BILL_RECOVERY_MAX_PAGES ?? "5", 10));
    let found: ParasutPurchaseBill | null = null;
    for (let p = 1; p <= maxPages; p++) {
        const list = await parasutApiCall(
            { op: "listPurchaseBillsBySupplier", orderId: poId, step: "invoice" as const },
            () => adapter.listPurchaseBillsBySupplier(vendor.parasut_contact_id!, p, 25),
        );
        if (list.length === 0) break;
        const hit = list.find(b => b.attributes.description === marker);
        if (hit) { found = hit; break; }
        if (list.length < 25) break;
    }

    if (found) {
        await dbWriteBillMeta(poId, found);
        return;
    }

    if (attempted) {
        // Marker var + uzak arama negatif → mükerrer fatura riski. Sessizce
        // ikinci fatura kesmek muhasebeyi bozardı; insan bakmalı.
        try {
            await dbCreateAlert({
                type:        "sync_issue",
                severity:    "critical",
                title:       "Alış faturası manuel inceleme gerekli",
                description: `${po.po_number}: alış faturası ${po.parasut_bill_create_attempted_at} tarihinde denendi ama DB'de ID yok ve uzak arama negatif → mükerrer fatura riski.`,
                entity_type: "parasut",
                entity_id:   ALERT_ENTITY_PARASUT_INVOICE,
                source:      "system",
            });
        } catch (alertErr) {
            console.error(JSON.stringify({ parasut_alert_fail: String(alertErr), poId }));
        }
        throw new ParasutError(
            "validation",
            "Alış faturası manual review gerekli — attempted marker + uzak arama negatif (duplicate riski)",
        );
    }

    // Tüm doğrulamalar create'ten ÖNCE — kalıcı hatalar marker bırakmamalı.
    const details: PurchaseBillInput["details"] = [];
    for (const line of po.lines) {
        const product = await dbGetProductById(line.product_id);
        if (!product) throw new ParasutError("not_found", `Ürün bulunamadı: ${line.product_id}`);
        if (!product.parasut_product_id) {
            throw new ParasutError("validation", `Ürün Paraşüt product ID eksik: ${product.sku}`);
        }
        details.push({
            // Fatura ALINAN miktar üzerinden kesilir. `received` durumunda
            // received_qty == quantity'dir (051), ama tek doğru kaynak alınan
            // maldır — sipariş edilen değil.
            quantity:       Number(line.received_qty ?? line.quantity),
            unit_price:     Number(line.unit_price),
            vat_rate:       poLineVatRate(line, po),
            discount_type:  "percentage",
            discount_value: Number(line.discount_pct ?? 0),
            description:    `${product.name} (${product.sku})`,
            product_id:     product.parasut_product_id,
            // warehouse: KASITLI OLARAK YOK — stok invariant
        });
    }
    if (details.length === 0) {
        throw new ParasutError("validation", `${po.po_number}: faturalanacak satır yok`);
    }

    const currency = mapCurrency(po.currency);
    // Tedarikçi faturasının KENDİ tarihi varsa o kullanılır (KDV dönemi buna
    // göre belirlenir); yoksa bugüne düşülür.
    const issueDate = po.vendor_invoice_date ?? localISODate(Date.now());
    const dueDate   = computePoDueDate(issueDate, vendor.payment_terms_days ?? 30);
    const exchangeRate = await resolveInvoiceExchangeRate(currency, issueDate);

    // Künye eksikse akış bloklanmaz ama muhasebeci bilgilendirilir: KDV
    // indirimi için tedarikçinin fatura numarası resmen gerekli.
    if (!po.vendor_invoice_no) {
        try {
            await dbCreateAlert({
                type:        "sync_issue",
                severity:    "warning",
                title:       "Alış faturası künyesi eksik",
                description: `${po.po_number} Paraşüt'e tedarikçi fatura numarası OLMADAN gönderildi. KDV indirimi için Paraşüt'te fatura no alanı tamamlanmalı.`,
                entity_type: "parasut",
                entity_id:   ALERT_ENTITY_PARASUT_INVOICE,
                source:      "system",
            });
        } catch (alertErr) {
            console.error(JSON.stringify({ parasut_alert_fail: String(alertErr), poId }));
        }
    }

    const { error: markerErr } = await supabase
        .from("purchase_orders")
        .update({ parasut_bill_create_attempted_at: new Date().toISOString() })
        .eq("id", poId);
    if (markerErr) throw new Error(`Alış faturası attempted marker yazılamadı: ${markerErr.message}`);

    const bill = await parasutApiCall(
        { op: "createPurchaseBill", orderId: poId, step: "invoice" as const },
        () => adapter.createPurchaseBill({
            supplier_id: vendor.parasut_contact_id!,
            issue_date:  issueDate,
            due_date:    dueDate,
            currency,
            description: marker,
            ...(po.vendor_invoice_no ? { invoice_no: po.vendor_invoice_no } : {}),
            ...(exchangeRate !== undefined ? { exchange_rate: exchangeRate } : {}),
            details,
        }),
    );

    await dbWriteBillMeta(poId, bill);
}

/** Vade tarihi — satıştaki `computeDueDate` ile aynı UTC-güvenli aritmetik. */
export function computePoDueDate(issueDate: string, paymentTermsDays: number): string {
    const d = new Date(issueDate + "T00:00:00.000Z");
    d.setUTCDate(d.getUTCDate() + paymentTermsDays);
    return d.toISOString().slice(0, 10);
}

// ── Orkestra ─────────────────────────────────────────────────

export async function serviceSyncPurchaseOrderToParasut(poId: string): Promise<SyncPurchaseOrderResult> {
    if (!isParasutEnabled()) return { success: false, error: "Paraşüt entegrasyonu devre dışı." };

    const po = await dbGetPurchaseOrderById(poId);
    if (!po) return { success: false, error: "Satın alma siparişi bulunamadı." };
    if (po.status !== "received") {
        // Kısmi kabulde fatura kesilmez — bkz. dosya başı gerekçe.
        return { success: false, error: "Yalnızca tamamen mal kabul edilmiş siparişler Paraşüt'e gönderilebilir." };
    }

    const supabase = createServiceClient();
    const owner    = crypto.randomUUID();

    const { data: claimed, error: claimErr } = await supabase.rpc("parasut_claim_po_sync", {
        p_po_id:      poId,
        p_owner:      owner,
        p_lease_secs: LEASE_SECS,
    });
    if (claimErr) {
        const pe = new ParasutError("server", `parasut_claim_po_sync RPC hatası (po=${poId}): ${claimErr.message}`);
        await patchAndLogFailure(poId, (po.parasut_step ?? "contact") as ParasutPoStep, pe, po);
        return { success: false, error: pe.message };
    }
    if (!claimed) return { success: false, skipped: true, reason: "not_eligible_or_locked" };

    let currentStep: ParasutPoStep = "contact";
    const poMut = { parasut_retry_count: po.parasut_retry_count ?? 0 };

    try {
        currentStep = "contact";
        await serviceEnsureParasutVendorContact(po.vendor_id);
        await markPoStepDone(poId, "contact", "product");
        poMut.parasut_retry_count = 0;

        currentStep = "product";
        // Ürün upsert satışla ORTAK (products.parasut_product_id) — aynı ürün
        // iki kez yaratılmaz. Döngüsel bağımlılık yok: satış servisi alışı bilmez.
        const { serviceEnsureParasutProduct } = await import("@/lib/services/parasut-service");
        for (const line of po.lines) {
            if (line.product_id) await serviceEnsureParasutProduct(line.product_id);
        }
        await markPoStepDone(poId, "product", "bill");
        poMut.parasut_retry_count = 0;

        currentStep = "bill";
        // Contact/product adımları DB'yi güncelledi → taze oku.
        const refreshed = await dbGetPurchaseOrderById(poId);
        if (!refreshed) throw new ParasutError("not_found", "PO fatura adımı öncesi bulunamadı (race condition)");
        await upsertPurchaseBill(refreshed);
        await markPoStepDone(poId, "bill", "done");

        return { success: true };
    } catch (err) {
        const pe = err instanceof ParasutError ? err : new ParasutError("server", String(err));
        await patchAndLogFailure(poId, currentStep, pe, poMut);
        if (pe.kind === "auth") {
            try {
                await checkAuthAlertThreshold();
            } catch (thresholdErr) {
                console.error(JSON.stringify({ parasut_auth_threshold_fail: String(thresholdErr), poId }));
            }
        }
        return { success: false, error: pe.message };
    } finally {
        try {
            await supabase.rpc("parasut_release_po_sync", { p_po_id: poId, p_owner: owner });
        } catch { /* best-effort — lease TTL ile düşer */ }
    }
}

async function patchAndLogFailure(
    poId: string,
    step: ParasutPoStep,
    pe: ParasutError,
    poLike: Pick<PurchaseOrderRow, "parasut_retry_count">,
): Promise<void> {
    const supabase = createServiceClient();
    const patch = classifyAndPatchPo(poLike, step, pe);
    try {
        const { error } = await supabase.from("purchase_orders").update(patch).eq("id", poId);
        if (error) console.error(JSON.stringify({ parasut_po_patch_fail: error.message, poId }));
    } catch (e) {
        console.error(String(e));
    }
    try {
        await dbCreateSyncLog({
            entity_type:   "purchase_order",
            entity_id:     poId,
            direction:     "push",
            status:        "error",
            step,
            error_kind:    pe.kind,
            error_message: pe.message,
        });
    } catch { /* best-effort */ }
}

// ── CRON: bekleyen alış faturaları ───────────────────────────

export async function serviceSyncAllPendingPurchaseBills(): Promise<{
    processed: number; succeeded: number; failed: number;
}> {
    if (!isParasutEnabled()) return { processed: 0, succeeded: 0, failed: 0 };

    const supabase = createServiceClient();
    const nowISO   = new Date().toISOString();

    // Aday: mal kabulü tamamlanmış, faturası kesilmemiş, kalıcı hataya
    // düşmemiş PO'lar. Index `idx_po_parasut_retry` bu sorguyla birebir.
    const { data: rows, error } = await supabase
        .from("purchase_orders")
        .select("id")
        .eq("status", "received")
        .is("parasut_bill_id", null)
        .or(`parasut_next_retry_at.is.null,parasut_next_retry_at.lt.${nowISO}`)
        .or("parasut_error_kind.is.null,parasut_error_kind.not.in.(validation,auth)")
        .limit(50);

    if (error) throw new Error(`Bekleyen alış faturaları okunamadı: ${error.message}`);

    let succeeded = 0;
    let failed    = 0;
    for (const row of rows ?? []) {
        const result = await serviceSyncPurchaseOrderToParasut((row as { id: string }).id);
        if (result.success) succeeded++;
        else if (!result.skipped) failed++;
    }
    return { processed: rows?.length ?? 0, succeeded, failed };
}
