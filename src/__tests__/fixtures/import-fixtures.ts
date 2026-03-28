/**
 * Import batch parse fixtures — customer, product, order scenarios.
 * Extends the CUSTOMER_ROWS / VALID_AI_BATCH_RESPONSE pattern from ai-batch-parse.test.ts.
 *
 * Each scenario includes:
 *   - rows: Excel-like input
 *   - goldenResponse: the JSON string a well-behaved AI would return
 *   - expected: structural assertions (minConfidence, requiredParsedKeys, maxUnmatchedCount)
 */

export interface ImportFixtureScenario {
    label: string;
    entity_type: "customer" | "product" | "order";
    rows: Array<Record<string, string>>;
    goldenResponse: string;
    expected: {
        minConfidence: number;
        requiredParsedKeys: string[];
        maxUnmatchedCount: number;
    };
}

// ── Customer scenarios ────────────────────────────────────────

/** All standard fields present — expect high confidence, no unmatched. */
export const COMPLETE_CUSTOMER_ROWS = [
    {
        firma_adi: "Petrokimya A.Ş.",
        email: "info@petrokimya.com",
        telefon: "+90 212 555 0101",
        ulke: "TR",
        para_birimi: "TRY",
        vergi_no: "1234567890",
        vergi_dairesi: "Kadıköy",
        adres: "Bağcılar Cad. No:12, İstanbul",
        notlar: "VIP müşteri",
    },
];

export const COMPLETE_CUSTOMER_GOLDEN = JSON.stringify({
    items: [
        {
            parsed_data: {
                name: "Petrokimya A.Ş.",
                email: "info@petrokimya.com",
                phone: "+90 212 555 0101",
                country: "TR",
                currency: "TRY",
                tax_number: "1234567890",
                tax_office: "Kadıköy",
                address: "Bağcılar Cad. No:12, İstanbul",
                notes: "VIP müşteri",
            },
            confidence: 0.92,
            ai_reason: "All required fields mapped successfully",
            unmatched_fields: [],
        },
    ],
});

/** Only name + email — partial data, mid confidence. */
export const PARTIAL_CUSTOMER_ROWS = [
    { firma_adi: "Beta Endüstri", email: "beta@example.com" },
];

export const PARTIAL_CUSTOMER_GOLDEN = JSON.stringify({
    items: [
        {
            parsed_data: { name: "Beta Endüstri", email: "beta@example.com" },
            confidence: 0.62,
            ai_reason: "Only name and email found; other fields missing",
            unmatched_fields: [],
        },
    ],
});

/** Unknown column names — should appear in unmatched_fields. */
export const UNMAPPED_COLUMNS_ROWS = [
    {
        firma_adi: "Gamma Ltd.",
        sistem_kodu: "SYS-001",
        bolge_kodu: "IST",
        ozel_alan: "xyz",
    },
];

export const UNMAPPED_COLUMNS_GOLDEN = JSON.stringify({
    items: [
        {
            parsed_data: { name: "Gamma Ltd." },
            confidence: 0.55,
            ai_reason: "Only company name mapped; other columns are non-standard",
            unmatched_fields: ["sistem_kodu", "bolge_kodu", "ozel_alan"],
        },
    ],
});

/** Turkish unicode characters — normalization edge case. */
export const TURKISH_UNICODE_ROWS = [
    { "Şirket Adı": "Ülker Endüstri", ülke: "TR", "şehir": "İstanbul" },
];

export const TURKISH_UNICODE_GOLDEN = JSON.stringify({
    items: [
        {
            parsed_data: { name: "Ülker Endüstri", country: "TR" },
            confidence: 0.70,
            ai_reason: "Company name and country extracted; city field not in schema",
            unmatched_fields: ["şehir"],
        },
    ],
});

/** Correct column names but all values empty. */
export const EMPTY_VALUES_ROWS = [
    { firma_adi: "", email: "", ulke: "", para_birimi: "" },
];

export const EMPTY_VALUES_GOLDEN = JSON.stringify({
    items: [
        {
            parsed_data: {},
            confidence: 0.30,
            ai_reason: "All fields are empty; no data could be extracted",
            unmatched_fields: [],
        },
    ],
});

// ── Product scenarios ─────────────────────────────────────────

