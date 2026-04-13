/**
 * POST /api/seed — Seeds the Supabase DB with PMT Endüstriyel demo data.
 * Products: upsert on SKU (safe to re-run).
 * Customers: upsert on name (safe to re-run).
 *
 * Stok senaryoları (demo alertları için tasarlandı):
 *   CRITICAL stock  : Çift Blok Küresel DN100, Basket Filtre DN100, Albrecht DN80
 *   WARNING  stock  : 3P Küresel DN80, API Forged Sürgülü DN50, Lift Çek DN50, Aramid Conta DN100
 *   PAST deadline   : Wafer Kelebek DN150 (7 gün geçti — tedarik 21 gün)
 *   IMMINENT deadline: Albrecht DN50 (3 gün kaldı — Almanya tedariki 45 gün!)
 *                      Kontrol Valfı DN65 (1 gün kaldı)
 */
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

// ── Ürünler ──────────────────────────────────────────────────────────────────
//
// available_now = on_hand - reserved  (Supabase computed column)
// Stok durumu:  available_now <= min → CRITICAL
//               available_now <= ceil(min*1.5) → WARNING
// Sipariş son tarihi:
//   stockoutDays = floor(promisable / daily_usage)
//   deadline     = stockoutDays - lead_time_days - 7
//   deadline <= 7 → alert tetiklenir

