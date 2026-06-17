/**
 * Order Service — business logic layer for order lifecycle.
 * Follows domain-rules.md §4 (orders) + §5 (inventory/reservation).
 * Transition logic is delegated to atomic Postgres RPCs.
 * Used by API routes only (server-side).
 */

import { localISODate } from "@/lib/stock-utils";
import {
    dbGetOrderById,
    dbListOrders,
    dbListOrdersPaged,
    dbCountOrdersByTab,
    dbCreateOrder,
    dbSubmitOrderForApproval,
    dbApproveOrder,
    dbShipOrderFull,
    dbCancelOrder,
    dbListExpiredQuotes,
    dbUpdateOrderQuoteDeadline,
    dbUpdateOrderWithLines,
    type CreateOrderInput,
    type UpdateOrderInput,
    type ListOrdersFilter,
    type OrdersPageQuery,
    type OrdersPageResult,
    type OrderTab,
    type ApproveOrderResult,
    type OrderWithLines,
} from "@/lib/supabase/orders";

import { dbCreateAlert, dbListActiveAlerts, dbBatchResolveAlerts, type BatchResolveEntry } from "@/lib/supabase/alerts";
import { dbGetCustomerById } from "@/lib/supabase/customers";
import { dbGetProductById, dbTryResolveShortages, dbGetOpenShortageProductIds } from "@/lib/supabase/products";
import { createServiceClient } from "@/lib/supabase/service";
import { enqueueInternalNotification } from "@/lib/services/notification-outbox-service";
import type { CommercialStatus, FulfillmentStatus } from "@/lib/database.types";

// ── Types ────────────────────────────────────────────────────

export type OrderTransition = CommercialStatus | "shipped";

export interface ShipMeta {
    shipDate?: string;           // ISO "YYYY-MM-DD"; verilmezse new Date()
    trackingNumber?: string | null;
    carrier?: string | null;
}

export interface TransitionActor {
    userId: string | null;
    label: string | null;
}

export interface ShortageInfo {
    product_name: string;
    requested: number;
    reserved: number;
    shortage: number;
}

export interface TransitionResult {
    success: boolean;
    error?: string;
    shortages?: ShortageInfo[];
    fulfillment_status?: FulfillmentStatus;
    /** O1 (2026-06): sevk RPC'si BAŞARILI (stok düştü) ama shipped_at/parasut_step
     *  yazımı başarısız — durum "başarısız" DEĞİL, uyarılı başarı (UI toast warning). */
    postShipWarning?: string;
}

export interface ValidationResult {
    valid: boolean;
    errors: string[];
}

// ── Transition map (domain-rules.md §4.3) ───────────────────

const COMMERCIAL_TRANSITIONS: Record<CommercialStatus, CommercialStatus[]> = {
    draft:            ["pending_approval", "cancelled"],
    pending_approval: ["approved", "cancelled"],
    approved:         ["cancelled"],  // only if not yet shipped
    cancelled:        [],
};

