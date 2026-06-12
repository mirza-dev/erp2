/**
 * seed-data — PMT Endüstriyel senaryosal demo verisi (TÜM modüller).
 *
 * Kaynak: pmt/ klasöründeki gerçek PMT teklif & datasheet'lerinden türetildi
 * (ürün adları/DN/PN/malzemeler gerçek katalogla uyumlu; fiyatlar yuvarlanmış
 * türevler — birebir tedarikçi fiyatı public repo'ya yazılmaz).
 *
 * DIŞ ETKİ YOK: bu modül yalnız sabit veri tanımlar. E-posta GÖNDERMEZ (email_logs
 * satırları sahte geçmiş kaydıdır), tüm müşteri e-postaları RFC 2606 @example.com,
 * Paraşüt'e çıkılmaz (DEMO-MOCK token).
 *
 * Senaryo haritası (alerts/scan bu veriden 7 alert tipini de üretebilmeli):
 *   CRITICAL        : FWBV-DN400-PN80-PH   (available 3 ≤ min 4)
 *   WARNING         : CKV-DD-DN150-PN16    (available 30 ≤ ceil(22×1.5)=33)
 *   DEADLINE geçmiş : FIT-TEE-DN200-20S    (runout ~4 gün < lead 60)
 *   DEADLINE yakın  : INS-GPR-DN100        (runout 50 - lead 45 ≈ 5 gün)
 *   FİYAT EKSİK     : CT-PTFE-DN80-PN16    (price NULL)
 *   SHORTAGE        : ORD-0008 (FWBV qty 6 > stok 3)
 *   OVERDUE SHIP    : ORD-0007 (planned_shipment_date geçmiş)
 *   QUOTE EXPIRED   : ORD-0003 (sipariş ekseni) + TKL-2026-003 (V7 sent ekseni)
 *   PO OVERDUE      : PO-2026-0002 (sent + expected_date geçmiş)
 */

// ── Tarih yardımcıları ───────────────────────────────────────────────────────

const _today = new Date();
export const daysAgo = (n: number) => new Date(_today.getTime() - n * 86_400_000).toISOString().slice(0, 10);
export const daysLater = (n: number) => new Date(_today.getTime() + n * 86_400_000).toISOString().slice(0, 10);
export const daysAgoISO = (n: number) => new Date(_today.getTime() - n * 86_400_000).toISOString();
export const hoursLaterISO = (n: number) => new Date(_today.getTime() + n * 3_600_000).toISOString();
export const todayStr = _today.toISOString().slice(0, 10);

// ── Şirket (PMT.pdf'teki gerçek bilgiler; VKN bilinçli kurgusal) ─────────────

export const SEED_COMPANY = {
    name: "PMT Endüstriyel Vana San. ve Tic. A.Ş.",
    tax_office: "Pendik VD",
    tax_no: "7290567890",                       // kurgusal — kullanıcı kararı
    address: "Çınardere Mah. Akan Sok. No:6/2 Pendik/İstanbul",
    phone: "+90 216 596 17 18",
    email: "info@pmtendustriyel.example.com",   // RFC 2606
    website: "https://www.pmtendustriyel.com.tr",
    currency: "USD",
} as const;

export const SEED_FACTORY_ADDRESS = "Kazanlı OSB Mevkii 3. Cadde No:2A/2 Suluova/Amasya";

// ── Ürün tipleri (mig.057 sabit UUID'leri) ───────────────────────────────────

export const PRODUCT_TYPE_IDS = {
    vana: "00000000-0000-4000-8000-000000000001",
    conta: "00000000-0000-4000-8000-000000000002",
    flans: "00000000-0000-4000-8000-000000000003",
    fitting: "00000000-0000-4000-8000-000000000004",
    baglanti: "00000000-0000-4000-8000-000000000005",
    enstruman: "00000000-0000-4000-8000-000000000006",
    sizdirmazlik: "00000000-0000-4000-8000-000000000007",
    diger: "00000000-0000-4000-8000-000000000008",
} as const;

export type ProductTypeKey = keyof typeof PRODUCT_TYPE_IDS;

// ── Tedarikçiler (5) ─────────────────────────────────────────────────────────

export interface SeedVendor {
    name: string; country: string; currency: "TRY" | "USD" | "EUR";
    lead_time_days: number; payment_terms_days: number;
    contact_email: string; contact_person: string | null; notes: string | null;
}

export const SEED_VENDORS: SeedVendor[] = [
    {
        name: "China Langge Valve Technology Co., Ltd", country: "CN", currency: "USD",
        lead_time_days: 60, payment_terms_days: 30,
        contact_email: "sales@langge-valve.example.com", contact_person: "Li Wei",
        notes: "Fully welded ball valve + gate valve ana tedarikçisi (PT0108 lotu).",
    },
    {
        name: "PMT Suluova Fabrikası", country: "TR", currency: "USD",
        lead_time_days: 14, payment_terms_days: 0,
        contact_email: "fabrika@pmtendustriyel.example.com", contact_person: "Üretim Planlama",
        notes: "Kendi üretim tesisi — " + SEED_FACTORY_ADDRESS,
    },
    {
        name: "Albrecht-Automatik GmbH", country: "DE", currency: "EUR",
        lead_time_days: 45, payment_terms_days: 45,
        contact_email: "vertrieb@albrecht-automatik.example.com", contact_person: "K. Hoffmann",
        notes: "Regülatör ve hızlı kapama vanaları — Almanya, 45 gün transit.",
    },
    {
        name: "Bulonsan A.Ş.", country: "TR", currency: "TRY",
        lead_time_days: 5, payment_terms_days: 30,
        contact_email: "satis@bulonsan.example.com", contact_person: null,
        notes: "Saplama/civata yerli tedarik.",
    },
    {
        name: "Garlock Türkiye", country: "TR", currency: "USD",
        lead_time_days: 7, payment_terms_days: 30,
        contact_email: "tr.satis@garlock.example.com", contact_person: null,
        notes: "Conta ve sızdırmazlık malzemeleri.",
    },
];

// ── Ürünler (20 — 8 tipin tamamı) ────────────────────────────────────────────

export interface SeedProduct {
    name: string; sku: string; category: string; unit: string;
    price: number | null; currency: "TRY" | "USD" | "EUR";
    on_hand: number; reserved: number; min_stock_level: number; reorder_qty: number;
    product_type: "manufactured" | "commercial";
    type_key: ProductTypeKey;
    attributes: Record<string, unknown>;
    warehouse: string; preferred_vendor: string;
    lead_time_days: number; daily_usage: number; cost_price: number | null;
    material_quality: string; origin_country: string;
    production_site?: string;
    hs_code?: string; size_text?: string;
}

