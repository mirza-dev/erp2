/**
 * Canlıdaki test/deneme artıklarını temizler — kurulum günü öncesi.
 *
 * NEDEN: `find-test-data` bunları buluyor ama silmiyor (bilinçli). Fabrikada
 * ekip "Test Müşterisi 1781860193444" kayıtlarını Son Siparişler panelinde,
 * "mrz" ürün tipini form açılır listesinde görecek. Gerçek veriyle karışmadan
 * temizlenmeli.
 *
 * SİLME SIRASI ZORUNLU — ters sırada FK guard'ı 409 döndürür:
 *   1. sipariş satırları + siparişler   (cari FK'sini serbest bırakır)
 *   2. cariler
 *   3. RFQ (alt tabloları cascade)
 *   4. kullanılmayan test ürün tipi
 *
 * GÜVENLİK ÖN KOŞULLARI — sağlanmazsa o kayıt ATLANIR, script devam eder:
 *   · sipariş `unallocated` olmalı (rezervasyon tutan sipariş silinmez;
 *     önce iptal edilmeli ki rezervasyon düzgün çözülsün)
 *   · ürün tipi hiçbir üründe kullanılmıyor olmalı
 *
 * Her silme `audit_log`'a yazılır — geriye dönük olarak ne silindiği görülür.
 * Varsayılan KURU ÇALIŞMA. Yazmak için: --uygula
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const UYGULA = process.argv.includes("--uygula");

/** find-test-data ile AYNI desenler — tek kaynak olması için oradan türetildi. */
const TEST_CARI_DESENLERI = [/^Test Müşterisi \d+/i, /^E2E Müşteri \d+/i, /@testfirma\.com$/i];
const TEST_URUN_TIPLERI = ["mrz", "sagsage"];

function testCarisiMi(ad: string, email: string | null): boolean {
    return TEST_CARI_DESENLERI.some(r => r.test(ad) || (email ? r.test(email) : false));
}

async function audit(sb: SupabaseClient, action: string, entityType: string, id: string, before: unknown) {
    await sb.from("audit_log").insert({
        actor: null, action, entity_type: entityType, entity_id: id,
        before_state: before, source: "script:cleanup-test-data",
    });
}

