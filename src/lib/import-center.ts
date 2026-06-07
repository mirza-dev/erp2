import { IMPORT_FIELDS } from "@/lib/import-fields";
import type { ProductTypeFieldRow, ProductFieldType } from "@/lib/database.types";

export const EXCEL_IMPORT_TEMPLATE_VERSION = "2026-06-03.1";
export const COLUMN_MAPPING_COMPANY_SCOPE = "default";

export type ExcelImportTemplateKind =
    | "product"
    | "customer"
    | "vendor"
    | "stock_count"
    | "stock_movement"
    | "vendor_product_relation";

export type ClassicImportEntityType =
    | "product"
    | "customer"
    | "vendor"
    | "stock";

export type ImportMatchStatus = "new" | "update" | "ambiguous" | "blocked" | "skipped";
export type ImportFieldApproval = "apply" | "skip" | "clear";
export type ImportFieldApprovals = Record<string, ImportFieldApproval>;

export const FINANCIAL_IMPORT_FIELDS = new Set(["price", "cost_price"]);
export const EXCEL_IMPORT_ENTITY_TYPES: ClassicImportEntityType[] = ["product", "customer", "vendor", "stock"];

/**
 * Faz A — AI katalog/datasheet extraction'ından ürün kartına yazılabilecek
 * "core" (sabit kolon) master-data alanları. Ürün-tipi teknik `attributes`
 * JSONB'sinden AYRIDIR (o ürün tipinin field_key'leriyle sınırlı).
 *
 * Finansal alanlar (price/cost_price) bu listede YOK — bilinçli: extraction
 * onları çıkarsa bile apply etmez; finansal yazma ayrı yetki+onay kapısında
 * (Faz C). Stok (on_hand) da yok — master-data akışı stok güncellemez.
 *
 * Her alanın tipi: "string" | "number". apply tarafı buna göre normalize eder.
 */
export const IMPORT_CORE_PRODUCT_FIELDS: Record<string, "string" | "number"> = {
    category: "string",
    unit: "string",
    currency: "string",
    min_stock_level: "number",
    reorder_qty: "number",
    product_family: "string",
    sub_category: "string",
    material_quality: "string",
    origin_country: "string",
    production_site: "string",
    standards: "string",
    certifications: "string",
    use_cases: "string",
    industries: "string",
    weight_kg: "number",
    lead_time_days: "number",
};

export const IMPORT_CORE_PRODUCT_FIELD_KEYS = new Set(Object.keys(IMPORT_CORE_PRODUCT_FIELDS));

/** Core alan anahtarı → Türkçe etiket (review ekranı gösterimi). */
export const IMPORT_CORE_PRODUCT_FIELD_LABELS: Record<string, string> = {
    category: "Kategori",
    unit: "Birim",
    currency: "Para Birimi",
    min_stock_level: "Min. Stok",
    reorder_qty: "Yeniden Sipariş Miktarı",
    product_family: "Ürün Ailesi",
    sub_category: "Alt Kategori",
    material_quality: "Malzeme Kalitesi",
    origin_country: "Menşei",
    production_site: "Üretim Tesisi",
    standards: "Standartlar",
    certifications: "Sertifikalar",
    use_cases: "Kullanım Alanları",
    industries: "Sektörler",
    weight_kg: "Ağırlık (kg)",
    lead_time_days: "Tedarik Süresi (gün)",
};

export function coreFieldLabel(key: string): string {
    return IMPORT_CORE_PRODUCT_FIELD_LABELS[key] ?? key;
}

/**
 * Ham (AI'dan gelen) core_fields objesini whitelist + tip-normalize eder.
 * - Bilinmeyen anahtar → drop.
 * - Finansal anahtar → drop (FINANCIAL_IMPORT_FIELDS).
 * - number alan: sonlu sayıya çevrilebiliyorsa number, değilse drop.
 * - string alan: trim; boş → drop (boş değer mevcut veriyi silmemeli).
 * - null/undefined/"" → drop (silme yok).
 */