export const SEED_PRODUCTS: SeedProduct[] = [
    // ── VANA (8) ──
    {
        // Normal stok + BOM finished + datasheet/görsel eki + üretim girişleri
        name: "Dövme Gate Valf 800LB DN25 A105 NPT",
        sku: "DGV-800-DN25-A105", category: "Vana", unit: "adet",
        price: 190, currency: "USD",
        on_hand: 160, reserved: 0, min_stock_level: 30, reorder_qty: 60,
        product_type: "manufactured", type_key: "vana",
        attributes: { dn: 25, pn_class: "800LB", valve_type: "Sürgülü (Gate)", end_connection: "NPT", actuator: "Volan", body_material: "A105", trim_material: "SS316" },
        warehouse: "Sevkiyat Deposu", preferred_vendor: "PMT Suluova Fabrikası",
        lead_time_days: 14, daily_usage: 2, cost_price: 105,
        material_quality: "A105 dövme gövde, SS trim", origin_country: "TR",
        production_site: "PMT Suluova Fabrikası",
        hs_code: "8481.80.81", size_text: "DN25 · 800LB",
    },
    {
        name: "Dövme Glob Valf 800LB DN25 A105 SW",
        sku: "DGLB-800-DN25-A105", category: "Vana", unit: "adet",
        price: 205, currency: "USD",
        on_hand: 90, reserved: 0, min_stock_level: 20, reorder_qty: 40,
        product_type: "manufactured", type_key: "vana",
        attributes: { dn: 25, pn_class: "800LB", valve_type: "Globe", end_connection: "SW (Socket Weld)", actuator: "Volan", body_material: "A105", trim_material: "SS316" },
        warehouse: "Sevkiyat Deposu", preferred_vendor: "PMT Suluova Fabrikası",
        lead_time_days: 14, daily_usage: 1, cost_price: 115,
        material_quality: "A105 dövme gövde, SS trim", origin_country: "TR",
        production_site: "PMT Suluova Fabrikası",
        hs_code: "8481.80.81", size_text: "DN25 · 800LB",
    },
    {
        name: "TGAV Gate Vana Class 150 DN150 WCB",
        sku: "TGAV-150-DN150-WCB", category: "Vana", unit: "adet",
        price: 830, currency: "USD",
        on_hand: 24, reserved: 0, min_stock_level: 10, reorder_qty: 20,
        product_type: "commercial", type_key: "vana",
        attributes: { dn: 150, pn_class: "150LB", valve_type: "Sürgülü (Gate)", end_connection: "Flanşlı (Flanged)", actuator: "Volan", body_material: "A216 WCB", trim_material: "Trim 8 (13Cr)" },
        warehouse: "Sevkiyat Deposu", preferred_vendor: "PMT Suluova Fabrikası",
        lead_time_days: 21, daily_usage: 1, cost_price: 470,
        material_quality: "A216 WCB, RF, flex wedge OS&Y", origin_country: "TR",
        hs_code: "8481.80.69", size_text: "DN150 · CL150",
    },
    {
        name: "Gate Valve Class 600 DN20 A105 Stellite Trim",
        sku: "GV-600-DN20-A105-STL", category: "Vana", unit: "adet",
        price: 195, currency: "USD",
        on_hand: 70, reserved: 0, min_stock_level: 15, reorder_qty: 30,
        product_type: "commercial", type_key: "vana",
        attributes: { dn: 20, pn_class: "600LB", valve_type: "Sürgülü (Gate)", end_connection: "NPT", body_material: "A105", trim_material: "SS + Stellite yüzey" },
        warehouse: "Sevkiyat Deposu", preferred_vendor: "PMT Suluova Fabrikası",
        lead_time_days: 14, daily_usage: 1, cost_price: 110,
        material_quality: "A105, stellite kaplama", origin_country: "TR",
    },
    {
        name: "Küresel Vana Class 600 DN20 A105 SW",
        sku: "KV-600-DN20-A105-SW", category: "Vana", unit: "adet",
        price: 115, currency: "USD",
        on_hand: 140, reserved: 0, min_stock_level: 25, reorder_qty: 50,
        product_type: "commercial", type_key: "vana",
        attributes: { dn: 20, pn_class: "600LB", valve_type: "Küresel (Ball)", end_connection: "SW (Socket Weld)", body_material: "A105", trim_material: "SS316" },
        warehouse: "Sevkiyat Deposu", preferred_vendor: "PMT Suluova Fabrikası",
        lead_time_days: 14, daily_usage: 2, cost_price: 62,
        material_quality: "A105 gövde, SS trim", origin_country: "TR",
    },
    {
        name: "Kondenstop Class 600 DN20 A105 NPT",
        sku: "KST-600-DN20-A105-NPT", category: "Vana", unit: "adet",
        price: 30, currency: "USD",
        on_hand: 320, reserved: 0, min_stock_level: 50, reorder_qty: 100,
        product_type: "commercial", type_key: "vana",
        attributes: { dn: 20, pn_class: "600LB", valve_type: "Kondenstop", end_connection: "NPT", body_material: "A105", trim_material: "SS" },
        warehouse: "Sarf Malzeme Deposu", preferred_vendor: "PMT Suluova Fabrikası",
        lead_time_days: 10, daily_usage: 6, cost_price: 16,
        material_quality: "A105 gövde, SS trim", origin_country: "TR",
    },
    {
        // CRITICAL: available 3 ≤ min 4 — yüksek değerli ithal vana
        name: "Fully Welded Ball Valve DN400 PN80 Pnömatik-Hidrolik",
        sku: "FWBV-DN400-PN80-PH", category: "Vana", unit: "adet",
        price: 18000, currency: "USD",
        on_hand: 3, reserved: 0, min_stock_level: 4, reorder_qty: 4,
        product_type: "commercial", type_key: "vana",
        attributes: { dn: 400, pn_class: "PN100", valve_type: "Küresel (Ball)", end_connection: "Kaynaklı (Welded)", actuator: "Pnö-hidrolik", body_material: "A105 + ENP", seat_material: "DEVLON" },
        warehouse: "Sevkiyat Deposu", preferred_vendor: "China Langge Valve Technology Co., Ltd",
        lead_time_days: 60, daily_usage: 1, cost_price: 12500,
        material_quality: "A105/A105+ENP/DEVLON, tam kaynaklı gövde", origin_country: "CN",
        hs_code: "8481.80.85", size_text: "DN400 · PN80",
    },
    {
        // WARNING: available 30, min 22, ceil(22×1.5)=33 → 22<30≤33
        name: "Çift Diskli Çekvalf DN150 PN16 WCB",
        sku: "CKV-DD-DN150-PN16-WCB", category: "Vana", unit: "adet",
        price: 100, currency: "USD",
        on_hand: 30, reserved: 0, min_stock_level: 22, reorder_qty: 40,
        product_type: "commercial", type_key: "vana",
        attributes: { dn: 150, pn_class: "PN16", valve_type: "Çek (Check)", end_connection: "Flanşlı (Flanged)", body_material: "A216 WCB" },
        warehouse: "Sevkiyat Deposu", preferred_vendor: "China Langge Valve Technology Co., Ltd",
        lead_time_days: 60, daily_usage: 1, cost_price: 55,
        material_quality: "WCB gövde, çift disk swing", origin_country: "CN",
    },

    // ── CONTA (2) ──
    {
        name: "Spiral Sarımlı Conta Class 150 DN200 SS304 + Flexgrafit",
        sku: "SWG-150-DN200-SS304", category: "Conta", unit: "adet",
        price: 23, currency: "USD",
        on_hand: 900, reserved: 0, min_stock_level: 200, reorder_qty: 500,
        product_type: "commercial", type_key: "conta",
        attributes: { style: "CGI (iç+dış ringli)", hoop_material: "SS304", filler_material: "Flexgrafit", outer_ring_material: "Karbon Çelik", thickness_mm: 4.5, max_temp_c: 450 },
        warehouse: "Sarf Malzeme Deposu", preferred_vendor: "Garlock Türkiye",
        lead_time_days: 7, daily_usage: 15, cost_price: 12,
        material_quality: "SS304 + flexgrafit, ASME B16.20", origin_country: "TR",
        size_text: "DN200 · CL150 · 4,5 mm",
    },
    {
        // FİYAT EKSİK senaryosu (price NULL)
        name: "PTFE Kaplı Conta DN80 PN16",
        sku: "CT-PTFE-DN80-PN16", category: "Conta", unit: "adet",
        price: null, currency: "USD",
        on_hand: 400, reserved: 0, min_stock_level: 100, reorder_qty: 300,
        product_type: "commercial", type_key: "conta",
        attributes: { style: "Düz kesim", filler_material: "PTFE", thickness_mm: 3, max_temp_c: 200 },
        warehouse: "Sarf Malzeme Deposu", preferred_vendor: "Garlock Türkiye",
        lead_time_days: 7, daily_usage: 8, cost_price: null,
        material_quality: "PTFE kaplı, gıda/GMP uyumlu", origin_country: "TR",
    },

    // ── FLANS (2) ──
    {
        name: "WN Flanş RF Class 150 DN80 S-20 A105",
        sku: "FL-WN-150-DN80-S20", category: "Flans", unit: "adet",
        price: 135, currency: "USD",
        on_hand: 110, reserved: 0, min_stock_level: 30, reorder_qty: 60,
        product_type: "commercial", type_key: "flans",
        attributes: { dn: 80, pn_class: "150LB", flange_type: "WN (Weld Neck)", face_type: "RF", material: "A105", standards: ["ASME B16.5"] },
        warehouse: "Sevkiyat Deposu", preferred_vendor: "PMT Suluova Fabrikası",
        lead_time_days: 10, daily_usage: 2, cost_price: 76,
        material_quality: "A105, ASME B16.5, Sch 20", origin_country: "TR",
        hs_code: "7307.91.00",
    },
    {
        name: "PL Flanş DN50 PN10 A105",
        sku: "FL-PL-DN50-PN10", category: "Flans", unit: "adet",
        price: 4, currency: "USD",
        on_hand: 1500, reserved: 0, min_stock_level: 300, reorder_qty: 800,
        product_type: "commercial", type_key: "flans",
        attributes: { dn: 50, pn_class: "PN10", flange_type: "PL (Plate)", face_type: "FF", material: "A105" },
        warehouse: "Sevkiyat Deposu", preferred_vendor: "China Langge Valve Technology Co., Ltd",
        lead_time_days: 60, daily_usage: 20, cost_price: 2,
        material_quality: "A105 plaka flanş", origin_country: "CN",
    },

    // ── FITTING (3) ──
    {
        name: "90° Dirsek DN100 Sch40 20# Çelik",
        sku: "FIT-ELB90-DN100-20S", category: "Fitting", unit: "adet",
        price: 9, currency: "USD",
        on_hand: 600, reserved: 0, min_stock_level: 150, reorder_qty: 400,
        product_type: "commercial", type_key: "fitting",
        attributes: { dn: 100, fitting_type: "Dirsek 90°", schedule_no: "Sch40", material: "20# Çelik" },
        warehouse: "Sarf Malzeme Deposu", preferred_vendor: "China Langge Valve Technology Co., Ltd",
        lead_time_days: 60, daily_usage: 10, cost_price: 5,
        material_quality: "20# karbon çelik, dikişsiz", origin_country: "CN",
    },
    {
        name: "Konsantrik Redüksiyon DN150×100 20# Çelik",
        sku: "FIT-RED-DN150x100-20S", category: "Fitting", unit: "adet",
        price: 12, currency: "USD",
        on_hand: 250, reserved: 0, min_stock_level: 60, reorder_qty: 150,
        product_type: "commercial", type_key: "fitting",
        attributes: { dn: 150, fitting_type: "Redüksiyon (Konsantrik)", schedule_no: "Sch40", material: "20# Çelik" },
        warehouse: "Sarf Malzeme Deposu", preferred_vendor: "China Langge Valve Technology Co., Ltd",
        lead_time_days: 60, daily_usage: 4, cost_price: 7,
        material_quality: "20# karbon çelik", origin_country: "CN",
    },
    {
        // DEADLINE GEÇMİŞ: runout (70-40)/8 ≈ 4 gün < lead 60 → sipariş tarihi geçti
        name: "Eşit Te DN200 Sch40 20# Çelik",
        sku: "FIT-TEE-DN200-20S", category: "Fitting", unit: "adet",
        price: 35, currency: "USD",
        on_hand: 70, reserved: 0, min_stock_level: 40, reorder_qty: 120,
        product_type: "commercial", type_key: "fitting",
        attributes: { dn: 200, fitting_type: "Te (Eşit)", schedule_no: "Sch40", material: "20# Çelik" },
        warehouse: "Sarf Malzeme Deposu", preferred_vendor: "China Langge Valve Technology Co., Ltd",
        lead_time_days: 60, daily_usage: 8, cost_price: 20,
        material_quality: "20# karbon çelik", origin_country: "CN",
    },

    // ── BAĞLANTI ELEMANI (1) ──
    {
        // BOM bileşeni + sayım düzeltmesi senaryosu
        name: "Saplama M24×100 B7 Karbon Çelik",
        sku: "BE-SC-M24x100-B7", category: "Bağlantı Elemanı", unit: "adet",
        price: 1.8, currency: "USD",
        on_hand: 3200, reserved: 0, min_stock_level: 500, reorder_qty: 2000,
        product_type: "commercial", type_key: "baglanti",
        attributes: { fastener_type: "Saplama", diameter_mm: 24, length_mm: 100, grade: "B7", material: "Karbon Çelik" },
        warehouse: "Bulon-Saplama Deposu", preferred_vendor: "Bulonsan A.Ş.",
        lead_time_days: 5, daily_usage: 30, cost_price: 0.9,
        material_quality: "ASTM A193 B7", origin_country: "TR",
    },

    // ── ENSTRÜMAN (2) ──
    {
        name: "Manometre Üçyollu Vana SS304 DN15",
        sku: "INS-MNF-3W-SS304", category: "Enstrüman", unit: "adet",
        price: 32, currency: "USD",
        on_hand: 85, reserved: 0, min_stock_level: 20, reorder_qty: 50,
        product_type: "commercial", type_key: "enstruman",
        attributes: { instrument_type: "Manometre vanası (3 yollu)", body_material: "SS304", process_connection_type: "NPT", process_connection_size: "1/2\"" },
        warehouse: "Sarf Malzeme Deposu", preferred_vendor: "Garlock Türkiye",
        lead_time_days: 7, daily_usage: 2, cost_price: 18,
        material_quality: "SS304 gövde", origin_country: "TR",
    },
    {
        // DEADLINE YAKIN (~5 gün): runout (60-10)/1=50 gün, lead 45 → deadline +5
        name: "Gaz Basınç Regülatörü DN100 Döküm Çelik",
        sku: "INS-GPR-DN100", category: "Enstrüman", unit: "adet",
        price: 1450, currency: "EUR",
        on_hand: 60, reserved: 0, min_stock_level: 10, reorder_qty: 12,
        product_type: "commercial", type_key: "enstruman",
        attributes: { instrument_type: "Basınç regülatörü", body_material: "Döküm çelik", measurement_range: "0,5–6 bar çıkış", media_type: "Doğalgaz" },
        warehouse: "Sevkiyat Deposu", preferred_vendor: "Albrecht-Automatik GmbH",
        lead_time_days: 45, daily_usage: 1, cost_price: 820,
        material_quality: "Döküm çelik gövde", origin_country: "DE",
    },

    // ── SIZDIRMAZLIK (1) ──
    {
        name: "Grafit Salmastra Bant 25mm",
        sku: "SLM-GRF-BANT-25", category: "Sızdırmazlık Malzemesi", unit: "metre",
        price: 14, currency: "USD",
        on_hand: 240, reserved: 0, min_stock_level: 50, reorder_qty: 150,
        product_type: "commercial", type_key: "sizdirmazlik",
        attributes: { material_type: "Grafit", form: "Bant", dimensions: "25 mm genişlik", max_temp_c: 550 },
        warehouse: "Sarf Malzeme Deposu", preferred_vendor: "Garlock Türkiye",
        lead_time_days: 7, daily_usage: 3, cost_price: 8,
        material_quality: "Saf grafit, asbestsiz", origin_country: "TR",
    },

    // ── DİĞER (1) ──
    {
        // Stoksuz, siparişe üretim — yüksek tutarlı tank senaryosu
        name: "Çelik Tank V=60 m³ Yatay Karbon Çelik",
        sku: "TANK-CS-60M3", category: "Diğer", unit: "adet",
        price: 8200, currency: "USD",
        on_hand: 0, reserved: 0, min_stock_level: 0, reorder_qty: 0,
        product_type: "manufactured", type_key: "diger",
        attributes: {},
        warehouse: "Sevkiyat Deposu", preferred_vendor: "PMT Suluova Fabrikası",
        lead_time_days: 60, daily_usage: 0, cost_price: 6000,
        material_quality: "Karbon çelik, yatay silindirik", origin_country: "TR",
        production_site: "PMT Suluova Fabrikası",
        size_text: "V=60 m³",
    },
];

