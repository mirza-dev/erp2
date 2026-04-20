import { createServiceClient } from "./service";

// ── Types ────────────────────────────────────────────────────

export type AgingCategory = "active" | "slow" | "stagnant" | "dead" | "no_movement";

export interface AgingRow {
    productId: string;
    productName: string;
    sku: string;
    category: string | null;
    unit: string;
    onHand: number;
    price: number;
    currency: string;
    productType: "manufactured" | "commercial";
    lastMovementDate: string | null;         // ISO timestamptz, null = hiç hareket yok
    lastSaleDate: string | null;
    lastIncomingDate: string | null;
    lastProductionDate: string | null;       // mamul: üretildiği tarih (production_entries)
    daysWaiting: number | null;          // null = no movement
    agingCategory: AgingCategory;
    costPrice: number | null;            // maliyet fiyatı (null = girilmemiş)
    boundCapital: number;                // on_hand * (cost_price ?? price)
}

// ── Pure helpers ─────────────────────────────────────────────

/** Null-safe MAX of two ISO timestamp strings. */
export function pickMax(a: string | null, b: string | null): string | null {
    if (!a) return b;
    if (!b) return a;
    return a > b ? a : b;
}

/**
 * Mamul / ticari mal eşikleri — daha hızlı dönmeli.
 * < 45 → active · 45–89 → slow · 90–179 → stagnant · ≥ 180 → dead
 */
export function computeAgingCategoryFinished(days: number | null): AgingCategory {
    if (days === null) return "no_movement";
    if (days < 45)    return "active";
    if (days < 90)    return "slow";
    if (days < 180)   return "stagnant";
    return "dead";
}

/**
 * Geriye dönük uyumluluk için korunuyor.
 * @deprecated computeAgingCategoryFinished kullan.
 */
export function computeAgingCategory(days: number | null): AgingCategory {
    return computeAgingCategoryFinished(days);
}

// ── Queries ──────────────────────────────────────────────────

/**
 * Her ürün için en son onaylı satış siparişinin tarihini döner.
 * order_lines JOIN sales_orders (commercial_status = 'approved')
 */
export async function dbGetLastSaleDates(): Promise<Map<string, string>> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("order_lines")
        .select("product_id, sales_orders!inner(created_at, commercial_status)")
        .in("sales_orders.commercial_status", ["approved"]);
    if (error || !data) return new Map();
    const map = new Map<string, string>();
    for (const row of data) {
        const raw = (row as unknown as { product_id: string; sales_orders: { created_at: string } | { created_at: string }[] }).sales_orders;
        const order = Array.isArray(raw) ? raw[0] : raw;
        if (!order?.created_at) continue;
        const existing = map.get(row.product_id);
        if (!existing || order.created_at > existing) {
            map.set(row.product_id, order.created_at);
        }
    }
    return map;
}

/**
 * Her ürün için en son gerçek stok girişinin tarihini döner.
 * Sadece status='received' satırlar — received_at = fiziksel teslim zamanı.
 */
export async function dbGetLastIncomingDates(): Promise<Map<string, string>> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("purchase_commitments")
        .select("product_id, received_at")
        .eq("status", "received");
    if (error || !data) return new Map();
    const map = new Map<string, string>();
    for (const row of data) {
        if (!row.received_at) continue;
        const existing = map.get(row.product_id);
        if (!existing || row.received_at > existing) {
            map.set(row.product_id, row.received_at);
        }
    }
    return map;
}

/**
 * Her mamul ürün için en son üretildiği tarihi döner.
 * Kaynak: production_entries.product_id = üretilen mamulün ID'si.
 */
export async function dbGetLastProductionDates(): Promise<Map<string, string>> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("production_entries")
        .select("product_id, production_date")
        .order("production_date", { ascending: false });
    if (error || !data) return new Map();
    const map = new Map<string, string>();
    for (const row of data) {
        // İlk karşılaşılan = en yeni (DESC sıralı)
        if (!map.has(row.product_id)) {
            map.set(row.product_id, row.production_date);
        }
    }
    return map;
}

