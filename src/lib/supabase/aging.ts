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
    productType: "raw_material" | "manufactured" | "commercial";
    isForSales: boolean;
    isForPurchase: boolean;
    lastMovementDate: string | null;         // ISO timestamptz, null = hiç hareket yok
    lastSaleDate: string | null;
    lastIncomingDate: string | null;
    lastProductionDate: string | null;       // mamul: üretildiği tarih (production_entries)
    lastComponentUsageDate: string | null;   // hammadde: üretimde tüketildiği tarih (inventory_movements)
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
 * Hammadde eşikleri — toplu alım doğası gereği daha uzun tutulur.
 * < 60 → active · 60–119 → slow · 120–239 → stagnant · ≥ 240 → dead
 */
export function computeAgingCategoryRaw(days: number | null): AgingCategory {
    if (days === null) return "no_movement";
    if (days < 60)    return "active";
    if (days < 120)   return "slow";
    if (days < 240)   return "stagnant";
    return "dead";
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
 * @deprecated computeAgingCategoryRaw veya computeAgingCategoryFinished kullan.
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
 * Hammadde tüketimi için dbGetLastComponentUsageDates() kullan.
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

/**
 * Her hammadde için üretimde son kullanıldığı tarihi döner.
 * Kaynak: inventory_movements WHERE movement_type='production' AND quantity < 0
 * (complete_production() RPC'si BOM tüketimini bu şekilde kaydeder.)
 */
export async function dbGetLastComponentUsageDates(): Promise<Map<string, string>> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("inventory_movements")
        .select("product_id, occurred_at")
        .eq("movement_type", "production")
        .lt("quantity", 0)
        .order("occurred_at", { ascending: false });
    if (error || !data) return new Map();
    const map = new Map<string, string>();
    for (const row of data) {
        // İlk karşılaşılan = en yeni (DESC sıralı)
        if (!map.has(row.product_id)) {
            map.set(row.product_id, row.occurred_at);
        }
    }
    return map;
}
