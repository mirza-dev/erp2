/**
 * Order Service — business logic layer for order lifecycle.
 * Follows domain-rules.md §4 (orders) + §5 (inventory/reservation).
 * Transition logic is delegated to atomic Postgres RPCs.
 * Used by API routes only (server-side).
 */

import {
    dbGetOrderById,
    dbListOrders,
    dbCreateOrder,
    dbUpdateOrderStatus,
    dbLogOrderAction,
    dbApproveOrder,
    dbShipOrderFull,
    dbCancelOrder,
    type CreateOrderInput,
    type ListOrdersFilter,
    type ApproveOrderResult,
} from "@/lib/supabase/orders";

import type { CommercialStatus, FulfillmentStatus } from "@/lib/database.types";

// ── Types ────────────────────────────────────────────────────

export type OrderTransition = CommercialStatus | "shipped";

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
    // Only draft and pending_approval are valid initial statuses (domain-rules §4.1)
    if (input.commercial_status !== "draft" && input.commercial_status !== "pending_approval") {
        throw new Error(`Geçersiz başlangıç durumu: ${input.commercial_status}`);
    }
    return dbCreateOrder({ ...input, fulfillment_status: "unallocated" });
}

// ── Status Transitions ───────────────────────────────────────

export async function serviceTransitionOrder(
    orderId: string,
    transition: OrderTransition
): Promise<TransitionResult> {

    // ── draft → pending_approval (simple status update, no stock effect) ──
    if (transition === "pending_approval") {
        const order = await dbGetOrderById(orderId);
        if (!order) return { success: false, error: "Sipariş bulunamadı." };
        if (!isValidCommercialTransition(order.commercial_status, "pending_approval")) {
            return { success: false, error: `'${order.commercial_status}' durumundan onay beklemesine geçilemez.` };
        }
        await dbUpdateOrderStatus(orderId, "pending_approval", order.fulfillment_status);
        await dbLogOrderAction(orderId, "status_transition",
            { commercial_status: order.commercial_status },
            { commercial_status: "pending_approval" });
        return { success: true };
    }

    // ── pending_approval → approved: atomic RPC with partial allocation ──
    if (transition === "approved") {
        const result: ApproveOrderResult = await dbApproveOrder(orderId);
        return {
            success: result.success,
            error: result.error,
            shortages: result.shortages,
            fulfillment_status: result.fulfillment_status,
        };
    }

    // ── approved+allocated → shipped: atomic RPC ──
    if (transition === "shipped") {
        const result = await dbShipOrderFull(orderId);
        return { success: result.success, error: result.error };
    }

    // ── cancelled: atomic RPC with reservation release + shortage cancel ──
    if (transition === "cancelled") {
        const result = await dbCancelOrder(orderId);
        return { success: result.success, error: result.error };
    }

    return { success: false, error: `Bilinmeyen geçiş: ${transition}` };
}
