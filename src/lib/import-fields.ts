// Shared import field definitions — single source of truth for UI, AI, and API routes.
// No "use client" directive — importable from both server and client contexts.

export const IMPORT_FIELDS: Record<string, Array<{ field: string; label: string }>> = {
    product: [
        { field: "name", label: "Ürün Adı" }, { field: "sku", label: "SKU" },
        { field: "category", label: "Kategori" }, { field: "unit", label: "Birim" },
        { field: "price", label: "Fiyat" }, { field: "currency", label: "Para Birimi" },
        { field: "on_hand", label: "Stok Miktarı" }, { field: "min_stock_level", label: "Min. Stok" },
        { field: "product_family", label: "Ürün Ailesi" }, { field: "sub_category", label: "Alt Kategori" }, { field: "sector_compatibility", label: "Sektör Uygunluğu" },
        { field: "cost_price", label: "Maliyet" }, { field: "weight_kg", label: "Ağırlık (kg)" },
        { field: "material_quality", label: "Malzeme Kalitesi" }, { field: "origin_country", label: "Menşei" },
        { field: "production_site", label: "Üretim Tesisi" }, { field: "use_cases", label: "Kullanım Alanları" },
        { field: "industries", label: "Sektörler" }, { field: "standards", label: "Standartlar" },
        { field: "certifications", label: "Sertifikalar" }, { field: "product_notes", label: "Notlar" },
        { field: "lead_time_days", label: "Tedarik Süresi (gün)" }, { field: "reorder_qty", label: "Yeniden Sipariş Miktarı" },
        { field: "preferred_vendor", label: "Tercihli Tedarikçi" },
    ],
    customer: [
        { field: "name", label: "Firma Adı" }, { field: "email", label: "E-posta" },
        { field: "phone", label: "Telefon" }, { field: "country", label: "Ülke" },
        { field: "currency", label: "Para Birimi" }, { field: "tax_number", label: "Vergi No" },
        { field: "tax_office", label: "Vergi Dairesi" }, { field: "address", label: "Adres" },
        { field: "notes", label: "Notlar" }, { field: "payment_terms_days", label: "Ödeme Vadesi (gün)" },
        { field: "customer_code", label: "Müşteri Kodu" }, { field: "default_incoterm", label: "Varsayılan Incoterm" },
    ],
    order: [
        { field: "customer_name", label: "Müşteri Adı" }, { field: "customer_code", label: "Müşteri Kodu" },
        { field: "currency", label: "Para Birimi" }, { field: "grand_total", label: "Toplam Tutar" },
        { field: "notes", label: "Notlar" }, { field: "incoterm", label: "Incoterm" },
        { field: "planned_shipment_date", label: "Planlanan Sevk Tarihi" },
        { field: "quote_number", label: "Teklif No" }, { field: "original_order_number", label: "Sipariş No" },
        // order_date intentionally omitted — sales_orders table has no such column (uses created_at)
    ],
    order_line: [
        { field: "order_number", label: "Sipariş No" }, { field: "product_sku", label: "Ürün SKU" },
        { field: "quantity", label: "Miktar" }, { field: "unit", label: "Birim" },
        { field: "unit_price", label: "Birim Fiyat" }, { field: "line_total", label: "Toplam" },
    ],
    quote: [
        { field: "quote_number", label: "Teklif No" }, { field: "quote_date", label: "Teklif Tarihi" },
        { field: "customer_code", label: "Müşteri Kodu" }, { field: "currency", label: "Para Birimi" },
        { field: "incoterm", label: "Incoterm" }, { field: "validity_days", label: "Geçerlilik (gün)" },
        { field: "total_amount", label: "Toplam Tutar" },
    ],
    shipment: [
        { field: "shipment_number", label: "Sevkiyat No" }, { field: "order_number", label: "Sipariş No" },
        { field: "shipment_date", label: "Sevkiyat Tarihi" }, { field: "transport_type", label: "Taşıma Türü" },
        { field: "net_weight_kg", label: "Net Ağırlık (kg)" }, { field: "gross_weight_kg", label: "Brüt Ağırlık (kg)" },
    ],
    invoice: [
        { field: "invoice_number", label: "Fatura No" }, { field: "invoice_date", label: "Fatura Tarihi" },
        { field: "order_number", label: "Sipariş No" }, { field: "customer_code", label: "Müşteri Kodu" },
        { field: "currency", label: "Para Birimi" }, { field: "amount", label: "Tutar" },
        { field: "due_date", label: "Vade Tarihi" },
    ],
    payment: [
        { field: "payment_number", label: "Tahsilat No" }, { field: "invoice_number", label: "Fatura No" },
        { field: "payment_date", label: "Tahsilat Tarihi" }, { field: "amount", label: "Tutar" },
        { field: "payment_method", label: "Ödeme Yöntemi" },
    ],
    stock: [
        { field: "sku", label: "SKU" }, { field: "on_hand", label: "Stok Miktarı" },
    ],
};

// Field name arrays for AI prompts (derived from IMPORT_FIELDS)
export const IMPORT_FIELD_NAMES: Record<string, string[]> = Object.fromEntries(
    Object.entries(IMPORT_FIELDS).map(([k, v]) => [k, v.map(f => f.field)])
);

// Set-based lookup for whitelist validation in apply-mappings route
export const IMPORT_FIELD_SET: Record<string, Set<string>> = Object.fromEntries(
    Object.entries(IMPORT_FIELD_NAMES).map(([k, v]) => [k, new Set(v)])
);

export const REQUIRED_FIELDS: Record<string, string[]> = {
    product: ["sku", "name", "unit"],
    customer: ["name"],
    quote: ["quote_number"],
    order: [],
    order_line: ["order_number", "product_sku"],
    stock: ["sku", "on_hand"],
    shipment: ["shipment_number"],
    invoice: ["invoice_number"],
    payment: ["payment_number"],
};

export const NUMERIC_FIELDS = new Set([
    "price", "grand_total", "min_stock_level", "on_hand", "cost_price", "weight_kg",
    "payment_terms_days", "total_amount", "net_weight_kg", "gross_weight_kg", "amount",
    "validity_days", "quantity", "unit_price", "line_total", "lead_time_days", "reorder_qty",
]);