export function normalizeCoreProductFields(raw: unknown): Record<string, string | number> {
    if (!raw || typeof raw !== "object") return {};
    const out: Record<string, string | number> = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
        const expectedType = IMPORT_CORE_PRODUCT_FIELDS[key];
        if (!expectedType) continue;
        if (FINANCIAL_IMPORT_FIELDS.has(key)) continue;
        if (value === null || value === undefined || value === "") continue;
        if (expectedType === "number") {
            const num = typeof value === "number" ? value : Number(String(value).replace(",", "."));
            if (!Number.isFinite(num)) continue;
            out[key] = num;
        } else {
            const str = String(value).trim();
            if (str.length === 0) continue;
            out[key] = str.slice(0, 500);
        }
    }
    return out;
}

export interface ExcelTemplateColumn {
    field: string;
    label: string;
    required: boolean;
    example: string | number | boolean;
    note: string;
}

export interface ExcelTemplateDefinition {
    kind: ExcelImportTemplateKind;
    entityType: ClassicImportEntityType;
    operationType: string;
    title: string;
    sheetName: string;
    description: string;
    columns: ExcelTemplateColumn[];
}

const productColumns: ExcelTemplateColumn[] = [
    { field: "sku", label: "SKU", required: true, example: "GV-A105-600", note: "Ürün için benzersiz kod. Boşsa sistem önerisi gerekir." },
    { field: "name", label: "Ürün Adı", required: true, example: "Sürgülü Vana A105 Gövde", note: "Ürün adı." },
    { field: "unit", label: "Birim", required: true, example: "adet", note: "adet, kg, metre gibi." },
    { field: "category", label: "Kategori", required: false, example: "Vana", note: "Serbest kategori." },
    { field: "currency", label: "Para Birimi", required: false, example: "USD", note: "TRY, USD veya EUR." },
    { field: "min_stock_level", label: "Min. Stok", required: false, example: 10, note: "Negatif olamaz." },
    { field: "product_family", label: "Ürün Ailesi", required: false, example: "Endüstriyel Vanalar", note: "Katalog sınıflandırması." },
    { field: "sub_category", label: "Alt Kategori", required: false, example: "Gate Valve", note: "Opsiyonel." },
    { field: "material_quality", label: "Malzeme Kalitesi", required: false, example: "A105", note: "Teknik bilgi." },
    { field: "origin_country", label: "Menşei", required: false, example: "TR", note: "Ülke kodu veya ülke adı." },
    { field: "standards", label: "Standartlar", required: false, example: "API 600", note: "Virgülle ayrılabilir." },
    { field: "certifications", label: "Sertifikalar", required: false, example: "CE, ISO", note: "Zorunlu değildir." },
    { field: "lead_time_days", label: "Tedarik Süresi (gün)", required: false, example: 21, note: "Negatif olamaz." },
    { field: "reorder_qty", label: "Yeniden Sipariş Miktarı", required: false, example: 12, note: "MOQ gibi operasyonel değer." },
    { field: "preferred_vendor", label: "Tercihli Tedarikçi", required: false, example: "PMT Amasya", note: "Tedarikçi adı." },
    { field: "price", label: "Fiyat", required: false, example: 1200, note: "Riskli finansal alan; ayrı onay ve yetki ister." },
    { field: "cost_price", label: "Maliyet", required: false, example: 850, note: "Riskli finansal alan; ayrı onay ve yetki ister." },
];

const customerColumns: ExcelTemplateColumn[] = [
    { field: "name", label: "Firma Adı", required: true, example: "Acme Medikal", note: "Müşteri adı." },
    { field: "email", label: "E-posta", required: false, example: "satinalma@acme.com", note: "Exact match için en güçlü sinyal." },
    { field: "customer_code", label: "Müşteri Kodu", required: false, example: "C-1001", note: "Exact match sinyali." },
    { field: "phone", label: "Telefon", required: false, example: "+90 212 000 00 00", note: "Opsiyonel." },
    { field: "country", label: "Ülke", required: false, example: "TR", note: "Ülke kodu veya ülke adı." },
    { field: "currency", label: "Para Birimi", required: false, example: "TRY", note: "TRY, USD veya EUR." },
    { field: "tax_number", label: "Vergi No", required: false, example: "1234567890", note: "Her zaman zorunlu değildir." },
    { field: "tax_office", label: "Vergi Dairesi", required: false, example: "Şişli", note: "Opsiyonel." },
    { field: "address", label: "Adres", required: false, example: "İstanbul", note: "Opsiyonel." },
    { field: "payment_terms_days", label: "Ödeme Vadesi (gün)", required: false, example: 30, note: "Negatif olamaz." },
    { field: "default_incoterm", label: "Varsayılan Incoterm", required: false, example: "EXW", note: "Opsiyonel." },
];