const SEED_PRODUCTS = [

    // ── KÜRESEL VANALAR ─────────────────────────────────────────────────────

    {
        name: "3 Parçalı Küresel Vana DN50 PN40 Paslanmaz 316",
        sku: "KV-3P-DN50-PN40-CF8M",
        category: "Küresel Vanalar",
        unit: "adet",
        price: 780,
        currency: "USD",
        on_hand: 180, reserved: 40, min_stock_level: 30, reorder_qty: 60,
        product_type: "manufactured",
        warehouse: "Sevkiyat Deposu",
        preferred_vendor: "PMT Amasya Fabrikası",
        lead_time_days: 14,
        daily_usage: 2,
        cost_price: 420,
        material_quality: "CF8M (SS316)",
        origin_country: "TR",
        production_site: "PMT Amasya Fabrikası",
        industries: "Petrokimya, Kimya, İlaç, Gıda",
        standards: "API 6D, EN 12516",
        certifications: "ISO 9001",
        is_for_sales: true, is_for_purchase: false,
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
        product_type: "manufactured",
        warehouse: "Sevkiyat Deposu",
        preferred_vendor: "PMT Amasya Fabrikası",
        lead_time_days: 14,
        daily_usage: 2,
        cost_price: 680,
        material_quality: "A216 WCB",
        origin_country: "TR",
        production_site: "PMT Amasya Fabrikası",
        industries: "Petrokimya, Gaz, Enerji",
        standards: "API 6D, ASME B16.10",
        is_for_sales: true, is_for_purchase: false,
    },
    {
        name: "2 Parçalı Küresel Vana DN25 PN16 Paslanmaz 304",
        sku: "KV-2P-DN25-PN16-CF8",
        category: "Küresel Vanalar",
        unit: "adet",
        price: 320,
        currency: "USD",
        on_hand: 350, reserved: 80, min_stock_level: 60, reorder_qty: 120,
        product_type: "manufactured",
        warehouse: "Sevkiyat Deposu",
        preferred_vendor: "PMT Amasya Fabrikası",
        lead_time_days: 14,
        daily_usage: 3,
        cost_price: 175,
        material_quality: "CF8 (SS304)",
        origin_country: "TR",
        production_site: "PMT Amasya Fabrikası",
        industries: "Gıda, İlaç, Kimya",
        standards: "EN 12516",
        is_for_sales: true, is_for_purchase: false,
    },
    {
        // CRITICAL: available=5, min=10 → 5≤10
        name: "Çift Blok Küresel Vana DN100 600LB Paslanmaz 316",
        sku: "KV-DB-DN100-600LB-CF8M",
        category: "Küresel Vanalar",
        unit: "adet",
        price: 4800,
        currency: "USD",
        on_hand: 12, reserved: 7, min_stock_level: 10, reorder_qty: 15,
        product_type: "manufactured",
        warehouse: "Sevkiyat Deposu",
        preferred_vendor: "PMT Amasya Fabrikası",
        lead_time_days: 21,
        cost_price: 2600,
        material_quality: "CF8M (SS316)",
        origin_country: "TR",
        production_site: "PMT Amasya Fabrikası",
        industries: "Petrokimya, Rafineri, Gaz",
        standards: "API 6D, API 600",
        certifications: "ISO 9001, PED 2014/68/EU",
        is_for_sales: true, is_for_purchase: false,
    },

    // ── SÜRGÜLÜ VANALAR ─────────────────────────────────────────────────────

    {
        name: "Yükselen Milli F5 Sürgülü Vana DN150 300LB Karbon Çelik",
        sku: "SV-F5-DN150-300LB-WCB",
        category: "Sürgülü Vanalar",
        unit: "adet",
        price: 2400,
        currency: "USD",
        on_hand: 120, reserved: 30, min_stock_level: 20, reorder_qty: 40,
        product_type: "manufactured",
        warehouse: "Sevkiyat Deposu",
        preferred_vendor: "PMT Amasya Fabrikası",
        lead_time_days: 21,
        daily_usage: 1,
        cost_price: 1300,
        material_quality: "A216 WCB",
        origin_country: "TR",
        production_site: "PMT Amasya Fabrikası",
        industries: "Petrokimya, Enerji, Gaz",
        standards: "EN 558 Serie 15, API 600",
        certifications: "ISO 9001",
        is_for_sales: true, is_for_purchase: false,
    },
    {
        name: "Yükselen Milli F4 Sürgülü Vana DN200 PN40 Karbon Çelik",
        sku: "SV-F4-DN200-PN40-WCB",
        category: "Sürgülü Vanalar",
        unit: "adet",
        price: 3800,
        currency: "USD",
        on_hand: 60, reserved: 15, min_stock_level: 10, reorder_qty: 20,
        product_type: "manufactured",
        warehouse: "Sevkiyat Deposu",
        preferred_vendor: "PMT Amasya Fabrikası",
        lead_time_days: 21,
        cost_price: 2100,
        material_quality: "A216 WCB",
        origin_country: "TR",
        production_site: "PMT Amasya Fabrikası",
        industries: "Enerji Santralleri, Gaz",
        standards: "EN 558 Serie 14, DIN 3352",
        is_for_sales: true, is_for_purchase: false,
    },
    {
        // WARNING: available=22, min=15, ceil(15*1.5)=23 → 15<22≤23
        name: "API Forged Sürgülü Vana DN50 600LB Butt Weld",
        sku: "SV-AF-DN50-600LB-BW",
        category: "Sürgülü Vanalar",
        unit: "adet",
        price: 1850,
        currency: "USD",
        on_hand: 35, reserved: 13, min_stock_level: 15, reorder_qty: 30,
        product_type: "manufactured",
        warehouse: "Sevkiyat Deposu",
        preferred_vendor: "PMT Amasya Fabrikası",
        lead_time_days: 21,
        daily_usage: 1,
        cost_price: 1000,
        material_quality: "A105 (Karbon Çelik Dövme)",
        origin_country: "TR",
        production_site: "PMT Amasya Fabrikası",
        industries: "Petrokimya, Rafineri, Gaz",
        standards: "API 602, ASME B16.34",
        certifications: "ISO 9001",
        is_for_sales: true, is_for_purchase: false,
    },

    // ── KELEBEK VANALAR ─────────────────────────────────────────────────────

    {
        // PAST DEADLINE: available=85, daily=4, lead=21
        //   stockoutDays=floor(85/4)=21, deadline=21-21-7=-7 → 7 GÜN GEÇTİ! (CRITICAL alert)
        name: "Wafer Tip Kelebek Vana DN150 PN16 Paslanmaz 304",
        sku: "KB-WT-DN150-PN16-CF8",
        category: "Kelebek Vanalar",
        unit: "adet",
        price: 580,
        currency: "USD",
        on_hand: 100, reserved: 15, min_stock_level: 30, reorder_qty: 80,
        product_type: "manufactured",
        warehouse: "Sevkiyat Deposu",
        preferred_vendor: "PMT Amasya Fabrikası",
        lead_time_days: 21,
        daily_usage: 4,
        cost_price: 310,
        material_quality: "CF8 (SS304)",
        origin_country: "TR",
        production_site: "PMT Amasya Fabrikası",
        industries: "Gıda, İlaç, Kimya, Petrokimya",
        standards: "EN 593, ISO 5752",
        certifications: "ISO 9001, FDA uyumlu",
        is_for_sales: true, is_for_purchase: false,
    },
    {
        name: "Lug Tip Kelebek Vana DN200 PN16 Karbon Çelik",
        sku: "KB-LG-DN200-PN16-WCB",
        category: "Kelebek Vanalar",
        unit: "adet",
        price: 920,
        currency: "USD",
        on_hand: 80, reserved: 20, min_stock_level: 15, reorder_qty: 30,
        product_type: "manufactured",
        warehouse: "Sevkiyat Deposu",
        preferred_vendor: "PMT Amasya Fabrikası",
        lead_time_days: 21,
        daily_usage: 1,
        cost_price: 500,
        material_quality: "A216 WCB",
        origin_country: "TR",
        production_site: "PMT Amasya Fabrikası",
        industries: "Enerji, Gaz, Petrokimya",
        standards: "EN 593, API 609",
        is_for_sales: true, is_for_purchase: false,
    },
    {
        name: "Çift Klapeli Flanşlı Kelebek Vana DN100 PN16 Karbon Çelik",
        sku: "KB-CK-DN100-PN16-WCB",
        category: "Kelebek Vanalar",
        unit: "adet",
        price: 640,
        currency: "USD",
        on_hand: 95, reserved: 25, min_stock_level: 15, reorder_qty: 30,
        product_type: "manufactured",
        warehouse: "Sevkiyat Deposu",
        preferred_vendor: "PMT Amasya Fabrikası",
        lead_time_days: 14,
        daily_usage: 2,
        cost_price: 345,
        material_quality: "A216 WCB",
        origin_country: "TR",
        production_site: "PMT Amasya Fabrikası",
        industries: "Enerji, Petrokimya, Kimya",
        standards: "EN 593",
        is_for_sales: true, is_for_purchase: false,
    },

    // ── ÇEK VALFLER ────────────────────────────────────────────────────────

    {
        name: "Swing Tipi Çek Valf DN80 PN16 Karbon Çelik",
        sku: "CV-SW-DN80-PN16-WCB",
        category: "Çek Valfler",
        unit: "adet",
        price: 680,
        currency: "USD",
        on_hand: 140, reserved: 30, min_stock_level: 25, reorder_qty: 50,
        product_type: "manufactured",
        warehouse: "Sevkiyat Deposu",
        preferred_vendor: "PMT Amasya Fabrikası",
        lead_time_days: 14,
        daily_usage: 2,
        cost_price: 370,
        material_quality: "A216 WCB",
        origin_country: "TR",
        production_site: "PMT Amasya Fabrikası",
        industries: "Petrokimya, Gaz, Enerji",
        standards: "EN 12334, API 6D",
        is_for_sales: true, is_for_purchase: false,
    },
    {
        // WARNING: available=28, min=20, ceil(20*1.5)=30 → 20<28≤30
        name: "Lift Tipi Çek Valf DN50 PN40 Paslanmaz 316",
        sku: "CV-LT-DN50-PN40-CF8M",
        category: "Çek Valfler",
        unit: "adet",
        price: 520,
        currency: "USD",
        on_hand: 50, reserved: 22, min_stock_level: 20, reorder_qty: 40,
        product_type: "manufactured",
        warehouse: "Sevkiyat Deposu",
        preferred_vendor: "PMT Amasya Fabrikası",
        lead_time_days: 14,
        daily_usage: 1,
        cost_price: 285,
        material_quality: "CF8M (SS316)",
        origin_country: "TR",
        production_site: "PMT Amasya Fabrikası",
        industries: "Kimya, İlaç, Gıda",
        standards: "EN 12334",
        certifications: "ISO 9001",
        is_for_sales: true, is_for_purchase: false,
    },
    {
        name: "Çift Klapeli Çek Valf DN200 PN16 Karbon Çelik",
        sku: "CV-CK-DN200-PN16-WCB",
        category: "Çek Valfler",
        unit: "adet",
        price: 2200,
        currency: "USD",
        on_hand: 25, reserved: 5, min_stock_level: 5, reorder_qty: 10,
        product_type: "manufactured",
        warehouse: "Sevkiyat Deposu",
        preferred_vendor: "PMT Amasya Fabrikası",
        lead_time_days: 21,
        cost_price: 1200,
        material_quality: "A216 WCB",
        origin_country: "TR",
        production_site: "PMT Amasya Fabrikası",
        industries: "Enerji Santralleri, Rafineri",
        standards: "EN 12334, API 6D",
        is_for_sales: true, is_for_purchase: false,
    },

    // ── FİLTRELER ──────────────────────────────────────────────────────────

    {
        name: "Flanşlı Y Tipi Filtre DN80 PN40 Karbon Çelik",
        sku: "FT-YF-DN80-PN40-WCB",
        category: "Filtreler",
        unit: "adet",
        price: 750,
        currency: "USD",
        on_hand: 75, reserved: 15, min_stock_level: 12, reorder_qty: 24,
        product_type: "manufactured",
        warehouse: "Sevkiyat Deposu",
        preferred_vendor: "PMT Amasya Fabrikası",
        lead_time_days: 14,
        daily_usage: 1,
        cost_price: 410,
        material_quality: "A216 WCB",
        origin_country: "TR",
        production_site: "PMT Amasya Fabrikası",
        industries: "Petrokimya, Enerji, Kimya",
        standards: "EN 13709",
        is_for_sales: true, is_for_purchase: false,
    },
    {
        // CRITICAL: available=6, min=10 → 6≤10
        name: "Basket Tip Filtre DN100 PN40 Paslanmaz 316",
        sku: "FT-BT-DN100-PN40-CF8M",
        category: "Filtreler",
        unit: "adet",
        price: 1450,
        currency: "USD",
        on_hand: 18, reserved: 12, min_stock_level: 10, reorder_qty: 20,
        product_type: "manufactured",
        warehouse: "Sevkiyat Deposu",
        preferred_vendor: "PMT Amasya Fabrikası",
        lead_time_days: 21,
        cost_price: 790,
        material_quality: "CF8M (SS316)",
        origin_country: "TR",
        production_site: "PMT Amasya Fabrikası",
        industries: "Kimya, İlaç, Gıda, Petrokimya",
        standards: "EN 13709",
        certifications: "ISO 9001",
        is_for_sales: true, is_for_purchase: false,
    },

    // ── GLOB / KONTROL VALFLERİ ─────────────────────────────────────────────

    {
        name: "Yükselen Milli Glob Vana DN65 PN40 Karbon Çelik",
        sku: "GV-KN-DN65-PN40-WCB",
        category: "Glob Vanalar",
        unit: "adet",
        price: 960,
        currency: "USD",
        on_hand: 65, reserved: 15, min_stock_level: 12, reorder_qty: 24,
        product_type: "manufactured",
        warehouse: "Sevkiyat Deposu",
        preferred_vendor: "PMT Amasya Fabrikası",
        lead_time_days: 14,
        daily_usage: 1,
        cost_price: 520,
        material_quality: "A216 WCB",
        origin_country: "TR",
        production_site: "PMT Amasya Fabrikası",
        industries: "Petrokimya, Enerji, Kimya",
        standards: "EN 13709, API 623",
        is_for_sales: true, is_for_purchase: false,
    },
    {
        // IMMINENT DEADLINE: available=45, daily=2, lead=14
        //   stockoutDays=floor(45/2)=22, deadline=22-14-7=1 → 1 GÜN KALDI (WARNING)
        name: "Kontrol Valfı DN65 PN40 Paslanmaz 316",
        sku: "CV-KV-DN65-PN40-CF8M",
        category: "Kontrol Valfleri",
        unit: "adet",
        price: 3200,
        currency: "USD",
        on_hand: 55, reserved: 10, min_stock_level: 12, reorder_qty: 20,
        product_type: "manufactured",
        warehouse: "Sevkiyat Deposu",
        preferred_vendor: "PMT Amasya Fabrikası",
        lead_time_days: 14,
        daily_usage: 2,
        cost_price: 1750,
        material_quality: "CF8M (SS316)",
        origin_country: "TR",
        production_site: "PMT Amasya Fabrikası",
        industries: "Petrokimya, Kimya, İlaç",
        standards: "IEC 60534, ISA S75",
        certifications: "ISO 9001, ATEX",
        is_for_sales: true, is_for_purchase: false,
    },

    // ── CONTALAR ───────────────────────────────────────────────────────────

    {
        name: "Spiral Sarım Conta DN50 PN40 Grafit",
        sku: "CT-SS-DN50-PN40-GRF",
        category: "Contalar",
        unit: "adet",
        price: 42,
        currency: "USD",
        on_hand: 2500, reserved: 400, min_stock_level: 500, reorder_qty: 1000,
        product_type: "commercial",
        warehouse: "Sevkiyat Deposu",
        preferred_vendor: "Garlock Türkiye",
        lead_time_days: 7,
        daily_usage: 15,
        cost_price: 23,
        material_quality: "Spiral Sarım SS304 + Grafit dolgu",
        origin_country: "TR",
        industries: "Petrokimya, Gaz, Enerji, Kimya",
        standards: "ASME B16.20, EN 1514-2",
        is_for_sales: true, is_for_purchase: true,
    },
    {
        name: "PTFE Conta DN80 PN16",
        sku: "CT-PTFE-DN80-PN16",
        category: "Contalar",
        unit: "adet",
        price: 28,
        currency: "USD",
        on_hand: 1800, reserved: 300, min_stock_level: 300, reorder_qty: 600,
        product_type: "commercial",
        warehouse: "Sevkiyat Deposu",
        preferred_vendor: "Garlock Türkiye",
        lead_time_days: 7,
        daily_usage: 10,
        cost_price: 15,
        material_quality: "Tam PTFE (Teflon)",
        origin_country: "TR",
        industries: "Kimya, İlaç, Gıda",
        standards: "EN 1514-1",
        certifications: "FDA 21 CFR 177.1550",
        is_for_sales: true, is_for_purchase: true,
    },
    {
        // WARNING: available=150, min=100, ceil(100*1.5)=150 → 100<150≤150 (sınırda!)
        name: "Aramid Fiber Non-Asbestos Conta DN100 PN40",
        sku: "CT-AF-DN100-PN40",
        category: "Contalar",
        unit: "adet",
        price: 55,
        currency: "USD",
        on_hand: 310, reserved: 160, min_stock_level: 100, reorder_qty: 250,
        product_type: "commercial",
        warehouse: "Sevkiyat Deposu",
        preferred_vendor: "Garlock Türkiye",
        lead_time_days: 7,
        daily_usage: 8,
        cost_price: 30,
        material_quality: "Aramid Fiber (Asbest içermez)",
        origin_country: "TR",
        industries: "Petrokimya, Kimya, Enerji",
        standards: "EN 1514-1, DIN 28090",
        is_for_sales: true, is_for_purchase: true,
    },

    // ── FLANŞ İZOLASYON KİTLERİ ────────────────────────────────────────────

    {
        name: "Flanş İzolasyon Kiti E Tipi DN80 PN16",
        sku: "IK-E-DN80-PN16",
        category: "Flanş İzolasyon Kitleri",
        unit: "set",
        price: 380,
        currency: "USD",
        on_hand: 120, reserved: 20, min_stock_level: 20, reorder_qty: 40,
        product_type: "commercial",
        warehouse: "Sevkiyat Deposu",
        preferred_vendor: "Üretek Conta",
        lead_time_days: 10,
        daily_usage: 1,
        cost_price: 210,
        material_quality: "G10/G11 Fiberglas + SS316 Yüksük + Naylon Saplama Kılıfı",
        origin_country: "TR",
        industries: "Gaz, Petrokimya, Enerji",
        standards: "EN 14772, ASME PCC-1",
        is_for_sales: true, is_for_purchase: true,
    },
    {
        name: "Flanş İzolasyon Kiti D Tipi DN100 PN16 O-Ring",
        sku: "IK-D-DN100-PN16-OR",
        category: "Flanş İzolasyon Kitleri",
        unit: "set",
        price: 490,
        currency: "USD",
        on_hand: 60, reserved: 10, min_stock_level: 10, reorder_qty: 20,
        product_type: "commercial",
        warehouse: "Sevkiyat Deposu",
        preferred_vendor: "Üretek Conta",
        lead_time_days: 10,
        cost_price: 270,
        material_quality: "G11 Fiberglas + SS316 Yüksük + NBR O-Ring",
        origin_country: "TR",
        industries: "Gaz, Petrokimya",
        standards: "EN 14772",
        is_for_sales: true, is_for_purchase: true,
    },

    // ── BAĞLANTI ELEMANLARI ─────────────────────────────────────────────────

    {
        name: "Saplama/Civata M24x100 A193 B7/A194 2H",
        sku: "BE-SC-M24x100-B7",
        category: "Bağlantı Elemanları",
        unit: "adet",
        price: 18,
        currency: "USD",
        on_hand: 5000, reserved: 800, min_stock_level: 1000, reorder_qty: 2000,
        product_type: "commercial",
        warehouse: "Sevkiyat Deposu",
        preferred_vendor: "Bulonsan",
        lead_time_days: 5,
        daily_usage: 40,
        cost_price: 10,
        material_quality: "ASTM A193 B7 / A194 2H",
        origin_country: "TR",
        industries: "Petrokimya, Enerji, Gaz, Kimya",
        standards: "ASTM A193, ASME B18.2.1",
        is_for_sales: true, is_for_purchase: true,
    },
    {
        name: "Boru Kelepçesi DN80",
        sku: "BE-BK-DN80",
        category: "Bağlantı Elemanları",
        unit: "adet",
        price: 35,
        currency: "USD",
        on_hand: 180, reserved: 30, min_stock_level: 30, reorder_qty: 80,
        product_type: "commercial",
        warehouse: "Sevkiyat Deposu",
        preferred_vendor: "Bulonsan",
        lead_time_days: 5,
        daily_usage: 3,
        cost_price: 19,
        material_quality: "Galvanizli Çelik",
        origin_country: "TR",
        industries: "Gaz, Enerji, Petrokimya",
        standards: "DIN 3567",
        is_for_sales: true, is_for_purchase: true,
    },

    // ── ALBRECHT-AUTOMATIK (İTHAL — UZUN TEDARİK SÜRESİ) ───────────────────

    {
        // IMMINENT DEADLINE: available=110, daily=2, lead=45
        //   stockoutDays=floor(110/2)=55, deadline=55-45-7=3 → 3 GÜN KALDI (WARNING)
        //   Not: 45 günlük Almanya tedariki — bu sipariş kritik!
        name: "Albrecht-Automatik Shut-Off Vana DN50 PN40",
        sku: "AA-SOV-DN50-PN40",
        category: "Hızlı Kapama Vanalar",
        unit: "adet",
        price: 2850,
        currency: "EUR",
        on_hand: 120, reserved: 10, min_stock_level: 8, reorder_qty: 20,
        product_type: "commercial",
        warehouse: "Sevkiyat Deposu",
        preferred_vendor: "Albrecht-Automatik GmbH",
        lead_time_days: 45,
        daily_usage: 2,
        cost_price: 1900,
        material_quality: "EN-JS1049 (Sfero Döküm) + SS316 trim",
        origin_country: "DE",
        production_site: "Albrecht-Automatik GmbH, Almanya",
        industries: "Gaz Dağıtımı, Petrokimya, Enerji",
        standards: "EN 14382, DIN DVGW G 459-1",
        certifications: "CE, DVGW, ISO 9001",
        product_notes: "Yetkili distribütör: PMT Endüstriyel. Min sipariş miktarı 10 adet.",
        is_for_sales: true, is_for_purchase: true,
    },
    {
        // CRITICAL: available=3, min=5 → 3≤5
        name: "Albrecht-Automatik Shut-Off Vana DN80 PN40",
        sku: "AA-SOV-DN80-PN40",
        category: "Hızlı Kapama Vanalar",
        unit: "adet",
        price: 4200,
        currency: "EUR",
        on_hand: 8, reserved: 5, min_stock_level: 5, reorder_qty: 15,
        product_type: "commercial",
        warehouse: "Sevkiyat Deposu",
        preferred_vendor: "Albrecht-Automatik GmbH",
        lead_time_days: 45,
        daily_usage: 1,
        cost_price: 2800,
        material_quality: "EN-JS1049 (Sfero Döküm) + SS316 trim",
        origin_country: "DE",
        production_site: "Albrecht-Automatik GmbH, Almanya",
        industries: "Gaz Dağıtımı, Enerji Santralleri",
        standards: "EN 14382, DIN DVGW G 459-1",
        certifications: "CE, DVGW, ISO 9001",
        product_notes: "Yetkili distribütör: PMT Endüstriyel. Min sipariş miktarı 10 adet.",
        is_for_sales: true, is_for_purchase: true,
    },

] as const;