/** Full product row with all numeric fields. */
export const FULL_PRODUCT_ROWS = [
    {
        urun_kodu: "VLV-DN50-001",
        urun_adi: "Küresel Vana DN50",
        kategori: "Vana",
        olcu_birimi: "adet",
        fiyat: "1250.00",
        para_birimi: "USD",
        guvenlik_stogu: "20",
    },
];

export const FULL_PRODUCT_GOLDEN = JSON.stringify({
    items: [
        {
            parsed_data: {
                sku: "VLV-DN50-001",
                name: "Küresel Vana DN50",
                category: "Vana",
                unit: "adet",
                price: 1250.00,
                currency: "USD",
                min_stock_level: 20,
            },
            confidence: 0.91,
            ai_reason: "All product fields mapped with correct numeric conversion",
            unmatched_fields: [],
        },
    ],
});

/** Decimal price as string — ensure float parsing. */
export const PRICE_VARIANTS_ROWS = [
    { urun_kodu: "VLV-DN25-002", urun_adi: "Küresel Vana DN25", liste_fiyati_usd: "278.48", para_birimi: "USD" },
];

export const PRICE_VARIANTS_GOLDEN = JSON.stringify({
    items: [
        {
            parsed_data: {
                sku: "VLV-DN25-002",
                name: "Küresel Vana DN25",
                price: 278.48,
                currency: "USD",
            },
            confidence: 0.80,
            ai_reason: "Decimal price parsed correctly from liste_fiyati_usd",
            unmatched_fields: [],
        },
    ],
});

/** Only SKU present — very low confidence. */
export const MINIMAL_PRODUCT_ROWS = [{ urun_kodu: "SKU-ONLY-003" }];

export const MINIMAL_PRODUCT_GOLDEN = JSON.stringify({
    items: [
        {
            parsed_data: { sku: "SKU-ONLY-003" },
            confidence: 0.40,
            ai_reason: "Only SKU found; name and pricing data missing",
            unmatched_fields: [],
        },
    ],
});

/** Zero price — must parse as 0, not empty/null. */
export const ZERO_PRICE_ROWS = [
    { urun_kodu: "FREE-ITEM-004", urun_adi: "Promosyon Kalemi", fiyat: "0", para_birimi: "USD" },
];

export const ZERO_PRICE_GOLDEN = JSON.stringify({
    items: [
        {
            parsed_data: { sku: "FREE-ITEM-004", name: "Promosyon Kalemi", price: 0, currency: "USD" },
            confidence: 0.85,
            ai_reason: "Zero price is valid and has been parsed as 0",
            unmatched_fields: [],
        },
    ],
});

// ── Order scenarios ───────────────────────────────────────────

/** Standard order with customer name and numeric grand total. */
export const STANDARD_ORDER_ROWS = [
    { musteri_adi: "SOCAR Turkey", toplam_tutar_usd: "45000", para_birimi: "USD" },
];

export const STANDARD_ORDER_GOLDEN = JSON.stringify({
    items: [
        {
            parsed_data: { customer_name: "SOCAR Turkey", grand_total: 45000, currency: "USD" },
            confidence: 0.88,
            ai_reason: "Customer name and grand total mapped successfully",
            unmatched_fields: [],
        },
    ],
});

/** Only customer code — very limited data. */
export const MINIMAL_ORDER_ROWS = [{ musteri_kodu: "CUST-0042" }];

export const MINIMAL_ORDER_GOLDEN = JSON.stringify({
    items: [
        {
            parsed_data: { customer_name: "CUST-0042" },
            confidence: 0.45,
            ai_reason: "Only customer code found; financial and line data missing",
            unmatched_fields: [],
        },
    ],
});

/** Mixed case column names — tests case normalization. */
export const MIXED_CASE_ORDER_ROWS = [
    { MUSTERI_ADI: "Delta Kimya", Toplam_Tutar: "12000", Para_Birimi: "EUR" },
];

export const MIXED_CASE_ORDER_GOLDEN = JSON.stringify({
    items: [
        {
            parsed_data: { customer_name: "Delta Kimya", grand_total: 12000, currency: "EUR" },
            confidence: 0.80,
            ai_reason: "Fields extracted despite mixed-case column names",
            unmatched_fields: [],
        },
    ],
});

// ── Collected scenarios for parametric tests ──────────────────

