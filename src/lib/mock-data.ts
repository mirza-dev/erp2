// Mock data for development — will be replaced with Supabase queries

export interface UretimKaydi {
    id: string;
    productId: string;
    productName: string;
    productSku: string;
    adet: number;
    tarih: string;          // "YYYY-MM-DD"
    girenKullanici: string;
    notlar: string;
}

export const mockUretimKayitlari: UretimKaydi[] = [];

export interface Product {
    id: string;
    name: string;
    sku: string;
    category: string;
    unit: string;
    price: number;
    currency: string;
    on_hand: number;
    reserved: number;
    available_now: number;   // on_hand - reserved (denormalized)
    minStockLevel: number;
    isActive: boolean;
    productType: "raw_material" | "finished";
    warehouse: string;
    reorderQty?: number;
    preferredVendor?: string;
    dailyUsage?: number;
    leadTimeDays?: number;
}

export interface Customer {
    id: string;
    name: string;
    email: string;
    phone: string;
    address: string;
    taxNumber: string;
    taxOffice: string;
    country: string;
    currency: string;
    notes: string;
    isActive: boolean;
    totalOrders: number;
    totalRevenue: number;
    lastOrderDate: string;
}

export interface Order {
    id: string;
    orderNumber: string;
    customerName: string;
    commercial_status: "draft" | "pending_approval" | "approved" | "cancelled";
    fulfillment_status: "unallocated" | "partially_allocated" | "allocated" | "partially_shipped" | "shipped";
    grandTotal: number;
    currency: string;
    createdAt: string;
    itemCount: number;
    aiRiskLevel?: "low" | "medium" | "high";
    aiConfidence?: number;
}

export interface OrderLineItem {
    id: string;
    productId: string;
    productName: string;
    productSku: string;
    unit: string;
    quantity: number;
    unitPrice: number;
    discountPct: number;
    lineTotal: number;
}

export interface AiRecommendation {
    id: string;
    entityType: string;
    entityId: string;
    recommendationType: "purchase_suggestion" | "stock_risk" | "order_risk";
    title: string;
    body: string | null;
    confidence: number | null;
    severity: "critical" | "warning" | "info";
    status: "suggested" | "accepted" | "edited" | "rejected" | "expired";
    modelVersion: string | null;
    metadata: Record<string, unknown> | null;
    editedMetadata: Record<string, unknown> | null;
    decidedAt: string | null;
    createdAt: string;
}

export interface OrderDetail extends Order {
    customerId: string;
    customerEmail: string;
    customerCountry: string;
    customerTaxOffice: string;
    customerTaxNumber: string;
    subtotal: number;
    vatTotal: number;
    notes: string;
    parasutInvoiceId?: string;
    parasutSentAt?: string;
    parasutError?: string;
    lines: OrderLineItem[];
    aiConfidence?: number;
    aiReason?: string;
    aiRiskLevel?: "low" | "medium" | "high";
}