// ── Müşteriler ────────────────────────────────────────────────────────────────

const SEED_CUSTOMERS = [
    {
        name: "Tüpraş İzmit Rafinerisi",
        email: "tedarik.izmit@tupras.com.tr",
        phone: "+90 262 316 0000",
        address: "TÜPRAŞ İzmit Rafinerisi, Körfez, Kocaeli",
        tax_number: "6440012345",
        tax_office: "Körfez VD",
        country: "TR",
        currency: "USD",
        notes: "Türkiye'nin en büyük rafinerisi. Yüksek basınçlı vana ve flanş talepleri yoğun. Onay süreci 3-4 hafta.",
        total_orders: 14,
        total_revenue: 512000,
        payment_terms_days: 60,
    },
    {
        name: "BOTAŞ Boru Hatları ve Petrol Taşıma A.Ş.",
        email: "tedarik@botas.gov.tr",
        phone: "+90 312 397 0000",
        address: "BOTAŞ Genel Müdürlüğü, Bilkent, Ankara",
        tax_number: "5840087654",
        tax_office: "Bilkent VD",
        country: "TR",
        currency: "USD",
        notes: "Doğalgaz boru hatları için kelebek vana ve sürgülü vana alımları. Teknik şartname bazlı ihale.",
        total_orders: 8,
        total_revenue: 284000,
        payment_terms_days: 90,
    },
    {
        name: "Petkim Petrokimya A.Ş.",
        email: "satinalma@petkim.com.tr",
        phone: "+90 232 616 0000",
        address: "Petkim Yarımadası, Aliağa, İzmir",
        tax_number: "1234098765",
        tax_office: "Aliağa VD",
        country: "TR",
        currency: "USD",
        notes: "Kâh hızlı kapama vanası (Albrecht) kâh standart küresel vana talebi. API sertifika şartı var.",
        total_orders: 11,
        total_revenue: 378000,
        payment_terms_days: 45,
    },
    {
        name: "Enerjisa Üretim Santralleri",
        email: "tedarik@enerjisa.com.tr",
        phone: "+90 212 375 0000",
        address: "Enerjisa Enerji, Nişantepe, İstanbul",
        tax_number: "7230145678",
        tax_office: "Sarıyer VD",
        country: "TR",
        currency: "USD",
        notes: "Doğalgaz kombine çevrim santralları. Sürgülü vana ve çek valf talebi. Yıllık bakım programı var.",
        total_orders: 6,
        total_revenue: 195000,
        payment_terms_days: 45,
    },
    {
        name: "Ülker Gıda San. ve Tic. A.Ş.",
        email: "satin.alma@ulker.com.tr",
        phone: "+90 212 867 0000",
        address: "Kısıklı Mahallesi, Üsküdar, İstanbul",
        tax_number: "4520167890",
        tax_office: "Üsküdar VD",
        country: "TR",
        currency: "TRY",
        notes: "Gıda üretim hatları. FDA/gıda uyumlu SS304/SS316 vana ve PTFE conta talebi. Hijyen sertifikası şart.",
        total_orders: 9,
        total_revenue: 87000,
        payment_terms_days: 30,
    },
    {
        name: "Abdi İbrahim İlaç San. ve Tic. A.Ş.",
        email: "procurement@abdibrahim.com.tr",
        phone: "+90 212 366 0000",
        address: "Esenyurt, İstanbul",
        tax_number: "3810234567",
        tax_office: "Esenyurt VD",
        country: "TR",
        currency: "EUR",
        notes: "GMP uyumlu paslanmaz çelik vana talebi. Sanitasyon valfleri ve PTFE conta kritik. Belgeleme çok önemli.",
        total_orders: 5,
        total_revenue: 62000,
        payment_terms_days: 30,
    },
    {
        name: "AKSA Akrilik Kimya San. A.Ş.",
        email: "tedarik@aksa.com",
        phone: "+90 262 728 0000",
        address: "AKSA Fabrikası, Yalova",
        tax_number: "2670312456",
        tax_office: "Yalova VD",
        country: "TR",
        currency: "USD",
        notes: "Kimya tesisi. Korozif ortam için SS316 vana ve spiral sarım conta talebi. Acil stok ihtiyacı zaman zaman oluyor.",
        total_orders: 7,
        total_revenue: 143000,
        payment_terms_days: 45,
    },
] as const;

