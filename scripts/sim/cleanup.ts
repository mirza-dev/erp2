/**
 * Sim artığını CANLI veriden geri alır.
 *
 * Tasarım kuralı: sipariş kayıtları ELLE SİLİNMEZ — önce uygulamanın kendi
 * `cancel_order` RPC'siyle iptal edilir ki rezervasyonlar düzgün çözülsün ve
 * `products.reserved` tutarlı kalsın. Ham DELETE, `stock_reservations` satırını
 * öksüz bırakıp zinciri kırardı (`check:chains` #2).
 *
 * VARSAYILAN KURU ÇALIŞMA. Silmek için `--uygula` gerekir.
 *
 * Üretim girişi ve stok sayımının `on_hand` etkisi BURADA GERİ ALINMAZ —
 * canlı proje seçiminin bilinen bedeli. `snapshot --karsilastir` sapmayı
 * sayısal gösterir; düzeltme kararı kullanıcınındır.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { SIM_ROLES } from "./roles";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("EKSİK ENV"); process.exit(2); }
const sb = createClient(url, key);

const APPLY = process.argv.includes("--uygula");
const SIM = "SIM";

function head(t: string) { console.log(`\n── ${t} ${"─".repeat(Math.max(0, 56 - t.length))}`); }
function line(s: string) { console.log(`   ${s}`); }

async function main(): Promise<void> {
    console.log(APPLY
        ? "SİM TEMİZLİĞİ — UYGULAMA MODU (kayıtlar silinecek)"
        : "SİM TEMİZLİĞİ — KURU ÇALIŞMA (hiçbir şey silinmez; --uygula ile çalıştırın)");

    // ── 1. Sim siparişleri: önce İPTAL (rezervasyon çözülür), sonra sil ─────
    head("Satış siparişleri");
    // SIM damgası NUMARADA değil, MÜŞTERİ ADINDA taşınıyor: sipariş/teklif
    // numaraları sistemin kendi sayacından geliyor (TKL-2026-015, ORD-2026-0030).
    // İlk sürüm yalnız numaraya bakıyordu ve hiçbir kaydı bulamıyordu.
    const { data: orders } = await sb.from("sales_orders")
        .select("id,order_number,commercial_status,notes")
        .or(`order_number.ilike.%${SIM}%,customer_name.ilike.${SIM} %,notes.ilike.%[${SIM}]%`);
    if (!orders?.length) line("(sim siparişi yok)");
    for (const o of orders ?? []) {
        const canCancel = !["cancelled", "shipped"].includes(o.commercial_status as string);
        line(`${o.order_number} [${o.commercial_status}] → ${canCancel ? "iptal + sil" : "sil"}`);
        if (!APPLY) continue;
        if (canCancel) {
            const { error } = await sb.rpc("cancel_order", { p_order_id: o.id });
            if (error) { line(`   ⚠ iptal edilemedi: ${error.message} — SİLİNMEDİ`); continue; }
        }
        await sb.from("order_lines").delete().eq("order_id", o.id);
        const { error: e } = await sb.from("sales_orders").delete().eq("id", o.id);
        if (e) line(`   ⚠ ${e.message}`);
    }

    // ── 2. Teklifler ────────────────────────────────────────────────────────
    head("Teklifler");
    const { data: quotes } = await sb.from("quotes")
        .select("id,quote_number,status,customer_name")
        .or(`quote_number.ilike.%${SIM}%,customer_name.ilike.${SIM} %`);
    if (!quotes?.length) line("(sim teklifi yok)");
    for (const q of quotes ?? []) {
        line(`${q.quote_number} — ${q.customer_name ?? "(müşterisiz)"} [${q.status}] → sil`);
        if (!APPLY) continue;
        await sb.from("quote_line_items").delete().eq("quote_id", q.id);
        await sb.from("quotes").delete().eq("id", q.id);
    }

    // ── 3. Satın alma siparişleri ───────────────────────────────────────────
    head("Satın alma siparişleri");
    const { data: pos } = await sb.from("purchase_orders")
        .select("id,po_number,status").ilike("po_number", `%${SIM}%`);
    if (!pos?.length) line("(sim PO'su yok)");
    for (const p of pos ?? []) {
        line(`${p.po_number} [${p.status}] → sil`);
        if (!APPLY) continue;
        await sb.from("purchase_order_lines").delete().eq("po_id", p.id);
        await sb.from("purchase_orders").delete().eq("id", p.id);
    }

    // ── 3b. Fiyat talepleri (RFQ) ───────────────────────────────────────────
    head("Fiyat talepleri");
    const { data: rfqs } = await sb.from("supplier_rfqs")
        .select("id,rfq_number,title,status").ilike("title", `${SIM}%`);
    if (!rfqs?.length) line("(sim RFQ'su yok)");
    for (const r of rfqs ?? []) {
        line(`${r.rfq_number} — ${r.title} [${r.status}] → sil`);
        if (!APPLY) continue;
        for (const t of ["rfq_vendor_prices", "rfq_vendors", "rfq_lines"]) {
            await sb.from(t).delete().eq("rfq_id", r.id);
        }
        const { error } = await sb.from("supplier_rfqs").delete().eq("id", r.id);
        if (error) line(`   ⚠ ${error.message}`);
    }

    // ── 4. Cari / tedarikçi / ürün ──────────────────────────────────────────
    for (const [table, col, adi] of [
        ["customers", "name", "Cariler"],
        ["vendors", "name", "Tedarikçiler"],
        ["products", "sku", "Ürünler"],
    ] as const) {
        head(adi);
        const { data } = await sb.from(table).select(`id,${col}`).ilike(col, `${SIM}%`);
        if (!data?.length) { line(`(sim kaydı yok)`); continue; }
        for (const r of data) {
            line(`${(r as Record<string, unknown>)[col]} → sil`);
            if (APPLY) {
                const { error } = await sb.from(table).delete().eq("id", (r as { id: string }).id);
                if (error) line(`   ⚠ ${error.message} (bağlı kayıt olabilir)`);
            }
        }
    }

    // ── 5. Sim kullanıcı hesapları ──────────────────────────────────────────
    head("Sim çalışan hesapları");
    const { data: users } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
    for (const r of SIM_ROLES) {
        const u = (users?.users ?? []).find(x => x.email?.toLowerCase() === r.email);
        if (!u) { line(`(${r.email} zaten yok)`); continue; }
        line(`${r.email} → sil`);
        if (APPLY) await sb.auth.admin.deleteUser(u.id);
    }

    console.log(APPLY
        ? "\n✅ Temizlik bitti. Şimdi: npm run check:chains && npm run find-test-data"
        : "\n(Kuru çalışmaydı. Uygulamak için: npx tsx scripts/sim/cleanup.ts --uygula)");
}

main();
