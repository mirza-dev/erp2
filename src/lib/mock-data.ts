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
    totalStock: number;
    allocatedStock: number;
    availableStock: number;
    minStockLevel: number;
    isActive: boolean;
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
    status: "DRAFT" | "PENDING" | "APPROVED" | "SHIPPED" | "CANCELLED";
    grandTotal: number;
    currency: string;
    createdAt: string;
    itemCount: number;
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
        totalStock: 1200,
        allocatedStock: 150,
        availableStock: 1050,
        minStockLevel: 200,
        isActive: true,
    },
    {
        id: "2",
        name: "2 Parçalı Küresel Vana DN50",
        sku: "KV-2P-DN50",
        category: "Küresel Vanalar",
        unit: "adet",
        price: 680,
        currency: "USD",
        totalStock: 800,
        allocatedStock: 300,
        availableStock: 500,
        minStockLevel: 100,
        isActive: true,
    },
    {
        id: "3",
        name: "API Forged Sürgülü Vana DN100",
        sku: "SV-API-DN100",
        category: "Sürgülü Vanalar",
        unit: "adet",
        price: 1250,
        currency: "USD",
        totalStock: 350,
        allocatedStock: 120,
        availableStock: 230,
        minStockLevel: 50,
        isActive: true,
    },
    {
        id: "4",
        name: "Wafer Tip Kelebek Vana DN150",
        sku: "KB-WT-DN150",
        category: "Kelebek Vanalar",
        unit: "adet",
        price: 320,
        currency: "USD",
        totalStock: 180,
        allocatedStock: 160,
        availableStock: 20,
        minStockLevel: 50,
        isActive: true,
    },
    {
        id: "5",
        name: "Spiral Sarım Conta DN80",
        sku: "CT-SS-DN80",
        category: "Contalar",
        unit: "adet",
        price: 45,
        currency: "USD",
        totalStock: 5000,
        allocatedStock: 800,
        availableStock: 4200,
        minStockLevel: 1000,
        isActive: true,
    },
    {
        id: "6",
        name: "PTFE Conta DN50",
        sku: "CT-PTFE-DN50",
        category: "Contalar",
        unit: "adet",
        price: 28,
        currency: "USD",
        totalStock: 3500,
        allocatedStock: 500,
        availableStock: 3000,
        minStockLevel: 500,
        isActive: true,
    },
    {
        id: "7",
        name: "Y Tipi Filtre DN100",
        sku: "FT-Y-DN100",
        category: "Filtreler",
        unit: "adet",
        price: 580,
        currency: "USD",
        totalStock: 120,
        allocatedStock: 30,
        availableStock: 90,
        minStockLevel: 20,
        isActive: true,
    },
    {
        id: "8",
        name: "Lift Tipi Çek Valf DN25",
        sku: "CV-LT-DN25",
        category: "Çek Valfler",
        unit: "adet",
        price: 290,
        currency: "USD",
        totalStock: 450,
        allocatedStock: 200,
        availableStock: 250,
        minStockLevel: 80,
        isActive: true,
    },
    {
        id: "9",
        name: "Çift Klapeli Çek Valf DN200",
        sku: "CV-CK-DN200",
        category: "Çek Valfler",
        unit: "adet",
        price: 1850,
        currency: "USD",
        totalStock: 60,
        allocatedStock: 55,
        availableStock: 5,
        minStockLevel: 15,
        isActive: true,
    },
    {
        id: "10",
        name: "Flanş İzolasyon Kiti E Tipi",
        sku: "FK-ET-GENEL",
        category: "Flanş Aksesuarları",
        unit: "set",
        price: 120,
        currency: "USD",
        totalStock: 2000,
        allocatedStock: 100,
        availableStock: 1900,
        minStockLevel: 300,
        isActive: true,
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
        status: "APPROVED",
        grandTotal: 185000,
        currency: "USD",
        createdAt: "2026-03-15",
        itemCount: 8,
    },
    {
        id: "2",
        orderNumber: "ORD-2026-0041",
        customerName: "Tüpraş",
        status: "SHIPPED",
        grandTotal: 92000,
        currency: "TRY",
        createdAt: "2026-03-12",
        itemCount: 15,
    },
    {
        id: "3",
        orderNumber: "ORD-2026-0040",
        customerName: "ADNOC Distribution",
        status: "PENDING",
        grandTotal: 67500,
        currency: "USD",
        createdAt: "2026-03-10",
        itemCount: 5,
    },
    {
        id: "4",
        orderNumber: "ORD-2026-0039",
        customerName: "Cepsa Trading S.A.U.",
        status: "DRAFT",
        grandTotal: 12400,
        currency: "EUR",
        createdAt: "2026-03-08",
        itemCount: 3,
    },
    {
        id: "5",
        orderNumber: "ORD-2026-0038",
        customerName: "MOL Group",
        status: "SHIPPED",
        grandTotal: 145000,
        currency: "EUR",
        createdAt: "2026-03-05",
        itemCount: 22,
    },
    {
        id: "6",
        orderNumber: "ORD-2026-0037",
        customerName: "Petronas Lubricants International",
        status: "CANCELLED",
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
        status: "APPROVED",
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
        status: "SHIPPED",
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
        status: "PENDING",
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
        status: "DRAFT",
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
        status: "SHIPPED",
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
        status: "CANCELLED",
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
