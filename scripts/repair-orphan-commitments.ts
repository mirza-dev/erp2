/**
 * Yetim satın alma taahhütlerini PO satırına bağlar.
 *
 * SORUN: `receive_po_lines` taahhüdü `WHERE po_line_id = …` ile kapatır
 * (051_po_receive_rpc.sql:72). `po_line_id` boş olan bir taahhüt mal kabulle
 * ASLA kapanmaz — ürün kartında kalıcı "Bekleniyor" üretir ve satın alma
 * önerisini yanıltır (yolda mal var sanır).
 *
 * Kaynağı seed'di: taahhütler PO satırına bağlanmadan insert ediliyordu.
 * Kod tarafı 2026-08-29'da düzeltildi (seed-runner artık bağlanamayan açık
 * taahhütte PATLAR), ama CANLIDA duran eski satırlar öylece kaldı.
 *
 * EŞLEŞTİRME KURALI — muhafazakâr:
 *   Aynı üründe, TEK BİR aday PO satırı varsa bağlar. Birden çok aday varsa
 *   DOKUNMAZ ve belirsizliği raporlar. Yanlış satıra bağlamak, bağlamamaktan
 *   kötüdür: mal kabul yanlış taahhüdü kapatır ve kimse fark etmez.
 *
 * Bağladıktan sonra durumu PO satırının gerçeğine göre senkronlar — RPC'nin
 * kendi kuralıyla birebir aynı (received_qty = satırın alınanı; tam alındıysa
 * status='received').
 *
 * Varsayılan KURU ÇALIŞMA. Yazmak için: --uygula
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const UYGULA = process.argv.includes("--uygula");

interface Commitment {
    id: string;
    product_id: string;
    quantity: number;
    status: string;
    po_line_id: string | null;
    received_qty: number;
    expected_date: string | null;
    supplier_name: string | null;
    notes: string | null;
}

interface PoLine {
    id: string;
    po_id: string;
    product_id: string;
    quantity: number;
    received_qty: number;
}

async function main() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        console.error("NEXT_PUBLIC_SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY gerekli (.env.local).");
        process.exit(1);
    }
    const sb = createClient(url, key);

    const { data: yetimler, error: e1 } = await sb
        .from("purchase_commitments")
        .select("*")
        .is("po_line_id", null)
        .eq("status", "pending");
    if (e1) throw new Error(e1.message);

    if (!yetimler || yetimler.length === 0) {
        console.log("✅ Yetim taahhüt yok — hiçbir şey yapılmadı.");
        return;
    }

    console.log(`${yetimler.length} yetim taahhüt bulundu (po_line_id boş + pending).\n`);

    const { data: satirlar, error: e2 } = await sb
        .from("purchase_order_lines")
        .select("id, po_id, product_id, quantity, received_qty");
    if (e2) throw new Error(e2.message);

    // Zaten bağlı satırlar tekrar aday olmamalı — bir PO satırına iki taahhüt bağlanamaz.
    const { data: bagliOlanlar } = await sb
        .from("purchase_commitments")
        .select("po_line_id")
        .not("po_line_id", "is", null);
    const kullanilan = new Set((bagliOlanlar ?? []).map(r => r.po_line_id as string));

    const { data: poBasliklari } = await sb
        .from("purchase_orders")
        .select("id, po_number, status");
    const poById = new Map((poBasliklari ?? []).map(p => [p.id as string, p]));

    const planlanan: Array<{ c: Commitment; line: PoLine; yeniDurum: string; yeniAlinan: number }> = [];
    const atlanan: Array<{ c: Commitment; sebep: string }> = [];

    for (const c of yetimler as Commitment[]) {
        const adaylar = (satirlar as PoLine[]).filter(
            l => l.product_id === c.product_id && !kullanilan.has(l.id),
        );

        if (adaylar.length === 0) {
            atlanan.push({ c, sebep: "bu ürün için bağlanabilir PO satırı yok" });
            continue;
        }
        if (adaylar.length > 1) {
            // Miktar eşitliğiyle daraltmayı dene; hâlâ birden çoksa DOKUNMA.
            const miktarEsit = adaylar.filter(l => l.quantity === c.quantity);
            if (miktarEsit.length !== 1) {
                atlanan.push({
                    c,
                    sebep: `${adaylar.length} aday PO satırı — belirsiz, elle karar gerekiyor ` +
                        `(${adaylar.map(a => `${poById.get(a.po_id)?.po_number ?? a.po_id}:${a.quantity} adet`).join(", ")})`,
                });
                continue;
            }
            adaylar.splice(0, adaylar.length, miktarEsit[0]);
        }

        const line = adaylar[0];
        // RPC ile aynı kural (051:69-71): alınan PO satırından gelir; tam alındıysa kapanır.
        const yeniAlinan = line.received_qty;
        const yeniDurum = yeniAlinan >= line.quantity ? "received" : "pending";
        planlanan.push({ c, line, yeniDurum, yeniAlinan });
    }

    console.log("─".repeat(70));
    for (const p of planlanan) {
        const po = poById.get(p.line.po_id);
        const degisiyor = p.yeniDurum !== p.c.status || p.yeniAlinan !== p.c.received_qty;
        console.log(`\n  taahhüt ${p.c.id.slice(0, 8)} — ${p.c.quantity} adet · ${p.c.supplier_name ?? "?"}`);
        console.log(`    not      : ${p.c.notes ?? "—"}`);
        console.log(`    bağlanıyor→ ${po?.po_number ?? p.line.po_id} satır ${p.line.id.slice(0, 8)} ` +
            `(${p.line.quantity} adet, ${p.line.received_qty} alınmış, PO: ${po?.status})`);
        console.log(`    durum    : ${p.c.status} → ${p.yeniDurum}` +
            `${degisiyor && p.yeniDurum === "received" ? "   ← mal ZATEN GELMİŞ, 'Bekleniyor' yanlıştı" : ""}`);
        console.log(`    alınan   : ${p.c.received_qty} → ${p.yeniAlinan}`);
    }
    for (const a of atlanan) {
        console.log(`\n  ⚠ taahhüt ${a.c.id.slice(0, 8)} ATLANDI — ${a.sebep}`);
    }
    console.log("\n" + "─".repeat(70));

    if (!UYGULA) {
        console.log(`\nKURU ÇALIŞMA — hiçbir şey yazılmadı.`);
        console.log(`${planlanan.length} taahhüt onarılacak, ${atlanan.length} atlanacak.`);
        console.log(`Uygulamak için: npx tsx scripts/repair-orphan-commitments.ts --uygula`);
        return;
    }

    let ok = 0;
    for (const p of planlanan) {
        const { error } = await sb
            .from("purchase_commitments")
            .update({
                po_line_id: p.line.id,
                status: p.yeniDurum,
                received_qty: p.yeniAlinan,
                received_at: p.yeniDurum === "received" ? new Date().toISOString() : null,
            })
            .eq("id", p.c.id)
            .is("po_line_id", null); // yarış koruması: bu arada bağlandıysa dokunma
        if (error) {
            console.error(`  ✗ ${p.c.id.slice(0, 8)}: ${error.message}`);
        } else {
            ok++;
            console.log(`  ✓ ${p.c.id.slice(0, 8)} bağlandı → ${p.yeniDurum}`);
        }
    }
    console.log(`\n${ok}/${planlanan.length} taahhüt onarıldı.`);
    if (atlanan.length > 0) {
        console.log(`${atlanan.length} tanesi belirsizlik nedeniyle ATLANDI — yukarıdaki gerekçelere bakın.`);
    }
    console.log(`\nDoğrulama: npm run find-test-data  ·  npm run check:chains`);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