async function main() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        console.error("NEXT_PUBLIC_SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY gerekli (.env.local).");
        process.exit(1);
    }
    const sb = createClient(url, key);

    // ── 1. Test carileri ve onların siparişleri ──────────────────────────────
    const { data: cariler, error: e1 } = await sb.from("customers").select("id, name, email");
    if (e1) throw new Error(e1.message);
    const testCariler = (cariler ?? []).filter(c => testCarisiMi(c.name as string, c.email as string | null));
    const testCariIds = new Set(testCariler.map(c => c.id as string));

    const { data: siparisler, error: e2 } = await sb
        .from("sales_orders")
        .select("id, order_number, customer_id, customer_name, commercial_status, fulfillment_status");
    if (e2) throw new Error(e2.message);

    const testSiparisler = (siparisler ?? []).filter(o =>
        testCariIds.has(o.customer_id as string) || testCarisiMi(String(o.customer_name ?? ""), null),
    );
    // Rezervasyon tutan sipariş SİLİNMEZ — önce iptal edilmeli.
    const silinebilirSiparis = testSiparisler.filter(o => o.fulfillment_status === "unallocated");
    const rezerveliSiparis = testSiparisler.filter(o => o.fulfillment_status !== "unallocated");

    // ── 2. Test RFQ'ları ────────────────────────────────────────────────────
    const { data: rfqs } = await sb.from("supplier_rfqs").select("id, rfq_number, title, status");
    const testRfqs = (rfqs ?? []).filter(r => {
        const t = String(r.title ?? "");
        // Sesli harf içermeyen 6+ harflik dizi = klavye ezmesi (zrxdjfgchvj).
        return t.length >= 6 && !/[aeıioöuüAEIİOÖUÜ]/.test(t);
    });

    // ── 3. Kullanılmayan test ürün tipleri ──────────────────────────────────
    const { data: tipler } = await sb.from("product_types").select("id, name");
    const { data: urunler } = await sb.from("products").select("product_type_id");
    const kullanilanTipler = new Set((urunler ?? []).map(p => p.product_type_id as string).filter(Boolean));
    const testTipler = (tipler ?? []).filter(t =>
        TEST_URUN_TIPLERI.includes(String(t.name).toLowerCase()) && !kullanilanTipler.has(t.id as string),
    );
    const kullanilanTestTipler = (tipler ?? []).filter(t =>
        TEST_URUN_TIPLERI.includes(String(t.name).toLowerCase()) && kullanilanTipler.has(t.id as string),
    );

    // ── Rapor ───────────────────────────────────────────────────────────────
    console.log("Test artığı temizliği" + (UYGULA ? " — UYGULANIYOR" : " — KURU ÇALIŞMA") + "\n");
    console.log("─".repeat(64));

    console.log(`\n1) SİPARİŞLER — ${silinebilirSiparis.length} silinecek`);
    for (const o of silinebilirSiparis) {
        console.log(`   · ${o.order_number} — ${o.customer_name} (${o.commercial_status})`);
    }
    for (const o of rezerveliSiparis) {
        console.log(`   ⚠ ${o.order_number} ATLANDI — ${o.fulfillment_status}, stok rezerve tutuyor.`);
        console.log(`     Önce ekrandan iptal edin (rezervasyon o zaman düzgün çözülür).`);
    }

    console.log(`\n2) CARİLER — ${testCariler.length} silinecek`);
    for (const c of testCariler.slice(0, 6)) console.log(`   · ${c.name}`);
    if (testCariler.length > 6) console.log(`   … +${testCariler.length - 6} tane daha`);

    console.log(`\n3) FİYAT TALEPLERİ — ${testRfqs.length} silinecek`);
    for (const r of testRfqs) {
        console.log(`   · ${r.rfq_number} — "${r.title}" (${r.status})`);
        console.log(`     Not: bağlı tedarikçi fiyat geçmişi KALIR, yalnız kaynak bağı boşalır.`);
    }

    console.log(`\n4) ÜRÜN TİPLERİ — ${testTipler.length} silinecek`);
    for (const t of testTipler) console.log(`   · ${t.name} (hiçbir üründe kullanılmıyor)`);
    for (const t of kullanilanTestTipler) {
        console.log(`   ⚠ ${t.name} ATLANDI — ürünlerde kullanılıyor, silmek onları tipsiz bırakır.`);
    }

    const toplam = silinebilirSiparis.length + testCariler.length + testRfqs.length + testTipler.length;
    console.log("\n" + "─".repeat(64));

    if (toplam === 0) {
        console.log("\n✅ Silinecek bir şey yok.");
        return;
    }
    if (!UYGULA) {
        console.log(`\nTOPLAM ${toplam} kayıt silinecek. Hiçbir şey yazılmadı.`);
        console.log(`Uygulamak için: npx tsx scripts/cleanup-test-data.ts --uygula`);
        return;
    }

    // ── Uygula (sıra ZORUNLU) ───────────────────────────────────────────────
    let ok = 0, hata = 0;

    for (const o of silinebilirSiparis) {
        // Satırlar önce — FK.
        await sb.from("sales_order_lines").delete().eq("order_id", o.id);
        const { error } = await sb.from("sales_orders").delete().eq("id", o.id);
        if (error) { console.error(`   ✗ ${o.order_number}: ${error.message}`); hata++; }
        else { await audit(sb, "order_deleted", "sales_order", o.id as string, o); ok++; console.log(`   ✓ ${o.order_number}`); }
    }

    for (const c of testCariler) {
        const { error } = await sb.from("customers").delete().eq("id", c.id);
        if (error) { console.error(`   ✗ ${c.name}: ${error.message}`); hata++; }
        else { await audit(sb, "customer_deleted", "customer", c.id as string, c); ok++; }
    }
    console.log(`   ✓ ${testCariler.length} cari`);

    for (const r of testRfqs) {
        const { error } = await sb.from("supplier_rfqs").delete().eq("id", r.id);
        if (error) { console.error(`   ✗ ${r.rfq_number}: ${error.message}`); hata++; }
        else { await audit(sb, "rfq_deleted", "supplier_rfq", r.id as string, r); ok++; console.log(`   ✓ ${r.rfq_number}`); }
    }

    for (const t of testTipler) {
        const { error } = await sb.from("product_types").delete().eq("id", t.id);
        if (error) { console.error(`   ✗ ${t.name}: ${error.message}`); hata++; }
        else { await audit(sb, "product_type_deleted", "product_type", t.id as string, t); ok++; console.log(`   ✓ ${t.name} tipi`); }
    }

    console.log(`\n${ok} kayıt silindi${hata ? `, ${hata} hata` : ""}.`);
    console.log(`\nDoğrulama: npm run find-test-data  ·  npm run check:chains`);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
