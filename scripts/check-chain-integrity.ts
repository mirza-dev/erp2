/**
 * Uçtan uca zincir bütünlüğü — SALT OKUNUR.
 *
 * Tek tek sayfaların çalışması yetmez; fabrikada asıl önemli olan RAKAMLARIN
 * ZİNCİR BOYUNCA TUTMASI:
 *   1. Teklif → (gönderim) → bağlı sipariş
 *   2. Sipariş satırı → rezervasyon → products.reserved
 *   3. PO → mal kabul → stok hareketi
 *   4. Üretim girişi → stok hareketi
 *
 * Deploy/teslim öncesi `npm run check:chains` ile koşulur. Hiçbir şey yazmaz.
 * Çıkış kodu: 0 = tüm zincirler tutuyor, 1 = en az bir kopukluk.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

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

let failures = 0;
function ok(msg: string) { console.log(`  ✅ ${msg}`); }
function bad(msg: string) { console.log(`  ❌ ${msg}`); failures++; }

async function main() {
    console.log("Uçtan uca zincir bütünlüğü — SALT OKUNUR\n");

    // ── 1. Teklif → sipariş ──────────────────────────────────────────────────
    console.log("1) Teklif → Sipariş");
    const [{ data: quotes }, { data: orders }] = await Promise.all([
        sb.from("quotes").select("id,quote_number,status,grand_total,currency"),
        sb.from("sales_orders").select("id,order_number,quote_id,commercial_status,grand_total,currency"),
    ]);
    const linked = (orders ?? []).filter(o => o.quote_id);
    const qById = new Map((quotes ?? []).map(q => [q.id, q]));

    const orphanLinks = linked.filter(o => !qById.has(o.quote_id as string));
    if (orphanLinks.length === 0) ok(`${linked.length} bağlı siparişin hepsi mevcut bir teklife işaret ediyor`);
    else bad(`${orphanLinks.length} sipariş olmayan teklife bağlı: ${orphanLinks.map(o => o.order_number).join(", ")}`);

    // Kabul edilmiş teklifin siparişi OLMALI.
    const accepted = (quotes ?? []).filter(q => q.status === "accepted");
    const acceptedNoOrder = accepted.filter(q => !linked.some(o => o.quote_id === q.id));
    if (acceptedNoOrder.length === 0) ok(`kabul edilmiş ${accepted.length} teklifin hepsinin siparişi var`);
    else bad(`siparişi olmayan kabul teklifi: ${acceptedNoOrder.map(q => q.quote_number).join(", ")}`);

    // Tutar karşılaştırması YALNIZ canlı (iptal olmayan) siparişlerde anlamlı:
    // teklif revize edilince bağlı sipariş iptal edilir ve totalleri DONMUŞ kalır
    // (V7-A9) — iptal siparişin teklifle birebir olmaması BEKLENEN davranıştır.
    const liveLinked = linked.filter(o => o.commercial_status !== "cancelled");
    const totalMismatch = liveLinked.filter(o => {
        const q = qById.get(o.quote_id as string);
        return q && (Number(q.grand_total) !== Number(o.grand_total) || q.currency !== o.currency);
    });
    if (totalMismatch.length === 0) ok(`canlı bağlı siparişlerin (${liveLinked.length}) tutar/PB'si teklifle birebir`);
    else bad(`tutar uyuşmazlığı: ${totalMismatch.map(o => o.order_number).join(", ")}`);

    // ── 2. Rezervasyon → stok ────────────────────────────────────────────────
    console.log("\n2) Sipariş → Rezervasyon → Stok");
    const [{ data: reservations }, { data: products }] = await Promise.all([
        sb.from("stock_reservations").select("product_id,reserved_qty,status"),
        sb.from("products").select("id,sku,on_hand,reserved"),
    ]);
    const openByProduct = new Map<string, number>();
    for (const r of (reservations ?? []).filter(r => r.status === "open")) {
        openByProduct.set(r.product_id, (openByProduct.get(r.product_id) ?? 0) + Number(r.reserved_qty));
    }
    const drift = (products ?? []).filter(p => Number(p.reserved) !== (openByProduct.get(p.id) ?? 0));
    if (drift.length === 0) ok(`products.reserved açık rezervasyonlarla tutuyor (${openByProduct.size} ürün)`);
    else bad(`reserved drift: ${drift.map(p => `${p.sku}(${p.reserved}≠${openByProduct.get(p.id) ?? 0})`).join(", ")}`);

    const overReserved = (products ?? []).filter(p => Number(p.reserved) > Number(p.on_hand));
    if (overReserved.length === 0) ok("hiçbir üründe reserved > on_hand yok");
    else bad(`reserved > on_hand: ${overReserved.map(p => p.sku).join(", ")}`);

    // ── 3. PO → mal kabul → stok hareketi ────────────────────────────────────
    console.log("\n3) Satın alma → Mal kabul → Stok hareketi");
    const [{ data: poLines }, { data: movements }] = await Promise.all([
        sb.from("purchase_order_lines").select("product_id,quantity,received_qty"),
        sb.from("inventory_movements").select("movement_type,quantity"),
    ]);
    const receivedTotal = (poLines ?? []).reduce((s, l) => s + Number(l.received_qty ?? 0), 0);
    const receiptTotal = (movements ?? [])
        .filter(m => m.movement_type === "receipt")
        .reduce((s, m) => s + Number(m.quantity), 0);
    if (receivedTotal === receiptTotal) ok(`mal kabul (${receivedTotal}) = receipt hareketi (${receiptTotal})`);
    else bad(`mal kabul ${receivedTotal} ≠ receipt hareketi ${receiptTotal}`);

    const overReceived = (poLines ?? []).filter(l => Number(l.received_qty ?? 0) > Number(l.quantity));
    if (overReceived.length === 0) ok("aşırı kabul yok (received ≤ sipariş miktarı)");
    else bad(`${overReceived.length} PO satırında received > quantity`);

    // ── 4. Üretim → stok hareketi ────────────────────────────────────────────
    console.log("\n4) Üretim girişi → Stok hareketi");
    const { data: entries } = await sb.from("production_entries").select("produced_qty,scrap_qty");
    // scrap KASITLI düşülmez (domain kuralı) → hareket = produced_qty toplamı.
    const producedTotal = (entries ?? []).reduce((s, e) => s + Number(e.produced_qty), 0);
    const productionMvTotal = (movements ?? [])
        .filter(m => m.movement_type === "production")
        .reduce((s, m) => s + Number(m.quantity), 0);
    if (producedTotal === productionMvTotal) ok(`üretim (${producedTotal}) = production hareketi (${productionMvTotal})`);
    else bad(`üretim ${producedTotal} ≠ production hareketi ${productionMvTotal}`);

    // ── 5. Tercihli tedarikçi → satın alma önerisi ───────────────────────────
    // İki temsil var ve senkron kalmak ZORUNDA:
    //   product_vendor_links.is_preferred  (ilişki tablosu — gerçek kayıt)
    //   products.preferred_vendor_id       (denormalize — öneri BUNU okur)
    // `dbUpsertProductVendorLink` ikisini birlikte yazar, ama alt tabloya
    // DOĞRUDAN insert eden her yol (seed gibi) senkronu atlar. Ayrıştıklarında
    // satın alma önerisi tedarikçiyi göremez, her kalem "tedarikçisiz" kovasına
    // düşer ve kullanıcı elle seçmek zorunda kalır (2026-08-29: 6 bağ işaretli,
    // 0 üründe kolon doluydu).
    console.log("\n5) Tercihli tedarikçi → satın alma önerisi");
    const { data: prefLinks } = await sb
        .from("product_vendor_links")
        .select("product_id,vendor_id")
        .eq("is_preferred", true);
    const { data: prefProducts } = await sb
        .from("products")
        .select("id,preferred_vendor_id");
    const prefById = new Map((prefProducts ?? []).map(p => [p.id as string, p.preferred_vendor_id as string | null]));
    const ayrisan = (prefLinks ?? []).filter(l => prefById.get(l.product_id as string) !== l.vendor_id);
    if (ayrisan.length === 0) {
        ok(`tercihli bağ (${(prefLinks ?? []).length}) = products.preferred_vendor_id`);
    } else {
        bad(`${ayrisan.length} üründe tercihli bağ var ama products.preferred_vendor_id tutmuyor ` +
            `→ satın alma önerisi tedarikçiyi göremez ` +
            `(onarım: npx tsx scripts/repair-preferred-vendor.ts)`);
    }

    console.log(`\n${"─".repeat(60)}`);
    if (failures === 0) {
        console.log("TÜM ZİNCİRLER TUTUYOR ✅");
        process.exit(0);
    }
    console.log(`${failures} KOPUKLUK — yukarıya bakın.`);
    process.exit(1);
}

main().catch(err => {
    console.error("HATA:", err instanceof Error ? err.message : err);
    process.exit(1);
});