export const mockProducts: Product[] = [
    {
        id: "1",
        name: "3 Parçalı Küresel Vana DN25",
        sku: "KV-3P-DN25",
        category: "Küresel Vanalar",
        unit: "adet",
        price: 450,
        currency: "USD",
        on_hand: 1200,
        reserved: 150,
        available_now: 1050,
        minStockLevel: 200,
        isActive: true,
        productType: "finished",
        warehouse: "Sevkiyat Deposu",
        reorderQty: 400,
    },
    {
        id: "2",
        name: "2 Parçalı Küresel Vana DN50",
        sku: "KV-2P-DN50",
        category: "Küresel Vanalar",
        unit: "adet",
        price: 680,
        currency: "USD",
        on_hand: 800,
        reserved: 300,
        available_now: 500,
        minStockLevel: 100,
        isActive: true,
        productType: "finished",
        warehouse: "Sevkiyat Deposu",
        reorderQty: 200,
    },
    {
        id: "3",
        name: "API Forged Sürgülü Vana DN100",
        sku: "SV-API-DN100",
        category: "Sürgülü Vanalar",
        unit: "adet",
        price: 1250,
        currency: "USD",
        on_hand: 350,
        reserved: 120,
        available_now: 230,
        minStockLevel: 50,
        isActive: true,
        productType: "finished",
        warehouse: "Sevkiyat Deposu",
        reorderQty: 100,
    },
    {
        id: "4",
        name: "Wafer Tip Kelebek Vana DN150",
        sku: "KB-WT-DN150",
        category: "Kelebek Vanalar",
        unit: "adet",
        price: 320,
        currency: "USD",
        on_hand: 180,
        reserved: 160,
        available_now: 20,
        minStockLevel: 50,
        isActive: true,
        productType: "finished",
        warehouse: "Sevkiyat Deposu",
        reorderQty: 100,
        dailyUsage: 3,
    },
    {
        id: "5",
        name: "Spiral Sarım Conta DN80",
        sku: "CT-SS-DN80",
        category: "Contalar",
        unit: "adet",
        price: 45,
        currency: "USD",
        on_hand: 5000,
        reserved: 800,
        available_now: 4200,
        minStockLevel: 1000,
        isActive: true,
        productType: "finished",
        warehouse: "Sevkiyat Deposu",
        reorderQty: 2000,
    },
    {
        id: "6",
        name: "PTFE Conta DN50",
        sku: "CT-PTFE-DN50",
        category: "Contalar",
        unit: "adet",
        price: 28,
        currency: "USD",
        on_hand: 3500,
        reserved: 500,
        available_now: 3000,
        minStockLevel: 500,
        isActive: true,
        productType: "finished",
        warehouse: "Sevkiyat Deposu",
        reorderQty: 1000,
    },
    {
        id: "7",
        name: "Y Tipi Filtre DN100",
        sku: "FT-Y-DN100",
        category: "Filtreler",
        unit: "adet",
        price: 580,
        currency: "USD",
        on_hand: 120,
        reserved: 30,
        available_now: 90,
        minStockLevel: 20,
        isActive: true,
        productType: "finished",
        warehouse: "Sevkiyat Deposu",
        reorderQty: 40,
    },
    {
        id: "8",
        name: "Lift Tipi Çek Valf DN25",
        sku: "CV-LT-DN25",
        category: "Çek Valfler",
        unit: "adet",
        price: 290,
        currency: "USD",
        on_hand: 450,
        reserved: 200,
        available_now: 250,
        minStockLevel: 80,
        isActive: true,
        productType: "finished",
        warehouse: "Sevkiyat Deposu",
        reorderQty: 160,
    },
    {
        id: "9",
        name: "Çift Klapeli Çek Valf DN200",
        sku: "CV-CK-DN200",
        category: "Çek Valfler",
        unit: "adet",
        price: 1850,
        currency: "USD",
        on_hand: 60,
        reserved: 55,
        available_now: 5,
        minStockLevel: 15,
        isActive: true,
        productType: "finished",
        warehouse: "Sevkiyat Deposu",
        reorderQty: 30,
        dailyUsage: 2,
    },
    {
        id: "10",
        name: "Flanş İzolasyon Kiti E Tipi",
        sku: "FK-ET-GENEL",
        category: "Flanş Aksesuarları",
        unit: "set",
        price: 120,
        currency: "USD",
        on_hand: 2000,
        reserved: 100,
        available_now: 1900,
        minStockLevel: 300,
        isActive: true,
        productType: "finished",
        warehouse: "Sevkiyat Deposu",
        reorderQty: 600,
    },
    // --- Hammaddeler ---
    {
        id: "rm-1",
        name: "Paslanmaz Çelik Döküm Gövde DN25",
        sku: "HM-DK-SS-DN25",
        category: "Hammadde - Döküm",
        unit: "adet",
        price: 85,
        currency: "USD",
        on_hand: 300,
        reserved: 0,
        available_now: 300,
        minStockLevel: 500,
        isActive: true,
        productType: "raw_material",
        warehouse: "Fabrika Deposu",
        reorderQty: 1000,
        preferredVendor: "Döktaş Dökümcülük",
        dailyUsage: 25,
    },
    {
        id: "rm-2",
        name: "PTFE O-Ring Seti (Çoklu Boyut)",
        sku: "HM-OR-PTFE",
        category: "Hammadde - Conta",
        unit: "set",
        price: 3.5,
        currency: "USD",
        on_hand: 2000,
        reserved: 0,
        available_now: 2000,
        minStockLevel: 3000,
        isActive: true,
        productType: "raw_material",
        warehouse: "Fabrika Deposu",
        reorderQty: 5000,
        preferredVendor: "Garlock Türkiye",
        dailyUsage: 80,
    },
    {
        id: "rm-3",
        name: "Pirinç Bar Ø32mm",
        sku: "HM-BR-32",
        category: "Hammadde - Metal",
        unit: "kg",
        price: 12,
        currency: "USD",
        on_hand: 800,
        reserved: 0,
        available_now: 800,
        minStockLevel: 500,
        isActive: true,
        productType: "raw_material",
        warehouse: "Fabrika Deposu",
        reorderQty: 1000,
        preferredVendor: "İstanbul Metal AŞ",
    },
    {
        id: "rm-4",
        name: "Cıvata-Somun Seti A2-70 (M10x50)",
        sku: "HM-CS-A270",
        category: "Hammadde - Bağlantı",
        unit: "takım",
        price: 1.8,
        currency: "USD",
        on_hand: 500,
        reserved: 0,
        available_now: 500,
        minStockLevel: 1000,
        isActive: true,
        productType: "raw_material",
        warehouse: "Fabrika Deposu",
        reorderQty: 3000,
        preferredVendor: "Norm Civata",
        dailyUsage: 40,
    },
    {
        id: "rm-5",
        name: "Karbon Çelik Flanş DN100 PN16",
        sku: "HM-FL-CS-DN100",
        category: "Hammadde - Flanş",
        unit: "adet",
        price: 45,
        currency: "USD",
        on_hand: 40,
        reserved: 0,
        available_now: 40,
        minStockLevel: 100,
        isActive: true,
        productType: "raw_material",
        warehouse: "Fabrika Deposu",
        reorderQty: 200,
        preferredVendor: "Tüpraş Flanş",
        dailyUsage: 8,
    },
];