// ── Müşteriler (8) ───────────────────────────────────────────────────────────

export interface SeedCustomer {
    name: string; email: string; phone: string; address: string;
    tax_number: string | null; tax_office: string | null;
    country: string; currency: "TRY" | "USD" | "EUR";
    notes: string; payment_terms_days: number; is_active: boolean;
}

export const SEED_CUSTOMERS: SeedCustomer[] = [
    {
        name: "Tüpraş İzmit Rafinerisi",
        email: "tedarik.izmit@tupras.example.com",   // RFC 2606 — gerçek firmaya gönderim imkânsız
        phone: "+90 262 316 0000",
        address: "TÜPRAŞ İzmit Rafinerisi, Körfez, Kocaeli",
        tax_number: "6440012345", tax_office: "Körfez VD",
        country: "TR", currency: "TRY",
        notes: "Yerli rafineri — yüksek basınç vana ve flanş alımları.",
        payment_terms_days: 60, is_active: true,
    },
    {
        name: "Abdi İbrahim İlaç A.Ş.",
        email: "procurement@abdibrahim.example.com",
        phone: "+90 212 366 0000",
        address: "Esenyurt, İstanbul",
        tax_number: "3810234567", tax_office: "Esenyurt VD",
        country: "TR", currency: "EUR",
        notes: "GMP uyumlu paslanmaz vana ve PTFE conta. EUR fatura.",
        payment_terms_days: 30, is_active: true,
    },
    {
        name: "Enerjisa Üretim Santralleri",
        email: "tedarik@enerjisa.example.com",
        phone: "+90 212 375 0000",
        address: "Nişantepe, İstanbul",
        tax_number: "7230145678", tax_office: "Sarıyer VD",
        country: "TR", currency: "USD",
        notes: "Doğalgaz kombine çevrim santralleri. USD fatura.",
        payment_terms_days: 45, is_active: true,
    },
    {
        // VKN-eksik → Paraşüt preflight senaryosu
        name: "Ülker Gıda — Demo Şube",
        email: "demo.satin.alma@ulker.example.com",
        phone: "+90 212 867 0000",
        address: "Kısıklı Mahallesi, Üsküdar, İstanbul",
        tax_number: null, tax_office: null,
        country: "TR", currency: "TRY",
        notes: "Demo/test şubesi — vergi numarası henüz girilmemiş (VKN-eksik akışı).",
        payment_terms_days: 30, is_active: true,
    },
    {
        name: "Botaş Doğalgaz İşletmeleri",
        email: "malzeme@botas.example.com",
        phone: "+90 312 297 2000",
        address: "Bilkent, Ankara",
        tax_number: "1870034567", tax_office: "Ankara Kurumlar VD",
        country: "TR", currency: "TRY",
        notes: "Boru hattı vana ve fitting alımları — çerçeve sözleşme.",
        payment_terms_days: 60, is_active: true,
    },
    {
        name: "Star Rafineri A.Ş.",
        email: "purchasing@starrefinery.example.com",
        phone: "+90 232 459 0000",
        address: "Aliağa, İzmir",
        tax_number: "7810098765", tax_office: "Aliağa VD",
        country: "TR", currency: "USD",
        notes: "Rafineri bakım-duruş dönemi yoğun alım.",
        payment_terms_days: 45, is_active: true,
    },
    {
        // İhracat — EXWORKS senaryosu (gerçek PT0108 projesinden esinli kurgu)
        name: "PT-0108 Kazakistan Boru Hattı Konsorsiyumu",
        email: "procurement@pt0108-consortium.example.com",
        phone: "+7 717 200 0000",
        address: "Astana, Kazakistan",
        tax_number: null, tax_office: null,
        country: "KZ", currency: "USD",
        notes: "İhracat müşterisi — EXWORKS PMT İstanbul Depo teslim, USD.",
        payment_terms_days: 0, is_active: true,
    },
    {
        // Pasif müşteri — liste filtresi senaryosu
        name: "Aygaz Dolum Tesisleri",
        email: "tedarik@aygaz.example.com",
        phone: "+90 212 354 1500",
        address: "Şişli, İstanbul",
        tax_number: "1190045678", tax_office: "Şişli VD",
        country: "TR", currency: "TRY",
        notes: "2025'te pasife alındı — yeni sipariş kabul edilmiyor.",
        payment_terms_days: 30, is_active: false,
    },
];

