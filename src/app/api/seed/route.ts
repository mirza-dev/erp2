/**
 * /api/seed — PMT Endüstriyel demo verisi (sade öz boyut, müşteri turuna uygun)
 *
 * Hedef: Her sayfada anlamlı veri olacak şekilde 8 ürün · 4 müşteri · 7 sipariş
 * · 3 teklif · 5 AI öneri · 2 import batch · 3 üretim. DELETE LOAD- prefix'li
 * verileri (scripts/seed-large.ts kalıntıları) da temizler.
 *
 * Stok senaryoları:
 *   CRITICAL : KV-DB-DN100 (available=5 ≤ min=10)
 *   WARNING  : KV-3P-DN80   (available=35, ≤ ceil(min*1.5)=38)
 *   PAST deadline    : KB-WT-DN150 (yüksek günlük tüketim + 21 gün lead)
 *   IMMINENT 3 gün   : AA-SOV-DN80 (Almanya 45 gün lead)
 *   IMMINENT 1 gün   : CV-KV-DN65
 *   FİYAT EKSİK      : CT-SS-DN50  (price=NULL → "X üründe fiyat eksik")
 */
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

async function checkAuth(request: NextRequest): Promise<boolean> {
    const secret = process.env.CRON_SECRET;
    return !!(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

// ── Date Helpers ─────────────────────────────────────────────────────────────

const _today = new Date();
const daysAgo = (n: number) => new Date(_today.getTime() - n * 86_400_000).toISOString().slice(0, 10);
const daysLater = (n: number) => new Date(_today.getTime() + n * 86_400_000).toISOString().slice(0, 10);
const daysAgoISO = (n: number) => new Date(_today.getTime() - n * 86_400_000).toISOString();
const todayStr = _today.toISOString().slice(0, 10);

// ── 8 Ürün (her biri bir senaryoyu karşılar) ─────────────────────────────────

const SEED_PRODUCTS = [
    {
        // Normal stok, manufactured, BOM kaynağı
        name: "3 Parçalı Küresel Vana DN50 PN40 Paslanmaz 316",
        sku: "KV-3P-DN50-PN40-CF8M",
        category: "Küresel Vanalar",
        unit: "adet",
        price: 780,
        currency: "USD",
        on_hand: 180, reserved: 40, min_stock_level: 30, reorder_qty: 60,
        product_type: "manufactured" as const,
        warehouse: "Sevkiyat Deposu",
        preferred_vendor: "PMT Amasya Fabrikası",
        lead_time_days: 14, daily_usage: 2, cost_price: 420,
        material_quality: "CF8M (SS316)",
        origin_country: "TR",
        production_site: "PMT Amasya Fabrikası",
    },
    {
        // CRITICAL: available=5 ≤ min=10
        name: "Çift Blok Küresel Vana DN100 600LB Paslanmaz 316",
        sku: "KV-DB-DN100-600LB-CF8M",
        category: "Küresel Vanalar",
        unit: "adet",
        price: 4800,
        currency: "USD",
        on_hand: 12, reserved: 7, min_stock_level: 10, reorder_qty: 15,
        product_type: "commercial" as const,
        warehouse: "Sevkiyat Deposu",
        preferred_vendor: "PMT Amasya Fabrikası",
        lead_time_days: 21, daily_usage: 1, cost_price: 2700,
        material_quality: "CF8M (SS316)",
        origin_country: "TR",
    },
    {
        // WARNING: available=35, min=25, ceil(25*1.5)=38 → 25<35≤38
        name: "3 Parçalı Küresel Vana DN80 300LB Karbon Çelik",
        sku: "KV-3P-DN80-300LB-WCB",
        category: "Küresel Vanalar",
        unit: "adet",
        price: 1250,
        currency: "USD",
        on_hand: 60, reserved: 25, min_stock_level: 25, reorder_qty: 50,
        product_type: "commercial" as const,
        warehouse: "Sevkiyat Deposu",
        preferred_vendor: "PMT Amasya Fabrikası",
        lead_time_days: 14, daily_usage: 2, cost_price: 680,
        material_quality: "A216 WCB",
        origin_country: "TR",
    },
    {
        // PAST deadline (yüksek günlük tüketim + 21 gün lead time)
        name: "Wafer Tip Kelebek Vana DN150 PN16 Paslanmaz",
        sku: "KB-WT-DN150-PN16-CF8",
        category: "Kelebek Vanalar",
        unit: "adet",
        price: 580,
        currency: "USD",
        on_hand: 32, reserved: 8, min_stock_level: 15, reorder_qty: 30,
        product_type: "commercial" as const,
        warehouse: "Sevkiyat Deposu",
        preferred_vendor: "PMT Amasya Fabrikası",
        lead_time_days: 21, daily_usage: 3, cost_price: 310,
        material_quality: "CF8 (SS304)",
        origin_country: "TR",
    },
    {
        // IMMINENT 3 gün — Almanya tedariki 45 gün
        name: "Albrecht Hızlı Kapama Vanası DN80 PN40",
        sku: "AA-SOV-DN80-PN40",
        category: "Hızlı Kapama Vanaları",
        unit: "adet",
        price: 4200,
        currency: "EUR",
        on_hand: 18, reserved: 4, min_stock_level: 6, reorder_qty: 12,
        product_type: "commercial" as const,
        warehouse: "Sevkiyat Deposu",
        preferred_vendor: "Albrecht-Automatik GmbH",
        lead_time_days: 45, daily_usage: 5, cost_price: 2400,
        material_quality: "Paslanmaz Çelik (SS316)",
        origin_country: "DE",
    },
    {
        // IMMINENT 1 gün
        name: "Kontrol Valfi DN65 PN40 Paslanmaz 316",
        sku: "CV-KV-DN65-PN40-CF8M",
        category: "Kontrol Valfleri",
        unit: "adet",
        price: 3200,
        currency: "USD",
        on_hand: 14, reserved: 2, min_stock_level: 8, reorder_qty: 16,
        product_type: "manufactured" as const,
        warehouse: "Sevkiyat Deposu",
        preferred_vendor: "PMT Amasya Fabrikası",
        lead_time_days: 28, daily_usage: 12, cost_price: 1680,
        material_quality: "CF8M (SS316)",
        origin_country: "TR",
        production_site: "PMT Amasya Fabrikası",
    },
    {
        // FİYAT EKSİK — Sprint C "X üründe fiyat eksik" sayacı
        name: "Spiral Sarım Conta DN50 PN40 Grafit",
        sku: "CT-SS-DN50-PN40-GRF",
        category: "Contalar",
        unit: "adet",
        price: null,                        // Sprint C bulgular 2. tur G4
        currency: "USD",
        on_hand: 850, reserved: 0, min_stock_level: 200, reorder_qty: 500,
        product_type: "commercial" as const,
        warehouse: "Sarf Malzeme Deposu",
        preferred_vendor: "Garlock Türkiye",
        lead_time_days: 7, daily_usage: 18,  cost_price: null,
        material_quality: "Grafit + SS316",
        origin_country: "TR",
    },
    {
        // BOM bileşeni + manuel adjustment örneği
        name: "Saplama M24x100 Sınıf 8.8 B7",
        sku: "BE-SC-M24x100-B7",
        category: "Bağlantı Elemanları",
        unit: "adet",
        price: 18,
        currency: "USD",
        on_hand: 3200, reserved: 0, min_stock_level: 500, reorder_qty: 2000,
        product_type: "commercial" as const,
        warehouse: "Bulon-Saplama Deposu",
        preferred_vendor: "Bulonsan",
        lead_time_days: 5, daily_usage: 30, cost_price: 9.5,
        material_quality: "Karbon Çelik B7",
        origin_country: "TR",
    },
] as const;

// ── 4 Müşteri (her biri bir currency / edge case) ────────────────────────────

const SEED_CUSTOMERS = [
    {
        name: "Tüpraş İzmit Rafinerisi",
        email: "tedarik.izmit@tupras.com.tr",
        phone: "+90 262 316 0000",
        address: "TÜPRAŞ İzmit Rafinerisi, Körfez, Kocaeli",
        tax_number: "6440012345",
        tax_office: "Körfez VD",
        country: "TR",
        currency: "TRY",
        notes: "Yerli rafineri — yüksek basınç vana ve flanş alımları.",
        total_orders: 0,
        total_revenue: 0,
        payment_terms_days: 60,
    },
    {
        name: "Abdi İbrahim İlaç A.Ş.",
        email: "procurement@abdibrahim.com.tr",
        phone: "+90 212 366 0000",
        address: "Esenyurt, İstanbul",
        tax_number: "3810234567",
        tax_office: "Esenyurt VD",
        country: "TR",
        currency: "EUR",
        notes: "GMP uyumlu paslanmaz çelik vana ve PTFE conta. EUR fatura.",
        total_orders: 0,
        total_revenue: 0,
        payment_terms_days: 30,
    },
    {
        name: "Enerjisa Üretim Santralleri",
        email: "tedarik@enerjisa.com.tr",
        phone: "+90 212 375 0000",
        address: "Nişantepe, İstanbul",
        tax_number: "7230145678",
        tax_office: "Sarıyer VD",
        country: "TR",
        currency: "USD",
        notes: "Doğalgaz kombine çevrim santralları. USD fatura.",
        total_orders: 0,
        total_revenue: 0,
        payment_terms_days: 45,
    },
    {
        name: "Ülker Gıda — Demo Şube",
        email: "demo.satin.alma@ulker.com.tr",
        phone: "+90 212 867 0000",
        address: "Kısıklı Mahallesi, Üsküdar, İstanbul",
        tax_number: null,                    // Paraşüt VKN-eksik preflight örneği
        tax_office: null,
        country: "TR",
        currency: "TRY",
        notes: "Demo/test şubesi — vergi numarası henüz girilmemiş (VKN-eksik akışı).",
        total_orders: 0,
        total_revenue: 0,
        payment_terms_days: 30,
    },
] as const;

// ── 3 Teklif ─────────────────────────────────────────────────────────────────

interface SeedQuoteLine { sku: string; description: string; quantity: number; unitPrice: number; }
interface SeedQuote {
    quoteNumber: string;
    customerName: string;
    status: "sent" | "expired" | "accepted";
    quoteDate: string;
    validUntil: string | null;
    currency: string;
    lines: SeedQuoteLine[];
}

const SEED_QUOTES: SeedQuote[] = [
    {
        quoteNumber: "TKL-2026-001",
        customerName: "Tüpraş İzmit Rafinerisi",
        status: "sent",
        quoteDate: daysAgo(5),
        validUntil: daysLater(30),
        currency: "TRY",
        lines: [
            { sku: "KV-3P-DN50-PN40-CF8M", description: "3 Parçalı Küresel Vana DN50 PN40 SS316", quantity: 30, unitPrice: 26000 },
            { sku: "BE-SC-M24x100-B7", description: "Saplama M24x100 Sınıf 8.8 B7", quantity: 240, unitPrice: 580 },
        ],
    },
    {
        quoteNumber: "TKL-2026-002",
        customerName: "Abdi İbrahim İlaç A.Ş.",
        status: "expired",
        quoteDate: daysAgo(40),
        validUntil: daysAgo(5),               // Süresi dolmuş — quote_expired alert tetikler
        currency: "EUR",
        lines: [
            { sku: "KV-3P-DN50-PN40-CF8M", description: "3 Parçalı Küresel Vana DN50 PN40 SS316 (GMP)", quantity: 18, unitPrice: 720 },
            { sku: "CT-SS-DN50-PN40-GRF", description: "Spiral Sarım Conta DN50 PN40 Grafit", quantity: 50, unitPrice: 38 },
        ],
    },
    {
        quoteNumber: "TKL-2026-003",
        customerName: "Enerjisa Üretim Santralleri",
        status: "accepted",
        quoteDate: daysAgo(20),
        validUntil: daysAgo(10),
        currency: "USD",
        lines: [
            { sku: "CV-KV-DN65-PN40-CF8M", description: "Kontrol Valfi DN65 PN40 SS316", quantity: 6, unitPrice: 3100 },
            { sku: "KV-3P-DN80-300LB-WCB", description: "3 Parçalı Küresel Vana DN80 300LB WCB", quantity: 12, unitPrice: 1180 },
        ],
    },
];

// ── 7 Sipariş (commercial × fulfillment matrisi) ─────────────────────────────

interface SeedOrderLine { sku: string; qty: number; price: number; disc: number; }
interface SeedOrder {
    orderNumber: string;
    customerName: string;
    commercial: "draft" | "pending_approval" | "approved" | "cancelled";
    fulfillment: "unallocated" | "partially_allocated" | "allocated" | "partially_shipped" | "shipped";
    currency: string;
    createdDaysAgo: number;
    quoteValidUntil?: string | null;
    plannedShipmentDate?: string | null;
    quoteNumber?: string | null;             // sales_orders.quote_id referansı
    aiRisk?: "low" | "medium" | "high" | null;
    aiConfidence?: number | null;
    aiReason?: string | null;
    parasutInvoiceId?: string | null;
    parasutSentAt?: string | null;
    parasutError?: string | null;
    notes?: string | null;
    lines: SeedOrderLine[];
}

const SEED_ORDERS: SeedOrder[] = [
    // 1) draft — Tüpraş — geçerli teklif (30 gün)
    {
        orderNumber: "ORD-2026-0001", customerName: "Tüpraş İzmit Rafinerisi",
        commercial: "draft", fulfillment: "unallocated", currency: "TRY", createdDaysAgo: 2,
        quoteValidUntil: daysLater(30),
        notes: "Rafineri bakım dönemi siparişi (taslak).",
        lines: [
            { sku: "KV-3P-DN50-PN40-CF8M", qty: 12, price: 26000, disc: 0 },
            { sku: "BE-SC-M24x100-B7", qty: 96, price: 580, disc: 5 },
        ],
    },
    // 2) pending_approval — Abdi İbrahim — quote süresi 3 gün önce dolmuş (alert)
    {
        orderNumber: "ORD-2026-0002", customerName: "Abdi İbrahim İlaç A.Ş.",
        commercial: "pending_approval", fulfillment: "unallocated", currency: "EUR", createdDaysAgo: 8,
        quoteValidUntil: daysAgo(3),
        aiRisk: "medium", aiConfidence: 0.74,
        aiReason: "Teklif süresi dolmuş; fiyat güncellemesi gerekebilir.",
        lines: [
            { sku: "KV-3P-DN50-PN40-CF8M", qty: 8, price: 720, disc: 0 },
            { sku: "CT-SS-DN50-PN40-GRF", qty: 30, price: 38, disc: 0 },
        ],
    },
    // 3) approved + allocated — Enerjisa — sevke hazır (TKL-2026-003 quote'a bağlı)
    {
        orderNumber: "ORD-2026-0003", customerName: "Enerjisa Üretim Santralleri",
        commercial: "approved", fulfillment: "allocated", currency: "USD", createdDaysAgo: 7,
        plannedShipmentDate: daysLater(4),
        quoteNumber: "TKL-2026-003",
        aiRisk: "low", aiConfidence: 0.92,
        aiReason: "Düzenli müşteri, standart kalemler.",
        lines: [
            { sku: "CV-KV-DN65-PN40-CF8M", qty: 4, price: 3100, disc: 0 },
            { sku: "KV-3P-DN80-300LB-WCB", qty: 6, price: 1180, disc: 0 },
        ],
    },
    // 4) approved + partially_allocated — Tüpraş — kritik stok → shortage
    {
        orderNumber: "ORD-2026-0004", customerName: "Tüpraş İzmit Rafinerisi",
        commercial: "approved", fulfillment: "partially_allocated", currency: "TRY", createdDaysAgo: 5,
        plannedShipmentDate: daysLater(8),
        notes: "KV-DB-DN100 kritik stokta — kısmi rezerve.",
        lines: [
            { sku: "KV-DB-DN100-600LB-CF8M", qty: 8, price: 156000, disc: 0 },  // shortage
            { sku: "KB-WT-DN150-PN16-CF8", qty: 6, price: 19500, disc: 0 },
        ],
    },
    // 5) approved + partially_shipped — Abdi İbrahim — yarı sevk + open reservation
    {
        orderNumber: "ORD-2026-0005", customerName: "Abdi İbrahim İlaç A.Ş.",
        commercial: "approved", fulfillment: "partially_shipped", currency: "EUR", createdDaysAgo: 12,
        plannedShipmentDate: daysAgo(2),
        lines: [
            { sku: "KV-3P-DN50-PN40-CF8M", qty: 10, price: 720, disc: 0 },
            { sku: "CT-SS-DN50-PN40-GRF", qty: 60, price: 38, disc: 0 },
        ],
    },
    // 6) approved + shipped — Enerjisa — Paraşüt sync hatası (VKN doğrulanamadı)
    {
        orderNumber: "ORD-2026-0006", customerName: "Enerjisa Üretim Santralleri",
        commercial: "approved", fulfillment: "shipped", currency: "USD", createdDaysAgo: 22,
        parasutError: "VKN doğrulanamadı — eşleşme hatası",
        lines: [
            { sku: "AA-SOV-DN80-PN40", qty: 5, price: 4200, disc: 3 },
            { sku: "BE-SC-M24x100-B7", qty: 80, price: 18, disc: 0 },
        ],
    },
    // 7) cancelled — Ülker — VKN-eksik müşteri, iptal
    {
        orderNumber: "ORD-2026-0007", customerName: "Ülker Gıda — Demo Şube",
        commercial: "cancelled", fulfillment: "unallocated", currency: "TRY", createdDaysAgo: 18,
        notes: "Müşteri tarafından iptal edildi (VKN bilgisi eksikti).",
        lines: [
            { sku: "KV-3P-DN50-PN40-CF8M", qty: 4, price: 26000, disc: 10 },
        ],
    },
];

// ════════════════════════════════════════════════════════════════════════════
// DELETE — tüm demo + LOAD- prefix'li veriler temizlenir, singleton'lar resetlenir
// ════════════════════════════════════════════════════════════════════════════

export async function DELETE(request: NextRequest) {
    if (!await checkAuth(request)) {
        return NextResponse.json({ error: "Yetkisiz erişim." }, { status: 401 });
    }
    try {
        const supabase = createServiceClient();

        // ── Aşama 1: LOAD- prefix'li veriler (scripts/seed-large.ts kalıntıları) ──
        const { data: loadOrders } = await supabase
            .from("sales_orders").select("id").like("notes", "LOAD-%");
        const loadOrderIds = (loadOrders ?? []).map(o => o.id);
        if (loadOrderIds.length > 0) {
            const chunks: string[][] = [];
            for (let i = 0; i < loadOrderIds.length; i += 500) chunks.push(loadOrderIds.slice(i, i + 500));
            for (const chunk of chunks) {
                await supabase.from("order_lines").delete().in("order_id", chunk);
                await supabase.from("stock_reservations").delete().in("order_id", chunk);
            }
        }
        await supabase.from("sales_orders").delete().like("notes", "LOAD-%");
        await supabase.from("customers").delete().like("name", "LOAD%");
        await supabase.from("products").delete().like("sku", "LOAD-%");

        // ── Aşama 2: Demo verileri (FK alt → üst sırasıyla) ─────────────────────
        const tables = [
            "audit_log",
            "integration_sync_logs",
            "alerts",
            "ai_feedback",
            "ai_recommendations",
            "ai_entity_aliases",
            "ai_runs",
            "column_mappings",
            "import_drafts",
            "import_batches",
            "quote_line_items",
            "quotes",
            "payments",
            "invoices",
            "shipments",
            "shortages",
            "stock_reservations",
            "inventory_movements",
            "order_lines",
            "sales_orders",
            "purchase_commitments",
            "production_entries",
            "bills_of_materials",
            "customers",
            "products",
            "parasut_oauth_tokens",
        ] as const;

        for (const table of tables) {
            const { error } = await supabase.from(table).delete().neq("id", "00000000-0000-0000-0000-000000000000");
            if (error) throw new Error(`${table}: ${error.message}`);
        }

        // ── Aşama 3: Singleton company_settings sıfırlanır (silinmez) ───────────
        await supabase.from("company_settings").update({
            name: "", tax_office: "", tax_no: "", address: "",
            phone: "", email: "", website: "", logo_url: null, currency: "USD",
        }).neq("id", "00000000-0000-0000-0000-000000000000");

        // ── Aşama 4: order_counters reset ───────────────────────────────────────
        await supabase.from("order_counters").upsert({ year: 2026, last_seq: 0 }, { onConflict: "year" });

        return NextResponse.json({
            ok: true,
            message: "Tüm demo + LOAD verileri temizlendi. POST /api/seed ile yeniden yükle.",
            cleaned: { load_orders: loadOrderIds.length, demo_tables: tables.length },
        });
    } catch (err) {
        console.error("[DELETE /api/seed]", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Silme başarısız." },
            { status: 500 }
        );
    }
}

// ════════════════════════════════════════════════════════════════════════════
// POST — sade öz demo seed'i yükler
// ════════════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
    if (!await checkAuth(request)) {
        return NextResponse.json({ error: "Yetkisiz erişim." }, { status: 401 });
    }
    try {
        const supabase = createServiceClient();

        // ── 1. company_settings (singleton UPDATE) ─────────────────────────────
        await supabase.from("company_settings").update({
            name: "PMT Endüstriyel Vana San. ve Tic. A.Ş.",
            tax_office: "Boğaziçi Kurumlar VD",
            tax_no: "7290567890",
            address: "Esenyurt OSB Mah. 105. Sok. No:12, İstanbul",
            phone: "+90 212 555 0123",
            email: "info@pmt.com.tr",
            website: "https://pmt.com.tr",
            currency: "USD",
        }).neq("id", "00000000-0000-0000-0000-000000000000");

        // ── 2. parasut_oauth_tokens (stub upsert) ───────────────────────────────
        const tokenExpiresAt = new Date(_today.getTime() + 60 * 60 * 1000).toISOString();
        await supabase.from("parasut_oauth_tokens").upsert(
            {
                singleton_key: "default",
                access_token: "DEMO-MOCK-AT-" + Math.random().toString(36).slice(2, 10),
                refresh_token: "DEMO-MOCK-RT-" + Math.random().toString(36).slice(2, 10),
                expires_at: tokenExpiresAt,
                token_version: 0,
            },
            { onConflict: "singleton_key" }
        );

        // ── 3. Products (insert) → SkuMap ───────────────────────────────────────
        const productInsertRows = SEED_PRODUCTS.map(p => ({ ...p, is_active: true }));
        const { error: pErr } = await supabase.from("products").insert(productInsertRows);
        if (pErr) throw new Error("Products: " + pErr.message);

        const { data: allProducts } = await supabase.from("products").select("id, sku, name");
        type SkuRow = { id: string; name: string };
        const skuMap = new Map<string, SkuRow>();
        for (const p of allProducts ?? []) skuMap.set(p.sku, { id: p.id, name: p.name });

        // ── 4. Customers (insert) → CustMap ─────────────────────────────────────
        const { error: cErr } = await supabase.from("customers")
            .insert(SEED_CUSTOMERS.map(c => ({ ...c, is_active: true })));
        if (cErr) throw new Error("Customers: " + cErr.message);

        const { data: allCustomers } = await supabase.from("customers")
            .select("id, name, email, country, tax_office, tax_number, currency");
        type CustRow = { id: string; email: string | null; country: string | null; tax_office: string | null; tax_number: string | null; currency: string };
        const custMap = new Map<string, CustRow>();
        for (const c of allCustomers ?? []) custMap.set(c.name, c as CustRow);

        // ── 5. Quotes + quote_line_items ────────────────────────────────────────
        const quoteInsertRows = SEED_QUOTES.map(q => {
            const cust = custMap.get(q.customerName);
            const subtotal = q.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
            const vatTotal = Math.round(subtotal * 0.20 * 100) / 100;
            return {
                quote_number: q.quoteNumber,
                quote_date: q.quoteDate,
                customer_id: cust?.id ?? null,
                customer_name: q.customerName,
                customer_email: cust?.email ?? null,
                currency: q.currency,
                status: q.status,
                valid_until: q.validUntil,
                vat_rate: 20,
                subtotal: Math.round(subtotal * 100) / 100,
                vat_total: vatTotal,
                grand_total: Math.round((subtotal + vatTotal) * 100) / 100,
            };
        });
        const { data: insertedQuotes, error: qErr } = await supabase
            .from("quotes").insert(quoteInsertRows).select("id, quote_number");
        if (qErr) throw new Error("Quotes: " + qErr.message);

        const quoteIdByNumber = new Map<string, string>();
        for (const q of insertedQuotes ?? []) quoteIdByNumber.set(q.quote_number, q.id);

        const quoteLineRows: Array<Record<string, unknown>> = [];
        for (const q of SEED_QUOTES) {
            const quoteId = quoteIdByNumber.get(q.quoteNumber);
            if (!quoteId) continue;
            q.lines.forEach((l, idx) => {
                const prod = skuMap.get(l.sku);
                quoteLineRows.push({
                    quote_id: quoteId,
                    position: idx + 1,
                    product_id: prod?.id ?? null,
                    product_code: l.sku,
                    description: l.description,
                    quantity: l.quantity,
                    unit_price: l.unitPrice,
                    line_total: Math.round(l.quantity * l.unitPrice * 100) / 100,
                });
            });
        }
        if (quoteLineRows.length > 0) {
            const { error: qlErr } = await supabase.from("quote_line_items").insert(quoteLineRows);
            if (qlErr) throw new Error("Quote line items: " + qlErr.message);
        }

        // quotes_number_seq advance: next_quote_number() RPC'sini SEED_QUOTES.length kez
        // çağırarak sequence'i ilerlet. Yeni teklifler TKL-2026-004'ten başlar.
        // Hata olursa non-fatal — sequence sadece next_quote_number() çağrılarını etkiler.
        try {
            for (let i = 0; i < SEED_QUOTES.length; i++) {
                await supabase.rpc("next_quote_number");
            }
        } catch {
            /* non-fatal */
        }

        // ── 6. Sales Orders + order_lines ───────────────────────────────────────
        const orderRows = SEED_ORDERS.map(o => {
            const cust = custMap.get(o.customerName);
            const subtotal = o.lines.reduce((s, l) => s + l.qty * l.price * (1 - l.disc / 100), 0);
            const vatTotal = Math.round(subtotal * 0.20 * 100) / 100;
            const grandTotal = Math.round((subtotal + vatTotal) * 100) / 100;
            return {
                order_number: o.orderNumber,
                customer_id: cust?.id ?? null,
                customer_name: o.customerName,
                customer_email: cust?.email ?? null,
                customer_country: cust?.country ?? null,
                customer_tax_office: cust?.tax_office ?? null,
                customer_tax_number: cust?.tax_number ?? null,
                commercial_status: o.commercial,
                fulfillment_status: o.fulfillment,
                currency: o.currency,
                subtotal: Math.round(subtotal * 100) / 100,
                vat_total: vatTotal,
                grand_total: grandTotal,
                item_count: o.lines.length,
                notes: o.notes ?? null,
                quote_valid_until: o.quoteValidUntil ?? null,
                planned_shipment_date: o.plannedShipmentDate ?? null,
                quote_id: o.quoteNumber ? quoteIdByNumber.get(o.quoteNumber) ?? null : null,
                ai_risk_level: o.aiRisk ?? null,
                ai_confidence: o.aiConfidence ?? null,
                ai_reason: o.aiReason ?? null,
                parasut_invoice_id: o.parasutInvoiceId ?? null,
                parasut_sent_at: o.parasutSentAt ?? null,
                parasut_error: o.parasutError ?? null,
                created_at: daysAgoISO(o.createdDaysAgo),
            };
        });

        const { data: insertedOrders, error: oErr } = await supabase
            .from("sales_orders").insert(orderRows).select("id, order_number");
        if (oErr) throw new Error("Orders: " + oErr.message);

        const orderIdMap = new Map<string, string>();
        for (const o of insertedOrders ?? []) orderIdMap.set(o.order_number, o.id);

        // order_counters: yeni numaralar 0008'den başlasın
        await supabase.from("order_counters").upsert(
            { year: 2026, last_seq: SEED_ORDERS.length },
            { onConflict: "year" }
        );

        // order_lines
        const lineRows: Array<Record<string, unknown>> = [];
        for (const o of SEED_ORDERS) {
            const orderId = orderIdMap.get(o.orderNumber);
            if (!orderId) continue;
            o.lines.forEach((l, idx) => {
                const prod = skuMap.get(l.sku);
                if (!prod) return;
                lineRows.push({
                    order_id: orderId,
                    product_id: prod.id,
                    product_name: prod.name,
                    product_sku: l.sku,
                    unit: "adet",
                    quantity: l.qty,
                    unit_price: l.price,
                    discount_pct: l.disc,
                    line_total: Math.round(l.qty * l.price * (1 - l.disc / 100) * 100) / 100,
                    sort_order: idx + 1,
                });
            });
        }
        const { data: insertedLines, error: lErr } = await supabase
            .from("order_lines").insert(lineRows).select("id, order_id, product_id, quantity");
        if (lErr) throw new Error("Order lines: " + lErr.message);

        // ── 7. Stock reservations + shortages + product.reserved sync ──────────
        const reservationRows: Array<Record<string, unknown>> = [];
        const productReservedQty = new Map<string, number>();

        for (const o of SEED_ORDERS) {
            if (o.commercial !== "approved") continue;
            const orderId = orderIdMap.get(o.orderNumber);
            if (!orderId) continue;
            const orderLines = (insertedLines ?? []).filter(l => l.order_id === orderId);

            for (const ol of orderLines) {
                if (o.fulfillment === "unallocated") continue;

                if (o.fulfillment === "partially_shipped") {
                    const shippedQty = Math.ceil(ol.quantity / 2);
                    const openQty = ol.quantity - shippedQty;
                    if (shippedQty > 0) {
                        reservationRows.push({
                            product_id: ol.product_id, order_id: orderId, order_line_id: ol.id,
                            reserved_qty: shippedQty, status: "shipped",
                        });
                    }
                    if (openQty > 0) {
                        reservationRows.push({
                            product_id: ol.product_id, order_id: orderId, order_line_id: ol.id,
                            reserved_qty: openQty, status: "open",
                        });
                        productReservedQty.set(ol.product_id, (productReservedQty.get(ol.product_id) ?? 0) + openQty);
                    }
                    continue;
                }

                if (o.fulfillment === "shipped") {
                    reservationRows.push({
                        product_id: ol.product_id, order_id: orderId, order_line_id: ol.id,
                        reserved_qty: ol.quantity, status: "shipped",
                    });
                    continue;
                }

                // allocated / partially_allocated
                let reserveQty = ol.quantity;
                if (o.fulfillment === "partially_allocated") {
                    const seedProd = SEED_PRODUCTS.find(p => skuMap.get(p.sku)?.id === ol.product_id);
                    if (seedProd) {
                        const avail = seedProd.on_hand - seedProd.reserved;
                        if (avail < ol.quantity) reserveQty = Math.max(0, avail);
                    }
                }
                if (reserveQty > 0) {
                    reservationRows.push({
                        product_id: ol.product_id, order_id: orderId, order_line_id: ol.id,
                        reserved_qty: reserveQty, status: "open",
                    });
                    productReservedQty.set(ol.product_id, (productReservedQty.get(ol.product_id) ?? 0) + reserveQty);
                }
            }
        }
        if (reservationRows.length > 0) {
            const { error: rErr } = await supabase.from("stock_reservations").insert(reservationRows);
            if (rErr) throw new Error("Reservations: " + rErr.message);
        }

        // products.reserved aktif open rezervasyonlarla senkronize edilir
        for (const [productId, totalReserved] of productReservedQty) {
            await supabase.from("products").update({ reserved: totalReserved }).eq("id", productId);
        }
        const productsWithRes = new Set(productReservedQty.keys());
        for (const p of allProducts ?? []) {
            if (!productsWithRes.has(p.id)) {
                await supabase.from("products").update({ reserved: 0 }).eq("id", p.id);
            }
        }

        // shortages: ORD-2026-0004 (partially_allocated, KV-DB-DN100 kritik)
        const shortageRows: Array<Record<string, unknown>> = [];
        const ord4Id = orderIdMap.get("ORD-2026-0004");
        if (ord4Id) {
            const ord4Lines = (insertedLines ?? []).filter(l => l.order_id === ord4Id);
            for (const ol of ord4Lines) {
                const seedProd = SEED_PRODUCTS.find(p => skuMap.get(p.sku)?.id === ol.product_id);
                if (!seedProd) continue;
                const avail = seedProd.on_hand - seedProd.reserved;
                if (avail < ol.quantity) {
                    shortageRows.push({
                        order_id: ord4Id, order_line_id: ol.id, product_id: ol.product_id,
                        requested_qty: ol.quantity, available_qty: Math.max(0, avail),
                        shortage_qty: ol.quantity - Math.max(0, avail), status: "open",
                    });
                }
            }
        }
        if (shortageRows.length > 0) {
            const { error: sErr } = await supabase.from("shortages").insert(shortageRows);
            if (sErr) throw new Error("Shortages: " + sErr.message);
        }

        // ── 8. Bills of materials (KV-3P-DN50 ← CT-SS + BE-SC) ──────────────────
        const bomData = [
            { finished: "KV-3P-DN50-PN40-CF8M", component: "CT-SS-DN50-PN40-GRF", qty: 1, unit: "adet", notes: "Ana gövde contası" },
            { finished: "KV-3P-DN50-PN40-CF8M", component: "BE-SC-M24x100-B7",   qty: 8, unit: "adet", notes: "Flanş bağlantı saplamaları" },
        ];
        const bomRows = bomData
            .map(b => ({
                finished_product_id: skuMap.get(b.finished)?.id,
                component_product_id: skuMap.get(b.component)?.id,
                quantity: b.qty, unit: b.unit, notes: b.notes,
            }))
            .filter(b => b.finished_product_id && b.component_product_id);
        if (bomRows.length > 0) {
            const { error: bErr } = await supabase.from("bills_of_materials").insert(bomRows);
            if (bErr) throw new Error("BOM: " + bErr.message);
        }

        // ── 9. Purchase commitments (4) ─────────────────────────────────────────
        const commitData = [
            { sku: "KV-DB-DN100-600LB-CF8M", qty: 12, date: daysLater(18), supplier: "PMT Amasya Fabrikası", status: "pending",   notes: "Acil tedarik — kritik stok takviyesi" },
            { sku: "AA-SOV-DN80-PN40",       qty: 10, date: daysLater(50), supplier: "Albrecht-Automatik GmbH", status: "pending", notes: "Almanya tedarik — 45 gün transit" },
            { sku: "KV-3P-DN80-300LB-WCB",   qty: 50, date: daysAgo(8),    supplier: "PMT Amasya Fabrikası", status: "received", notes: "Teslim alındı — stok güncellendi" },
            { sku: "CV-KV-DN65-PN40-CF8M",   qty: 12, date: daysAgo(15),   supplier: "PMT Amasya Fabrikası", status: "cancelled", notes: "İptal — tedarikçi fiyat artırdı" },
        ] as const;
        const commitRows = commitData
            .map(c => ({
                product_id: skuMap.get(c.sku)?.id,
                quantity: c.qty,
                expected_date: c.date,
                supplier_name: c.supplier,
                status: c.status,
                notes: c.notes,
                received_at: c.status === "received" ? c.date : null,
            }))
            .filter(c => c.product_id);
        if (commitRows.length > 0) {
            const { error: pcErr } = await supabase.from("purchase_commitments").insert(commitRows);
            if (pcErr) throw new Error("Purchase commitments: " + pcErr.message);
        }

        // ── 10. Production entries (3) ──────────────────────────────────────────
        const prodEntries = [
            { sku: "KV-3P-DN50-PN40-CF8M", qty: 30, scrap: 0, date: todayStr,    notes: null },
            { sku: "KV-3P-DN50-PN40-CF8M", qty: 15, scrap: 2, date: daysAgo(2),  notes: "2 adet yüzey hatası" },
            { sku: "KB-WT-DN150-PN16-CF8", qty: 20, scrap: 0, date: daysAgo(5),  notes: null },
        ];
        const prodRows = prodEntries
            .map(e => {
                const prod = skuMap.get(e.sku);
                return prod ? {
                    product_id: prod.id, product_name: prod.name, product_sku: e.sku,
                    produced_qty: e.qty, scrap_qty: e.scrap,
                    waste_reason: e.scrap > 0 ? e.notes : null,
                    production_date: e.date, notes: e.notes,
                } : null;
            })
            .filter((x): x is NonNullable<typeof x> => x !== null);
        if (prodRows.length > 0) {
            const { error: peErr } = await supabase.from("production_entries").insert(prodRows);
            if (peErr) throw new Error("Production: " + peErr.message);
        }

        // ── 11. Inventory movements (production + receipt + shipment + adjustment) ──
        const movementRows: Array<Record<string, unknown>> = [];

        for (const e of prodEntries) {
            const prod = skuMap.get(e.sku);
            if (!prod) continue;
            movementRows.push({
                product_id: prod.id, movement_type: "production", quantity: e.qty,
                reference_type: "production_entry",
                notes: `Üretim: ${e.qty} adet ${prod.name}`,
                occurred_at: e.date + "T08:00:00Z", source: "system",
            });
        }
        for (const c of commitData) {
            if (c.status !== "received") continue;
            const prod = skuMap.get(c.sku);
            if (!prod) continue;
            movementRows.push({
                product_id: prod.id, movement_type: "receipt", quantity: c.qty,
                reference_type: "manual",
                notes: `Tedarik teslimi: ${c.supplier} — ${c.qty} adet`,
                occurred_at: c.date + "T10:00:00Z", source: "system",
            });
        }
        // Shipment movements (shipped + partially_shipped)
        for (const o of SEED_ORDERS) {
            if (o.fulfillment !== "shipped" && o.fulfillment !== "partially_shipped") continue;
            for (const l of o.lines) {
                const prod = skuMap.get(l.sku);
                if (!prod) continue;
                const qty = o.fulfillment === "partially_shipped" ? Math.ceil(l.qty / 2) : l.qty;
                movementRows.push({
                    product_id: prod.id, movement_type: "shipment", quantity: -qty,
                    reference_type: "order", reference_id: orderIdMap.get(o.orderNumber),
                    notes: `Sevkiyat: ${o.orderNumber} — ${qty} adet`,
                    occurred_at: daysAgoISO(Math.max(1, o.createdDaysAgo - 5)),
                    source: "system",
                });
            }
        }
        // Manuel sayım düzeltmesi (BE-SC)
        const beSc = skuMap.get("BE-SC-M24x100-B7");
        if (beSc) {
            movementRows.push({
                product_id: beSc.id, movement_type: "adjustment", quantity: 200,
                reference_type: "manual",
                notes: "Sayım düzeltmesi — 200 adet fazla tespit edildi",
                occurred_at: daysAgoISO(6), source: "ui",
            });
        }
        if (movementRows.length > 0) {
            const { error: mErr } = await supabase.from("inventory_movements").insert(movementRows);
            if (mErr) throw new Error("Movements: " + mErr.message);
        }

        // ── 12. Shipments + invoices + payments ─────────────────────────────────
        const shipmentRows = [
            {
                shipment_number: "SVK-2026-0001", order_id: orderIdMap.get("ORD-2026-0006"),
                order_number: "ORD-2026-0006", shipment_date: daysAgo(20),
                transport_type: "Karayolu — TIR", net_weight_kg: 480, gross_weight_kg: 540,
                notes: "Enerjisa — Nişantepe teslimat",
            },
            {
                shipment_number: "SVK-2026-0002", order_id: orderIdMap.get("ORD-2026-0005"),
                order_number: "ORD-2026-0005", shipment_date: daysAgo(2),
                transport_type: "Karayolu — Kamyonet", net_weight_kg: 220, gross_weight_kg: 260,
                notes: "Abdi İbrahim — kısmi sevkiyat (1. parti)",
            },
        ].filter(s => s.order_id);
        if (shipmentRows.length > 0) {
            const { error: shErr } = await supabase.from("shipments").insert(shipmentRows);
            if (shErr) throw new Error("Shipments: " + shErr.message);
        }

        const ord6 = SEED_ORDERS.find(o => o.orderNumber === "ORD-2026-0006");
        const ord5 = SEED_ORDERS.find(o => o.orderNumber === "ORD-2026-0005");
        const calcGrand = (o: SeedOrder) => {
            const sub = o.lines.reduce((s, l) => s + l.qty * l.price * (1 - l.disc / 100), 0);
            return Math.round((sub * 1.20) * 100) / 100;
        };

        const invoiceRows = [
            {
                invoice_number: "FTR-2026-0001", invoice_date: daysAgo(20),
                order_id: orderIdMap.get("ORD-2026-0006"), order_number: "ORD-2026-0006",
                customer_id: custMap.get("Enerjisa Üretim Santralleri")?.id,
                currency: "USD",
                amount: ord6 ? calcGrand(ord6) : 0,
                due_date: daysLater(25), status: "open" as const,
                notes: "Enerjisa — Paraşüt sync hatası (manuel kontrol)",
            },
            {
                invoice_number: "FTR-2026-0002", invoice_date: daysAgo(2),
                order_id: orderIdMap.get("ORD-2026-0005"), order_number: "ORD-2026-0005",
                customer_id: custMap.get("Abdi İbrahim İlaç A.Ş.")?.id,
                currency: "EUR",
                amount: ord5 ? Math.round(calcGrand(ord5) / 2) : 0,
                due_date: daysLater(28), status: "partially_paid" as const,
                notes: "Abdi İbrahim — kısmi sevkiyat faturası",
            },
        ].filter(i => i.order_id);
        const { data: insertedInvoices, error: iErr } = await supabase
            .from("invoices").insert(invoiceRows).select("id, invoice_number");
        if (iErr) throw new Error("Invoices: " + iErr.message);

        const inv2 = insertedInvoices?.find(i => i.invoice_number === "FTR-2026-0002");
        const paymentRows = inv2 ? [{
            payment_number: "ODM-2026-0001",
            invoice_id: inv2.id, invoice_number: inv2.invoice_number,
            payment_date: daysAgo(1),
            amount: Math.round((invoiceRows[1]?.amount ?? 0) * 0.5),
            currency: "EUR", payment_method: "Havale/EFT",
            notes: "Abdi İbrahim — kısmi ödeme (%50)",
        }] : [];
        if (paymentRows.length > 0) {
            const { error: payErr } = await supabase.from("payments").insert(paymentRows);
            if (payErr) throw new Error("Payments: " + payErr.message);
        }

        // ── 13. AI recommendations + ai_feedback ────────────────────────────────
        const recBuilder = (
            sku: string,
            recType: "purchase_suggestion" | "stock_risk" | "order_risk",
            status: "suggested" | "accepted" | "edited" | "rejected",
            opts: {
                title: string; body: string; severity: "critical" | "warning" | "info";
                confidence: number; metadata?: Record<string, unknown>;
                editedMetadata?: Record<string, unknown>; decidedDaysAgo?: number;
            },
        ) => {
            const prod = skuMap.get(sku);
            if (!prod) return null;
            return {
                entity_type: "product",
                entity_id: prod.id,                              // text kolonu — UUID stringify
                recommendation_type: recType,
                title: opts.title,
                body: opts.body,
                confidence: opts.confidence,
                severity: opts.severity,
                status,
                model_version: "claude-haiku-4-5-demo",
                metadata: opts.metadata ?? null,
                edited_metadata: opts.editedMetadata ?? null,
                decided_at: opts.decidedDaysAgo != null ? daysAgoISO(opts.decidedDaysAgo) : null,
            };
        };

        const recRows = [
            recBuilder("KV-DB-DN100-600LB-CF8M", "purchase_suggestion", "suggested", {
                title: "Çift Blok Küresel Vana DN100 — Acil Sipariş",
                body: "Stok kritik seviyede (5 adet). Açık siparişler nedeniyle 18 gün içinde tedarik gerekli.",
                severity: "critical", confidence: 0.93,
                metadata: { suggestQty: 12, urgencyLevel: "high", supplier: "PMT Amasya Fabrikası", confidenceReason: "Açık sipariş + lead time uyumlu" },
            }),
            recBuilder("AA-SOV-DN80-PN40", "purchase_suggestion", "suggested", {
                title: "Albrecht Hızlı Kapama DN80 — Almanya Tedariki",
                body: "Stok azalıyor; Almanya 45 gün transit. Sipariş şimdi açılmazsa 3 gün sonra deadline aşılır.",
                severity: "warning", confidence: 0.88,
                metadata: { suggestQty: 10, urgencyLevel: "high", supplier: "Albrecht-Automatik GmbH", confidenceReason: "Lead time + günlük tüketim" },
            }),
            recBuilder("KB-WT-DN150-PN16-CF8", "purchase_suggestion", "accepted", {
                title: "Wafer Kelebek DN150 — Yeniden Sipariş",
                body: "Sipariş son tarihi geçti; stok takviyesi kabul edildi.",
                severity: "warning", confidence: 0.81,
                metadata: { suggestQty: 30, urgencyLevel: "moderate" },
                decidedDaysAgo: 2,
            }),
            recBuilder("KV-3P-DN80-300LB-WCB", "purchase_suggestion", "rejected", {
                title: "3P Küresel Vana DN80 — Önerilen Tedarik",
                body: "Stok orta seviyede; tedarik şu an gerek değil.",
                severity: "info", confidence: 0.62,
                metadata: { suggestQty: 25, urgencyLevel: "moderate" },
                decidedDaysAgo: 1,
            }),
            recBuilder("CV-KV-DN65-PN40-CF8M", "stock_risk", "edited", {
                title: "Kontrol Valfi DN65 — Stok Riski",
                body: "Yüksek günlük tüketim; minimum seviyeye yaklaşıyor.",
                severity: "warning", confidence: 0.79,
                metadata: { suggestQty: 16, urgencyLevel: "moderate" },
                editedMetadata: { suggestQty: 25 },
                decidedDaysAgo: 1,
            }),
        ].filter((x): x is NonNullable<typeof x> => x !== null);

        const { data: insertedRecs, error: arErr } = await supabase
            .from("ai_recommendations").insert(recRows).select("id, status, entity_id");
        if (arErr) throw new Error("AI recommendations: " + arErr.message);

        const feedbackRows: Array<Record<string, unknown>> = [];
        for (const r of insertedRecs ?? []) {
            if (r.status === "accepted") {
                feedbackRows.push({
                    recommendation_id: r.id, feedback_type: "accepted", actor: "demo-user",
                });
            } else if (r.status === "rejected") {
                feedbackRows.push({
                    recommendation_id: r.id, feedback_type: "rejected",
                    feedback_note: "Şu an gerek yok.", actor: "demo-user",
                });
            } else if (r.status === "edited") {
                feedbackRows.push({
                    recommendation_id: r.id, feedback_type: "edited",
                    edited_values: { suggestQty: 25 }, actor: "demo-user",
                });
            }
        }
        if (feedbackRows.length > 0) {
            const { error: afErr } = await supabase.from("ai_feedback").insert(feedbackRows);
            if (afErr) throw new Error("AI feedback: " + afErr.message);
        }

        // ── 14. Import batches + drafts ─────────────────────────────────────────
        const batchRows = [
            {
                file_name: "urunler-ocak-2026.xlsx",
                file_size: 184_320,
                status: "confirmed",
                parse_result: { sheet_count: 1, row_count: 3 },
                confidence: 0.92,
                created_by: "demo-user",
                confirmed_at: daysAgoISO(7),
            },
            {
                file_name: "musteri-listesi.csv",
                file_size: 12_400,
                status: "review",
                parse_result: { sheet_count: 1, row_count: 4 },
                confidence: 0.78,
                created_by: "demo-user",
            },
        ];
        const { data: insertedBatches, error: ibErr } = await supabase
            .from("import_batches").insert(batchRows).select("id, file_name");
        if (ibErr) throw new Error("Import batches: " + ibErr.message);

        const batchA = insertedBatches?.find(b => b.file_name === "urunler-ocak-2026.xlsx");
        const batchB = insertedBatches?.find(b => b.file_name === "musteri-listesi.csv");

        const draftRows: Array<Record<string, unknown>> = [];
        if (batchA) {
            for (let i = 1; i <= 3; i++) {
                draftRows.push({
                    batch_id: batchA.id, entity_type: "product",
                    raw_data: { sku: `BATCH-A-${i}`, name: `Batch A Ürün ${i}` },
                    parsed_data: { sku: `BATCH-A-${i}`, name: `Batch A Ürün ${i}` },
                    confidence: 0.95, status: "merged",
                });
            }
        }
        if (batchB) {
            draftRows.push({
                batch_id: batchB.id, entity_type: "customer",
                raw_data: { name: "Yeni Müşteri Ltd.", tax_no: "1234567890" },
                parsed_data: { name: "Yeni Müşteri Ltd.", tax_no: "1234567890" },
                confidence: 0.88, status: "pending",
            });
            draftRows.push({
                batch_id: batchB.id, entity_type: "customer",
                raw_data: { name: "Eksik Bilgili A.Ş.", tax_no: null },
                parsed_data: { name: "Eksik Bilgili A.Ş." },
                ai_reason: "tax_no boş; manuel düzeltme gerekiyor",
                unmatched_fields: { tax_no: "missing" },
                confidence: 0.62, status: "pending",
            });
            draftRows.push({
                batch_id: batchB.id, entity_type: "customer",
                raw_data: { name: "Tüpraş İzmit", tax_no: "6440012345" },
                parsed_data: { name: "Tüpraş İzmit Rafinerisi", tax_no: "6440012345" },
                user_corrections: { name: "Tüpraş İzmit Rafinerisi" },
                confidence: 0.96, status: "pending",
            });
            draftRows.push({
                batch_id: batchB.id, entity_type: "customer",
                raw_data: { name: "Yanlış Format Müşteri", tax_no: "abc123" },
                parsed_data: { name: "Yanlış Format Müşteri" },
                ai_reason: "tax_no formatı hatalı",
                confidence: 0.40, status: "rejected",
            });
        }
        if (draftRows.length > 0) {
            const { error: idErr } = await supabase.from("import_drafts").insert(draftRows);
            if (idErr) throw new Error("Import drafts: " + idErr.message);
        }

        // ── 15. column_mappings + ai_entity_aliases ─────────────────────────────
        const columnMappingRows = [
            { source_column: "Ürün Kodu",  normalized: "urun_kodu",  entity_type: "product",  target_field: "sku",        usage_count: 5, success_count: 4 },
            { source_column: "Stok Adedi", normalized: "stok_adedi", entity_type: "product",  target_field: "on_hand",    usage_count: 3, success_count: 3 },
            { source_column: "Vergi No",   normalized: "vergi_no",   entity_type: "customer", target_field: "tax_number", usage_count: 8, success_count: 7 },
        ];
        const { error: cmErr } = await supabase.from("column_mappings").insert(columnMappingRows);
        if (cmErr) throw new Error("Column mappings: " + cmErr.message);

        const aliasRows: Array<Record<string, unknown>> = [];
        const tupras = custMap.get("Tüpraş İzmit Rafinerisi");
        const kv3p = skuMap.get("KV-3P-DN50-PN40-CF8M");
        if (tupras) {
            aliasRows.push({
                raw_value: "Tupras", normalized: "tupras", entity_type: "customer",
                resolved_id: tupras.id, resolved_name: "Tüpraş İzmit Rafinerisi",
            });
        }
        if (kv3p) {
            aliasRows.push({
                raw_value: "kuresel dn50", normalized: "kuresel dn50", entity_type: "product",
                resolved_id: kv3p.id, resolved_name: kv3p.name,
            });
        }
        if (aliasRows.length > 0) {
            const { error: aaErr } = await supabase.from("ai_entity_aliases").insert(aliasRows);
            if (aaErr) throw new Error("AI entity aliases: " + aaErr.message);
        }

        // ── 16. Integration sync logs (4) ───────────────────────────────────────
        const syncLogRows = [
            {
                entity_type: "sales_order", entity_id: orderIdMap.get("ORD-2026-0006"),
                direction: "push", status: "error",
                error_message: "VKN doğrulanamadı — eşleşme hatası",
                retry_count: 2, requested_at: daysAgoISO(20), source: "system",
            },
            {
                entity_type: "sales_order", entity_id: orderIdMap.get("ORD-2026-0005"),
                direction: "push", status: "success", external_id: "INV-DEMO-0042",
                retry_count: 0, requested_at: daysAgoISO(2), completed_at: daysAgoISO(2), source: "system",
            },
            {
                entity_type: "customer", entity_id: tupras?.id,
                direction: "push", status: "success", external_id: "CST-DEMO-1001",
                retry_count: 0, requested_at: daysAgoISO(30), completed_at: daysAgoISO(30), source: "system",
            },
            {
                entity_type: "sales_order", entity_id: orderIdMap.get("ORD-2026-0003"),
                direction: "push", status: "retrying",
                error_message: "Geçici timeout — tekrar denenecek",
                retry_count: 1, requested_at: daysAgoISO(1), source: "scheduled",
            },
        ].filter(s => s.entity_id);
        if (syncLogRows.length > 0) {
            const { error: slErr } = await supabase.from("integration_sync_logs").insert(syncLogRows);
            if (slErr) throw new Error("Sync logs: " + slErr.message);
        }

        // ── 17. Audit log (8) ───────────────────────────────────────────────────
        const auditRows = [
            { action: "order_created",   entity_type: "sales_order", entity_id: orderIdMap.get("ORD-2026-0003"), occurred_at: daysAgoISO(7),  source: "ui" },
            { action: "order_approved",  entity_type: "sales_order", entity_id: orderIdMap.get("ORD-2026-0003"), occurred_at: daysAgoISO(6),  source: "ui" },
            { action: "order_created",   entity_type: "sales_order", entity_id: orderIdMap.get("ORD-2026-0006"), occurred_at: daysAgoISO(22), source: "ui" },
            { action: "order_shipped",   entity_type: "sales_order", entity_id: orderIdMap.get("ORD-2026-0006"), occurred_at: daysAgoISO(20), source: "system" },
            { action: "order_cancelled", entity_type: "sales_order", entity_id: orderIdMap.get("ORD-2026-0007"), occurred_at: daysAgoISO(15), source: "ui" },
            { action: "stock_adjusted",  entity_type: "product",     entity_id: beSc?.id,                          occurred_at: daysAgoISO(6),  source: "ui" },
            { action: "production_logged", entity_type: "product",   entity_id: kv3p?.id,                          occurred_at: todayStr + "T08:30:00Z", source: "ui" },
            { action: "rec_accepted",    entity_type: "product",     entity_id: skuMap.get("KB-WT-DN150-PN16-CF8")?.id, occurred_at: daysAgoISO(2), source: "ui" },
        ].filter(a => a.entity_id);
        if (auditRows.length > 0) {
            const { error: aErr } = await supabase.from("audit_log").insert(auditRows);
            if (aErr) throw new Error("Audit log: " + aErr.message);
        }

        // ── Response ────────────────────────────────────────────────────────────
        return NextResponse.json({
            ok: true,
            seeded: {
                products: SEED_PRODUCTS.length,
                customers: SEED_CUSTOMERS.length,
                orders: SEED_ORDERS.length,
                order_lines: lineRows.length,
                quotes: SEED_QUOTES.length,
                quote_lines: quoteLineRows.length,
                reservations: reservationRows.length,
                shortages: shortageRows.length,
                bom: bomRows.length,
                purchase_commitments: commitRows.length,
                production: prodRows.length,
                movements: movementRows.length,
                shipments: shipmentRows.length,
                invoices: invoiceRows.length,
                payments: paymentRows.length,
                ai_recommendations: recRows.length,
                ai_feedback: feedbackRows.length,
                import_batches: batchRows.length,
                import_drafts: draftRows.length,
                column_mappings: columnMappingRows.length,
                ai_entity_aliases: aliasRows.length,
                sync_logs: syncLogRows.length,
                audit_log: auditRows.length,
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
