import { createServiceClient } from "./service";

/**
 * Kurulum durumu sayaçları — Veri Aktarım Merkezi'nin "neyi taşıdın, neyi
 * taşımadın" paneli.
 *
 * NEDEN VAR: Veri Aktarım Merkezi dosya BİÇİMİNE göre kurgulanmıştı (Excel mi
 * PDF mi), kullanıcı ise İŞE göre düşünüyor ("ürün listemi yükleyeyim").
 * Sayfayı ilk açan kişiye ne yapabileceğini hiçbir yer söylemiyordu. 2026-08-29
 * ölçümü: modül neredeyse hiç kullanılmamış (2 batch, 3 belge) ve asıl katalog
 * göçü hiç yapılmamış — 42 ürünün 22'si tipsiz.
 *
 * Panel bu sayıları GERÇEK veriden okur; kullanıcının elle işaretlediği bir
 * kontrol listesi değildir. "Tamamlandı" demesi için verinin gerçekten orada
 * olması gerekir.
 *
 * Tüm sorgular `head: true` + `count: "exact"` — satır gövdesi çekilmez.
 */

export interface ImportSetupStatus {
    productTypes: { total: number; withFields: number };
    products: { total: number; withoutType: number; withoutSku: number };
    customers: { total: number };
    vendors: { total: number; productLinks: number; productsWithPreferred: number };
    stock: { productsWithStock: number };
    /**
     * Onboarding genişlemesi (2026-09-16): kurulum "ilk değer anına" kadar
     * uzatıldı. Üç alan da OPSİYONEL — eski fixture'lar derlenmeye devam eder;
     * alan yoksa ilgili adım ÜRETİLMEZ (`buildSetupSteps`).
     */
    /** Firma profili — teklif/PO belgeleri bunsuz unvansız ve logosuz basılır. */
    company?: { nameFilled: boolean; taxNoFilled: boolean; addressFilled: boolean; hasLogo: boolean };
    /** İlk teklif/sipariş — kullanıcının "sistem işe yarıyor" dediği an. */
    documents?: { quotes: number; salesOrders: number };
    /**
     * Auth kullanıcı sayısı — YALNIZ route'ta, istek sahibi admin ise ve CACHE
     * DIŞINDA doldurulur (`unstable_cache` anahtarı global; kişiye göre değişen
     * alan cache'e giremez). `dbGetImportSetupStatus` bunu hiç doldurmaz.
     */
    users?: { total: number };
}

export async function dbGetImportSetupStatus(): Promise<ImportSetupStatus> {
    const supabase = createServiceClient();

    const head = (table: string) =>
        supabase.from(table).select("id", { count: "exact", head: true });

    const [
        productTypesTotal,
        typeFieldRows,
        productsTotal,
        productsWithoutType,
        productsWithoutSku,
        customersTotal,
        vendorsTotal,
        vendorLinks,
        productsWithPreferred,
        productsWithStock,
        companyRow,
        quotesTotal,
        salesOrdersTotal,
    ] = await Promise.all([
        head("product_types"),
        // Alan tanımı OLAN tip sayısı: field satırlarından ayrık tip id'si
        // türetilir (head+count ile "distinct" alınamıyor, bu tek istisna).
        supabase.from("product_type_fields").select("product_type_id"),
        head("products").eq("is_active", true),
        head("products").eq("is_active", true).is("product_type_id", null),
        head("products").eq("is_active", true).is("sku", null),
        head("customers"),
        head("vendors"),
        head("product_vendor_links"),
        head("products").eq("is_active", true).not("preferred_vendor_id", "is", null),
        head("products").eq("is_active", true).gt("on_hand", 0),
        // Tek satırlık firma profili (mig.033 singleton). Satır yoksa hata
        // değil boş kabul — yeni kurulumda seed satırı '' değerlerle gelir.
        supabase.from("company_settings").select("name,tax_no,address,logo_url").limit(1).maybeSingle(),
        head("quotes"),
        head("sales_orders"),
    ]);

    const errored = [
        productTypesTotal, typeFieldRows, productsTotal, productsWithoutType,
        productsWithoutSku, customersTotal, vendorsTotal, vendorLinks,
        productsWithPreferred, productsWithStock, companyRow, quotesTotal, salesOrdersTotal,
    ].find(r => r.error);
    if (errored?.error) throw new Error(errored.error.message);

    const typesWithFields = new Set(
        (typeFieldRows.data ?? []).map(r => (r as { product_type_id: string }).product_type_id),
    );

    return {
        productTypes: {
            total: productTypesTotal.count ?? 0,
            withFields: typesWithFields.size,
        },
        products: {
            total: productsTotal.count ?? 0,
            withoutType: productsWithoutType.count ?? 0,
            withoutSku: productsWithoutSku.count ?? 0,
        },
        customers: { total: customersTotal.count ?? 0 },
        vendors: {
            total: vendorsTotal.count ?? 0,
            productLinks: vendorLinks.count ?? 0,
            productsWithPreferred: productsWithPreferred.count ?? 0,
        },
        stock: { productsWithStock: productsWithStock.count ?? 0 },
        company: {
            nameFilled: filled(companyRow.data?.name),
            taxNoFilled: filled(companyRow.data?.tax_no),
            addressFilled: filled(companyRow.data?.address),
            hasLogo: filled(companyRow.data?.logo_url),
        },
        documents: {
            quotes: quotesTotal.count ?? 0,
            salesOrders: salesOrdersTotal.count ?? 0,
        },
    };
}

/** DB varsayılanı boş string ('') — null ile aynı anlama gelir: doldurulmamış. */
function filled(v: string | null | undefined): boolean {
    return typeof v === "string" && v.trim().length > 0;
}

/**
 * Auth kullanıcı sayısı (Supabase Auth'ta tablo yok; tek kaynak `listUsers`).
 * KOBİ ölçeğinde tek sayfa yeter; 1000'i aşan kurulumda sayaç "en az 1000"
 * anlamına gelir ve adım zaten tamamdır.
 */
export async function dbCountAuthUsers(): Promise<number> {
    const supabase = createServiceClient();
    const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) throw new Error(error.message);
    return data.users.length;
}