const vendorColumns: ExcelTemplateColumn[] = [
    { field: "name", label: "Tedarikçi Adı", required: true, example: "PMT Amasya", note: "Tedarikçi adı." },
    { field: "contact_email", label: "E-posta", required: false, example: "sales@pmt.com", note: "Exact match için güçlü sinyal." },
    { field: "contact_phone", label: "Telefon", required: false, example: "+90 358 000 00 00", note: "Opsiyonel." },
    { field: "contact_person", label: "Yetkili", required: false, example: "Ayşe Yılmaz", note: "Opsiyonel." },
    { field: "tax_number", label: "Vergi No", required: false, example: "1234567890", note: "Destekleyici sinyal." },
    { field: "currency", label: "Para Birimi", required: false, example: "TRY", note: "TRY, USD veya EUR." },
    { field: "payment_terms_days", label: "Ödeme Vadesi (gün)", required: false, example: 45, note: "Negatif olamaz." },
    { field: "lead_time_days", label: "Tedarik Süresi (gün)", required: false, example: 21, note: "Negatif olamaz." },
    { field: "address", label: "Adres", required: false, example: "Amasya", note: "Opsiyonel." },
    { field: "notes", label: "Notlar", required: false, example: "Ana tedarikçi", note: "Opsiyonel." },
];

const stockCountColumns: ExcelTemplateColumn[] = [
    { field: "sku", label: "SKU", required: true, example: "GV-A105-600", note: "Ürün exact match." },
    { field: "on_hand", label: "Sayılan Miktar", required: true, example: 42, note: "Sayım sonucu. Negatif olamaz." },
    { field: "warehouse", label: "Depo/Lokasyon", required: false, example: "Ana Depo", note: "Transfer fazında lokasyon için kullanılır." },
    { field: "notes", label: "Not", required: false, example: "Yıl sonu sayımı", note: "Stok hareket notu." },
];

const stockMovementColumns: ExcelTemplateColumn[] = [
    { field: "sku", label: "SKU", required: true, example: "GV-A105-600", note: "Ürün exact match." },
    { field: "on_hand", label: "Miktar", required: true, example: 5, note: "Pozitif sayı. Yön ayrıca seçilir." },
    { field: "direction", label: "Yön", required: true, example: "in", note: "in, out veya transfer." },
    { field: "from_location", label: "Çıkış Lokasyonu", required: false, example: "Ana Depo", note: "Transfer için gerekir." },
    { field: "to_location", label: "Giriş Lokasyonu", required: false, example: "Şube Depo", note: "Transfer için gerekir." },
    { field: "notes", label: "Not", required: false, example: "Manuel stok girişi", note: "Stok hareket notu." },
];

const vendorProductColumns: ExcelTemplateColumn[] = [
    { field: "sku", label: "Ürün SKU", required: true, example: "GV-A105-600", note: "Ürün exact match." },
    { field: "vendor_name", label: "Tedarikçi Adı", required: true, example: "PMT Amasya", note: "Tedarikçi exact/manuel eşleşme." },
    { field: "vendor_email", label: "Tedarikçi E-posta", required: false, example: "sales@pmt.com", note: "Tedarikçi eşleşme sinyali." },
    { field: "vendor_sku", label: "Tedarikçi Ürün Kodu", required: false, example: "PMT-GV-600", note: "Tedarikçinin kendi ürün kodu." },
    { field: "lead_time_days", label: "Tedarik Süresi (gün)", required: false, example: 21, note: "Negatif olamaz." },
    { field: "moq", label: "MOQ", required: false, example: 10, note: "Minimum sipariş miktarı." },
    { field: "is_preferred", label: "Tercihli", required: false, example: true, note: "true/false, evet/hayır kabul edilir." },
    { field: "notes", label: "Not", required: false, example: "Ana tedarik ilişkisi", note: "Opsiyonel." },
];

