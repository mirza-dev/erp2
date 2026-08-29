/**
 * `products.preferred_vendor_id` / `preferred_vendor` alanlarını
 * `product_vendor_links.is_preferred` gerçeğinden tazeler.
 *
 * SORUN: tercihli tedarikçinin iki temsili var —
 *   product_vendor_links.is_preferred  → ilişki tablosu, GERÇEK kayıt
 *   products.preferred_vendor_id       → denormalize kopya, ÖNERİ BUNU OKUR
 *
 * `dbUpsertProductVendorLink` ikisini birlikte yazar
 * (src/lib/supabase/product-vendor-links.ts:52). Ama alt tabloya DOĞRUDAN
 * insert eden yollar (seed gibi) senkronu atlar. Ayrıştıklarında satın alma
 * önerisi `preferredVendorId`'yi null görür ve HER kalem "tedarikçisiz"
 * kovasına düşer (purchase/suggested/page.tsx:1239) — veri cevabı bilmesine
 * rağmen kullanıcı her satırda elle tedarikçi seçmek zorunda kalır.
 *
 * Yön TEK YÖNLÜ: ilişki tablosu kaynaktır, products'a yazılır. Tersi değil.
 *
 * Varsayılan KURU ÇALIŞMA. Yazmak için: --uygula
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const UYGULA = process.argv.includes("--uygula");

async function main() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        console.error("NEXT_PUBLIC_SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY gerekli (.env.local).");
        process.exit(1);
    }
    const sb = createClient(url, key);

    const { data: links, error: e1 } = await sb
        .from("product_vendor_links")
        .select("product_id, vendor_id, lead_time_days, moq")
        .eq("is_preferred", true);
    if (e1) throw new Error(e1.message);

    if (!links || links.length === 0) {
        console.log("Tercihli işaretli bağ yok — yapılacak bir şey yok.");
        return;
    }

    // Aynı üründe birden çok tercihli bağ olamaz — olursa yazmak yerine bildir.
    const sayac = new Map<string, number>();
    for (const l of links) sayac.set(l.product_id, (sayac.get(l.product_id) ?? 0) + 1);
    const cakisan = [...sayac.entries()].filter(([, n]) => n > 1);

    const { data: products, error: e2 } = await sb
        .from("products")
        .select("id, sku, name, preferred_vendor_id, preferred_vendor");
    if (e2) throw new Error(e2.message);
    const urunById = new Map((products ?? []).map(p => [p.id as string, p]));

    const { data: vendors, error: e3 } = await sb.from("vendors").select("id, name");
    if (e3) throw new Error(e3.message);
    const tedarikciById = new Map((vendors ?? []).map(v => [v.id as string, v.name as string]));

    const yapilacak = links.filter(l => {
        if ((sayac.get(l.product_id) ?? 0) > 1) return false;
        return urunById.get(l.product_id)?.preferred_vendor_id !== l.vendor_id;
    });

    console.log(`${links.length} tercihli bağ · ${yapilacak.length} tanesi products ile ayrışmış\n`);
    console.log("─".repeat(70));

    for (const l of yapilacak) {
        const u = urunById.get(l.product_id);
        const tedAd = tedarikciById.get(l.vendor_id) ?? "(bilinmeyen tedarikçi)";
        console.log(`\n  ${u?.sku ?? l.product_id} — ${u?.name ?? "?"}`);
        console.log(`    preferred_vendor_id: ${u?.preferred_vendor_id ?? "—"} → ${l.vendor_id}`);
        console.log(`    preferred_vendor   : ${u?.preferred_vendor ?? "—"} → ${tedAd}`);
    }

    for (const [pid, n] of cakisan) {
        const u = urunById.get(pid);
        console.log(`\n  ⚠ ${u?.sku ?? pid} ATLANDI — ${n} tercihli bağ birden ` +
            `(tek tercihli olmalı; hangisi doğru, elle karar verin)`);
    }

    console.log("\n" + "─".repeat(70));

    if (yapilacak.length === 0 && cakisan.length === 0) {
        console.log("\n✅ Hepsi senkron — yazılacak bir şey yok.");
        return;
    }

    if (!UYGULA) {
        console.log(`\nKURU ÇALIŞMA — hiçbir şey yazılmadı.`);
        console.log(`Uygulamak için: npx tsx scripts/repair-preferred-vendor.ts --uygula`);
        return;
    }

    let ok = 0;
    for (const l of yapilacak) {
        const tedAd = tedarikciById.get(l.vendor_id);
        if (!tedAd) {
            console.error(`  ✗ ${l.product_id}: tedarikçi bulunamadı (${l.vendor_id})`);
            continue;
        }
        // NOT: `dbUpsertProductVendorLink` burada lead_time_days/reorder_qty'yi de
        // tazeliyor. Bu araç ONLARI YAZMAZ — mevcut ürün değerleri elle
        // düzeltilmiş olabilir ve tercihli tedarikçiyi senkronlamak onları
        // ezmek için gerekçe değil.
        const { error } = await sb
            .from("products")
            .update({ preferred_vendor_id: l.vendor_id, preferred_vendor: tedAd })
            .eq("id", l.product_id);
        if (error) console.error(`  ✗ ${l.product_id}: ${error.message}`);
        else { ok++; console.log(`  ✓ ${urunById.get(l.product_id)?.sku ?? l.product_id} → ${tedAd}`); }
    }
    console.log(`\n${ok}/${yapilacak.length} ürün senkronlandı.`);
    console.log(`\nDoğrulama: npm run check:chains  (5. zincir)`);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
