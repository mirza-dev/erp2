/**
 * Paraşüt stok mutabakatı (Faz 15).
 *
 * SORUN: Paraşüt'e stok YALNIZ satış irsaliyesinden (`shipment_document`,
 * inflow=false) DÜŞÜŞ olarak gidiyordu. Giriş hiç gitmiyordu:
 *  · mal kabul → alış faturası warehouse'suz kesilir (stok hareketi yaratmaz)
 *  · üretim çıkışı → Paraşüt'te belge karşılığı YOK (Paraşüt üretim bilmez;
 *    `shipment_document` contact ister, üretimin müşterisi yoktur)
 * Sonuç: Paraşüt stoğu zamanla eksiye düşer ve ERP'den kalıcı olarak sapar.
 *
 * ÇÖZÜM — olay tekrarı DEĞİL, MUTABAKAT:
 * Paraşüt `stock_updates` ucu `new_total_inventory` ile **MUTLAK** yazar
 * (delta değil). Bu, her ERP hareketini Paraşüt'e taşımaya çalışmaktan
 * (kırılgan, sıralamaya duyarlı, üretim için imkânsız) çok daha sağlam:
 * periyodik olarak "ERP ne diyorsa o" denir. Doğası gereği idempotent.
 *
 * VARSAYILAN DAVRANIŞ: **yalnız rapor.** Sapma bulunursa uyarı açılır, hiçbir
 * şey yazılmaz. Otomatik düzeltme `PARASUT_STOCK_AUTOCORRECT=true` ile açılır —
 * canlıda ilk hafta yalnız rapor okunması içindir.
 *
 * TEK DEPO VARSAYIMI: ERP'de stok tek `products.on_hand` sayısıdır
 * (`products.warehouse` düz metin bir etiket). Paraşüt'te birden fazla depo
 * varsa seviyeler TOPLANIR ve karşılaştırma toplam üzerinden yapılır;
 * düzeltme yazımı varsayılan depoya gider.
 */

import { createServiceClient } from "@/lib/supabase/service";
import { dbCreateAlert, dbBatchResolveAlerts } from "@/lib/supabase/alerts";
import { getParasutAdapter } from "@/lib/parasut";
import { ParasutError } from "@/lib/parasut-adapter";
import type { ParasutInventoryLevel } from "@/lib/parasut-adapter";
import { parasutApiCall } from "@/lib/services/parasut-api-call";
import { ALERT_ENTITY_PARASUT_STOCK_INVARIANT } from "@/lib/parasut-constants";

export interface StockDriftRow {
    productId:     string;
    sku:           string;
    name:          string;
    parasutId:     string;
    erpOnHand:     number;
    parasutCount:  number | null;
    /** erp - parasut. `parasutCount` null ise null. */
    diff:          number | null;
}

export interface ReconcileStockResult {
    checked:     number;
    drifted:     number;
    corrected:   number;
    failed:      number;
    autocorrect: boolean;
    drifts:      StockDriftRow[];
    disabled?:   boolean;
}

/** Tek koşuda incelenecek ürün sayısı — Paraşüt limiti 10 istek/10 sn. */
const RECONCILE_BATCH = 100;
/** Tek `stock_updates` çağrısına konacak kalem sayısı. */
const CORRECTION_CHUNK = 25;

function isParasutEnabled(): boolean {
    return process.env.PARASUT_ENABLED === "true";
}

export function isAutocorrectEnabled(): boolean {
    return process.env.PARASUT_STOCK_AUTOCORRECT === "true";
}

// ── Saf yardımcılar ──────────────────────────────────────────

/**
 * Paraşüt seviyelerinin toplamı.
 *
 * Boş liste `null` döner — "Paraşüt'te bu ürünün stok kaydı YOK" ile
 * "stoğu sıfır" AYNI ŞEY DEĞİL. Sıfır sanmak, hiç kaydı olmayan ürün için
 * sahte bir sapma üretirdi.
 */
export function totalParasutStock(levels: ParasutInventoryLevel[]): number | null {
    if (levels.length === 0) return null;
    return levels.reduce((sum, l) => sum + Number(l.stock_count ?? 0), 0);
}

/** Sapma var mı? Tam sayı karşılaştırması (adet bazlı stok). */
export function hasDrift(erpOnHand: number, parasutCount: number | null): boolean {
    if (parasutCount === null) return false; // kayıt yok → sapma değil, kapsam dışı
    return Math.round(Number(erpOnHand)) !== Math.round(Number(parasutCount));
}

/** Sapma satırlarını okunabilir tek satıra indirger (uyarı açıklaması). */
export function describeDrifts(drifts: StockDriftRow[], max = 10): string {
    const head = drifts.slice(0, max).map(d =>
        `${d.sku}: ERP ${d.erpOnHand} · Paraşüt ${d.parasutCount ?? "kayıt yok"} (fark ${d.diff ?? "?"})`,
    );
    const rest = drifts.length > max ? ` … ve ${drifts.length - max} ürün daha` : "";
    return head.join(" · ") + rest;
}