// ── Teklifler (8 — V7) ───────────────────────────────────────────────────────

export interface SeedQuoteLine { sku: string; description: string; quantity: number; unitPrice: number; }
export interface SeedQuote {
    quoteNumber: string;
    customerName: string;
    status: "draft" | "sent" | "accepted" | "rejected" | "expired" | "revised";
    revisionNo: number;
    rootQuoteNumber?: string;             // revizyon zinciri (kendi numarası ≠ root)
    quoteDate: string;
    validUntil: string | null;
    currency: "TRY" | "USD" | "EUR";
    discountAmount: number;
    deliveryMethod?: string;
    paymentMethod?: string;
    notes?: string;
    /** true → seller_* alanları SEED_COMPANY'den doldurulur (ihracat/baskı senaryosu) */
    withSellerInfo?: boolean;
    /** Arşiv PDF satırı + sentetik dosya üretilir (accepted/sent baskı senaryosu) */
    withPdfArchive?: boolean;
    lines: SeedQuoteLine[];
}

export const SEED_QUOTES: SeedQuote[] = [
    {
        quoteNumber: "TKL-2026-001", customerName: "Tüpraş İzmit Rafinerisi",
        status: "draft", revisionNo: 1,
        quoteDate: daysAgo(1), validUntil: daysLater(30), currency: "TRY", discountAmount: 0,
        notes: "Rafineri bakım dönemi — taslak çalışma.",
        lines: [
            { sku: "DGV-800-DN25-A105", description: "Dövme Gate Valf 800LB DN25 A105 NPT", quantity: 20, unitPrice: 7800 },
            { sku: "BE-SC-M24x100-B7", description: "Saplama M24×100 B7", quantity: 160, unitPrice: 75 },
        ],
    },
    {
        // SENT + geçerli → bağlı pending_approval sipariş (ORD-0004) + hard rezerv (088)
        quoteNumber: "TKL-2026-002", customerName: "Botaş Doğalgaz İşletmeleri",
        status: "sent", revisionNo: 1,
        quoteDate: daysAgo(4), validUntil: daysLater(25), currency: "TRY", discountAmount: 0,
        deliveryMethod: "PMT İstanbul Depo Teslimi (EXWORKS)",
        paymentMethod: "60 gün vadeli havale",
        lines: [
            { sku: "TGAV-150-DN150-WCB", description: "TGAV Gate Vana CL150 DN150 WCB", quantity: 6, unitPrice: 34000 },
            { sku: "FIT-ELB90-DN100-20S", description: "90° Dirsek DN100 Sch40", quantity: 80, unitPrice: 380 },
        ],
    },
    {
        // SENT + süresi geçmiş → quote_expired alert adayı (V7 sent ekseni, entity_type=quote)
        quoteNumber: "TKL-2026-003", customerName: "Abdi İbrahim İlaç A.Ş.",
        status: "sent", revisionNo: 1,
        quoteDate: daysAgo(40), validUntil: daysAgo(5), currency: "EUR", discountAmount: 0,
        notes: "Müşteri geri dönüş yapmadı — süre doldu.",
        lines: [
            { sku: "CT-PTFE-DN80-PN16", description: "PTFE Kaplı Conta DN80 PN16 (GMP)", quantity: 120, unitPrice: 9.5 },
            { sku: "KV-600-DN20-A105-SW", description: "Küresel Vana CL600 DN20 SW", quantity: 12, unitPrice: 108 },
        ],
    },
    {
        // Revizyon zinciri ROOT — revised (süpersede edilmiş)
        quoteNumber: "TKL-2026-004", customerName: "Enerjisa Üretim Santralleri",
        status: "revised", revisionNo: 1,
        quoteDate: daysAgo(12), validUntil: daysAgo(2), currency: "USD", discountAmount: 0,
        lines: [
            { sku: "GV-600-DN20-A105-STL", description: "Gate Valve CL600 stellite trim", quantity: 10, unitPrice: 195 },
            { sku: "SWG-150-DN200-SS304", description: "SWG Conta CL150 DN200", quantity: 60, unitPrice: 23 },
        ],
    },
    {
        // Revizyon zinciri REV2 — draft (074: yeni numara, valid_until NULL, quote_date bugün)
        quoteNumber: "TKL-2026-005", customerName: "Enerjisa Üretim Santralleri",
        status: "draft", revisionNo: 2, rootQuoteNumber: "TKL-2026-004",
        quoteDate: todayStr, validUntil: null, currency: "USD", discountAmount: 0,
        notes: "Rev 2 — müşteri adet artırdı, birim fiyat güncellendi.",
        lines: [
            { sku: "GV-600-DN20-A105-STL", description: "Gate Valve CL600 stellite trim", quantity: 16, unitPrice: 188 },
            { sku: "SWG-150-DN200-SS304", description: "SWG Conta CL150 DN200", quantity: 100, unitPrice: 21.5 },
        ],
    },
    {
        // ACCEPTED + convert (077) → ORD-0010 (donmuş totaller + arşiv PDF) + İSKONTO
        quoteNumber: "TKL-2026-006", customerName: "Enerjisa Üretim Santralleri",
        status: "accepted", revisionNo: 1,
        quoteDate: daysAgo(15), validUntil: daysLater(15), currency: "USD", discountAmount: 250,
        deliveryMethod: "PMT İstanbul Depo Teslimi (EXWORKS)",
        paymentMethod: "45 gün vadeli havale",
        withPdfArchive: true,
        lines: [
            { sku: "TGAV-150-DN150-WCB", description: "TGAV Gate Vana CL150 DN150 WCB", quantity: 4, unitPrice: 830 },
            { sku: "FL-WN-150-DN80-S20", description: "WN Flanş RF CL150 DN80 S-20", quantity: 16, unitPrice: 135 },
        ],
    },
    {
        quoteNumber: "TKL-2026-007", customerName: "Star Rafineri A.Ş.",
        status: "rejected", revisionNo: 1,
        quoteDate: daysAgo(9), validUntil: daysLater(21), currency: "USD", discountAmount: 0,
        notes: "Müşteri rakip fiyatını tercih etti.",
        lines: [
            { sku: "CKV-DD-DN150-PN16-WCB", description: "Çift Diskli Çekvalf DN150 PN16", quantity: 20, unitPrice: 100 },
        ],
    },
    {
        // İHRACAT — sent + seller_* + EXWORKS (PMT.pdf gerçek şartları) → bağlı ORD-0015
        quoteNumber: "TKL-2026-008", customerName: "PT-0108 Kazakistan Boru Hattı Konsorsiyumu",
        status: "sent", revisionNo: 1,
        quoteDate: daysAgo(2), validUntil: daysLater(30), currency: "USD", discountAmount: 0,
        deliveryMethod: "EXWORKS PMT İstanbul Depo",
        paymentMethod: "Peşin — sevkiyat öncesi %100",
        withSellerInfo: true, withPdfArchive: true,
        notes: "İhracat teklifi — fiyatlar net, KDV ilave edilecektir.",
        lines: [
            { sku: "TANK-CS-60M3", description: "Çelik Tank V=60 m³ Yatay CS", quantity: 2, unitPrice: 8200 },
            { sku: "FWBV-DN400-PN80-PH", description: "Fully Welded Ball Valve DN400 PN80", quantity: 1, unitPrice: 18000 },
            { sku: "FL-PL-DN50-PN10", description: "PL Flanş DN50 PN10 A105", quantity: 200, unitPrice: 4 },
        ],
    },
];