export const mockCustomers: Customer[] = [
    {
        id: "1",
        name: "Petronas Lubricants International",
        email: "procurement@petronas.com",
        phone: "+60 3 2051 5050",
        address: "Tower 1, PETRONAS Twin Towers, Kuala Lumpur, Malaysia",
        taxNumber: "ML-83726451",
        taxOffice: "KL Central",
        country: "MY",
        currency: "USD",
        notes: "Büyük ölçekli sipariş potansiyeli. Q2 için vana teklifi bekliyor.",
        isActive: true,
        totalOrders: 12,
        totalRevenue: 285000,
        lastOrderDate: "2026-02-15",
    },
    {
        id: "2",
        name: "SOCAR Turkey Enerji",
        email: "tedarik@socar.com.tr",
        phone: "+90 212 398 2000",
        address: "Maslak Mahallesi, AOS 55. Sok. No:2, Sarıyer/İstanbul",
        taxNumber: "4270068508",
        taxOffice: "Maslak VD",
        country: "TR",
        currency: "USD",
        notes: "STAR Rafineri projesi için sürgülü vana siparişi devam ediyor.",
        isActive: true,
        totalOrders: 28,
        totalRevenue: 1450000,
        lastOrderDate: "2026-03-10",
    },
    {
        id: "3",
        name: "ADNOC Distribution",
        email: "supply@adnoc.ae",
        phone: "+971 2 602 0000",
        address: "ADNOC HQ, Abu Dhabi, UAE",
        taxNumber: "AE-0029384756",
        taxOffice: "Abu Dhabi",
        country: "AE",
        currency: "USD",
        notes: "Yılda 3 kez toplu sipariş geçiyor. 2026 sözleşmesi onaylandı.",
        isActive: true,
        totalOrders: 9,
        totalRevenue: 520000,
        lastOrderDate: "2026-01-28",
    },
    {
        id: "4",
        name: "Cepsa Trading S.A.U.",
        email: "purchasing@cepsa.com",
        phone: "+34 91 337 60 00",
        address: "Paseo de la Castellana, 259 A, Madrid, Spain",
        taxNumber: "ES-A28003119",
        taxOffice: "Madrid",
        country: "ES",
        currency: "EUR",
        notes: "Yeni müşteri. Kelebek vana ve conta fiyat teklifi gönderildi.",
        isActive: true,
        totalOrders: 2,
        totalRevenue: 38000,
        lastOrderDate: "2026-03-05",
    },
    {
        id: "5",
        name: "Tüpraş",
        email: "satin.alma@tupras.com.tr",
        phone: "+90 262 316 30 00",
        address: "Körfez, Kocaeli, Türkiye",
        taxNumber: "5150003271",
        taxOffice: "Körfez VD",
        country: "TR",
        currency: "TRY",
        notes: "İzmit Rafineri bakım dönemi için filtre ve conta siparişleri.",
        isActive: true,
        totalOrders: 45,
        totalRevenue: 3200000,
        lastOrderDate: "2026-03-12",
    },
    {
        id: "6",
        name: "MOL Group",
        email: "procurement@mol.hu",
        phone: "+36 1 886 5000",
        address: "Október huszonharmadika u. 18, Budapest, Hungary",
        taxNumber: "HU-10625790",
        taxOffice: "Budapest",
        country: "HU",
        currency: "EUR",
        notes: "Macaristan ve Hırvatistan tesisleri için düzenli sipariş veriyor.",
        isActive: true,
        totalOrders: 18,
        totalRevenue: 680000,
        lastOrderDate: "2026-02-20",
    },
];

