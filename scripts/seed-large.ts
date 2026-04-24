/**
 * Büyük Veri Seed Script — Kapasite Testi için
 *
 * Mevcut demo seed'e dokunmaz. Supabase service role ile doğrudan yazar.
 * Tüm kayıtlar "LOAD-" prefix'iyle işaretlenir — temizlik kolaylığı için.
 *
 * Profiller:
 *   small  : 500 ürün, 200 müşteri, 1.000 sipariş (~3.000 line)
 *   medium : 5.000 ürün, 2.000 müşteri, 10.000 sipariş (~30.000 line)
 *   large  : 20.000 ürün, 10.000 müşteri, 50.000 sipariş (~150.000 line)
 *
 * Kullanım:
 *   npx tsx scripts/seed-large.ts --profile=small
 *   npx tsx scripts/seed-large.ts --profile=medium
 *   npx tsx scripts/seed-large.ts --profile=large
 *   npx tsx scripts/seed-large.ts --clean          # LOAD- prefix'li tüm verileri sil
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error("NEXT_PUBLIC_SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY gerekli.");
    console.error(".env.local dosyasını source edin: source .env.local || dotenv -e .env.local");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// ── Profil Konfigürasyonu ─────────────────────────────────────────────────────

const PROFILES = {
    small:  { products: 500,    customers: 200,    orders: 1_000,  linesPerOrder: 3 },
    medium: { products: 5_000,  customers: 2_000,  orders: 10_000, linesPerOrder: 3 },
    large:  { products: 20_000, customers: 10_000, orders: 50_000, linesPerOrder: 3 },
};

const CATEGORIES = [
    "Küresel Vanalar", "Kelebek Vanalar", "Çek Valflar", "Sürgülü Vanalar",
    "Basınç Düşürücüler", "Bağlantı Elemanları", "Contalar", "Flanşlar",
    "Enstrümanlar", "Filtreler",
];

const UNITS = ["adet", "kg", "mt", "takım", "kutu"];
const CURRENCIES = ["TRY", "USD", "EUR"];
const PRODUCT_TYPES = ["manufactured", "commercial"] as const;
const COMMERCIAL_STATUSES = ["draft", "pending_approval", "approved", "cancelled"] as const;

// ── Yardımcı Fonksiyonlar ─────────────────────────────────────────────────────

function rand(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

function chunk<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
    return chunks;
}

async function batchInsert<T extends object>(table: string, rows: T[], batchSize = 500): Promise<void> {
    const batches = chunk(rows, batchSize);
    let inserted = 0;
    for (const batch of batches) {
        const { error } = await supabase.from(table).insert(batch);
        if (error) throw new Error(`[${table}] Batch insert hatası: ${error.message}`);
        inserted += batch.length;
        process.stdout.write(`\r  ${table}: ${inserted}/${rows.length}`);
    }
    console.log(`\r  ${table}: ${rows.length} kayıt eklendi`);
}

// ── Temizlik ──────────────────────────────────────────────────────────────────

async function cleanLoadTestData(): Promise<void> {
    console.log("🧹 LOAD- prefix'li test verisi temizleniyor...");

    // FK sırasına göre sil
    const tables = [
        "order_lines",
        "sales_orders",
        "customers",
        "products",
    ];

    // order_lines: LOAD- sipariş ID'leri üzerinden sil
    const { data: loadOrders } = await supabase
        .from("sales_orders")
        .select("id")
        .like("notes", "LOAD-%");

    if (loadOrders && loadOrders.length > 0) {
        const ids = loadOrders.map(o => o.id);
        for (const batch of chunk(ids, 500)) {
            await supabase.from("order_lines").delete().in("order_id", batch);
        }
        console.log(`  order_lines: ${ids.length} sipariş için satırlar silindi`);

        for (const batch of chunk(ids, 500)) {
            await supabase.from("sales_orders").delete().in("id", batch);
        }
        console.log(`  sales_orders: ${ids.length} sipariş silindi`);
    }

    // Customers
    const { error: custErr } = await supabase
        .from("customers")
        .delete()
        .like("name", "LOAD%");
    if (custErr) console.warn("  customers temizleme uyarısı:", custErr.message);
    else console.log("  customers: LOAD- prefix silindi");

    // Products
    const { error: prodErr } = await supabase
        .from("products")
        .delete()
        .like("sku", "LOAD-%");
    if (prodErr) console.warn("  products temizleme uyarısı:", prodErr.message);
    else console.log("  products: LOAD- prefix silindi");

    console.log("✅ Temizlik tamamlandı.");
}

// ── Ürün Üretici ──────────────────────────────────────────────────────────────

function generateProducts(count: number): object[] {
    return Array.from({ length: count }, (_, i) => {
        const on_hand = rand(0, 500);
        const reserved = rand(0, Math.min(on_hand, 100));
        return {
            sku: `LOAD-PRD-${String(i + 1).padStart(6, "0")}`,
            name: `LOAD Ürün ${i + 1} - ${pick(CATEGORIES)}`,
            category: pick(CATEGORIES),
            unit: pick(UNITS),
            price: rand(50, 5000),
            currency: pick(CURRENCIES),
            on_hand,
            reserved,
            min_stock_level: rand(5, 50),
            reorder_qty: rand(10, 100),
            product_type: pick(PRODUCT_TYPES),
            is_active: true,
            warehouse: "Test Deposu",
            lead_time_days: rand(7, 90),
            daily_usage: rand(1, 20),
            cost_price: rand(30, 3000),
        };
    });
}

// ── Müşteri Üretici ───────────────────────────────────────────────────────────

function generateCustomers(count: number): object[] {
    return Array.from({ length: count }, (_, i) => ({
        name: `LOAD Müşteri ${i + 1}`,
        email: `load-customer-${i + 1}@load-test.example.com`,
        phone: `+90 555 ${String(rand(1000000, 9999999))}`,
        address: `LOAD Test Caddesi No:${i + 1}, Test Şehir`,
        country: pick(["TR", "DE", "US", "GB", "FR"]),
        currency: pick(CURRENCIES),
        tax_number: String(rand(1000000000, 9999999999)),
        tax_office: "Test Vergi Dairesi",
        notes: "LOAD-TEST müşteri",
        is_active: true,
    }));
}

// ── Sipariş Üretici ───────────────────────────────────────────────────────────

function generateOrders(
    count: number,
    customerIds: string[],
    productIds: string[],
    linesPerOrder: number
): { orders: object[]; lines: { orderId: string; lines: object[] }[] } {
    const orders: object[] = [];
    const linesMap: { orderId: string; lines: object[] }[] = [];
    const now = new Date();

    for (let i = 0; i < count; i++) {
        const customerId = pick(customerIds);
        const status = pick(COMMERCIAL_STATUSES);
        const createdAt = new Date(now.getTime() - rand(0, 90) * 24 * 60 * 60 * 1000);

        const orderId = crypto.randomUUID();

        let subtotal = 0;
        const lineItems = Array.from({ length: linesPerOrder }, (_, li) => {
            const qty = rand(1, 20);
            const price = rand(100, 10000);
            const disc = pick([0, 0, 0, 5, 10]);
            const lineTotal = qty * price * (1 - disc / 100);
            subtotal += lineTotal;
            return {
                order_id: orderId,
                product_id: pick(productIds),
                product_name: "LOAD Ürün",
                product_sku: `LOAD-PRD-${String(rand(1, 500)).padStart(6, "0")}`,
                unit: "adet",
                quantity: qty,
                unit_price: price,
                discount_pct: disc,
                line_total: Math.round(lineTotal * 100) / 100,
                sort_order: li + 1,
            };
        });

        const vatTotal = subtotal * 0.20;
        const grandTotal = subtotal + vatTotal;

        orders.push({
            id: orderId,
            order_number: `LOAD-ORD-${String(i + 1).padStart(6, "0")}`,
            customer_id: customerId,
            customer_name: `LOAD Müşteri`,
            commercial_status: status,
            fulfillment_status: status === "approved" ? "allocated" : "unallocated",
            subtotal: Math.round(subtotal * 100) / 100,
            vat_total: Math.round(vatTotal * 100) / 100,
            grand_total: Math.round(grandTotal * 100) / 100,
            currency: pick(CURRENCIES),
            notes: `LOAD-TEST sipariş ${i + 1}`,
            created_at: createdAt.toISOString(),
        });

        linesMap.push({ orderId, lines: lineItems });
    }

    return { orders, lines: linesMap };
}

// ── Ana Akış ──────────────────────────────────────────────────────────────────

async function run(): Promise<void> {
    const args = process.argv.slice(2);
    const profileArg = args.find(a => a.startsWith("--profile="))?.split("=")[1] ?? "small";
    const isClean = args.includes("--clean");

    if (isClean) {
        await cleanLoadTestData();
        return;
    }

    if (!(profileArg in PROFILES)) {
        console.error(`Geçersiz profil: ${profileArg}. Geçerli: ${Object.keys(PROFILES).join(", ")}`);
        process.exit(1);
    }

    const profile = PROFILES[profileArg as keyof typeof PROFILES];
    console.log(`\n🚀 Seed başlıyor: ${profileArg} profili`);
    console.log(`   Ürün: ${profile.products.toLocaleString()}`);
    console.log(`   Müşteri: ${profile.customers.toLocaleString()}`);
    console.log(`   Sipariş: ${profile.orders.toLocaleString()} (${profile.linesPerOrder} satır/sipariş)\n`);

    const startTime = Date.now();

    // 1. Ürünler
    console.log("1/4 Ürünler ekleniyor...");
    const productRows = generateProducts(profile.products);
    await batchInsert("products", productRows);

    // Eklenen LOAD- ürün ID'lerini al
    const { data: productData, error: prodErr } = await supabase
        .from("products")
        .select("id")
        .like("sku", "LOAD-%")
        .limit(profile.products + 100);
    if (prodErr || !productData?.length) {
        throw new Error("Ürün ID'leri alınamadı: " + prodErr?.message);
    }
    const productIds = productData.map(p => p.id);
    console.log(`   ${productIds.length} ürün ID alındı`);

    // 2. Müşteriler
    console.log("\n2/4 Müşteriler ekleniyor...");
    const customerRows = generateCustomers(profile.customers);
    await batchInsert("customers", customerRows);

    const { data: customerData, error: custErr } = await supabase
        .from("customers")
        .select("id")
        .like("name", "LOAD%")
        .limit(profile.customers + 100);
    if (custErr || !customerData?.length) {
        throw new Error("Müşteri ID'leri alınamadı: " + custErr?.message);
    }
    const customerIds = customerData.map(c => c.id);
    console.log(`   ${customerIds.length} müşteri ID alındı`);

    // 3. Siparişler
    console.log("\n3/4 Siparişler oluşturuluyor...");
    const { orders, lines } = generateOrders(
        profile.orders,
        customerIds,
        productIds,
        profile.linesPerOrder
    );
    await batchInsert("sales_orders", orders);

    // 4. Sipariş Satırları
    console.log("\n4/4 Sipariş satırları ekleniyor...");
    const allLines = lines.flatMap(l => l.lines);
    await batchInsert("order_lines", allLines, 1000);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n✅ Seed tamamlandı — ${elapsed}s`);
    console.log(`   Toplam satır: ${allLines.length.toLocaleString()}`);
    console.log("\n⚠️  Temizlemek için: npx tsx scripts/seed-large.ts --clean");
}

run().catch(err => {
    console.error("\n❌ Seed hatası:", err.message);
    process.exit(1);
});