// ── Siparişler (15 — çift eksen matrisi) ─────────────────────────────────────

export interface SeedOrderLine { sku: string; qty: number; price: number; disc: number; }
export interface SeedOrder {
    orderNumber: string;
    customerName: string;
    commercial: "draft" | "pending_approval" | "approved" | "cancelled";
    fulfillment: "unallocated" | "partially_allocated" | "allocated" | "partially_shipped" | "shipped";
    currency: "TRY" | "USD" | "EUR";
    createdDaysAgo: number;
    quoteValidUntil?: string | null;
    plannedShipmentDate?: string | null;
    quoteNumber?: string | null;
    /** 077 convert alanları (yalnız ORD-0010): */
    sourceQuoteRevisionNo?: number;
    discountAmount?: number;
    aiRisk?: "low" | "medium" | "high" | null;
    aiConfidence?: number | null;
    aiReason?: string | null;
    parasutInvoiceId?: string | null;
    parasutSentAt?: string | null;
    parasutError?: string | null;
    notes?: string | null;
    lines: SeedOrderLine[];
}

export const SEED_ORDERS: SeedOrder[] = [
    // 1) draft — Tüpraş
    {
        orderNumber: "ORD-2026-0001", customerName: "Tüpraş İzmit Rafinerisi",
        commercial: "draft", fulfillment: "unallocated", currency: "TRY", createdDaysAgo: 1,
        quoteValidUntil: daysLater(30),
        notes: "Rafineri bakım dönemi siparişi (taslak).",
        lines: [
            { sku: "DGV-800-DN25-A105", qty: 12, price: 7800, disc: 0 },
            { sku: "BE-SC-M24x100-B7", qty: 96, price: 75, disc: 5 },
        ],
    },
    // 2) draft yüksek tutar — PT-0108 ihracat
    {
        orderNumber: "ORD-2026-0002", customerName: "PT-0108 Kazakistan Boru Hattı Konsorsiyumu",
        commercial: "draft", fulfillment: "unallocated", currency: "USD", createdDaysAgo: 1,
        quoteValidUntil: daysLater(20),
        notes: "İhracat ön kaydı — tank üretim planına girecek.",
        lines: [
            { sku: "TANK-CS-60M3", qty: 2, price: 8200, disc: 0 },
            { sku: "FWBV-DN400-PN80-PH", qty: 1, price: 18000, disc: 0 },
        ],
    },
    // 3) pending_approval — Abdi — teklif süresi 3 gün önce dolmuş (sipariş ekseni alert)
    {
        orderNumber: "ORD-2026-0003", customerName: "Abdi İbrahim İlaç A.Ş.",
        commercial: "pending_approval", fulfillment: "allocated", currency: "EUR", createdDaysAgo: 8,
        quoteValidUntil: daysAgo(3),
        aiRisk: "medium", aiConfidence: 0.74,
        aiReason: "Teklif süresi dolmuş; fiyat güncellemesi gerekebilir.",
        lines: [
            { sku: "KV-600-DN20-A105-SW", qty: 8, price: 108, disc: 0 },
            { sku: "SWG-150-DN200-SS304", qty: 40, price: 21, disc: 0 },
        ],
    },
    // 4) pending_approval — Botaş — TKL-2026-002 sent teklifin bağlı siparişi (088)
    {
        orderNumber: "ORD-2026-0004", customerName: "Botaş Doğalgaz İşletmeleri",
        commercial: "pending_approval", fulfillment: "allocated", currency: "TRY", createdDaysAgo: 4,
        quoteValidUntil: daysLater(25), quoteNumber: "TKL-2026-002",
        notes: "TKL-2026-002 gönderimiyle otomatik oluştu (rezervli bekleyen).",
        lines: [
            { sku: "TGAV-150-DN150-WCB", qty: 6, price: 34000, disc: 0 },
            { sku: "FIT-ELB90-DN100-20S", qty: 80, price: 380, disc: 0 },
        ],
    },
    // 5) approved + unallocated — Star — yeni onaylandı, henüz tahsis yok
    {
        orderNumber: "ORD-2026-0005", customerName: "Star Rafineri A.Ş.",
        commercial: "approved", fulfillment: "unallocated", currency: "USD", createdDaysAgo: 2,
        plannedShipmentDate: daysLater(10),
        lines: [
            { sku: "FIT-RED-DN150x100-20S", qty: 30, price: 12, disc: 0 },
            { sku: "INS-MNF-3W-SS304", qty: 10, price: 32, disc: 0 },
        ],
    },
    // 6) approved + allocated — Enerjisa — sevke hazır
    {
        orderNumber: "ORD-2026-0006", customerName: "Enerjisa Üretim Santralleri",
        commercial: "approved", fulfillment: "allocated", currency: "USD", createdDaysAgo: 6,
        plannedShipmentDate: daysLater(4),
        aiRisk: "low", aiConfidence: 0.92,
        aiReason: "Düzenli müşteri, standart kalemler.",
        lines: [
            { sku: "GV-600-DN20-A105-STL", qty: 6, price: 195, disc: 0 },
            { sku: "KST-600-DN20-A105-NPT", qty: 40, price: 30, disc: 0 },
        ],
    },
    // 7) approved + allocated + planned GEÇMİŞ → overdue_shipment
    {
        orderNumber: "ORD-2026-0007", customerName: "Tüpraş İzmit Rafinerisi",
        commercial: "approved", fulfillment: "allocated", currency: "TRY", createdDaysAgo: 10,
        plannedShipmentDate: daysAgo(3),
        notes: "Sevkiyat gecikti — araç planı bekleniyor.",
        lines: [
            { sku: "FL-WN-150-DN80-S20", qty: 20, price: 5600, disc: 0 },
            { sku: "SLM-GRF-BANT-25", qty: 50, price: 580, disc: 0 },
        ],
    },
    // 8) approved + partially_allocated — Star — FWBV kritik → shortage
    {
        orderNumber: "ORD-2026-0008", customerName: "Star Rafineri A.Ş.",
        commercial: "approved", fulfillment: "partially_allocated", currency: "USD", createdDaysAgo: 5,
        plannedShipmentDate: daysLater(8),
        notes: "FWBV DN400 kritik stokta — kısmi rezerve, kalan tedarik bekliyor.",
        lines: [
            { sku: "FWBV-DN400-PN80-PH", qty: 6, price: 18000, disc: 0 },   // stok 3 → shortage 3
            { sku: "TGAV-150-DN150-WCB", qty: 4, price: 830, disc: 0 },
        ],
    },
    // 9) approved + partially_shipped — Abdi
    {
        orderNumber: "ORD-2026-0009", customerName: "Abdi İbrahim İlaç A.Ş.",
        commercial: "approved", fulfillment: "partially_shipped", currency: "EUR", createdDaysAgo: 12,
        plannedShipmentDate: daysAgo(2),
        lines: [
            { sku: "KST-600-DN20-A105-NPT", qty: 30, price: 28, disc: 0 },
            { sku: "SWG-150-DN200-SS304", qty: 80, price: 21, disc: 0 },
        ],
    },
    // 10) approved + allocated — Enerjisa — TKL-2026-006 ACCEPT dönüşümü (077 donmuş alanlar)
    {
        orderNumber: "ORD-2026-0010", customerName: "Enerjisa Üretim Santralleri",
        commercial: "approved", fulfillment: "allocated", currency: "USD", createdDaysAgo: 3,
        plannedShipmentDate: daysLater(7),
        quoteNumber: "TKL-2026-006", sourceQuoteRevisionNo: 1, discountAmount: 250,
        notes: "TKL-2026-006 kabulüyle oluştu — totaller teklif anından donduruldu.",
        lines: [
            { sku: "TGAV-150-DN150-WCB", qty: 4, price: 830, disc: 0 },
            { sku: "FL-WN-150-DN80-S20", qty: 16, price: 135, disc: 0 },
        ],
    },
    // 11) approved + shipped — Enerjisa — Paraşüt SUCCESS
    {
        orderNumber: "ORD-2026-0011", customerName: "Enerjisa Üretim Santralleri",
        commercial: "approved", fulfillment: "shipped", currency: "USD", createdDaysAgo: 22,
        parasutInvoiceId: "PARASUT-INV-48211", parasutSentAt: daysAgoISO(19),
        lines: [
            { sku: "INS-GPR-DN100", qty: 4, price: 1580, disc: 3 },
            { sku: "BE-SC-M24x100-B7", qty: 80, price: 1.8, disc: 0 },
        ],
    },
    // 12) approved + shipped — Botaş — Paraşüt ERROR (VKN)
    {
        orderNumber: "ORD-2026-0012", customerName: "Botaş Doğalgaz İşletmeleri",
        commercial: "approved", fulfillment: "shipped", currency: "TRY", createdDaysAgo: 20,
        parasutError: "VKN doğrulanamadı — eşleşme hatası",
        lines: [
            { sku: "FIT-TEE-DN200-20S", qty: 24, price: 1450, disc: 0 },
            { sku: "FIT-ELB90-DN100-20S", qty: 60, price: 380, disc: 0 },
        ],
    },
    // 13) approved + shipped — Abdi — Paraşüt'e hiç gönderilmemiş
    {
        orderNumber: "ORD-2026-0013", customerName: "Abdi İbrahim İlaç A.Ş.",
        commercial: "approved", fulfillment: "shipped", currency: "EUR", createdDaysAgo: 30,
        lines: [
            { sku: "DGLB-800-DN25-A105", qty: 10, price: 185, disc: 0 },
        ],
    },
    // 14) cancelled — Ülker (VKN-eksik müşteri)
    {
        orderNumber: "ORD-2026-0014", customerName: "Ülker Gıda — Demo Şube",
        commercial: "cancelled", fulfillment: "unallocated", currency: "TRY", createdDaysAgo: 18,
        notes: "Müşteri tarafından iptal edildi (VKN bilgisi eksikti).",
        lines: [
            { sku: "KV-600-DN20-A105-SW", qty: 6, price: 4400, disc: 10 },
        ],
    },
    // 15) pending_approval — PT-0108 — TKL-2026-008 ihracat teklifinin bağlı siparişi
    //     (088 zero-stock lenient: tank stoğu 0 → ne ayrılırsa ayrılır, kalan shortage)
    {
        orderNumber: "ORD-2026-0015", customerName: "PT-0108 Kazakistan Boru Hattı Konsorsiyumu",
        commercial: "pending_approval", fulfillment: "partially_allocated", currency: "USD", createdDaysAgo: 2,
        quoteValidUntil: daysLater(30), quoteNumber: "TKL-2026-008",
        notes: "TKL-2026-008 gönderimiyle otomatik oluştu — tank üretimden karşılanacak.",
        lines: [
            { sku: "TANK-CS-60M3", qty: 2, price: 8200, disc: 0 },          // stok 0 → tam shortage
            { sku: "FL-PL-DN50-PN10", qty: 200, price: 4, disc: 0 },
        ],
    },
];