export const mockOrders: Order[] = [
    {
        id: "1",
        orderNumber: "ORD-2026-0042",
        customerName: "SOCAR Turkey Enerji",
        commercial_status: "approved",
        fulfillment_status: "allocated",
        grandTotal: 185000,
        currency: "USD",
        createdAt: "2026-03-15",
        itemCount: 8,
    },
    {
        id: "2",
        orderNumber: "ORD-2026-0041",
        customerName: "Tüpraş",
        commercial_status: "approved",
        fulfillment_status: "shipped",
        grandTotal: 92000,
        currency: "TRY",
        createdAt: "2026-03-12",
        itemCount: 15,
    },
    {
        id: "3",
        orderNumber: "ORD-2026-0040",
        customerName: "ADNOC Distribution",
        commercial_status: "pending_approval",
        fulfillment_status: "unallocated",
        grandTotal: 67500,
        currency: "USD",
        createdAt: "2026-03-10",
        itemCount: 5,
    },
    {
        id: "4",
        orderNumber: "ORD-2026-0039",
        customerName: "Cepsa Trading S.A.U.",
        commercial_status: "draft",
        fulfillment_status: "unallocated",
        grandTotal: 12400,
        currency: "EUR",
        createdAt: "2026-03-08",
        itemCount: 3,
    },
    {
        id: "5",
        orderNumber: "ORD-2026-0038",
        customerName: "MOL Group",
        commercial_status: "approved",
        fulfillment_status: "shipped",
        grandTotal: 145000,
        currency: "EUR",
        createdAt: "2026-03-05",
        itemCount: 22,
    },
    {
        id: "6",
        orderNumber: "ORD-2026-0037",
        customerName: "Petronas Lubricants International",
        commercial_status: "cancelled",
        fulfillment_status: "unallocated",
        grandTotal: 28000,
        currency: "USD",
        createdAt: "2026-03-01",
        itemCount: 4,
    },
];