// ── Route Handler ──────────────────────────────────────────────────────────────

/**
 * DELETE /api/seed — Tüm verileri siler (demo sıfırlama).
 * Silme sırası FK bağımlılıklarına göre ayarlandı.
 */
export async function DELETE() {
    try {
        const supabase = createServiceClient();

        // FK bağımlılık sırası: alt tablolar önce silinir
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
        ] as const;

        for (const table of tables) {
            const { error } = await supabase.from(table).delete().neq("id", "00000000-0000-0000-0000-000000000000");
            if (error) throw new Error(`${table}: ${error.message}`);
        }

        return NextResponse.json({ ok: true, message: "Tüm veriler silindi. POST /api/seed ile yeniden yükle." });
    } catch (err) {
        console.error("[DELETE /api/seed]", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Silme başarısız." },
            { status: 500 }
        );
    }
}

export async function POST() {
    try {
        const supabase = createServiceClient();

        // Products: upsert on SKU (safe to re-run)
        const { error: pErr } = await supabase
            .from("products")
            .upsert(
                SEED_PRODUCTS.map(p => ({ ...p, is_active: true })),
                { onConflict: "sku" }
            );
        if (pErr) throw new Error("Products: " + pErr.message);

        // Customers: insert only if table is empty (preserves real data)
        const { count: cCount } = await supabase
            .from("customers")
            .select("*", { count: "exact", head: true });
        let customersSeeded = 0;
        if ((cCount ?? 0) === 0) {
            const { error: cErr } = await supabase
                .from("customers")
                .insert(SEED_CUSTOMERS.map(c => ({ ...c, is_active: true })));
            if (cErr) throw new Error("Customers: " + cErr.message);
            customersSeeded = SEED_CUSTOMERS.length;
        }

        return NextResponse.json({
            ok: true,
            seeded: {
                products: SEED_PRODUCTS.length,
                customers: customersSeeded,
                customers_note: customersSeeded === 0
                    ? "Müşteri tablosu boş değil — atlandı."
                    : `${customersSeeded} müşteri eklendi.`,
            },
            alert_scenarios: {
                critical_stock: ["KB-CK-DN100-600LB-CF8M", "FT-BT-DN100-PN40-CF8M", "AA-SOV-DN80-PN40"],
                warning_stock: ["KV-3P-DN80-300LB-WCB", "SV-AF-DN50-600LB-BW", "CV-LT-DN50-PN40-CF8M", "CT-AF-DN100-PN40"],
                past_deadline: ["KB-WT-DN150-PN16-CF8"],
                imminent_deadline: ["AA-SOV-DN50-PN40", "CV-KV-DN65-PN40-CF8M"],
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