// ── Satın Alma Siparişleri (5) ───────────────────────────────────────────────

export interface SeedPoLine { sku: string; qty: number; unitPrice: number; receivedQty: number; }
export interface SeedPo {
    poNumber: string;
    vendorName: string;
    status: "draft" | "sent" | "confirmed" | "partially_received" | "received" | "cancelled";
    orderDaysAgo: number;
    expectedDate: string | null;
    currency: "TRY" | "USD" | "EUR";
    notes: string | null;
    /** accepted AI önerisine junction bağlanacak satır index'i */
    linkRecommendationLineIdx?: number;
    lines: SeedPoLine[];
}

export const SEED_POS: SeedPo[] = [
    {
        poNumber: "PO-2026-0001", vendorName: "Bulonsan A.Ş.",
        status: "draft", orderDaysAgo: 1, expectedDate: daysLater(7), currency: "TRY",
        notes: "Saplama stok takviyesi — onay bekliyor.",
        lines: [{ sku: "BE-SC-M24x100-B7", qty: 2000, unitPrice: 62, receivedQty: 0 }],
    },
    {
        // PO OVERDUE: sent + expected_date 6 gün geçmiş
        poNumber: "PO-2026-0002", vendorName: "China Langge Valve Technology Co., Ltd",
        status: "sent", orderDaysAgo: 70, expectedDate: daysAgo(6), currency: "USD",
        notes: "PT0108 lotu — gümrükte bekliyor, tedarikçi takipte.",
        lines: [
            { sku: "FWBV-DN400-PN80-PH", qty: 4, unitPrice: 12500, receivedQty: 0 },
            { sku: "FIT-TEE-DN200-20S", qty: 60, unitPrice: 20, receivedQty: 0 },
        ],
    },
    {
        poNumber: "PO-2026-0003", vendorName: "Albrecht-Automatik GmbH",
        status: "confirmed", orderDaysAgo: 10, expectedDate: daysLater(35), currency: "EUR",
        notes: "Regülatör — Almanya üretim teyidi alındı.",
        linkRecommendationLineIdx: 0,
        lines: [{ sku: "INS-GPR-DN100", qty: 6, unitPrice: 820, receivedQty: 0 }],
    },
    {
        poNumber: "PO-2026-0004", vendorName: "China Langge Valve Technology Co., Ltd",
        status: "partially_received", orderDaysAgo: 75, expectedDate: daysAgo(10), currency: "USD",
        notes: "İlk parti teslim alındı; bakiye ikinci konteynerde.",
        lines: [
            { sku: "FIT-ELB90-DN100-20S", qty: 300, unitPrice: 5, receivedQty: 180 },
            { sku: "FIT-RED-DN150x100-20S", qty: 100, unitPrice: 7, receivedQty: 0 },
        ],
    },
    {
        poNumber: "PO-2026-0005", vendorName: "PMT Suluova Fabrikası",
        status: "received", orderDaysAgo: 20, expectedDate: daysAgo(8), currency: "USD",
        notes: "Fabrika içi transfer — tamamı teslim alındı.",
        lines: [{ sku: "DGV-800-DN25-A105", qty: 40, unitPrice: 105, receivedQty: 40 }],
    },
];