export const mockOrderDetails: OrderDetail[] = [
    {
        id: "1",
        orderNumber: "ORD-2026-0042",
        customerName: "SOCAR Turkey Enerji",
        customerId: "2",
        customerEmail: "tedarik@socar.com.tr",
        customerCountry: "TR",
        customerTaxOffice: "Maslak VD",
        customerTaxNumber: "4270068508",
        commercial_status: "approved",
        fulfillment_status: "allocated",
        currency: "USD",
        createdAt: "2026-03-15",
        itemCount: 3,
        subtotal: 154166,
        vatTotal: 30833,
        grandTotal: 185000,
        notes: "STAR Rafineri sahası için. Özel paletleme ve MSDS belgesi gerekli.",
        lines: [
            { id: "l1", productId: "3", productName: "API Forged Sürgülü Vana DN100", productSku: "SV-API-DN100", unit: "adet", quantity: 80, unitPrice: 1250, discountPct: 5, lineTotal: 95000 },
            { id: "l2", productId: "1", productName: "3 Parçalı Küresel Vana DN25", productSku: "KV-3P-DN25", unit: "adet", quantity: 100, unitPrice: 450, discountPct: 0, lineTotal: 45000 },
            { id: "l3", productId: "5", productName: "Spiral Sarım Conta DN80", productSku: "CT-SS-DN80", unit: "adet", quantity: 500, unitPrice: 45, discountPct: 10, lineTotal: 20250 },
        ],
    },
    {
        id: "2",
        orderNumber: "ORD-2026-0041",
        customerName: "Tüpraş",
        customerId: "5",
        customerEmail: "satin.alma@tupras.com.tr",
        customerCountry: "TR",
        customerTaxOffice: "Körfez VD",
        customerTaxNumber: "5150003271",
        commercial_status: "approved",
        fulfillment_status: "shipped",
        currency: "TRY",
        createdAt: "2026-03-12",
        itemCount: 3,
        subtotal: 76666,
        vatTotal: 15334,
        grandTotal: 92000,
        notes: "İzmit Rafineri bakım dönemi. Acil teslimat.",
        parasutInvoiceId: "F-2026-0041",
        parasutSentAt: "2026-03-12T09:15:00.000Z",
        lines: [
            { id: "l4", productId: "7", productName: "Y Tipi Filtre DN100", productSku: "FT-Y-DN100", unit: "adet", quantity: 50, unitPrice: 580, discountPct: 0, lineTotal: 29000 },
            { id: "l5", productId: "6", productName: "PTFE Conta DN50", productSku: "CT-PTFE-DN50", unit: "adet", quantity: 1000, unitPrice: 28, discountPct: 10, lineTotal: 25200 },
            { id: "l6", productId: "10", productName: "Flanş İzolasyon Kiti E Tipi", productSku: "FK-ET-GENEL", unit: "set", quantity: 200, unitPrice: 120, discountPct: 5, lineTotal: 22800 },
        ],
    },
    {
        id: "3",
        orderNumber: "ORD-2026-0040",
        customerName: "ADNOC Distribution",
        customerId: "3",
        customerEmail: "supply@adnoc.ae",
        customerCountry: "AE",
        customerTaxOffice: "Abu Dhabi",
        customerTaxNumber: "AE-0029384756",
        commercial_status: "pending_approval",
        fulfillment_status: "unallocated",
        currency: "USD",
        createdAt: "2026-03-10",
        itemCount: 2,
        subtotal: 56250,
        vatTotal: 11250,
        grandTotal: 67500,
        notes: "",
        lines: [
            { id: "l7", productId: "2", productName: "2 Parçalı Küresel Vana DN50", productSku: "KV-2P-DN50", unit: "adet", quantity: 50, unitPrice: 680, discountPct: 0, lineTotal: 34000 },
            { id: "l8", productId: "4", productName: "Wafer Tip Kelebek Vana DN150", productSku: "KB-WT-DN150", unit: "adet", quantity: 70, unitPrice: 320, discountPct: 0, lineTotal: 22400 },
        ],
    },
    {
        id: "4",
        orderNumber: "ORD-2026-0039",
        customerName: "Cepsa Trading S.A.U.",
        customerId: "4",
        customerEmail: "purchasing@cepsa.com",
        customerCountry: "ES",
        customerTaxOffice: "Madrid",
        customerTaxNumber: "ES-A28003119",
        commercial_status: "draft",
        fulfillment_status: "unallocated",
        currency: "EUR",
        createdAt: "2026-03-08",
        itemCount: 2,
        subtotal: 10333,
        vatTotal: 2067,
        grandTotal: 12400,
        notes: "Fiyat teklifine göre hazırlandı. Onay bekliyor.",
        lines: [
            { id: "l9", productId: "8", productName: "Lift Tipi Çek Valf DN25", productSku: "CV-LT-DN25", unit: "adet", quantity: 20, unitPrice: 290, discountPct: 0, lineTotal: 5800 },
            { id: "l10", productId: "5", productName: "Spiral Sarım Conta DN80", productSku: "CT-SS-DN80", unit: "adet", quantity: 100, unitPrice: 45, discountPct: 5, lineTotal: 4275 },
        ],
    },
    {
        id: "5",
        orderNumber: "ORD-2026-0038",
        customerName: "MOL Group",
        customerId: "6",
        customerEmail: "procurement@mol.hu",
        customerCountry: "HU",
        customerTaxOffice: "Budapest",
        customerTaxNumber: "HU-10625790",
        commercial_status: "approved",
        fulfillment_status: "shipped",
        currency: "EUR",
        createdAt: "2026-03-05",
        itemCount: 3,
        subtotal: 120833,
        vatTotal: 24167,
        grandTotal: 145000,
        notes: "Macaristan ve Hırvatistan tesisleri. İki ayrı sevkiyat.",
        parasutInvoiceId: "F-2026-0038",
        parasutSentAt: "2026-03-05T14:22:00.000Z",
        lines: [
            { id: "l11", productId: "3", productName: "API Forged Sürgülü Vana DN100", productSku: "SV-API-DN100", unit: "adet", quantity: 60, unitPrice: 1250, discountPct: 5, lineTotal: 71250 },
            { id: "l12", productId: "9", productName: "Çift Klapeli Çek Valf DN200", productSku: "CV-CK-DN200", unit: "adet", quantity: 20, unitPrice: 1850, discountPct: 0, lineTotal: 37000 },
            { id: "l13", productId: "10", productName: "Flanş İzolasyon Kiti E Tipi", productSku: "FK-ET-GENEL", unit: "set", quantity: 100, unitPrice: 120, discountPct: 0, lineTotal: 12000 },
        ],
    },
    {
        id: "6",
        orderNumber: "ORD-2026-0037",
        customerName: "Petronas Lubricants International",
        customerId: "1",
        customerEmail: "procurement@petronas.com",
        customerCountry: "MY",
        customerTaxOffice: "KL Central",
        customerTaxNumber: "ML-83726451",
        commercial_status: "cancelled",
        fulfillment_status: "unallocated",
        currency: "USD",
        createdAt: "2026-03-01",
        itemCount: 2,
        subtotal: 23333,
        vatTotal: 4667,
        grandTotal: 28000,
        notes: "İptal edildi: müşteri teklif revizesi talep etti.",
        lines: [
            { id: "l14", productId: "1", productName: "3 Parçalı Küresel Vana DN25", productSku: "KV-3P-DN25", unit: "adet", quantity: 30, unitPrice: 450, discountPct: 0, lineTotal: 13500 },
            { id: "l15", productId: "7", productName: "Y Tipi Filtre DN100", productSku: "FT-Y-DN100", unit: "adet", quantity: 16, unitPrice: 580, discountPct: 5, lineTotal: 8816 },
        ],
    },
];