// ── Mutabakat ────────────────────────────────────────────────

interface ProductRow {
    id: string; sku: string; name: string;
    on_hand: number; parasut_product_id: string;
}

export async function serviceReconcileParasutStock(): Promise<ReconcileStockResult> {
    if (!isParasutEnabled()) {
        return { checked: 0, drifted: 0, corrected: 0, failed: 0, autocorrect: false, drifts: [], disabled: true };
    }

    const supabase   = createServiceClient();
    const adapter    = getParasutAdapter();
    const autocorrect = isAutocorrectEnabled();

    // Yalnız Paraşüt'e kayıtlı ürünler karşılaştırılır; henüz senkronlanmamış
    // ürün "sapma" değildir (satış/alış akışı sırasında yaratılır).
    const { data, error } = await supabase
        .from("products")
        .select("id, sku, name, on_hand, parasut_product_id")
        .not("parasut_product_id", "is", null)
        .eq("is_active", true)
        .limit(RECONCILE_BATCH);

    if (error) throw new Error(`Mutabakat için ürünler okunamadı: ${error.message}`);

    const products = (data ?? []) as unknown as ProductRow[];
    const drifts: StockDriftRow[] = [];
    let failed = 0;

    for (const p of products) {
        try {
            const levels = await parasutApiCall(
                { op: "listInventoryLevels" },
                () => adapter.listInventoryLevels(p.parasut_product_id),
            );
            const parasutCount = totalParasutStock(levels);
            if (!hasDrift(p.on_hand, parasutCount)) continue;

            drifts.push({
                productId:    p.id,
                sku:          p.sku,
                name:         p.name,
                parasutId:    p.parasut_product_id,
                erpOnHand:    Number(p.on_hand),
                parasutCount,
                diff:         parasutCount === null ? null : Number(p.on_hand) - parasutCount,
            });
        } catch (err) {
            failed++;
            const pe = err instanceof ParasutError ? err : new ParasutError("server", String(err));
            console.error(JSON.stringify({
                parasut_stock_reconcile_fail: pe.message, kind: pe.kind, productId: p.id,
            }));
        }
    }

    // ── Düzeltme (opt-in) ────────────────────────────────────
    let corrected = 0;
    if (autocorrect && drifts.length > 0) {
        // `parasutCount === null` olan ürün düzeltilmez: Paraşüt'te stok kaydı
        // hiç yokken mutlak değer yazmak beklenmedik kayıt yaratabilir.
        const fixable = drifts.filter(d => d.parasutCount !== null);
        for (let i = 0; i < fixable.length; i += CORRECTION_CHUNK) {
            const chunk = fixable.slice(i, i + CORRECTION_CHUNK);
            try {
                await parasutApiCall(
                    { op: "createStockUpdate" },
                    () => adapter.createStockUpdate(chunk.map(d => ({
                        product_id:          d.parasutId,
                        // MUTLAK: ERP otoritedir.
                        new_total_inventory: d.erpOnHand,
                    }))),
                );
                corrected += chunk.length;
            } catch (err) {
                failed++;
                const pe = err instanceof ParasutError ? err : new ParasutError("server", String(err));
                console.error(JSON.stringify({
                    parasut_stock_correct_fail: pe.message, kind: pe.kind, count: chunk.length,
                }));
            }
        }
    }

    // ── Uyarı ────────────────────────────────────────────────
    // Tek toplu uyarı (ürün başına değil): 40 ürün sapmışsa 40 uyarı açmak
    // uyarı merkezini boğardı. `dbCreateAlert` dedup'u aynı entity için tek
    // aktif kayıt tutar; içerik her koşuda tazelenir.
    try {
        const unresolved = autocorrect ? drifts.length - corrected : drifts.length;
        if (unresolved > 0) {
            await dbCreateAlert({
                type:        "sync_issue",
                severity:    "warning",
                title:       `Paraşüt stok sapması — ${unresolved} ürün`,
                description: autocorrect
                    ? `Otomatik düzeltme açık ama ${unresolved} ürün düzeltilemedi. ${describeDrifts(drifts.filter(d => d.parasutCount === null))}`
                    : `ERP ile Paraşüt stokları farklı. Otomatik düzeltme KAPALI (yalnız rapor). ${describeDrifts(drifts)}`,
                entity_type: "parasut",
                entity_id:   ALERT_ENTITY_PARASUT_STOCK_INVARIANT,
                source:      "system",
            });
        } else {
            await dbBatchResolveAlerts([{
                type:     "sync_issue",
                entityId: ALERT_ENTITY_PARASUT_STOCK_INVARIANT,
                reason:   "stock_reconciled",
                source:   "system",
            }]);
        }
    } catch (alertErr) {
        console.error(JSON.stringify({ parasut_stock_alert_fail: String(alertErr) }));
    }

    return {
        checked:   products.length,
        drifted:   drifts.length,
        corrected,
        failed,
        autocorrect,
        drifts,
    };
}