// ── Tedarik taahhütleri (incoming ekseni — PO'larla hizalı) ─────────────────

export const SEED_COMMITMENTS = [
    { sku: "FWBV-DN400-PN80-PH", qty: 4, date: daysLater(18), supplier: "China Langge Valve Technology Co., Ltd", status: "pending", notes: "PO-2026-0002 bakiyesi — acil kritik stok takviyesi" },
    { sku: "INS-GPR-DN100", qty: 6, date: daysLater(35), supplier: "Albrecht-Automatik GmbH", status: "pending", notes: "PO-2026-0003 — Almanya 45 gün transit" },
    { sku: "DGV-800-DN25-A105", qty: 40, date: daysAgo(8), supplier: "PMT Suluova Fabrikası", status: "received", notes: "PO-2026-0005 — teslim alındı, stok güncellendi" },
    { sku: "KST-600-DN20-A105-NPT", qty: 100, date: daysAgo(15), supplier: "PMT Suluova Fabrikası", status: "cancelled", notes: "İptal — üretim planı değişti" },
] as const;

// ── BOM (gate valf ← conta + saplama) ───────────────────────────────────────

export const SEED_BOM = [
    { finished: "DGV-800-DN25-A105", component: "SWG-150-DN200-SS304", qty: 1, unit: "adet", notes: "Gövde contası" },
    { finished: "DGV-800-DN25-A105", component: "BE-SC-M24x100-B7", qty: 4, unit: "adet", notes: "Kapak saplamaları" },
] as const;

// ── Üretim girişleri ─────────────────────────────────────────────────────────

export const SEED_PRODUCTION = [
    { sku: "DGV-800-DN25-A105", qty: 30, scrap: 0, date: todayStr, notes: null },
    { sku: "DGV-800-DN25-A105", qty: 15, scrap: 2, date: daysAgo(2), notes: "2 adet yüzey hatası" },
    { sku: "DGLB-800-DN25-A105", qty: 20, scrap: 0, date: daysAgo(5), notes: null },
] as const;

// ── Depo bakiyeleri (084 — sum ≤ on_hand kuralı testle kilitli) ──────────────

export const SEED_LOCATION_BALANCES = [
    { sku: "DGV-800-DN25-A105", location: "Sevkiyat Deposu", quantity: 120 },
    { sku: "DGV-800-DN25-A105", location: "Suluova Fabrika Ambarı", quantity: 40 },
    { sku: "SWG-150-DN200-SS304", location: "Sarf Malzeme Deposu", quantity: 700 },
    { sku: "SWG-150-DN200-SS304", location: "Sevkiyat Deposu", quantity: 200 },
    { sku: "BE-SC-M24x100-B7", location: "Bulon-Saplama Deposu", quantity: 3200 },
    { sku: "FWBV-DN400-PN80-PH", location: "Sevkiyat Deposu", quantity: 3 },
    { sku: "FL-PL-DN50-PN10", location: "Sevkiyat Deposu", quantity: 1500 },
    { sku: "FIT-ELB90-DN100-20S", location: "Sarf Malzeme Deposu", quantity: 600 },
] as const;

// ── Ürün-tedarikçi bağları (084) ─────────────────────────────────────────────

export const SEED_VENDOR_LINKS = [
    { sku: "FWBV-DN400-PN80-PH", vendor: "China Langge Valve Technology Co., Ltd", vendorSku: "LGE-FWBV-400-80", leadDays: 60, moq: 1, preferred: true },
    { sku: "FIT-TEE-DN200-20S", vendor: "China Langge Valve Technology Co., Ltd", vendorSku: "LGE-TEE-200", leadDays: 60, moq: 50, preferred: true },
    { sku: "INS-GPR-DN100", vendor: "Albrecht-Automatik GmbH", vendorSku: "ALB-GPR-100", leadDays: 45, moq: 2, preferred: true },
    { sku: "BE-SC-M24x100-B7", vendor: "Bulonsan A.Ş.", vendorSku: "BLS-M24-100-B7", leadDays: 5, moq: 500, preferred: true },
    { sku: "SWG-150-DN200-SS304", vendor: "Garlock Türkiye", vendorSku: "GRL-SWG-200-150", leadDays: 7, moq: 100, preferred: true },
    { sku: "DGV-800-DN25-A105", vendor: "PMT Suluova Fabrikası", vendorSku: null, leadDays: 14, moq: 10, preferred: true },
] as const;

// ── Takvim notları (092) ─────────────────────────────────────────────────────

export const SEED_CALENDAR_NOTES = [
    { title: "ISK-SODEX Fuarı — stant kurulumu", description: "Tüyap 9. salon, stant C-214. Numune vana seti hazırlanacak.", noteDate: daysLater(12), noteTime: "09:00", visibility: "company" as const },
    { title: "Tüpraş İzmit saha ziyareti", description: "Bakım dönemi ihtiyaç listesi + DGV-800 numune teslimi.", noteDate: daysLater(3), noteTime: "14:00", visibility: "personal" as const },
    { title: "Banka mutabakatı tamamlandı", description: null, noteDate: daysAgo(5), noteTime: null, visibility: "company" as const },
];

// ── E-posta logları (047/096 — SAHTE GEÇMİŞ; gönderim YAPILMAZ) ─────────────

export interface SeedEmailLog {
    notification_type: string;
    entity: "quote" | "order" | null;
    /** quote/order numarası — runner gerçek id'ye çözer */
    entityRef: string | null;
    recipient: string; subject: string;
    status: "sent" | "failed" | "pending";
    attemptCount: number;
    errorMessage: string | null;
    sentDaysAgo: number | null;
    /** 096 retry snapshot: html/text gövdesi + 24 saat TTL */
    withBodySnapshot?: boolean;
}

export const SEED_EMAIL_LOGS: SeedEmailLog[] = [
    {
        notification_type: "quote_sent", entity: "quote", entityRef: "TKL-2026-002",
        recipient: "malzeme@botas.example.com",
        subject: "PMT Endüstriyel — Teklif TKL-2026-002",
        status: "sent", attemptCount: 1, errorMessage: null, sentDaysAgo: 4,
    },
    {
        // FAILED + retry snapshot (096): gövde saklandı, Yeniden Gönder test edilebilir
        notification_type: "quote_sent", entity: "quote", entityRef: "TKL-2026-008",
        recipient: "procurement@pt0108-consortium.example.com",
        subject: "PMT Industrial — Quotation TKL-2026-008",
        status: "failed", attemptCount: 2,
        errorMessage: "SMTP 451 — geçici alıcı sunucu hatası",
        sentDaysAgo: null, withBodySnapshot: true,
    },
    {
        notification_type: "order_approved", entity: "order", entityRef: "ORD-2026-0010",
        recipient: "tedarik@enerjisa.example.com",
        subject: "Siparişiniz onaylandı — ORD-2026-0010",
        status: "sent", attemptCount: 1, errorMessage: null, sentDaysAgo: 3,
    },
    {
        notification_type: "stock_alert_digest", entity: null, entityRef: null,
        recipient: "satinalma@pmt-demo.test",
        subject: "Günlük stok uyarı özeti",
        status: "pending", attemptCount: 1,
        errorMessage: "Zaman aşımı — yeniden denenecek", sentDaysAgo: null,
    },
];

