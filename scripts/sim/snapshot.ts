/**
 * Sim öncesi/sonrası SAYISAL DURUM FOTOĞRAFI — salt okunur.
 *
 * Canlı veritabanında koştuğumuz için "sim ne değiştirdi" sorusunun cevabı
 * tahmine bırakılamaz. Bu dosya sim'den önce ve sonra çekilir; fark, canlı
 * teslim verisine ne bulaştığının SAYISAL kanıtıdır.
 *
 * Kullanım: npx tsx scripts/sim/snapshot.ts --out=docs/sim/snapshot-oncesi.json
 *           npx tsx scripts/sim/snapshot.ts --karsilastir a.json b.json
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("EKSİK ENV"); process.exit(2); }
const sb = createClient(url, key);

interface Shot {
    at: string;
    counts: Record<string, number>;
    /** SKU → { on_hand, reserved } — üretim/sayım tam bu değerleri kaydırır. */
    stock: Record<string, { on_hand: number; reserved: number }>;
    revenueByCurrency: Record<string, number>;
}

async function count(table: string): Promise<number> {
    const { count: c } = await sb.from(table).select("*", { count: "exact", head: true });
    return c ?? 0;
}

async function take(): Promise<Shot> {
    const tables = [
        "products", "customers", "vendors", "quotes", "sales_orders", "order_lines",
        "purchase_orders", "purchase_order_lines", "production_entries",
        "inventory_movements", "stock_reservations", "alerts", "supplier_rfqs",
    ];
    const counts: Record<string, number> = {};
    for (const t of tables) counts[t] = await count(t).catch(() => -1);

    const { data: prods } = await sb.from("products").select("sku,on_hand,reserved").order("sku");
    const stock: Shot["stock"] = {};
    for (const p of prods ?? []) stock[p.sku as string] = { on_hand: Number(p.on_hand), reserved: Number(p.reserved) };

    const { data: orders } = await sb.from("sales_orders")
        .select("grand_total,currency,commercial_status");
    const revenueByCurrency: Record<string, number> = {};
    for (const o of orders ?? []) {
        if (o.commercial_status === "cancelled" || o.commercial_status === "draft") continue;
        const c = (o.currency as string) ?? "TRY";
        revenueByCurrency[c] = (revenueByCurrency[c] ?? 0) + Number(o.grand_total ?? 0);
    }

    return { at: new Date().toISOString(), counts, stock, revenueByCurrency };
}

function compare(a: Shot, b: Shot): void {
    console.log(`Fotoğraf karşılaştırması\n  ÖNCE: ${a.at}\n  SONRA: ${b.at}\n`);

    console.log("KAYIT SAYILARI");
    let any = false;
    for (const k of Object.keys(a.counts)) {
        const d = (b.counts[k] ?? 0) - a.counts[k];
        if (d !== 0) { console.log(`  ${d > 0 ? "+" : ""}${d}  ${k}  (${a.counts[k]} → ${b.counts[k]})`); any = true; }
    }
    if (!any) console.log("  (değişmedi)");

    console.log("\nSTOK KAYMASI (gerçek ürünlerde)");
    let drift = 0;
    for (const [sku, before] of Object.entries(a.stock)) {
        const after = b.stock[sku];
        if (!after) { console.log(`  ⚠ ${sku} kayboldu`); drift++; continue; }
        const dh = after.on_hand - before.on_hand;
        const dr = after.reserved - before.reserved;
        if (dh !== 0 || dr !== 0) {
            console.log(`  ${sku}: gerçek stok ${before.on_hand}→${after.on_hand} (${dh > 0 ? "+" : ""}${dh}) · rezerve ${before.reserved}→${after.reserved} (${dr > 0 ? "+" : ""}${dr})`);
            drift++;
        }
    }
    const yeni = Object.keys(b.stock).filter(s => !(s in a.stock));
    if (yeni.length) console.log(`  + ${yeni.length} yeni ürün: ${yeni.slice(0, 15).join(", ")}`);
    if (drift === 0 && yeni.length === 0) console.log("  (hiç kaymadı)");

    console.log("\nCİRO");
    const curs = new Set([...Object.keys(a.revenueByCurrency), ...Object.keys(b.revenueByCurrency)]);
    for (const c of curs) {
        const x = a.revenueByCurrency[c] ?? 0, y = b.revenueByCurrency[c] ?? 0;
        if (x !== y) console.log(`  ${c}: ${x.toFixed(2)} → ${y.toFixed(2)}  (${(y - x) > 0 ? "+" : ""}${(y - x).toFixed(2)})`);
    }
}

async function main(): Promise<void> {
    const args = process.argv.slice(2);
    const cmp = args.indexOf("--karsilastir");
    if (cmp !== -1) {
        const a = JSON.parse(readFileSync(args[cmp + 1], "utf8")) as Shot;
        const b = JSON.parse(readFileSync(args[cmp + 2], "utf8")) as Shot;
        compare(a, b);
        return;
    }
    const outArg = args.find(a => a.startsWith("--out="));
    const shot = await take();
    if (outArg) {
        const p = outArg.slice(6);
        mkdirSync(dirname(p), { recursive: true });
        writeFileSync(p, JSON.stringify(shot, null, 2));
        console.log(`Fotoğraf yazıldı: ${p}`);
    }
    console.log(`\n${Object.entries(shot.counts).map(([k, v]) => `${k}=${v}`).join(" · ")}`);
    console.log(`ciro: ${Object.entries(shot.revenueByCurrency).map(([c, v]) => `${c} ${v.toFixed(2)}`).join(" · ")}`);
}

main();
