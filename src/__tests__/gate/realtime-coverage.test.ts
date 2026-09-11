/**
 * KAPI — realtime yayın kapsaması (2026-09-11, dış inceleme #6).
 *
 * BULGU: `channel.ts` DOKUZ alan ilan ediyordu; yayın YEDİ dosyada ve yalnız
 * BEŞ alanda vardı, üstelik hepsi koleksiyon POST'undaydı. `quotes`,
 * `purchase_orders`, `rfqs` ve `alerts` için TEK BİR yayın yoktu; mevcut
 * beşinin de PATCH/DELETE kolları sessizdi. Yani teklif gönderen, PO onaylayan,
 * RFQ fiyatı giren kullanıcının değişikliği diğer sekmelere HİÇ ulaşmıyordu —
 * özellik "var" görünüyor, yarısı çalışmıyordu.
 *
 * İKİ KURAL, iki farklı kör noktayı kapatır:
 *   1. İlan edilen her alanın en az bir yayıncısı var → `REALTIME_DOMAINS`'e
 *      yeni alan eklenip bağlanmazsa kırılır (bugünkü kusurun imzası).
 *   2. Domain-destekli bir önbellek etiketini tazeleyen her route yayın da
 *      yapar → YENİ bir mutasyon ucu sessiz doğarsa kırılır (kusurun
 *      TEKRARLAMA yolu).
 *
 * Kural (2) "sayı" iddiası KURMAZ — yapı iddiasıdır: `revalidateTag`
 * (sunucu önbelleği) ile yayın (istemci önbelleği) aynı mutasyonun iki yüzüdür;
 * biri varsa diğeri de olmalı.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, statSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { REALTIME_DOMAINS } from "@/lib/realtime/channel";

const root = process.cwd();
const API = join(root, "src/app/api");

function routeFiles(dir: string = API, out: string[] = []): string[] {
    for (const e of readdirSync(dir)) {
        const full = join(dir, e);
        if (statSync(full).isDirectory()) routeFiles(full, out);
        else if (e === "route.ts") out.push(full);
    }
    return out;
}

const strip = (s: string) =>
    s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const FILES = routeFiles().map(f => ({ rel: f.replace(root + "/", ""), code: strip(readFileSync(f, "utf8")) }));

/** `revalidateTag("<x>")` etiketi → realtime alanı. Listede olmayan etiket muaf. */
const TAG_TO_DOMAIN: Record<string, string> = {
    products: "products",
    orders: "orders",
    customers: "customers",
    vendors: "vendors",
    quotes: "quotes",
    "purchase-orders": "purchase_orders",
    rfqs: "rfqs",
};

describe("GATE — realtime yayın kapsaması", () => {
    it("tarama çalışıyor (anti-vakum)", () => {
        // Desen çökerse alttaki iki iddia da BOŞ KÜME üzerinde sahte-yeşil olur.
        expect(FILES.length, "hiç route.ts bulunamadı").toBeGreaterThan(50);
        expect(
            FILES.filter(f => f.code.includes("broadcastDataChange(")).length,
            "hiç yayın çağrısı bulunamadı — ayrıştırıcı bozuk",
        ).toBeGreaterThan(0);
    });

    it("ilan edilen HER alanın en az bir yayıncısı var", () => {
        const published = new Set<string>();
        for (const { code } of FILES) {
            for (const m of code.matchAll(/broadcastDataChange\(\s*\[([^\]]*)\]/g)) {
                for (const d of m[1].matchAll(/"([^"]+)"/g)) published.add(d[1]);
            }
        }
        const orphans = REALTIME_DOMAINS.filter(d => !published.has(d));
        expect(
            orphans,
            "bu alan(lar) ilan edilmiş ama hiçbir yerden yayınlanmıyor — istemci elle yenilemeye mahkûm",
        ).toEqual([]);
    });

    it("domain-destekli etiketi tazeleyen her route yayın da yapar", () => {
        const silent: string[] = [];
        for (const { rel, code } of FILES) {
            const tags = [...code.matchAll(/revalidateTag\(\s*"([^"`$]+)"/g)].map(m => m[1]);
            const domainTags = tags.filter(t => TAG_TO_DOMAIN[t]);
            if (domainTags.length === 0) continue;
            if (!code.includes("broadcastDataChange(")) silent.push(`${rel} (${[...new Set(domainTags)].join(", ")})`);
        }
        expect(
            silent,
            "sunucu önbelleği tazeleniyor ama istemcilere haber verilmiyor — diğer sekmeler bayat kalır",
        ).toEqual([]);
    });

    it("yayın DÖNGÜ İÇİNDE çağrılmıyor — koşum başına tek sinyal", () => {
        // `quotes/expire` bu tuzağa birebir açıktı: ikinci `revalidateTag`
        // süresi dolan her teklif için dönen bir `for` döngüsünün içinde.
        // Yayın oraya konsaydı 40 teklif 40 sinyal üretir, her istemci 40 kez
        // yeniden çekerdi.
        const offenders: string[] = [];
        for (const { rel, code } of FILES) {
            for (const m of code.matchAll(/\bfor\s*\(|\bwhile\s*\(|\.forEach\(/g)) {
                // Döngü gövdesini paren+brace eşlemesiyle çıkar.
                const open = code.indexOf("{", m.index!);
                if (open < 0) continue;
                let depth = 0, i = open;
                for (; i < code.length; i++) {
                    if (code[i] === "{") depth++;
                    else if (code[i] === "}") { depth--; if (depth === 0) break; }
                }
                if (code.slice(open, i).includes("broadcastDataChange(")) offenders.push(rel);
            }
        }
        expect([...new Set(offenders)], "yayın bir döngünün içinde").toEqual([]);
    });
});