export const EXCEL_IMPORT_TEMPLATES: Record<ExcelImportTemplateKind, ExcelTemplateDefinition> = {
    product: {
        kind: "product",
        entityType: "product",
        operationType: "product_update",
        title: "Ürünler",
        sheetName: "Urunler",
        description: "Ürün ana kayıtlarını oluşturmak veya güncellemek için.",
        columns: productColumns,
    },
    customer: {
        kind: "customer",
        entityType: "customer",
        operationType: "customer_upsert",
        title: "Müşteriler",
        sheetName: "Musteriler",
        description: "Müşteri kayıtlarını e-posta/kod öncelikli eşleştirmek için.",
        columns: customerColumns,
    },
    vendor: {
        kind: "vendor",
        entityType: "vendor",
        operationType: "vendor_upsert",
        title: "Tedarikçiler",
        sheetName: "Tedarikciler",
        description: "Tedarikçi kayıtlarını e-posta/kod sinyalleriyle eşleştirmek için.",
        columns: vendorColumns,
    },
    stock_count: {
        kind: "stock_count",
        entityType: "stock",
        operationType: "stock_count",
        title: "Stok Sayımı",
        sheetName: "Stok_Sayimi",
        description: "Sayılan miktarı mevcut stokla karşılaştırıp fark hareketi oluşturmak için.",
        columns: stockCountColumns,
    },
    stock_movement: {
        kind: "stock_movement",
        entityType: "stock",
        operationType: "stock_movement",
        title: "Stok Hareketi",
        sheetName: "Stok_Hareketleri",
        description: "Giriş, çıkış veya transfer stok hareketlerini işlemek için.",
        columns: stockMovementColumns,
    },
    vendor_product_relation: {
        kind: "vendor_product_relation",
        entityType: "product",
        operationType: "vendor_product_relation",
        title: "Tedarikçi-Ürün İlişkisi",
        sheetName: "Tedarikci_Urunleri",
        description: "Ürün ile tedarikçi arasındaki operasyonel ilişkiyi yönetmek için.",
        columns: vendorProductColumns,
    },
};

export function isExcelImportTemplateKind(value: unknown): value is ExcelImportTemplateKind {
    return typeof value === "string" && value in EXCEL_IMPORT_TEMPLATES;
}

export function getExcelTemplateDefinition(kind: ExcelImportTemplateKind): ExcelTemplateDefinition {
    return EXCEL_IMPORT_TEMPLATES[kind];
}

export function normalizeImportToken(value: string): string {
    return value.trim()
        .replace(/İ/g, "i").replace(/I/g, "i")
        .toLowerCase()
        .replace(/[ğ]/g, "g").replace(/[ü]/g, "u").replace(/[ş]/g, "s")
        .replace(/[ı]/g, "i").replace(/[ö]/g, "o").replace(/[ç]/g, "c")
        .replace(/[^a-z0-9]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "");
}