function isValidCommercialTransition(from: CommercialStatus, to: CommercialStatus): boolean {
    return COMMERCIAL_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Resolves open quote_expired alerts for an order (called on approve/cancel/extend). */
async function resolveQuoteExpiredAlerts(orderId: string): Promise<void> {
    const entry: BatchResolveEntry = {
        type: "quote_expired",
        entityId: orderId,
        reason: "order_state_change",
    };
    await dbBatchResolveAlerts([entry]);
}

// ── Validation ───────────────────────────────────────────────

export function validateOrderCreate(input: CreateOrderInput): ValidationResult {
    const errors: string[] = [];

    if (!input.customer_name?.trim()) errors.push("Müşteri adı zorunludur.");
    if (!input.lines || input.lines.length === 0) errors.push("En az bir satır ürün girilmelidir.");
    if (input.grand_total <= 0) errors.push("Sipariş tutarı 0'dan büyük olmalıdır.");

    if (input.quote_valid_until) {
        const today = localISODate(Date.now());
        if (input.quote_valid_until < today) {
            errors.push("Teklif geçerlilik tarihi bugün veya sonrası olmalıdır.");
        }
    }

    for (const [i, line] of (input.lines ?? []).entries()) {
        if (!line.product_id) errors.push(`Satır ${i + 1}: Ürün seçilmedi.`);
        if (line.quantity <= 0) errors.push(`Satır ${i + 1}: Miktar 0'dan büyük olmalı.`);
        if (line.quantity > 999_999_999) errors.push(`Satır ${i + 1}: Miktar çok büyük.`);
        if (line.unit_price < 0) errors.push(`Satır ${i + 1}: Birim fiyat negatif olamaz.`);
        if (line.unit_price > 999_999_999) errors.push(`Satır ${i + 1}: Birim fiyat çok büyük.`);
    }

    return { valid: errors.length === 0, errors };
}

// ── Order CRUD ───────────────────────────────────────────────

export async function serviceListOrders(filter: ListOrdersFilter = {}) {
    return dbListOrders(filter);
}

/** A1: sunucu tarafı filtre + sayfalama (RSC liste sayfası tüketir). */
export async function serviceListOrdersPaged(q: OrdersPageQuery = {}): Promise<OrdersPageResult> {
    return dbListOrdersPaged(q);
}

/** A1: sekme rozet sayaçları (global, filtre-bağımsız). */
export async function serviceCountOrdersByTab(): Promise<Record<OrderTab, number>> {
    return dbCountOrdersByTab();
}

export async function serviceGetOrder(id: string) {
    return dbGetOrderById(id);
}

export interface ReallocateResult {
    fulfillment_status: FulfillmentStatus | null;
    productsTried: number;
    shortagesResolved: number;
}

/**
 * Bir siparişin açık shortage'larını mevcut stoktan yeniden tahsis etmeyi dener
 * (manuel "Yeniden Rezerve Et"). Siparişin shortage ürünleri için FIFO
 * try_resolve_shortages çağırır; tüm shortage çözülünce sipariş
 * partially_allocated→allocated yükselir (mig.008). PO mal kabulü dışında stok
 * elle geldiğinde de sevk yolunu açar (denetim O2). Best-effort: bir ürün
 * çözülemese de diğerleri denenir. approved-only (try_resolve_shortages kapsamı).
 */
export async function serviceReallocateOrder(orderId: string): Promise<ReallocateResult> {
    const order = await dbGetOrderById(orderId);
    if (!order) throw new Error("Sipariş bulunamadı.");

    const productIds = await dbGetOpenShortageProductIds(orderId);
    let shortagesResolved = 0;
    for (const pid of productIds) {
        try {
            const r = await dbTryResolveShortages(pid);
            shortagesResolved += r.shortages_resolved;
        } catch {
            // best-effort — tek ürün hatası tüm işlemi bozmaz
        }
    }

    const updated = await dbGetOrderById(orderId);
    return {
        fulfillment_status: updated?.fulfillment_status ?? null,
        productsTried: productIds.length,
        shortagesResolved,
    };
}

export async function serviceCreateOrder(input: CreateOrderInput) {
    const validation = validateOrderCreate(input);
    if (!validation.valid) throw new Error(validation.errors.join(" "));
    // Only draft and pending_approval are valid initial statuses (domain-rules §4.1)
    if (input.commercial_status !== "draft" && input.commercial_status !== "pending_approval") {
        throw new Error(`Geçersiz başlangıç durumu: ${input.commercial_status}`);
    }
    return dbCreateOrder({ ...input, fulfillment_status: "unallocated" });
}

// ── Draft edit (Faz 2) ───────────────────────────────────────

export function validateOrderUpdate(input: UpdateOrderInput): ValidationResult {
    const errors: string[] = [];

    if (!input.customer_name?.trim()) errors.push("Müşteri adı zorunludur.");
    if (!input.lines || input.lines.length === 0) errors.push("En az bir satır ürün girilmelidir.");

    if (input.quote_valid_until) {
        const today = localISODate(Date.now());
        if (input.quote_valid_until < today) {
            errors.push("Teklif geçerlilik tarihi bugün veya sonrası olmalıdır.");
        }
    }

    for (const [i, line] of (input.lines ?? []).entries()) {
        if (!line.product_id) errors.push(`Satır ${i + 1}: Ürün seçilmedi.`);
        if (line.quantity <= 0) errors.push(`Satır ${i + 1}: Miktar 0'dan büyük olmalı.`);
        if (line.quantity > 999_999_999) errors.push(`Satır ${i + 1}: Miktar çok büyük.`);
        if (line.unit_price < 0) errors.push(`Satır ${i + 1}: Birim fiyat negatif olamaz.`);
        if (line.unit_price > 999_999_999) errors.push(`Satır ${i + 1}: Birim fiyat çok büyük.`);
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Taslak siparişin içeriğini değiştirir (müşteri/kalem/not/teklif vadesi).
 * Yalnızca draft düzenlenebilir — service pre-check + RPC FOR UPDATE guard
 * (yarış: RPC authoritative). Totaller RPC içinde line_total'lerden hesaplanır.
 */
export async function serviceUpdateOrderLines(
    orderId: string,
    input: UpdateOrderInput,
    actor?: string | null,
) {
    const order = await dbGetOrderById(orderId);
    if (!order) throw new Error("Sipariş bulunamadı.");
    if (order.commercial_status !== "draft") {
        throw new Error("Yalnızca taslak siparişler düzenlenebilir.");
    }
    const validation = validateOrderUpdate(input);
    if (!validation.valid) throw new Error(validation.errors.join(" "));
    return dbUpdateOrderWithLines(orderId, input, actor);
}

// ── Faz 11.1: Shipment Preflight ─────────────────────────────
// Sevk öncesi customer/product güncel okuma + Paraşüt için zorunlu alan kontrolü.
// Transition fail olursa stok hareketi yapılmaz, sync başlamaz.

const PARASUT_ORDER_NUMBER_REGEX = /^ORD-(\d{4})-(\d+)$/;

export interface PreflightResult {
    valid: boolean;
    error?: string;
}

export async function preflightShipment(order: OrderWithLines): Promise<PreflightResult> {
    if (!order.customer_id) {
        return { valid: false, error: "Sipariş müşterisiz sevk edilemez." };
    }

    const parasutEnabled = process.env.PARASUT_ENABLED === "true";
    if (!parasutEnabled) {
        return { valid: true };
    }

    const customer = await dbGetCustomerById(order.customer_id);
    if (!customer) {
        return { valid: false, error: "Sevk için müşteri kaydı bulunamadı." };
    }
    if (!customer.tax_number || customer.tax_number.trim() === "") {
        return { valid: false, error: "Paraşüt için müşteri vergi numarası (tax_number) zorunludur." };
    }

    if (!PARASUT_ORDER_NUMBER_REGEX.test(order.order_number)) {
        return {
            valid: false,
            error: `Sipariş numarası Paraşüt için uygun değil (beklenen: ORD-YYYY-NNNN): ${order.order_number}`,
        };
    }

    for (const line of order.lines) {
        if (!line.product_id) continue;
        const product = await dbGetProductById(line.product_id);
        if (!product) {
            return {
                valid: false,
                error: `Sipariş satırındaki ürün bulunamadı: ${line.product_name || line.product_id}`,
            };
        }
        if (!product.sku || product.sku.trim() === "") {
            return { valid: false, error: `Paraşüt için ürün SKU eksik: ${product.name}` };
        }
    }

    return { valid: true };
}

// ── Status Transitions ───────────────────────────────────────

export async function serviceTransitionOrder(
    orderId: string,
    transition: OrderTransition,
    shipMeta?: ShipMeta,
    actor?: TransitionActor,
): Promise<TransitionResult> {

    // ── draft → pending_approval: HARD rezervasyon BURADA (migration 082) ──
    // Eskiden no-op statü geçişiydi; artık submit_order_for_approval RPC stok
    // kontrol + rezervasyon + shortage yapar (eski "approved" mantığı buraya taşındı).
    if (transition === "pending_approval") {
        const order = await dbGetOrderById(orderId);
        if (!order) return { success: false, error: "Sipariş bulunamadı." };
        if (!isValidCommercialTransition(order.commercial_status, "pending_approval")) {
            return { success: false, error: `'${order.commercial_status}' durumundan onay beklemesine geçilemez.` };
        }
        const result: ApproveOrderResult = await dbSubmitOrderForApproval(orderId);
        if (!result.success) {
            return { success: false, error: result.error };
        }
        await enqueueInternalNotification({
            eventKey: `sales_order:${orderId}:pending_approval`,
            notificationType: "order_pending",
            entityType: "sales_order",
            entityId: orderId,
            actorUserId: actor?.userId ?? null,
            actorLabel: actor?.label ?? null,
            render: { type: "order_pending", ctx: {
                orderId,
                orderNumber: order.order_number,
                customerName: order.customer_name,
                total: order.grand_total,
                currency: order.currency,
                actorLabel: actor?.label ?? null,
            } },
        }).catch(err => console.error("[outbox order_pending]", err));
        return {
            success: true,
            shortages: result.shortages,
            fulfillment_status: result.fulfillment_status,
        };
    }

    // ── pending_approval → approved: light ticari teyit (rezervasyon zaten ──
    // pending'de yapıldı). approve_order RPC sadece statü flip eder; legacy
    // rezervsiz pending'de fallback allocation çalışır (shortages dönebilir).
    if (transition === "approved") {
        const order = await dbGetOrderById(orderId);
        if (!order) return { success: false, error: "Sipariş bulunamadı." };
        if (!isValidCommercialTransition(order.commercial_status, "approved")) {
            return { success: false, error: `'${order.commercial_status}' durumundaki sipariş onaylanamaz. Önce onaya gönderin.` };
        }
        const result: ApproveOrderResult = await dbApproveOrder(orderId);
        if (result.success) await resolveQuoteExpiredAlerts(orderId);
        return {
            success: result.success,
            error: result.error,
            shortages: result.shortages,
            fulfillment_status: result.fulfillment_status,
        };
    }

    // ── approved+allocated → shipped: preflight + atomic RPC ──
    if (transition === "shipped") {
        const order = await dbGetOrderById(orderId);
        if (!order) return { success: false, error: "Sipariş bulunamadı." };
        if (order.commercial_status !== "approved") {
            return { success: false, error: "Yalnızca onaylanmış siparişler sevk edilebilir." };
        }

        // Faz 11.1: Preflight — customer/products güncel okuma + Paraşüt zorunluları.
        // Fail → stok hareketi yapılmaz, sync başlamaz.
        const preflight = await preflightShipment(order);
        if (!preflight.valid) {
            return { success: false, error: preflight.error };
        }

        const result = await dbShipOrderFull(orderId);
        if (result.success) {
            // shipped_at her zaman yazılır (Paraşüt'ten bağımsız — sevk tarihi kanonik kaynak).
            // shipMeta varsa kullanıcının seçtiği tarih; yoksa now().
            // parasut_step='contact' yalnızca Paraşüt aktifken (sync başlangıç durumu).
            // Hata yutulmaz: stok hareketi yapılmış olsa da bu yazım başarısızsa Paraşüt sync
            // doğru başlangıç state'ine gelemez → caller'a explicit error iletilir.
            const supabase = createServiceClient();
            const patch: Record<string, unknown> = {
                shipped_at: shipMeta?.shipDate
                    ? new Date(`${shipMeta.shipDate}T12:00:00Z`).toISOString()
                    : new Date().toISOString(),
                shipment_tracking_number: shipMeta?.trackingNumber ?? null,
                shipment_carrier:         shipMeta?.carrier        ?? null,
            };
            if (process.env.PARASUT_ENABLED === "true") {
                patch.parasut_step = "contact";
            }
            const { error: updErr } = await supabase
                .from("sales_orders")
                .update(patch)
                .eq("id", orderId);
            if (updErr) {
                console.error(JSON.stringify({
                    transition_post_ship_update_fail: updErr.message,
                    orderId,
                    patch,
                }));
                // O1 (2026-06): stok GERÇEKTEN hareket etti (RPC commit edildi) —
                // caller'a "başarısız" demek yanıltıcıydı (UI retry'ı teşvik eder,
                // durum tutarsız görünür). Dürüst sinyal: uyarılı başarı; Paraşüt
                // başlangıç adımı için manuel kontrol mesajda.
                await enqueueInternalNotification({
                    eventKey: `sales_order:${orderId}:shipped`,
                    notificationType: "order_shipped",
                    entityType: "sales_order",
                    entityId: orderId,
                    actorUserId: actor?.userId ?? null,
                    actorLabel: actor?.label ?? null,
                    render: { type: "order_shipped", ctx: {
                        orderId,
                        orderNumber: order.order_number,
                        customerName: order.customer_name,
                        actorLabel: actor?.label ?? null,
                    } },
                }).catch(err => console.error("[outbox order_shipped]", err));
                return {
                    success: true,
                    postShipWarning: `Sevk tamamlandı ancak sevk tarihi/Paraşüt adımı yazılamadı: ${updErr.message}. Kaydı manuel kontrol edin.`,
                };
            }
            await enqueueInternalNotification({
                eventKey: `sales_order:${orderId}:shipped`,
                notificationType: "order_shipped",
                entityType: "sales_order",
                entityId: orderId,
                actorUserId: actor?.userId ?? null,
                actorLabel: actor?.label ?? null,
                render: { type: "order_shipped", ctx: {
                    orderId,
                    orderNumber: order.order_number,
                    customerName: order.customer_name,
                    actorLabel: actor?.label ?? null,
                } },
            }).catch(err => console.error("[outbox order_shipped]", err));
        }
        return { success: result.success, error: result.error };
    }

    // ── cancelled: atomic RPC with reservation release + shortage cancel ──
    if (transition === "cancelled") {
        const result = await dbCancelOrder(orderId);
        if (result.success) await resolveQuoteExpiredAlerts(orderId);
        return { success: result.success, error: result.error };
    }

    return { success: false, error: `Bilinmeyen geçiş: ${transition}` };
}

// ── Quote Deadline Update ────────────────────────────────────

/**
 * Updates quote_valid_until and resolves open quote_expired alerts
 * if the new date is today or in the future (i.e. quote is now valid again).
 */
export async function serviceUpdateQuoteDeadline(
    orderId: string,
    quoteValidUntil: string | null
): Promise<void> {
    await dbUpdateOrderQuoteDeadline(orderId, quoteValidUntil);
    const today = localISODate(Date.now());
    if (quoteValidUntil && quoteValidUntil >= today) {
        await resolveQuoteExpiredAlerts(orderId);
    }
}

// ── Quote Expiry ─────────────────────────────────────────────

/**
 * Süresi dolmuş teklifleri tarar:
 *   - draft → cancel_order RPC ile otomatik iptal (rezervasyon yok, güvenli)
 *   - pending_approval → quote_expired alert üretir (insan kararı gerekir)
 *
 * Endpoint: POST /api/orders/expire-quotes (CRON_SECRET ile çağrılır)
 */
export async function serviceExpireQuotes(): Promise<{ expired: number; alerted: number }> {
    const expiredOrders = await dbListExpiredQuotes();
    if (expiredOrders.length === 0) return { expired: 0, alerted: 0 };

    // Mevcut açık alert'ler — pending_approval dedup için
    const activeAlerts = await dbListActiveAlerts();
    const activeSet = new Set(
        activeAlerts
            .filter(a => a.type === "quote_expired")
            .map(a => a.entity_id)
    );

    let expired = 0;
    let alerted = 0;

    for (const order of expiredOrders) {
        if (order.commercial_status === "draft") {
            const result = await dbCancelOrder(order.id);
            if (result.success) expired++;
        } else if (order.commercial_status === "pending_approval") {
            if (activeSet.has(order.id)) continue;
            await dbCreateAlert({
                type: "quote_expired",
                severity: "warning",
                title: `Teklif Süresi Doldu: ${order.order_number}`,
                description: `${order.customer_name} — ${order.order_number} teklifinin süresi ${order.quote_valid_until} tarihinde doldu. İptal veya uzatma gerekiyor.`,
                entity_type: "sales_order",
                entity_id: order.id,
            });
            alerted++;
        }
    }

    return { expired, alerted };
}