export const ALL_IMPORT_SCENARIOS: ImportFixtureScenario[] = [
    {
        label: "customer — complete (all fields)",
        entity_type: "customer",
        rows: COMPLETE_CUSTOMER_ROWS,
        goldenResponse: COMPLETE_CUSTOMER_GOLDEN,
        expected: {
            minConfidence: 0.8,
            requiredParsedKeys: ["name", "email"],
            maxUnmatchedCount: 0,
        },
    },
    {
        label: "customer — partial (name + email only)",
        entity_type: "customer",
        rows: PARTIAL_CUSTOMER_ROWS,
        goldenResponse: PARTIAL_CUSTOMER_GOLDEN,
        expected: {
            minConfidence: 0.5,
            requiredParsedKeys: ["name"],
            maxUnmatchedCount: 0,
        },
    },
    {
        label: "customer — unmapped columns",
        entity_type: "customer",
        rows: UNMAPPED_COLUMNS_ROWS,
        goldenResponse: UNMAPPED_COLUMNS_GOLDEN,
        expected: {
            minConfidence: 0.4,
            requiredParsedKeys: ["name"],
            maxUnmatchedCount: 5,
        },
    },
    {
        label: "customer — Turkish unicode headers",
        entity_type: "customer",
        rows: TURKISH_UNICODE_ROWS,
        goldenResponse: TURKISH_UNICODE_GOLDEN,
        expected: {
            minConfidence: 0.5,
            requiredParsedKeys: ["name"],
            maxUnmatchedCount: 3,
        },
    },
    {
        label: "customer — empty values",
        entity_type: "customer",
        rows: EMPTY_VALUES_ROWS,
        goldenResponse: EMPTY_VALUES_GOLDEN,
        expected: {
            minConfidence: 0,
            requiredParsedKeys: [],
            maxUnmatchedCount: 4,
        },
    },
    {
        label: "product — full row with numeric fields",
        entity_type: "product",
        rows: FULL_PRODUCT_ROWS,
        goldenResponse: FULL_PRODUCT_GOLDEN,
        expected: {
            minConfidence: 0.8,
            requiredParsedKeys: ["sku", "name"],
            maxUnmatchedCount: 0,
        },
    },
    {
        label: "product — decimal price string",
        entity_type: "product",
        rows: PRICE_VARIANTS_ROWS,
        goldenResponse: PRICE_VARIANTS_GOLDEN,
        expected: {
            minConfidence: 0.6,
            requiredParsedKeys: ["sku", "price"],
            maxUnmatchedCount: 0,
        },
    },
    {
        label: "product — minimal (SKU only)",
        entity_type: "product",
        rows: MINIMAL_PRODUCT_ROWS,
        goldenResponse: MINIMAL_PRODUCT_GOLDEN,
        expected: {
            minConfidence: 0.3,
            requiredParsedKeys: ["sku"],
            maxUnmatchedCount: 0,
        },
    },
    {
        label: "product — zero price",
        entity_type: "product",
        rows: ZERO_PRICE_ROWS,
        goldenResponse: ZERO_PRICE_GOLDEN,
        expected: {
            minConfidence: 0.7,
            requiredParsedKeys: ["sku", "price"],
            maxUnmatchedCount: 0,
        },
    },
    {
        label: "order — standard with numeric grand_total",
        entity_type: "order",
        rows: STANDARD_ORDER_ROWS,
        goldenResponse: STANDARD_ORDER_GOLDEN,
        expected: {
            minConfidence: 0.7,
            requiredParsedKeys: ["customer_name"],
            maxUnmatchedCount: 0,
        },
    },
    {
        label: "order — minimal (customer code only)",
        entity_type: "order",
        rows: MINIMAL_ORDER_ROWS,
        goldenResponse: MINIMAL_ORDER_GOLDEN,
        expected: {
            minConfidence: 0.3,
            requiredParsedKeys: ["customer_name"],
            maxUnmatchedCount: 0,
        },
    },
    {
        label: "order — mixed-case column names",
        entity_type: "order",
        rows: MIXED_CASE_ORDER_ROWS,
        goldenResponse: MIXED_CASE_ORDER_GOLDEN,
        expected: {
            minConfidence: 0.6,
            requiredParsedKeys: ["customer_name"],
            maxUnmatchedCount: 0,
        },
    },
];
