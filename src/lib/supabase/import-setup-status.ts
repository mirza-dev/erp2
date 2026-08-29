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
    ]);

    const errored = [
        productTypesTotal, typeFieldRows, productsTotal, productsWithoutType,
        productsWithoutSku, customersTotal, vendorsTotal, vendorLinks,
        productsWithPreferred, productsWithStock,
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
    };
}
