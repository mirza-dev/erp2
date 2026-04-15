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

// ── Date Helpers ─────────────────────────────────────────────────────────────

const _today = new Date();
const daysAgo = (n: number) => new Date(_today.getTime() - n * 86_400_000).toISOString().slice(0, 10);
const daysLater = (n: number) => new Date(_today.getTime() + n * 86_400_000).toISOString().slice(0, 10);
const daysAgoISO = (n: number) => new Date(_today.getTime() - n * 86_400_000).toISOString();
const todayStr = _today.toISOString().slice(0, 10);

// ── Sipariş Tanımları ────────────────────────────────────────────────────────
// Her sipariş: müşteri adı, durumlar, tarihler, kalemler (SKU + miktar + fiyat + iskonto)
// Hesaplama: lineTotal = qty * unitPrice * (1 - disc/100), subtotal = sum, vat = 0.20, grand = sub + vat

interface SeedOrderLine {
    sku: string;
    qty: number;
    price: number;
    disc: number; // iskonto %
}

interface SeedOrder {
    orderNumber: string;
    customerName: string;
    commercial: "draft" | "pending_approval" | "approved" | "cancelled";
    fulfillment: "unallocated" | "partially_allocated" | "allocated" | "partially_shipped" | "shipped";
    currency: string;
    createdDaysAgo: number;
    quoteValidUntil?: string | null;
    plannedShipmentDate?: string | null;
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
    // 1. Draft — Tüpraş — geçerli teklif
    {
        orderNumber: "ORD-2026-0001", customerName: "Tüpraş İzmit Rafinerisi",
        commercial: "draft", fulfillment: "unallocated", currency: "USD", createdDaysAgo: 2,
        quoteValidUntil: daysLater(15), notes: "Rafineri bakım dönemi siparişi",
        lines: [
            { sku: "KV-3P-DN50-PN40-CF8M", qty: 20, price: 780, disc: 5 },
            { sku: "SV-F5-DN150-300LB-WCB", qty: 8, price: 2400, disc: 0 },
            { sku: "CT-SS-DN50-PN40-GRF", qty: 200, price: 42, disc: 10 },
        ],
    },
    // 2. Draft — BOTAŞ — süresi DOLMUŞ teklif
    {
        orderNumber: "ORD-2026-0002", customerName: "BOTAŞ Boru Hatları ve Petrol Taşıma A.Ş.",
        commercial: "draft", fulfillment: "unallocated", currency: "USD", createdDaysAgo: 18,
        quoteValidUntil: daysAgo(1),
        lines: [
            { sku: "KB-WT-DN150-PN16-CF8", qty: 30, price: 580, disc: 0 },
            { sku: "CV-SW-DN80-PN16-WCB", qty: 15, price: 680, disc: 5 },
        ],
    },
    // 3. Draft — Petkim — süresiz
    {
        orderNumber: "ORD-2026-0003", customerName: "Petkim Petrokimya A.Ş.",
        commercial: "draft", fulfillment: "unallocated", currency: "USD", createdDaysAgo: 5,
        lines: [
            { sku: "KV-2P-DN25-PN16-CF8", qty: 50, price: 320, disc: 8 },
            { sku: "BE-SC-M24x100-B7", qty: 500, price: 18, disc: 0 },
        ],
    },
    // 4. Pending Approval — Enerjisa — 2 gün kaldı
    {
        orderNumber: "ORD-2026-0004", customerName: "Enerjisa Üretim Santralleri",
        commercial: "pending_approval", fulfillment: "unallocated", currency: "USD", createdDaysAgo: 8,
        quoteValidUntil: daysLater(2), aiRisk: "low", aiConfidence: 0.91, aiReason: "Düşük risk — düzenli müşteri, standart kalemler",
        lines: [
            { sku: "SV-F4-DN200-PN40-WCB", qty: 5, price: 3800, disc: 0 },
            { sku: "FT-YF-DN80-PN40-WCB", qty: 10, price: 750, disc: 5 },
            { sku: "CT-SS-DN50-PN40-GRF", qty: 100, price: 42, disc: 0 },
        ],
    },
    // 5. Pending Approval — AKSA — süresi 3 gün önce DOLMUŞ → alert
    {
        orderNumber: "ORD-2026-0005", customerName: "AKSA Akrilik Kimya San. A.Ş.",
        commercial: "pending_approval", fulfillment: "unallocated", currency: "USD", createdDaysAgo: 20,
        quoteValidUntil: daysAgo(3), aiRisk: "medium", aiConfidence: 0.74, aiReason: "Orta risk — teklif süresi dolmuş, fiyat güncellemesi gerekebilir",
        lines: [
            { sku: "KV-DB-DN100-600LB-CF8M", qty: 3, price: 4800, disc: 0 },
            { sku: "IK-E-DN80-PN16", qty: 12, price: 380, disc: 10 },
        ],
    },
    // 6. Approved + Allocated — Tüpraş — sevke hazır
    {
        orderNumber: "ORD-2026-0006", customerName: "Tüpraş İzmit Rafinerisi",
        commercial: "approved", fulfillment: "allocated", currency: "USD", createdDaysAgo: 7,
        plannedShipmentDate: daysLater(3), aiRisk: "low", aiConfidence: 0.95,
        lines: [
            { sku: "KV-2P-DN25-PN16-CF8", qty: 30, price: 320, disc: 5 },
            { sku: "CT-PTFE-DN80-PN16", qty: 100, price: 28, disc: 0 },
            { sku: "BE-BK-DN80", qty: 20, price: 35, disc: 0 },
        ],
    },
    // 7. Approved + Partially Allocated — BOTAŞ — bazı kalemler eksik → shortage
    {
        orderNumber: "ORD-2026-0007", customerName: "BOTAŞ Boru Hatları ve Petrol Taşıma A.Ş.",
        commercial: "approved", fulfillment: "partially_allocated", currency: "USD", createdDaysAgo: 5,
        plannedShipmentDate: daysLater(10),
        lines: [
            { sku: "KV-DB-DN100-600LB-CF8M", qty: 8, price: 4800, disc: 0 },  // Kritik stok — shortage!
            { sku: "FT-BT-DN100-PN40-CF8M", qty: 10, price: 1450, disc: 0 },  // Kritik stok — shortage!
            { sku: "SV-F5-DN150-300LB-WCB", qty: 5, price: 2400, disc: 5 },   // Yeterli stok
        ],
    },
    // 8. Approved + Unallocated — Petkim — 12 gün önce → overdue_shipment
    {
        orderNumber: "ORD-2026-0008", customerName: "Petkim Petrokimya A.Ş.",
        commercial: "approved", fulfillment: "unallocated", currency: "USD", createdDaysAgo: 12,
        notes: "Acil sipariş — stok bekleniyor",
        lines: [
            { sku: "AA-SOV-DN80-PN40", qty: 4, price: 4200, disc: 0 },  // Kritik stok
            { sku: "AA-SOV-DN50-PN40", qty: 6, price: 2850, disc: 5 },
        ],
    },
    // 9. Approved + Partially Shipped — Ülker
    {
        orderNumber: "ORD-2026-0009", customerName: "Ülker Gıda San. ve Tic. A.Ş.",
        commercial: "approved", fulfillment: "partially_shipped", currency: "TRY", createdDaysAgo: 15,
        plannedShipmentDate: daysAgo(3),
        lines: [
            { sku: "KV-2P-DN25-PN16-CF8", qty: 40, price: 10500, disc: 0 },   // TRY fiyat
            { sku: "CT-PTFE-DN80-PN16", qty: 200, price: 920, disc: 5 },
            { sku: "CV-LT-DN50-PN40-CF8M", qty: 10, price: 17000, disc: 0 },
        ],
    },
    // 10. Approved + Shipped — Abdi İbrahim — Paraşüt sync OK
    {
        orderNumber: "ORD-2026-0010", customerName: "Abdi İbrahim İlaç San. ve Tic. A.Ş.",
        commercial: "approved", fulfillment: "shipped", currency: "EUR", createdDaysAgo: 25,
        parasutInvoiceId: "INV-2026-0087", parasutSentAt: daysAgoISO(20),
        aiRisk: "low", aiConfidence: 0.88,
        lines: [
            { sku: "KV-3P-DN50-PN40-CF8M", qty: 10, price: 720, disc: 0 },
            { sku: "CT-PTFE-DN80-PN16", qty: 150, price: 26, disc: 0 },
            { sku: "CV-LT-DN50-PN40-CF8M", qty: 5, price: 480, disc: 5 },
        ],
    },
    // 11. Approved + Shipped — Enerjisa — Paraşüt sync HATALI
    {
        orderNumber: "ORD-2026-0011", customerName: "Enerjisa Üretim Santralleri",
        commercial: "approved", fulfillment: "shipped", currency: "USD", createdDaysAgo: 22,
        parasutError: "Müşteri Paraşüt'te bulunamadı — eşleşme hatası",
        lines: [
            { sku: "SV-F5-DN150-300LB-WCB", qty: 12, price: 2400, disc: 3 },
            { sku: "GV-KN-DN65-PN40-WCB", qty: 8, price: 960, disc: 0 },
        ],
    },
    // 12. Approved + Allocated — AKSA — overdue (planned_shipment geçmiş)
    {
        orderNumber: "ORD-2026-0012", customerName: "AKSA Akrilik Kimya San. A.Ş.",
        commercial: "approved", fulfillment: "allocated", currency: "USD", createdDaysAgo: 14,
        plannedShipmentDate: daysAgo(5),
        lines: [
            { sku: "KV-3P-DN80-300LB-WCB", qty: 6, price: 1250, disc: 0 },
            { sku: "CT-AF-DN100-PN40", qty: 80, price: 55, disc: 5 },
            { sku: "IK-D-DN100-PN16-OR", qty: 8, price: 490, disc: 0 },
        ],
    },
    // 13. Cancelled — Tüpraş
    {
        orderNumber: "ORD-2026-0013", customerName: "Tüpraş İzmit Rafinerisi",
        commercial: "cancelled", fulfillment: "unallocated", currency: "USD", createdDaysAgo: 30,
        notes: "Müşteri tarafından iptal edildi — bütçe kesintisi",
        lines: [
            { sku: "KB-LG-DN200-PN16-WCB", qty: 10, price: 920, disc: 0 },
            { sku: "CV-CK-DN200-PN16-WCB", qty: 5, price: 2200, disc: 0 },
        ],
    },
    // 14. Cancelled — Ülker
    {
        orderNumber: "ORD-2026-0014", customerName: "Ülker Gıda San. ve Tic. A.Ş.",
        commercial: "cancelled", fulfillment: "unallocated", currency: "TRY", createdDaysAgo: 35,
        lines: [
            { sku: "KV-2P-DN25-PN16-CF8", qty: 20, price: 10500, disc: 10 },
        ],
    },
    // 15. Approved + Allocated — Petkim — AI risk=high, büyük sipariş
    {
        orderNumber: "ORD-2026-0015", customerName: "Petkim Petrokimya A.Ş.",
        commercial: "approved", fulfillment: "allocated", currency: "USD", createdDaysAgo: 3,
        plannedShipmentDate: daysLater(7),
        aiRisk: "high", aiConfidence: 0.82, aiReason: "Yüksek tutar — toplam $120K+ sipariş, son 6 ayın en büyüğü. Stok yeterliliği doğrulanmalı.",
        lines: [
            { sku: "KV-DB-DN100-600LB-CF8M", qty: 5, price: 4800, disc: 3 },
            { sku: "SV-F4-DN200-PN40-WCB", qty: 8, price: 3800, disc: 0 },
            { sku: "CV-KV-DN65-PN40-CF8M", qty: 6, price: 3200, disc: 0 },
            { sku: "FT-BT-DN100-PN40-CF8M", qty: 4, price: 1450, disc: 5 },
            { sku: "AA-SOV-DN50-PN40", qty: 10, price: 2850, disc: 0 },
        ],
    },
];

