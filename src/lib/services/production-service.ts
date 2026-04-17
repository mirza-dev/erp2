/**
 * Production Service — üretim girişi + BOM tüketimi.
 * Tüm iş tek bir atomik RPC (complete_production) ile yapılır:
 *  1. BOM validasyonu + bileşen kilidi
 *  2. Bileşen tüketimi + bitmiş ürün stoğu artışı
 *  3. Movement kayıtları + production_entry oluşturma
 * Sonrasında shortage resolution ayrı RPC ile tetiklenir (non-fatal).
 */

import { dbCompleteProduction } from "@/lib/supabase/production";
import { dbTryResolveShortages } from "@/lib/supabase/products";

export interface CreateProductionInput {
    product_id: string;
    produced_qty: number;
    scrap_qty?: number;
    waste_reason?: string;
    production_date?: string;   // defaults to today
    notes?: string;
    related_order_id?: string;
    entered_by?: string;
}

export interface ComponentShortage {
    component_product_id: string;
    required_qty: number;
    available_qty: number;
}

export interface ProductionResult {
    success: boolean;
    entry_id?: string;
    error?: string;
    shortages?: ComponentShortage[];
}

export async function serviceCreateProductionEntry(
    input: CreateProductionInput
): Promise<ProductionResult> {
    // 1. Basic validation (fast fail before RPC)
    if (!input.product_id) return { success: false, error: "Ürün ID zorunludur." };
    if (!input.produced_qty || input.produced_qty <= 0) {
        return { success: false, error: "Üretim miktarı sıfırdan büyük olmalı." };
    }
    if (input.scrap_qty != null && (input.scrap_qty < 0 || input.scrap_qty > input.produced_qty)) {
        return { success: false, error: "Fire miktarı 0 ile üretim miktarı arasında olmalı." };
    }

    // 2. Atomic production: BOM check + consume + produce + record — all in one transaction
    const result = await dbCompleteProduction({
        product_id: input.product_id,
        produced_qty: input.produced_qty,
        scrap_qty: input.scrap_qty,
        waste_reason: input.waste_reason,
        production_date: input.production_date,
        notes: input.notes,
        related_order_id: input.related_order_id,
        entered_by: input.entered_by,
    });

    if (!result.success) {
        return {
            success: false,
            error: result.error,
            shortages: result.shortages,
        };
    }

    // 3. Post-production shortage resolution (non-fatal)
    // Finished product stock increased — try to allocate to waiting orders
    try {
        await dbTryResolveShortages(input.product_id);
    } catch {
        // Shortage resolution failure must not roll back production
        console.warn("[production-service] shortage resolution failed (non-fatal)", input.product_id);
    }

    return { success: true, entry_id: result.entry_id };
}