export const IMPORT_ALIAS_FIELD_MAP: Record<ClassicImportEntityType, Record<string, string>> = {
    customer: {
        firma: "name", firma_adi: "name", musteri: "name", musteri_adi: "name", cari: "name", ad: "name", isim: "name",
        email: "email", mail: "email", eposta: "email", e_posta: "email", mail_adresi: "email", musteri_e_posta: "email", musteri_email: "email",
        telefon: "phone", tel: "phone", phone: "phone",
        ulke: "country", country: "country",
        para_birimi: "currency", doviz: "currency",
        vergi_no: "tax_number", vergi_numarasi: "tax_number", tax_no: "tax_number",
        vergi_dairesi: "tax_office",
        adres: "address", address: "address",
        notlar: "notes", not: "notes",
        odeme_vadesi: "payment_terms_days", odeme_vadesi_gun: "payment_terms_days",
        musteri_kodu: "customer_code", cari_kodu: "customer_code", code: "customer_code",
        incoterm: "default_incoterm", varsayilan_incoterm: "default_incoterm",
    },
    vendor: {
        tedarikci: "name", tedarikci_adi: "name", firma: "name", firma_adi: "name", ad: "name", isim: "name",
        email: "contact_email", mail: "contact_email", eposta: "contact_email", e_posta: "contact_email", tedarikci_email: "contact_email",
        telefon: "contact_phone", tel: "contact_phone", phone: "contact_phone",
        yetkili: "contact_person", ilgili_kisi: "contact_person", contact: "contact_person",
        vergi_no: "tax_number", vergi_numarasi: "tax_number",
        adres: "address",
        para_birimi: "currency", doviz: "currency",
        odeme_vadesi: "payment_terms_days", odeme_vadesi_gun: "payment_terms_days",
        tedarik_suresi: "lead_time_days", tedarik_suresi_gun: "lead_time_days", lead_time: "lead_time_days", lead_time_gun: "lead_time_days",
        notlar: "notes", not: "notes",
    },
    product: {
        urun_adi: "name", product_name: "name", malzeme_adi: "name", ad: "name", isim: "name",
        urun_kodu: "sku", stok_kodu: "sku", malzeme_kodu: "sku", sku: "sku", kod: "sku",
        kategori: "category", category: "category",
        olcu_birimi: "unit", birim: "unit", unit: "unit",
        liste_fiyati: "price", liste_fiyati_usd: "price", satis_fiyati: "price", fiyat: "price", price: "price",
        maliyet: "cost_price", maliyet_fiyati: "cost_price", standart_maliyet: "cost_price", cost: "cost_price", cost_price: "cost_price",
        para_birimi: "currency", doviz: "currency",
        min_stok: "min_stock_level", guvenlik_stogu: "min_stock_level", min_siparis_miktari: "min_stock_level",
        urun_ailesi: "product_family", alt_kategori: "sub_category", sektor_uygunlugu: "sector_compatibility",
        agirlik: "weight_kg", birim_agirlik_kg: "weight_kg",
        malzeme: "material_quality", malzeme_kalitesi: "material_quality",
        mensei: "origin_country", origin: "origin_country",
        uretim_tesisi: "production_site", tesis: "production_site",
        kullanim: "use_cases", kullanim_alanlari: "use_cases",
        sektorler: "industries", standartlar: "standards", sertifikalar: "certifications",
        urun_notlari: "product_notes", notlar: "product_notes",
        tedarik_suresi: "lead_time_days", tedarik_suresi_gun: "lead_time_days", lead_time: "lead_time_days",
        yeniden_siparis_miktari: "reorder_qty", moq: "moq", minimum_order_quantity: "moq",
        tercihli_tedarikci: "preferred_vendor", tedarikci: "vendor_name", tedarikci_adi: "vendor_name",
        tedarikci_email: "vendor_email", tedarikci_mail: "vendor_email",
        tedarikci_urun_kodu: "vendor_sku", tedarikci_sku: "vendor_sku",
        tercihli: "is_preferred", preferred: "is_preferred",
    },
    stock: {
        urun_kodu: "sku", stok_kodu: "sku", malzeme_kodu: "sku", sku: "sku",
        stok: "on_hand", stok_miktari: "on_hand", miktar: "on_hand", sayim: "on_hand", sayilan_miktar: "on_hand", qty: "on_hand", adet: "on_hand",
        yon: "direction", hareket_yonu: "direction", direction: "direction", islem: "direction",
        depo: "warehouse", lokasyon: "warehouse", warehouse: "warehouse",
        cikis_lokasyonu: "from_location", kaynak_lokasyon: "from_location", from_location: "from_location",
        giris_lokasyonu: "to_location", hedef_lokasyon: "to_location", to_location: "to_location",
        not: "notes", notlar: "notes",
    },
};

export function getAliasFieldMap(entityType: string): Record<string, string> {
    return IMPORT_ALIAS_FIELD_MAP[entityType as ClassicImportEntityType] ?? {};
}

// ── Faz B — Tip-özel Excel şablonu + satırdan teknik attributes ─────────────

/** Tip-özel şablonda ürün tipini taşıyan kolon (önceden doldurulur). */
export const PRODUCT_TYPE_TEMPLATE_COLUMN = "urun_tipi";