// ── Şirket dosyaları (091 — sentetik mini PDF/PNG, demo/ prefix) ─────────────

export const SEED_COMPANY_FILES = [
    {
        displayName: "Tüpraş Çerçeve Sözleşme 2026", category: "sozlesme" as const,
        ext: "pdf", mime: "application/pdf",
        description: "2026 yılı vana/flanş çerçeve tedarik sözleşmesi (demo).",
        pdfTitle: "Cerceve Tedarik Sozlesmesi 2026",
        pdfLines: ["PMT Endustriyel Vana San. ve Tic. A.S.", "Tupras Izmit Rafinerisi", "Kapsam: vana, flans, conta tedariki", "DEMO BELGE — sentetik icerik"],
    },
    {
        displayName: "SWG Conta Malzeme Sertifikası (örnek)", category: "belge" as const,
        ext: "pdf", mime: "application/pdf",
        description: "Spiral sarımlı conta EN 10204 3.1 örnek sertifika (demo).",
        pdfTitle: "Malzeme Sertifikasi EN 10204 3.1",
        pdfLines: ["Urun: Spiral Sarimli Conta CL150 DN200", "Malzeme: SS304 + Flexgrafit", "Standart: ASME B16.20", "DEMO BELGE — sentetik icerik"],
    },
    {
        displayName: "TKL-2026-008 Teknik Ek", category: "teklif-eki" as const,
        ext: "pdf", mime: "application/pdf",
        description: "İhracat teklifi teknik şartname eki (demo).",
        pdfTitle: "Teknik Sartname Eki — TKL-2026-008",
        pdfLines: ["Celik Tank V=60 m3 — yatay, karbon celik", "FWBV DN400 PN80 — tam kaynakli govde", "EXWORKS PMT Istanbul Depo", "DEMO BELGE — sentetik icerik"],
    },
    {
        displayName: "PMT Logo (kurumsal)", category: "kurumsal" as const,
        ext: "png", mime: "image/png",
        description: "Kurumsal kimlik — logo placeholder (demo).",
        pdfTitle: null, pdfLines: null,
    },
];

// ── Import belgeleri (061-086 — AI kuyruğu senaryoları) ──────────────────────

export const SEED_IMPORT_DOCUMENTS = [
    {
        fileName: "PMT-800LB-datasheet.pdf", mime: "application/pdf",
        status: "classified" as const, createdDaysAgo: 2,
        classification: { document_type: "product_datasheet", confidence: 0.91, summary: "Dövme çelik 800LB vana serisi datasheet (gate + globe)" },
        pdfTitle: "Dovme Celik Vana Serisi 800LB",
        pdfLines: ["Gate Valf DN25 A105 NPT — SS trim", "Glob Valf DN25 A105 SW — SS trim", "Test: API 598", "DEMO BELGE — sentetik icerik"],
        lines: [
            {
                lineNumber: 1, extractedName: "Dövme Gate Valf 800LB DN25 A105 NPT",
                extractedSku: "DGV-800-DN25-A105", matchSku: "DGV-800-DN25-A105",
                matchAction: "matched" as const, confidence: 96,
                attributes: { dn: 25, pn_class: "800LB", body_material: "A105" },
                coreFields: { unit: "adet", material_quality: "A105 dövme gövde, SS trim", origin_country: "TR" },
                sourcePage: 1,
            },
            {
                // Yeni ürün satırı — İncele ekranında SKU girişi senaryosu
                lineNumber: 2, extractedName: "Dövme Gate Valf 800LB DN40 A105 NPT",
                extractedSku: "DGV-800-DN40-A105", matchSku: null,
                matchAction: "new_product" as const, confidence: null,
                attributes: { dn: 40, pn_class: "800LB", body_material: "A105" },
                coreFields: { unit: "adet", material_quality: "A105 dövme gövde, SS trim", origin_country: "TR" },
                sourcePage: 1,
            },
            {
                lineNumber: 3, extractedName: "Test Sertifika Şablonu",
                extractedSku: null, matchSku: null,
                matchAction: "skipped" as const, confidence: null,
                attributes: {}, coreFields: null, sourcePage: 2,
            },
        ],
    },
    {
        fileName: "stok-sayim-mayis-2026.xlsx",
        mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        status: "classified" as const, createdDaysAgo: 1,
        classification: { document_type: "migration_excel", confidence: 0.88, summary: "Aylık stok sayım listesi — Excel sihirbazına yönlendirilebilir" },
        pdfTitle: null, pdfLines: null,
        lines: [],
    },
    {
        fileName: "langge-proforma-PT0108.pdf", mime: "application/pdf",
        status: "applied" as const, createdDaysAgo: 9,
        classification: { document_type: "supplier_quotation", confidence: 0.93, summary: "Tedarikçi proforması — satırlar ürünlere uygulandı" },
        pdfTitle: "Proforma Invoice PT0108",
        pdfLines: ["Fully Welded Ball Valve DN400 PN80", "Equal Tee DN200 Sch40", "DEMO BELGE — sentetik icerik"],
        lines: [
            {
                lineNumber: 1, extractedName: "Fully Welded Ball Valve DN400 PN80",
                extractedSku: "FWBV-DN400-PN80-PH", matchSku: "FWBV-DN400-PN80-PH",
                matchAction: "matched" as const, confidence: 98,
                attributes: { dn: 400, pn_class: "PN100" }, coreFields: null, sourcePage: 1,
            },
            {
                lineNumber: 2, extractedName: "Eşit Te DN200 Sch40",
                extractedSku: "FIT-TEE-DN200-20S", matchSku: "FIT-TEE-DN200-20S",
                matchAction: "matched" as const, confidence: 95,
                attributes: { dn: 200 }, coreFields: null, sourcePage: 1,
            },
        ],
    },
];

// ── RBAC test kullanıcıları (şifre SEED_DEMO_PASSWORD env'inden) ─────────────

export const SEED_DEMO_USERS = [
    { email: "admin@pmt-demo.test", role: "admin", displayName: "Demo Admin" },
    { email: "satis@pmt-demo.test", role: "sales", displayName: "Demo Satış" },
    { email: "uretim@pmt-demo.test", role: "production", displayName: "Demo Üretim" },
    { email: "satinalma@pmt-demo.test", role: "purchasing", displayName: "Demo Satın Alma" },
    { email: "muhasebe@pmt-demo.test", role: "accounting", displayName: "Demo Muhasebe" },
    { email: "viewer@pmt-demo.test", role: "viewer", displayName: "Demo İzleyici" },
] as const;

// ── Hesap yardımcıları (KDV %20 — domain kuralı) ─────────────────────────────

export const VAT_RATE = 0.20;
export const round2 = (n: number) => Math.round(n * 100) / 100;

export function orderLineTotal(l: SeedOrderLine): number {
    return round2(l.qty * l.price * (1 - l.disc / 100));
}
export function orderTotals(o: SeedOrder) {
    const subtotal = round2(o.lines.reduce((s, l) => s + l.qty * l.price * (1 - l.disc / 100), 0));
    const discount = o.discountAmount ?? 0;
    const base = round2(subtotal - discount);
    const vatTotal = round2(base * VAT_RATE);
    return { subtotal, vatTotal, grandTotal: round2(base + vatTotal) };
}
export function quoteTotals(q: SeedQuote) {
    const subtotal = round2(q.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0));
    const base = round2(subtotal - q.discountAmount);
    const vatTotal = round2(base * VAT_RATE);
    return { subtotal, vatTotal, grandTotal: round2(base + vatTotal) };
}
export function poTotals(p: SeedPo) {
    const subtotal = round2(p.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0));
    const vatTotal = round2(subtotal * VAT_RATE);
    return { subtotal, vatTotal, grandTotal: round2(subtotal + vatTotal) };
}
