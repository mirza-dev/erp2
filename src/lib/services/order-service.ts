/**
 * Order Service — business logic layer for order lifecycle.
 * Follows domain-rules.md §4 (orders) + §5 (inventory/reservation).
 * Used by API routes only (server-side).
 */

import {
    dbGetOrderById,
    dbListOrders,
    dbCreateOrder,
    dbUpdateOrderStatus,
    dbGetProductStocks,
    dbReserveStock,
    dbReleaseStock,
    dbShipOrder,
    dbLogOrderAction,
    type CreateOrderInput,
    type ListOrdersFilter,
    type StockConflict,
} from "@/lib/supabase/orders";

import type { CommercialStatus, FulfillmentStatus } from "@/lib/database.types";

// ── Types ────────────────────────────────────────────────────

export type OrderTransition = CommercialStatus | "shipped";

export interface TransitionResult {
    success: boolean;
    error?: string;
    conflicts?: StockConflict[];
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

// ── Validation ───────────────────────────────────────────────

export function validateOrderCreate(input: CreateOrderInput): ValidationResult {
    const errors: string[] = [];

    if (!input.customer_name?.trim()) errors.push("Müşteri adı zorunludur.");
    if (!input.lines || input.lines.length === 0) errors.push("En az bir satır ürün girilmelidir.");
    if (input.grand_total <= 0) errors.push("Sipariş tutarı 0'dan büyük olmalıdır.");

    for (const [i, line] of (input.lines ?? []).entries()) {
        if (!line.product_id) errors.push(`Satır ${i + 1}: Ürün seçilmedi.`);
        if (line.quantity <= 0) errors.push(`Satır ${i + 1}: Miktar 0'dan büyük olmalı.`);
        if (line.unit_price < 0) errors.push(`Satır ${i + 1}: Birim fiyat negatif olamaz.`);
    }

    return { valid: errors.length === 0, errors };
}

// ── Order CRUD ───────────────────────────────────────────────

export async function serviceListOrders(filter: ListOrdersFilter = {}) {
    return dbListOrders(filter);
}

export async function serviceGetOrder(id: string) {
    return dbGetOrderById(id);
}

export async function serviceCreateOrder(input: CreateOrderInput) {
    const validation = validateOrderCreate(input);
    if (!validation.valid) throw new Error(validation.errors.join(" "));
    return dbCreateOrder(input);
}

// ── Status Transitions ───────────────────────────────────────

export async function serviceTransitionOrder(
    orderId: string,
    transition: OrderTransition
): Promise<TransitionResult> {
    const order = await dbGetOrderById(orderId);
    if (!order) return { success: false, error: "Sipariş bulunamadı." };

    const prevCommercial = order.commercial_status;
    const prevFulfillment = order.fulfillment_status;

    // ── draft → pending_approval ─────────────────────────────
    if (transition === "pending_approval") {
        if (!isValidCommercialTransition(prevCommercial, "pending_approval")) {
            return { success: false, error: `'${prevCommercial}' durumundan onay beklemesine geçilemez.` };
        }
        await dbUpdateOrderStatus(orderId, "pending_approval", prevFulfillment);
        await dbLogOrderAction(orderId, "status_transition", { commercial_status: prevCommercial }, { commercial_status: "pending_approval" });
        return { success: true };
    }

    // ── pending_approval → approved: conflict check + reserve stock ──
    if (transition === "approved") {
        if (!isValidCommercialTransition(prevCommercial, "approved")) {
            return { success: false, error: `'${prevCommercial}' durumundan onaylamaya geçilemez.` };
        }

        // Check stock for all lines (domain-rules §5.1: hard reservation only on approved)
        const productIds = order.lines.map(l => l.product_id);
        const stocks = await dbGetProductStocks(productIds);

        const conflicts: StockConflict[] = [];
        for (const line of order.lines) {
            const stock = stocks.get(line.product_id);
            const available = stock?.available_now ?? 0;
            if (available < line.quantity) {
                conflicts.push({
                    product_id: line.product_id,
                    product_name: line.product_name,
                    requested: line.quantity,
                    available,
                });
            }
        }

        if (conflicts.length > 0) {
            return { success: false, conflicts };
        }

        // Reserve stock and update status
        await dbReserveStock(orderId, order.lines);
        await dbUpdateOrderStatus(orderId, "approved", "allocated");
        await dbLogOrderAction(orderId, "order_approved",
            { commercial_status: prevCommercial, fulfillment_status: prevFulfillment },
            { commercial_status: "approved", fulfillment_status: "allocated" }
        );
        return { success: true };
    }

    // ── approved/allocated → shipped ────────────────────────
    if (transition === "shipped") {
        if (prevCommercial !== "approved") {
            return { success: false, error: "Yalnızca onaylı sipariş sevk edilebilir." };
        }
        if (prevFulfillment !== "allocated" && prevFulfillment !== "partially_allocated") {
            return { success: false, error: "Sipariş rezerveli olmalıdır." };
        }

        await dbShipOrder(orderId, order.lines);
        await dbUpdateOrderStatus(orderId, "approved", "shipped");
        await dbLogOrderAction(orderId, "order_shipped",
            { fulfillment_status: prevFulfillment },
            { fulfillment_status: "shipped" }
        );
        return { success: true };
    }

    // ── cancelled ────────────────────────────────────────────
    if (transition === "cancelled") {
        if (!isValidCommercialTransition(prevCommercial, "cancelled")) {
            return { success: false, error: `'${prevCommercial}' durumundan iptal edilemez.` };
        }

        // Only release stock if order was allocated (domain-rules §4.5)
        if (prevFulfillment === "allocated" || prevFulfillment === "partially_allocated") {
            await dbReleaseStock(orderId);
        }

        await dbUpdateOrderStatus(orderId, "cancelled", "unallocated");
        await dbLogOrderAction(orderId, "order_cancelled",
            { commercial_status: prevCommercial, fulfillment_status: prevFulfillment },
            { commercial_status: "cancelled", fulfillment_status: "unallocated" }
        );
        return { success: true };
    }

    return { success: false, error: `Bilinmeyen geçiş: ${transition}` };
}
