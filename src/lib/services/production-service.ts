/**
 * Production Service — üretim girişi + BOM tüketimi.
 * Akış:
 *  1. Bitmiş ürünün BOM'unu çek
 *  2. Her bileşen için yeterli stok var mı kontrol et
 *  3. Bileşen stoklarını düş (adjust_on_hand negatif delta)
 *  4. Bitmiş ürün stoğunu artır (adjust_on_hand pozitif delta)
 *  5. Inventory movements kaydet
 *  6. production_entries kaydı oluştur
 */

import { dbGetProductById } from "@/lib/supabase/products";
import { dbRecordMovement } from "@/lib/supabase/products";
import { dbGetBOM, dbCreateProductionEntry } from "@/lib/supabase/production";

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
    // 1. Bitmiş ürünü çek
    const product = await dbGetProductById(input.product_id);
    if (!product) return { success: false, error: "Ürün bulunamadı." };
    if (!product.is_active) return { success: false, error: "Ürün aktif değil." };
    if (input.produced_qty <= 0) return { success: false, error: "Üretim miktarı sıfırdan büyük olmalı." };

    // 2. BOM'u çek
    const bom = await dbGetBOM(input.product_id);

    // 3. Stok yeterliliği kontrolü
    const shortages: ComponentShortage[] = [];
    for (const row of bom) {
        const comp = await dbGetProductById(row.component_product_id);
        if (!comp) continue;
        const required = row.quantity * input.produced_qty;
        if (comp.available_now < required) {
            shortages.push({
                component_product_id: row.component_product_id,
                required_qty: required,
                available_qty: comp.available_now,
            });
        }
    }
    if (shortages.length > 0) {
        return { success: false, error: "Yetersiz bileşen stoğu.", shortages };
    }

    const productionDate = input.production_date ?? new Date().toISOString().split("T")[0];

    // 4. Bileşen stoklarını tüket
    for (const row of bom) {
        const consumed = row.quantity * input.produced_qty;
        await dbRecordMovement({
            product_id: row.component_product_id,
            movement_type: "production",
            quantity: -consumed,
            reference_type: "production_entry",
            notes: `BOM tüketimi: ${product.name} x${input.produced_qty}`,
        });
    }

    // 5. Bitmiş ürün stoğunu artır
    await dbRecordMovement({
        product_id: input.product_id,
        movement_type: "production",
        quantity: input.produced_qty,
        reference_type: "production_entry",
        notes: input.notes ?? `Üretim girişi: ${input.produced_qty} ${product.unit}`,
    });

    // 6. Üretim kaydı oluştur
    const entry = await dbCreateProductionEntry({
        product_id: input.product_id,
        product_name: product.name,
        product_sku: product.sku,
        produced_qty: input.produced_qty,
        scrap_qty: input.scrap_qty,
        waste_reason: input.waste_reason,
        production_date: productionDate,
        notes: input.notes,
        related_order_id: input.related_order_id,
        entered_by: input.entered_by,
    });

    return { success: true, entry_id: entry.id };
}
