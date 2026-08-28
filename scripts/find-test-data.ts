/**
 * Teslim öncesi test/E2E artığı veri raporu — SALT OKUNUR.
 *
 * Fabrikaya kurulum öncesi canlı veride test kalıntısı bırakılmamalı: canlıda
 * 29 satış siparişinin ~17'si `Test Müşterisi 1781860…`, carilerde
 * `E2E Müşteri 178…`, tek RFQ'nun başlığı `zrxdjfgchvj` (2026-08-24 tespiti).
 *
 * Bu script HİÇBİR ŞEY SİLMEZ — yalnız neyin test artığı göründüğünü listeler.
 * Silme kararı ve işlemi kullanıcıya aittir (bkz. çıktının sonundaki not).
 *
 * Kullanım: npx tsx scripts/find-test-data.ts
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { matchTestDataPattern, isGibberishTitle } from "../src/lib/test-data-patterns";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
    console.error("MISSING ENV: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
}
const sb = createClient(url, key);




async function main() {
    console.log("Test/E2E artığı taraması — SALT OKUNUR (hiçbir şey silinmez)\n");
    let total = 0;

    // ── Cariler ──────────────────────────────────────────────────────────────
    const { data: customers, error: cErr } = await sb
        .from("customers").select("id,name,email,is_active");
    if (cErr) throw new Error(`customers: ${cErr.message}`);
    const badCustomers = (customers ?? []).filter(
        c => matchTestDataPattern(c.name) || matchTestDataPattern(c.email),
    );
    console.log(`CARİLER: ${badCustomers.length} / ${customers?.length ?? 0} şüpheli`);
    for (const c of badCustomers) {
        console.log(`  · ${c.name}${c.email ? ` <${c.email}>` : ""}  [${c.id.slice(0, 8)}]`);
    }
    total += badCustomers.length;

    // Bu carilerin siparişleri — silmenin FK etkisini önceden göster.
    const badIds = new Set(badCustomers.map(c => c.id));
    const { data: orders, error: oErr } = await sb
        .from("sales_orders").select("id,order_number,customer_id,customer_name,commercial_status");
    if (oErr) throw new Error(`sales_orders: ${oErr.message}`);
    const badOrders = (orders ?? []).filter(
        o => (o.customer_id && badIds.has(o.customer_id)) || matchTestDataPattern(o.customer_name),
    );
    console.log(`\nSATIŞ SİPARİŞLERİ: ${badOrders.length} / ${orders?.length ?? 0} şüpheli`);
    const byStatus: Record<string, number> = {};
    for (const o of badOrders) byStatus[o.commercial_status] = (byStatus[o.commercial_status] ?? 0) + 1;
    console.log(`  durum dağılımı: ${JSON.stringify(byStatus)}`);
    for (const o of badOrders.slice(0, 5)) console.log(`  · ${o.order_number} — ${o.customer_name}`);
    if (badOrders.length > 5) console.log(`  … +${badOrders.length - 5} tane daha`);
    total += badOrders.length;

    // ── Teklifler ────────────────────────────────────────────────────────────
    const { data: quotes, error: qErr } = await sb
        .from("quotes").select("id,quote_number,customer_name,status");
    if (qErr) throw new Error(`quotes: ${qErr.message}`);
    const badQuotes = (quotes ?? []).filter(q => matchTestDataPattern(q.customer_name));
    console.log(`\nTEKLİFLER: ${badQuotes.length} / ${quotes?.length ?? 0} şüpheli`);
    for (const q of badQuotes) console.log(`  · ${q.quote_number} — ${q.customer_name} (${q.status})`);
    total += badQuotes.length;

    // ── Fiyat talepleri (RFQ) ────────────────────────────────────────────────
    const { data: rfqs, error: rErr } = await sb
        .from("supplier_rfqs").select("id,rfq_number,title,status");
    if (rErr) throw new Error(`supplier_rfqs: ${rErr.message}`);
    const badRfqs = (rfqs ?? []).filter(r => matchTestDataPattern(r.title) || isGibberishTitle(r.title));
    console.log(`\nFİYAT TALEPLERİ: ${badRfqs.length} / ${rfqs?.length ?? 0} şüpheli`);
    for (const r of badRfqs) console.log(`  · ${r.rfq_number} — "${r.title}" (${r.status})`);
    total += badRfqs.length;

    // ── Ürünler (gerçek katalog — burada artık beklenmiyor) ──────────────────
    const { data: products, error: pErr } = await sb
        .from("products").select("id,sku,name,is_active");
    if (pErr) throw new Error(`products: ${pErr.message}`);
    const badProducts = (products ?? []).filter(p => matchTestDataPattern(p.name) || matchTestDataPattern(p.sku));
    console.log(`\nÜRÜNLER: ${badProducts.length} / ${products?.length ?? 0} şüpheli`);
    for (const p of badProducts) console.log(`  · ${p.sku} — ${p.name}`);
    total += badProducts.length;

    console.log(`\n${"─".repeat(60)}`);
    console.log(`TOPLAM ŞÜPHELİ KAYIT: ${total}`);
    console.log(`
Bu script hiçbir şey silmez. Silmeden önce:
  1. Listeyi gözden geçirin — gerçek bir kayıt yanlışlıkla eşleşmiş olabilir.
  2. Sipariş/teklif silmek stok rezervasyonlarını ve audit_log'u etkiler;
     cari silmek siparişi varsa FK guard'ıyla 409 döner (doğru davranış).
  3. Temiz bir başlangıç isteniyorsa tercih edilen yol tek tek silmek DEĞİL,
     Ayarlar → Demo Hazırlık ile veriyi sıfırlayıp gerçek katalogla yeniden
     kurmaktır.`);
}

main().catch(err => {
    console.error("HATA:", err instanceof Error ? err.message : err);
    process.exit(1);
});
