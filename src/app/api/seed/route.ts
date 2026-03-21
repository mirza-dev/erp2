/**
 * POST /api/seed — Seeds the Supabase DB with mock data.
 * Only for development. Remove or protect with auth in production.
 */
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

const SEED_PRODUCTS = [
    { name: "3 Parçalı Küresel Vana DN25", sku: "KV-3P-DN25", category: "Küresel Vanalar", unit: "adet", price: 450, currency: "USD", on_hand: 1200, reserved: 150, min_stock_level: 200, product_type: "finished", warehouse: "Sevkiyat Deposu", reorder_qty: 400 },
    { name: "2 Parçalı Küresel Vana DN50", sku: "KV-2P-DN50", category: "Küresel Vanalar", unit: "adet", price: 680, currency: "USD", on_hand: 800, reserved: 300, min_stock_level: 100, product_type: "finished", warehouse: "Sevkiyat Deposu", reorder_qty: 200 },
    { name: "API Forged Sürgülü Vana DN100", sku: "SV-API-DN100", category: "Sürgülü Vanalar", unit: "adet", price: 1250, currency: "USD", on_hand: 350, reserved: 120, min_stock_level: 50, product_type: "finished", warehouse: "Sevkiyat Deposu", reorder_qty: 100 },
    { name: "Wafer Tip Kelebek Vana DN150", sku: "KB-WT-DN150", category: "Kelebek Vanalar", unit: "adet", price: 320, currency: "USD", on_hand: 180, reserved: 160, min_stock_level: 50, product_type: "finished", warehouse: "Sevkiyat Deposu", reorder_qty: 100, daily_usage: 3 },
    { name: "Spiral Sarım Conta DN80", sku: "CT-SS-DN80", category: "Contalar", unit: "adet", price: 45, currency: "USD", on_hand: 5000, reserved: 800, min_stock_level: 1000, product_type: "finished", warehouse: "Sevkiyat Deposu", reorder_qty: 2000 },
    { name: "PTFE Conta DN50", sku: "CT-PTFE-DN50", category: "Contalar", unit: "adet", price: 28, currency: "USD", on_hand: 3500, reserved: 500, min_stock_level: 500, product_type: "finished", warehouse: "Sevkiyat Deposu", reorder_qty: 1000 },
    { name: "Y Tipi Filtre DN100", sku: "FT-Y-DN100", category: "Filtreler", unit: "adet", price: 580, currency: "USD", on_hand: 120, reserved: 30, min_stock_level: 20, product_type: "finished", warehouse: "Sevkiyat Deposu", reorder_qty: 40 },
    { name: "Lift Tipi Çek Valf DN25", sku: "CV-LT-DN25", category: "Çek Valfler", unit: "adet", price: 290, currency: "USD", on_hand: 450, reserved: 200, min_stock_level: 80, product_type: "finished", warehouse: "Sevkiyat Deposu", reorder_qty: 160 },
    { name: "Çift Klapeli Çek Valf DN200", sku: "CV-CK-DN200", category: "Çek Valfler", unit: "adet", price: 1850, currency: "USD", on_hand: 60, reserved: 55, min_stock_level: 15, product_type: "finished", warehouse: "Sevkiyat Deposu", reorder_qty: 30 },
    { name: "Motorlu Küresel Vana DN32", sku: "KV-MOT-DN32", category: "Aktüatörlü Vanalar", unit: "adet", price: 1100, currency: "USD", on_hand: 85, reserved: 20, min_stock_level: 20, product_type: "finished", warehouse: "Sevkiyat Deposu", reorder_qty: 40 },
] as const;

const SEED_CUSTOMERS = [
    { name: "Petkim Petrokimya A.Ş.", email: "tedarik@petkim.com.tr", phone: "+90 232 000 0001", address: "Petkim Yarımadası, Aliağa, İzmir", tax_number: "1234567890", tax_office: "Aliağa VD", country: "TR", currency: "USD", total_orders: 12, total_revenue: 284500 },
    { name: "Tüpraş İzmit Rafinerisi", email: "procurement@tupras.com.tr", phone: "+90 262 000 0002", address: "Körfez, Kocaeli", tax_number: "2345678901", tax_office: "Körfez VD", country: "TR", currency: "USD", total_orders: 8, total_revenue: 192000 },
    { name: "Borusan Mannesmann", email: "satinalma@borusan.com", phone: "+90 216 000 0003", address: "Gemlik, Bursa", tax_number: "3456789012", tax_office: "Gemlik VD", country: "TR", currency: "EUR", total_orders: 5, total_revenue: 97500 },
    { name: "Shell & Turcas Petrol", email: "supply@shellturcas.com", phone: "+90 212 000 0004", address: "Levent, İstanbul", tax_number: "4567890123", tax_office: "Levent VD", country: "TR", currency: "USD", total_orders: 15, total_revenue: 445000 },
] as const;

export async function POST() {
    try {
        const supabase = createServiceClient();

        // Seed products (upsert on SKU)
        const { error: pErr } = await supabase
            .from("products")
            .upsert(
                SEED_PRODUCTS.map(p => ({ ...p, is_active: true })),
                { onConflict: "sku" }
            );
        if (pErr) throw new Error("Products: " + pErr.message);

        // Seed customers — only insert if table is empty
        const { count: cCount } = await supabase
            .from("customers")
            .select("*", { count: "exact", head: true });
        if ((cCount ?? 0) === 0) {
            const { error: cErr } = await supabase
                .from("customers")
                .insert(SEED_CUSTOMERS.map(c => ({ ...c, is_active: true })));
            if (cErr) throw new Error("Customers: " + cErr.message);
        }

        return NextResponse.json({
            ok: true,
            seeded: {
                products: SEED_PRODUCTS.length,
                customers: SEED_CUSTOMERS.length,
            },
        });
    } catch (err) {
        console.error("[POST /api/seed]", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Seed başarısız." },
            { status: 500 }
        );
    }
}