export interface ProductTypeTemplateColumn {
    field: string;          // başlık (field_key veya sabit kolon adı)
    label: string;          // Türkçe başlık
    required: boolean;
    example: string | number | boolean;
    note: string;
    /** AI/confirm tarafı için: bu kolon ürün-tipi teknik alanı mı? */
    isAttribute: boolean;
}

const PRODUCT_FIELD_TYPE_HINT: Record<ProductFieldType, string> = {
    text: "metin",
    number: "sayı",
    select: "tek seçim",
    multiselect: "çoklu seçim (virgülle)",
    date: "tarih (YYYY-AA-GG)",
    boolean: "evet/hayır",
    longtext: "uzun metin",
};

/**
 * Bir ürün tipi için indirilebilir Excel şablonunun kolonlarını üretir.
 * Sabit kimlik kolonları (sku/name/unit) + tip kolonu (önceden doldurulu) +
 * seçili core master-data alanları + tipin teknik field_key kolonları.
 */
export function buildProductTypeTemplateColumns(
    typeName: string,
    fields: ProductTypeFieldRow[],
): ProductTypeTemplateColumn[] {
    const base: ProductTypeTemplateColumn[] = [
        { field: "sku", label: "SKU", required: true, example: "GV-A105-600", note: "Ürün için benzersiz kod.", isAttribute: false },
        { field: "name", label: "Ürün Adı", required: true, example: "Sürgülü Vana A105", note: "Ürün adı.", isAttribute: false },
        { field: "unit", label: "Birim", required: true, example: "adet", note: "adet, kg, metre gibi.", isAttribute: false },
        { field: PRODUCT_TYPE_TEMPLATE_COLUMN, label: "Ürün Tipi", required: true, example: typeName, note: "Bu sütunu değiştirme — teknik alanların hangi tipe ait olduğunu belirler.", isAttribute: false },
        { field: "category", label: "Kategori", required: false, example: "Vana", note: "Opsiyonel serbest kategori.", isAttribute: false },
        { field: "material_quality", label: "Malzeme Kalitesi", required: false, example: "A105", note: "Opsiyonel.", isAttribute: false },
        { field: "standards", label: "Standartlar", required: false, example: "API 600", note: "Virgülle ayrılabilir.", isAttribute: false },
    ];

    const techCols: ProductTypeTemplateColumn[] = fields.map(f => {
        const opts = f.options?.length ? ` Seçenekler: ${f.options.join(", ")}.` : "";
        const unit = f.unit ? ` Birim: ${f.unit}.` : "";
        return {
            field: f.field_key,
            label: f.label_tr,
            required: f.required,
            example: f.options?.length ? f.options[0] : (f.field_type === "number" ? 0 : ""),
            note: `${PRODUCT_FIELD_TYPE_HINT[f.field_type]}.${unit}${opts}`.trim(),
            isAttribute: true,
        };
    });

    return [...base, ...techCols];
}

/**
 * Confirm sırasında bir ürün satırının ham verisinden, verilen ürün tipinin
 * teknik field_key'lerine uyan değerleri toplar + normalize eder.
 * - select/multiselect: değer string'e indirgenir (multiselect virgülle parse).
 * - number: sonlu sayı; değilse drop.
 * - boolean: parseBooleanLike.
 * - boş/null → drop (silme yok; fill-empty/overwrite kararı apply'da).
 */
export function collectTypeAttributesFromRow(
    data: Record<string, unknown>,
    fields: ProductTypeFieldRow[],
): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const f of fields) {
        const raw = data[f.field_key];
        if (raw === null || raw === undefined || raw === "") continue;
        if (f.field_type === "number") {
            const num = typeof raw === "number" ? raw : Number(String(raw).replace(",", "."));
            if (!Number.isFinite(num)) continue;
            out[f.field_key] = num;
        } else if (f.field_type === "boolean") {
            const b = parseBooleanLike(raw);
            if (b === undefined) continue;
            out[f.field_key] = b;
        } else if (f.field_type === "multiselect") {
            const arr = String(raw).split(",").map(s => s.trim()).filter(Boolean);
            if (arr.length === 0) continue;
            out[f.field_key] = arr;
        } else {
            const s = String(raw).trim();
            if (s.length === 0) continue;
            out[f.field_key] = s.slice(0, 500);
        }
    }
    return out;
}