// ── Route Handler ──────────────────────────────────────────────────────────────

export async function POST() {
    try {
        const supabase = createServiceClient();

        // ════════════════════════════════════════════════════════════
        // 1. Products: upsert on SKU
        // ════════════════════════════════════════════════════════════
        const { error: pErr } = await supabase
            .from("products")
            .upsert(
                SEED_PRODUCTS.map(p => ({ ...p, is_active: true })),
                { onConflict: "sku" }
            );
        if (pErr) throw new Error("Products: " + pErr.message);

        // Build SKU→ID map
        const { data: allProducts } = await supabase.from("products").select("id, sku, name");
        const skuMap = new Map<string, { id: string; name: string }>();
        for (const p of allProducts ?? []) skuMap.set(p.sku, { id: p.id, name: p.name });

        // ════════════════════════════════════════════════════════════
        // 2. Customers: insert only if empty
        // ════════════════════════════════════════════════════════════
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

        // Build customer name→row map
        const { data: allCustomers } = await supabase.from("customers").select("id, name, email, country, tax_office, tax_number");
        const custMap = new Map<string, { id: string; email: string | null; country: string | null; tax_office: string | null; tax_number: string | null }>();
        for (const c of allCustomers ?? []) custMap.set(c.name, { id: c.id, email: c.email, country: c.country, tax_office: c.tax_office, tax_number: c.tax_number });

        // ════════════════════════════════════════════════════════════
        // 3. Sales Orders
        // ════════════════════════════════════════════════════════════
        const orderRows = SEED_ORDERS.map(o => {
            const cust = custMap.get(o.customerName);
            // Calculate totals from lines
            const lineTotals = o.lines.map(l => l.qty * l.price * (1 - l.disc / 100));
            const subtotal = lineTotals.reduce((a, b) => a + b, 0);
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
            .from("sales_orders")
            .insert(orderRows)
            .select("id, order_number");
        if (oErr) throw new Error("Orders: " + oErr.message);

        // order_number → id map
        const orderIdMap = new Map<string, string>();
        for (const o of insertedOrders ?? []) orderIdMap.set(o.order_number, o.id);

        // Update order_counters so future generated numbers don't collide
        await supabase.from("order_counters").upsert(
            { year: 2026, last_seq: SEED_ORDERS.length },
            { onConflict: "year" }
        );

        // ════════════════════════════════════════════════════════════
        // 4. Order Lines
        // ════════════════════════════════════════════════════════════
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
            .from("order_lines")
            .insert(lineRows)
            .select("id, order_id, product_id, quantity");
        if (lErr) throw new Error("Order Lines: " + lErr.message);

        // ════════════════════════════════════════════════════════════
        // 5. Stock Reservations (approved + allocated/shipped siparişler)
        // ════════════════════════════════════════════════════════════
        const reservationRows: Array<Record<string, unknown>> = [];
        // Track per-product reserved totals for later sync
        const productReservedQty = new Map<string, number>();

        const approvedOrders = SEED_ORDERS.filter(o => o.commercial === "approved");
        for (const o of approvedOrders) {
            const orderId = orderIdMap.get(o.orderNumber);
            if (!orderId) continue;
            const orderLines = (insertedLines ?? []).filter(l => l.order_id === orderId);

            for (const ol of orderLines) {
                // Determine reservation status based on fulfillment
                let resStatus: "open" | "shipped" = "open";
                if (o.fulfillment === "shipped") resStatus = "shipped";

                // For partially_allocated: only reserve part of critical-stock items
                let reserveQty = ol.quantity;
                if (o.fulfillment === "partially_allocated") {
                    // Check if this is a critical-stock product
                    const seedProd = SEED_PRODUCTS.find(p => {
                        const prod = skuMap.get(p.sku);
                        return prod?.id === ol.product_id;
                    });
                    if (seedProd) {
                        const avail = seedProd.on_hand - seedProd.reserved;
                        if (avail < ol.quantity) {
                            reserveQty = Math.max(0, avail); // Reserve what's available
                        }
                    }
                }
                // For unallocated orders (overdue), no reservations
                if (o.fulfillment === "unallocated") continue;

                // For partially_shipped: first half shipped, rest open
                if (o.fulfillment === "partially_shipped") {
                    const shippedQty = Math.ceil(ol.quantity / 2);
                    const openQty = ol.quantity - shippedQty;
                    if (shippedQty > 0) {
                        reservationRows.push({
                            product_id: ol.product_id,
                            order_id: orderId,
                            order_line_id: ol.id,
                            reserved_qty: shippedQty,
                            status: "shipped",
                        });
                    }
                    if (openQty > 0) {
                        reservationRows.push({
                            product_id: ol.product_id,
                            order_id: orderId,
                            order_line_id: ol.id,
                            reserved_qty: openQty,
                            status: "open",
                        });
                        productReservedQty.set(ol.product_id, (productReservedQty.get(ol.product_id) ?? 0) + openQty);
                    }
                    continue;
                }

                if (reserveQty > 0) {
                    reservationRows.push({
                        product_id: ol.product_id,
                        order_id: orderId,
                        order_line_id: ol.id,
                        reserved_qty: reserveQty,
                        status: resStatus,
                    });
                    if (resStatus === "open") {
                        productReservedQty.set(ol.product_id, (productReservedQty.get(ol.product_id) ?? 0) + reserveQty);
                    }
                }
            }
        }

        if (reservationRows.length > 0) {
            const { error: rErr } = await supabase.from("stock_reservations").insert(reservationRows);
            if (rErr) throw new Error("Reservations: " + rErr.message);
        }

        // Sync products.reserved with actual open reservation totals
        for (const [productId, totalReserved] of productReservedQty) {
            await supabase.from("products").update({ reserved: totalReserved }).eq("id", productId);
        }
        // Products with no open reservations → reset to 0 (seed had hardcoded values)
        const productsWithReservations = new Set(productReservedQty.keys());
        for (const p of allProducts ?? []) {
            if (!productsWithReservations.has(p.id)) {
                await supabase.from("products").update({ reserved: 0 }).eq("id", p.id);
            }
        }

        // ════════════════════════════════════════════════════════════
        // 6. Shortages (partially_allocated sipariş — eksik kalemler)
        // ════════════════════════════════════════════════════════════
        const shortageRows: Array<Record<string, unknown>> = [];
        // Order 7 is partially_allocated
        const order7Id = orderIdMap.get("ORD-2026-0007");
        if (order7Id) {
            const o7lines = (insertedLines ?? []).filter(l => l.order_id === order7Id);
            for (const ol of o7lines) {
                const seedProd = SEED_PRODUCTS.find(p => skuMap.get(p.sku)?.id === ol.product_id);
                if (!seedProd) continue;
                const avail = seedProd.on_hand - seedProd.reserved;
                if (avail < ol.quantity) {
                    shortageRows.push({
                        order_id: order7Id,
                        order_line_id: ol.id,
                        product_id: ol.product_id,
                        requested_qty: ol.quantity,
                        available_qty: Math.max(0, avail),
                        shortage_qty: ol.quantity - Math.max(0, avail),
                        status: "open",
                    });
                }
            }
        }
        if (shortageRows.length > 0) {
            const { error: sErr } = await supabase.from("shortages").insert(shortageRows);
            if (sErr) throw new Error("Shortages: " + sErr.message);
        }

        // ════════════════════════════════════════════════════════════
        // 7. Purchase Commitments
        // ════════════════════════════════════════════════════════════
        const commitmentData = [
            { sku: "KV-DB-DN100-600LB-CF8M", qty: 15, date: daysLater(18), supplier: "PMT Amasya Fabrikası", status: "pending", notes: "Acil tedarik — Çift Blok sipariş yoğunluğu" },
            { sku: "FT-BT-DN100-PN40-CF8M", qty: 20, date: daysLater(14), supplier: "PMT Amasya Fabrikası", status: "pending", notes: "Basket filtre kritik stok takviyesi" },
            { sku: "AA-SOV-DN80-PN40", qty: 15, date: daysLater(50), supplier: "Albrecht-Automatik GmbH", status: "pending", notes: "Almanya tedarik — 45 gün transit" },
            { sku: "CT-SS-DN50-PN40-GRF", qty: 1000, date: daysLater(5), supplier: "Garlock Türkiye", status: "pending", notes: null },
            { sku: "BE-SC-M24x100-B7", qty: 2000, date: daysLater(3), supplier: "Bulonsan", status: "pending", notes: null },
            { sku: "KV-3P-DN80-300LB-WCB", qty: 50, date: daysAgo(10), supplier: "PMT Amasya Fabrikası", status: "received", notes: "Teslim alındı — stok güncellendi" },
            { sku: "KB-WT-DN150-PN16-CF8", qty: 80, date: daysAgo(5), supplier: "PMT Amasya Fabrikası", status: "received", notes: "Teslim alındı" },
            { sku: "CV-KV-DN65-PN40-CF8M", qty: 20, date: daysAgo(20), supplier: "PMT Amasya Fabrikası", status: "cancelled", notes: "İptal — tedarikçi fiyat artırdı" },
        ] as const;

        const commitRows = commitmentData.map(c => ({
            product_id: skuMap.get(c.sku)?.id,
            quantity: c.qty,
            expected_date: c.date,
            supplier_name: c.supplier,
            status: c.status,
            notes: c.notes,
            received_at: c.status === "received" ? c.date : null,
        })).filter(c => c.product_id);

        if (commitRows.length > 0) {
            const { error: pcErr } = await supabase.from("purchase_commitments").insert(commitRows);
            if (pcErr) throw new Error("Purchase Commitments: " + pcErr.message);
        }

        // ════════════════════════════════════════════════════════════
        // 8. Bills of Materials
        // ════════════════════════════════════════════════════════════
        const bomData = [
            // 3P Küresel DN50 → conta + saplama
            { finished: "KV-3P-DN50-PN40-CF8M", component: "CT-SS-DN50-PN40-GRF", qty: 1, unit: "adet", notes: "Ana gövde contası" },
            { finished: "KV-3P-DN50-PN40-CF8M", component: "BE-SC-M24x100-B7", qty: 4, unit: "adet", notes: "Flanş bağlantı saplamalar" },
            // Wafer Kelebek DN150 → conta + saplama + kelepçe
            { finished: "KB-WT-DN150-PN16-CF8", component: "CT-PTFE-DN80-PN16", qty: 1, unit: "adet", notes: "Disk contası" },
            { finished: "KB-WT-DN150-PN16-CF8", component: "BE-SC-M24x100-B7", qty: 6, unit: "adet", notes: "Gövde saplamalar" },
            { finished: "KB-WT-DN150-PN16-CF8", component: "BE-BK-DN80", qty: 1, unit: "adet", notes: "Ara boru kelepçesi" },
            // Kontrol Valfı DN65 → conta + saplama
            { finished: "CV-KV-DN65-PN40-CF8M", component: "CT-SS-DN50-PN40-GRF", qty: 1, unit: "adet", notes: "Gövde contası" },
            { finished: "CV-KV-DN65-PN40-CF8M", component: "BE-SC-M24x100-B7", qty: 2, unit: "adet", notes: "Bonnet saplamalar" },
        ];

        const bomRows = bomData.map(b => ({
            finished_product_id: skuMap.get(b.finished)?.id,
            component_product_id: skuMap.get(b.component)?.id,
            quantity: b.qty,
            unit: b.unit,
            notes: b.notes,
        })).filter(b => b.finished_product_id && b.component_product_id);

        if (bomRows.length > 0) {
            const { error: bErr } = await supabase.from("bills_of_materials").insert(bomRows);
            if (bErr) throw new Error("BOM: " + bErr.message);
        }

        // ════════════════════════════════════════════════════════════
        // 9. Production Entries
        // ════════════════════════════════════════════════════════════
        const prodEntries = [
            { sku: "KV-3P-DN50-PN40-CF8M", qty: 30, scrap: 0, date: todayStr, notes: "Sabah vardiyası — tam verimlilik" },
            { sku: "CV-SW-DN80-PN16-WCB", qty: 15, scrap: 1, date: todayStr, notes: "1 adet döküm hatası — fire" },
            { sku: "KB-WT-DN150-PN16-CF8", qty: 20, scrap: 0, date: todayStr, notes: "Acil sipariş üretimi" },
            { sku: "SV-F5-DN150-300LB-WCB", qty: 10, scrap: 0, date: daysAgo(1), notes: null },
            { sku: "KV-2P-DN25-PN16-CF8", qty: 40, scrap: 2, date: daysAgo(2), notes: "2 adet yüzey işleme hatası" },
            { sku: "KB-LG-DN200-PN16-WCB", qty: 8, scrap: 0, date: daysAgo(3), notes: null },
            { sku: "GV-KN-DN65-PN40-WCB", qty: 12, scrap: 0, date: daysAgo(5), notes: null },
            { sku: "CV-CK-DN200-PN16-WCB", qty: 5, scrap: 0, date: daysAgo(7), notes: null },
            { sku: "CV-KV-DN65-PN40-CF8M", qty: 8, scrap: 1, date: daysAgo(10), notes: "1 adet kalibrasyon dışı — fire" },
            { sku: "KV-3P-DN80-300LB-WCB", qty: 25, scrap: 0, date: daysAgo(14), notes: null },
        ];

        const prodRows = prodEntries.map(e => {
            const prod = skuMap.get(e.sku);
            return prod ? {
                product_id: prod.id,
                product_name: prod.name,
                product_sku: e.sku,
                produced_qty: e.qty,
                scrap_qty: e.scrap,
                waste_reason: e.scrap > 0 ? e.notes : null,
                production_date: e.date,
                notes: e.notes,
            } : null;
        }).filter(Boolean);

        let productionSeeded = 0;
        if (prodRows.length > 0) {
            const { error: peErr } = await supabase.from("production_entries").insert(prodRows);
            if (peErr) throw new Error("Production: " + peErr.message);
            productionSeeded = prodRows.length;
        }

        // ════════════════════════════════════════════════════════════
        // 10. Inventory Movements
        // ════════════════════════════════════════════════════════════
        const movementRows: Array<Record<string, unknown>> = [];

        // Production movements (positive)
        for (const e of prodEntries) {
            const prod = skuMap.get(e.sku);
            if (!prod) continue;
            movementRows.push({
                product_id: prod.id,
                movement_type: "production",
                quantity: e.qty,
                reference_type: "production_entry",
                notes: `Üretim: ${e.qty} adet ${prod.name}`,
                occurred_at: e.date + "T08:00:00Z",
                source: "system",
            });
        }

        // Receipt movements (received purchase commitments)
        for (const c of commitmentData) {
            if (c.status !== "received") continue;
            const prod = skuMap.get(c.sku);
            if (!prod) continue;
            movementRows.push({
                product_id: prod.id,
                movement_type: "receipt",
                quantity: c.qty,
                reference_type: "manual",
                notes: `Tedarik teslimi: ${c.supplier} — ${c.qty} adet`,
                occurred_at: c.date + "T10:00:00Z",
                source: "system",
            });
        }

        // Shipment movements for shipped orders (negative)
        const shippedOrders = SEED_ORDERS.filter(o => o.fulfillment === "shipped" || o.fulfillment === "partially_shipped");
        for (const o of shippedOrders) {
            for (const l of o.lines) {
                const prod = skuMap.get(l.sku);
                if (!prod) continue;
                const qty = o.fulfillment === "partially_shipped" ? Math.ceil(l.qty / 2) : l.qty;
                movementRows.push({
                    product_id: prod.id,
                    movement_type: "shipment",
                    quantity: -qty,
                    reference_type: "order",
                    reference_id: orderIdMap.get(o.orderNumber),
                    notes: `Sevkiyat: ${o.orderNumber} — ${qty} adet ${prod.name}`,
                    occurred_at: daysAgoISO(o.createdDaysAgo - 5),
                    source: "system",
                });
            }
        }

        // Manual adjustments
        const adjSku1 = skuMap.get("CT-SS-DN50-PN40-GRF");
        const adjSku2 = skuMap.get("BE-SC-M24x100-B7");
        if (adjSku1) {
            movementRows.push({
                product_id: adjSku1.id,
                movement_type: "adjustment",
                quantity: -50,
                notes: "Sayım düzeltmesi — depoda 50 adet eksik tespit edildi",
                occurred_at: daysAgoISO(8),
                source: "ui",
            });
        }
        if (adjSku2) {
            movementRows.push({
                product_id: adjSku2.id,
                movement_type: "adjustment",
                quantity: 200,
                notes: "Sayım düzeltmesi — 200 adet fazla tespit edildi",
                occurred_at: daysAgoISO(6),
                source: "ui",
            });
        }

        if (movementRows.length > 0) {
            const { error: mErr } = await supabase.from("inventory_movements").insert(movementRows);
            if (mErr) throw new Error("Movements: " + mErr.message);
        }

        // ════════════════════════════════════════════════════════════
        // 11. Shipments
        // ════════════════════════════════════════════════════════════
        const shipmentRows = [
            {
                shipment_number: "SVK-2026-0001",
                order_id: orderIdMap.get("ORD-2026-0010"),
                order_number: "ORD-2026-0010",
                shipment_date: daysAgo(20),
                transport_type: "Karayolu — TIR",
                net_weight_kg: 2400,
                gross_weight_kg: 2650,
                notes: "Abdi İbrahim İlaç — İstanbul Esenyurt teslimat",
            },
            {
                shipment_number: "SVK-2026-0002",
                order_id: orderIdMap.get("ORD-2026-0011"),
                order_number: "ORD-2026-0011",
                shipment_date: daysAgo(17),
                transport_type: "Karayolu — TIR",
                net_weight_kg: 3800,
                gross_weight_kg: 4100,
                notes: "Enerjisa — İstanbul Nişantepe teslimat",
            },
            {
                shipment_number: "SVK-2026-0003",
                order_id: orderIdMap.get("ORD-2026-0009"),
                order_number: "ORD-2026-0009",
                shipment_date: daysAgo(5),
                transport_type: "Karayolu — Kamyonet",
                net_weight_kg: 850,
                gross_weight_kg: 980,
                notes: "Ülker — kısmi sevkiyat (1. parti)",
            },
        ].filter(s => s.order_id);

        if (shipmentRows.length > 0) {
            const { error: shErr } = await supabase.from("shipments").insert(shipmentRows);
            if (shErr) throw new Error("Shipments: " + shErr.message);
        }

        // ════════════════════════════════════════════════════════════
        // 12. Invoices
        // ════════════════════════════════════════════════════════════
        const ord10 = SEED_ORDERS.find(o => o.orderNumber === "ORD-2026-0010");
        const ord11 = SEED_ORDERS.find(o => o.orderNumber === "ORD-2026-0011");
        const ord9 = SEED_ORDERS.find(o => o.orderNumber === "ORD-2026-0009");
        const calcGrand = (o: SeedOrder) => {
            const sub = o.lines.reduce((s, l) => s + l.qty * l.price * (1 - l.disc / 100), 0);
            return Math.round((sub * 1.20) * 100) / 100;
        };

        const invoiceRows = [
            {
                invoice_number: "FTR-2026-0001",
                invoice_date: daysAgo(20),
                order_id: orderIdMap.get("ORD-2026-0010"),
                order_number: "ORD-2026-0010",
                currency: "EUR",
                amount: ord10 ? calcGrand(ord10) : 0,
                due_date: daysAgo(20 - 30), // 30 gün vade
                status: "paid" as const,
                notes: "Abdi İbrahim faturası — ödendi",
            },
            {
                invoice_number: "FTR-2026-0002",
                invoice_date: daysAgo(17),
                order_id: orderIdMap.get("ORD-2026-0011"),
                order_number: "ORD-2026-0011",
                currency: "USD",
                amount: ord11 ? calcGrand(ord11) : 0,
                due_date: daysLater(28),
                status: "open" as const,
                notes: "Enerjisa faturası — ödeme bekleniyor",
            },
            {
                invoice_number: "FTR-2026-0003",
                invoice_date: daysAgo(5),
                order_id: orderIdMap.get("ORD-2026-0009"),
                order_number: "ORD-2026-0009",
                currency: "TRY",
                amount: ord9 ? Math.round(calcGrand(ord9) / 2) : 0, // Kısmi
                due_date: daysLater(25),
                status: "partially_paid" as const,
                notes: "Ülker — kısmi sevkiyat faturası",
            },
        ].filter(i => i.order_id);

        const { data: insertedInvoices, error: iErr } = await supabase
            .from("invoices")
            .insert(invoiceRows)
            .select("id, invoice_number");
        if (iErr) throw new Error("Invoices: " + iErr.message);

        // ════════════════════════════════════════════════════════════
        // 13. Payments
        // ════════════════════════════════════════════════════════════
        const inv1 = insertedInvoices?.find(i => i.invoice_number === "FTR-2026-0001");
        const inv3 = insertedInvoices?.find(i => i.invoice_number === "FTR-2026-0003");

        const paymentRows = [
            inv1 ? {
                payment_number: "ODM-2026-0001",
                invoice_id: inv1.id,
                invoice_number: inv1.invoice_number,
                payment_date: daysAgo(10),
                amount: invoiceRows[0]?.amount ?? 0,
                currency: "EUR",
                payment_method: "Havale/EFT",
                notes: "Abdi İbrahim — tam ödeme",
            } : null,
            inv3 ? {
                payment_number: "ODM-2026-0002",
                invoice_id: inv3.id,
                invoice_number: inv3.invoice_number,
                payment_date: daysAgo(2),
                amount: Math.round((invoiceRows[2]?.amount ?? 0) * 0.6),
                currency: "TRY",
                payment_method: "Havale/EFT",
                notes: "Ülker — kısmi ödeme (%60)",
            } : null,
        ].filter(Boolean);

        if (paymentRows.length > 0) {
            const { error: payErr } = await supabase.from("payments").insert(paymentRows);
            if (payErr) throw new Error("Payments: " + payErr.message);
        }

        // ════════════════════════════════════════════════════════════
        // 14. Integration Sync Logs (Paraşüt)
        // ════════════════════════════════════════════════════════════
        const syncLogRows = [
            {
                entity_type: "sales_order", entity_id: orderIdMap.get("ORD-2026-0010"),
                direction: "push", status: "success", external_id: "INV-2026-0087",
                retry_count: 0, requested_at: daysAgoISO(20), completed_at: daysAgoISO(20), source: "system",
            },
            {
                entity_type: "sales_order", entity_id: orderIdMap.get("ORD-2026-0011"),
                direction: "push", status: "error", error_message: "Müşteri Paraşüt'te bulunamadı — eşleşme hatası",
                retry_count: 2, requested_at: daysAgoISO(17), source: "system",
            },
            {
                entity_type: "sales_order", entity_id: orderIdMap.get("ORD-2026-0006"),
                direction: "push", status: "success", external_id: "INV-2026-0092",
                retry_count: 0, requested_at: daysAgoISO(5), completed_at: daysAgoISO(5), source: "system",
            },
            {
                entity_type: "sales_order", entity_id: orderIdMap.get("ORD-2026-0012"),
                direction: "push", status: "retrying", error_message: "Timeout — tekrar denenecek",
                retry_count: 1, requested_at: daysAgoISO(2), source: "system",
            },
            {
                entity_type: "customer", entity_id: custMap.get("Tüpraş İzmit Rafinerisi")?.id,
                direction: "push", status: "success", external_id: "CST-4821",
                retry_count: 0, requested_at: daysAgoISO(30), completed_at: daysAgoISO(30), source: "system",
            },
            {
                entity_type: "sales_order", entity_id: orderIdMap.get("ORD-2026-0008"),
                direction: "push", status: "error", error_message: "API timeout — 30s aşıldı",
                retry_count: 3, requested_at: daysAgoISO(10), source: "scheduled",
            },
        ].filter(s => s.entity_id);

        if (syncLogRows.length > 0) {
            const { error: slErr } = await supabase.from("integration_sync_logs").insert(syncLogRows);
            if (slErr) throw new Error("Sync Logs: " + slErr.message);
        }

        // ════════════════════════════════════════════════════════════
        // 15. Audit Log
        // ════════════════════════════════════════════════════════════
        const auditRows = [
            { action: "order_created", entity_type: "sales_order", entity_id: orderIdMap.get("ORD-2026-0006"), occurred_at: daysAgoISO(7), source: "ui" },
            { action: "order_approved", entity_type: "sales_order", entity_id: orderIdMap.get("ORD-2026-0006"), occurred_at: daysAgoISO(6), source: "ui" },
            { action: "order_created", entity_type: "sales_order", entity_id: orderIdMap.get("ORD-2026-0010"), occurred_at: daysAgoISO(25), source: "ui" },
            { action: "order_approved", entity_type: "sales_order", entity_id: orderIdMap.get("ORD-2026-0010"), occurred_at: daysAgoISO(24), source: "ui" },
            { action: "order_shipped", entity_type: "sales_order", entity_id: orderIdMap.get("ORD-2026-0010"), occurred_at: daysAgoISO(20), source: "system" },
            { action: "order_created", entity_type: "sales_order", entity_id: orderIdMap.get("ORD-2026-0013"), occurred_at: daysAgoISO(30), source: "ui" },
            { action: "order_cancelled", entity_type: "sales_order", entity_id: orderIdMap.get("ORD-2026-0013"), occurred_at: daysAgoISO(28), source: "ui" },
            { action: "stock_adjusted", entity_type: "product", entity_id: skuMap.get("CT-SS-DN50-PN40-GRF")?.id, occurred_at: daysAgoISO(8), source: "ui" },
            { action: "production_logged", entity_type: "product", entity_id: skuMap.get("KV-3P-DN50-PN40-CF8M")?.id, occurred_at: todayStr + "T08:30:00Z", source: "ui" },
            { action: "commitment_created", entity_type: "product", entity_id: skuMap.get("KV-DB-DN100-600LB-CF8M")?.id, occurred_at: daysAgoISO(3), source: "ui" },
        ].filter(a => a.entity_id);

        if (auditRows.length > 0) {
            const { error: aErr } = await supabase.from("audit_log").insert(auditRows);
            if (aErr) throw new Error("Audit Log: " + aErr.message);
        }

        // ════════════════════════════════════════════════════════════
        // Response
        // ════════════════════════════════════════════════════════════
        return NextResponse.json({
            ok: true,
            seeded: {
                products: SEED_PRODUCTS.length,
                customers: customersSeeded,
                orders: SEED_ORDERS.length,
                order_lines: lineRows.length,
                reservations: reservationRows.length,
                shortages: shortageRows.length,
                purchase_commitments: commitRows.length,
                bom: bomRows.length,
                production: productionSeeded,
                movements: movementRows.length,
                shipments: shipmentRows.length,
                invoices: invoiceRows.length,
                payments: paymentRows.length,
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