export function getAllowedFieldLabels(entityType: string): Map<string, string> {
    const fields = IMPORT_FIELDS[entityType] ?? [];
    return new Map(fields.map(field => [field.field, field.label]));
}

export function mapHeaderToField(header: string, entityType: string): string | null {
    const normalized = normalizeImportToken(header);
    return getAliasFieldMap(entityType)[normalized] ?? null;
}

export function detectSheetEntityType(
    sheetName: string,
    headers: string[],
): { entityType: ClassicImportEntityType | null; confidence: number; reason: string } {
    const name = normalizeImportToken(sheetName);
    const direct: Record<string, ClassicImportEntityType> = {
        urunler: "product",
        urun: "product",
        products: "product",
        musteriler: "customer",
        musteri: "customer",
        customers: "customer",
        tedarikciler: "vendor",
        tedarikci: "vendor",
        vendors: "vendor",
        stok: "stock",
        stok_sayimi: "stock",
        stok_hareketleri: "stock",
        stock: "stock",
    };
    if (direct[name]) {
        return { entityType: direct[name], confidence: 1, reason: "sheet_name" };
    }

    const scores = new Map<ClassicImportEntityType, number>();
    for (const entityType of EXCEL_IMPORT_ENTITY_TYPES) scores.set(entityType, 0);
    for (const header of headers) {
        for (const entityType of EXCEL_IMPORT_ENTITY_TYPES) {
            if (mapHeaderToField(header, entityType)) {
                scores.set(entityType, (scores.get(entityType) ?? 0) + 1);
            }
        }
    }
    const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
    const [bestEntity, bestScore] = ranked[0] ?? [null, 0];
    const secondScore = ranked[1]?.[1] ?? 0;
    if (!bestEntity || bestScore === 0) {
        return { entityType: null, confidence: 0, reason: "no_signal" };
    }
    const confidence = Math.min(0.95, bestScore / Math.max(3, headers.length));
    if (bestScore === secondScore) {
        return { entityType: null, confidence: 0.35, reason: "ambiguous_columns" };
    }
    return { entityType: bestEntity, confidence, reason: "column_signal" };
}

export function defaultFieldApprovals(fields: Record<string, unknown>): ImportFieldApprovals {
    return Object.fromEntries(
        Object.keys(fields)
            .filter(field => field !== "__ai_import_operation")
            .map(field => [field, FINANCIAL_IMPORT_FIELDS.has(field) ? "skip" : "apply"]),
    );
}

export function riskFlagsForFields(fields: Record<string, unknown>): string[] {
    const flags: string[] = [];
    for (const field of Object.keys(fields)) {
        if (FINANCIAL_IMPORT_FIELDS.has(field)) flags.push(`financial:${field}`);
    }
    return flags;
}

export function suggestSkuFromName(name: string, sequence = 1): string {
    const base = normalizeImportToken(name)
        .split("_")
        .filter(Boolean)
        .map(part => part.slice(0, 4).toUpperCase())
        .slice(0, 4)
        .join("-");
    const suffix = String(sequence).padStart(3, "0");
    return `${base || "SKU"}-${suffix}`;
}

export function parseBooleanLike(value: unknown): boolean | undefined {
    if (typeof value === "boolean") return value;
    if (value === null || value === undefined || value === "") return undefined;
    const normalized = normalizeImportToken(String(value));
    if (["true", "evet", "e", "yes", "y", "1"].includes(normalized)) return true;
    if (["false", "hayir", "h", "no", "n", "0"].includes(normalized)) return false;
    return undefined;
}

export function normalizeStockDirection(value: unknown): "in" | "out" | "transfer" | undefined {
    if (value === null || value === undefined || value === "") return undefined;
    const normalized = normalizeImportToken(String(value));
    if (["in", "giris", "girdi", "arti", "receipt", "stok_girisi"].includes(normalized)) return "in";
    if (["out", "cikis", "cikti", "eksi", "shipment", "stok_cikisi"].includes(normalized)) return "out";
    if (["transfer", "aktarma", "depo_transferi"].includes(normalized)) return "transfer";
    return undefined;
}
