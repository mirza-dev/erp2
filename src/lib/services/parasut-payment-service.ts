/**
 * Paraşüt tahsilat/ödeme durumu — Paraşüt → ERP tek yönlü okuma (Faz 14).
 *
 * NEDEN: Entegrasyon bugüne dek tek yönlüydü (ERP → Paraşüt). Faturanın tahsil
 * edilip edilmediği yalnız Paraşüt'te biliniyordu; ERP'de GERÇEK alacak bilgisi
 * yoktu. Genel Bakış'taki "Açık Alacak" kartı tam bu yüzden 2026-06'da
 * kaldırılmıştı (created_at+30g sabit vade varsayan, ödemeleri hiç düşmeyen
 * proxy hesap). Artık kaynak Paraşüt'ün kendi `payment_status`/`remaining`i.
 *
 * TASARIM:
 *  · YAZMA YOK — ERP Paraşüt'e tahsilat kaydetmez. Tahsilat muhasebede yapılır.
 *  · Claim/lease KULLANILMAZ (poll-e-documents kalıbı): salt okuma + tek satır
 *    güncelleme; eşzamanlı iki koşu aynı değeri yazar, zarar yok.
 *  · `paid` TERMİNAL: bir kez ödendi olarak işaretlenen belge bir daha
 *    sorgulanmaz → API çağrısı ve rate-limit baskısı düşer.
 *  · Para birimleri ASLA toplanmaz: toplama yalnız Paraşüt'ün hesapladığı
 *    `remaining_in_trl` üzerinden yapılır.
 */

import { createServiceClient } from "@/lib/supabase/service";
import { dbCreateAlert, dbBatchResolveAlerts } from "@/lib/supabase/alerts";
import { getParasutAdapter } from "@/lib/parasut";
import { ParasutError } from "@/lib/parasut-adapter";
import type { ParasutPaymentState } from "@/lib/parasut-adapter";
import { parasutApiCall } from "@/lib/services/parasut-api-call";

export interface PollPaymentsResult {
    checked:   number;
    updated:   number;
    failed:    number;
    overdue:   number;
    /** Devre dışıyken true — çağıran "0 sonuç" ile "hiç koşmadı"yı ayırt edebilsin. */
    disabled?: boolean;
}

/** Tek seferde sorgulanacak belge sayısı — Paraşüt limiti 10 istek/10 sn. */
const POLL_BATCH = 40;

function isParasutEnabled(): boolean {
    return process.env.PARASUT_ENABLED === "true";
}

// ── Saf yardımcılar ──────────────────────────────────────────

/** Tahsil edilmemiş sayılan durumlar (açık alacak/borç hesabına girer). */
export const OPEN_PAYMENT_STATUSES = new Set(["unpaid", "partially_paid", "overdue"]);

export function isOpenPayment(status: string | null | undefined): boolean {
    return !!status && OPEN_PAYMENT_STATUSES.has(status);
}

/**
 * Açık alacak toplamı — YALNIZ TL karşılığı üzerinden.
 *
 * `remaining` faturanın kendi para birimindedir; farklı birimlerdeki değerleri
 * toplamak anlamsız bir sayı üretirdi (B1 bulgusunun aynısı). `remaining_in_trl`
 * çözülemeyen kayıt toplama GİRMEZ ve ayrıca sayılır — sessizce 0 sayılmaz.
 */
export function sumOpenReceivablesTry(
    rows: Array<{ parasut_payment_status?: string | null; parasut_remaining_try?: number | null }>,
): { totalTry: number; openCount: number; unconvertibleCount: number } {
    let totalTry = 0;
    let openCount = 0;
    let unconvertibleCount = 0;
    for (const r of rows) {
        if (!isOpenPayment(r.parasut_payment_status)) continue;
        openCount++;
        const v = r.parasut_remaining_try;
        if (v === null || v === undefined || !Number.isFinite(Number(v))) {
            unconvertibleCount++;
            continue;
        }
        totalTry += Number(v);
    }
    return { totalTry: Math.round(totalTry * 100) / 100, openCount, unconvertibleCount };
}

/** Paraşüt durumu → ERP kolon yaması. */
export function paymentPatch(state: ParasutPaymentState): Record<string, unknown> {
    return {
        parasut_payment_status:     state.payment_status,
        parasut_remaining:          state.remaining,
        parasut_remaining_try:      state.remaining_in_trl,
        parasut_payment_checked_at: new Date().toISOString(),
    };
}

// ── Poll ─────────────────────────────────────────────────────

interface PollTarget {
    table:      "sales_orders" | "purchase_orders";
    idColumn:   "parasut_invoice_id" | "parasut_bill_id";
    numberCol:  "order_number" | "po_number";
    entityType: "sales_order" | "purchase_order";
    fetch:      (documentId: string) => Promise<ParasutPaymentState>;
}

async function pollOne(target: PollTarget): Promise<PollPaymentsResult> {
    const supabase = createServiceClient();

    // Aday: faturası kesilmiş ve henüz tamamen ödenmemiş kayıtlar.
    // `paid` terminal → sorgudan düşer (index bu koşulla birebir).
    const { data: rows, error } = await supabase
        .from(target.table)
        .select(`id, ${target.numberCol}, ${target.idColumn}, parasut_payment_status`)
        .not(target.idColumn, "is", null)
        .or("parasut_payment_status.is.null,parasut_payment_status.neq.paid")
        .order("parasut_payment_checked_at", { ascending: true, nullsFirst: true })
        .limit(POLL_BATCH);

    if (error) throw new Error(`${target.table} tahsilat adayları okunamadı: ${error.message}`);

    let updated = 0;
    let failed  = 0;
    let overdue = 0;

    for (const raw of (rows ?? []) as unknown as Array<Record<string, string | null>>) {
        const rowId      = raw.id as string;
        const documentId = raw[target.idColumn] as string;
        const docNumber  = (raw[target.numberCol] as string) ?? rowId;
        const previous   = raw.parasut_payment_status;

        try {
            const state = await parasutApiCall(
                { op: "getPaymentState", orderId: rowId },
                () => target.fetch(documentId),
            );

            const { error: patchErr } = await supabase
                .from(target.table)
                .update(paymentPatch(state))
                .eq("id", rowId);
            if (patchErr) throw new Error(patchErr.message);
            updated++;

            if (state.payment_status === "overdue") {
                overdue++;
                // Yalnız satış tarafında uyarı: gecikmiş ALACAK operasyonel bir
                // aksiyon gerektirir. Gecikmiş borç (alış) muhasebenin işidir.
                if (target.entityType === "sales_order" && previous !== "overdue") {
                    try {
                        await dbCreateAlert({
                            type:        "payment_overdue",
                            severity:    "warning",
                            title:       `Tahsilat gecikti — ${docNumber}`,
                            description: `${docNumber} faturasının vadesi geçti. Paraşüt'e göre kalan tutar: ${formatRemaining(state)}.`,
                            entity_type: target.entityType,
                            entity_id:   rowId,
                            source:      "system",
                        });
                    } catch (alertErr) {
                        console.error(JSON.stringify({ parasut_payment_alert_fail: String(alertErr), rowId }));
                    }
                }
            } else if (state.payment_status === "paid" && target.entityType === "sales_order") {
                // Tahsil edildi → varsa gecikme uyarısını kapat.
                try {
                    await dbBatchResolveAlerts([{
                        type:     "payment_overdue",
                        entityId: rowId,
                        reason:   "payment_received",
                        source:   "system",
                    }]);
                } catch (resolveErr) {
                    console.error(JSON.stringify({ parasut_payment_resolve_fail: String(resolveErr), rowId }));
                }
            }
        } catch (err) {
            failed++;
            const pe = err instanceof ParasutError ? err : new ParasutError("server", String(err));
            console.error(JSON.stringify({
                parasut_payment_poll_fail: pe.message,
                kind: pe.kind, table: target.table, rowId,
            }));
        }
    }

    return { checked: rows?.length ?? 0, updated, failed, overdue };
}

function formatRemaining(state: ParasutPaymentState): string {
    if (state.remaining === null) return "bilinmiyor";
    return `${state.remaining} ${state.currency ?? ""}`.trim();
}

/**
 * CRON girişi — hem satış hem alış belgelerinin tahsilat durumunu tazeler.
 * Kısmi başarı normaldir: tek belgenin hatası diğerlerini durdurmaz.
 */
export async function serviceParasutPollPayments(): Promise<PollPaymentsResult> {
    if (!isParasutEnabled()) {
        return { checked: 0, updated: 0, failed: 0, overdue: 0, disabled: true };
    }

    const adapter = getParasutAdapter();

    const sales = await pollOne({
        table:      "sales_orders",
        idColumn:   "parasut_invoice_id",
        numberCol:  "order_number",
        entityType: "sales_order",
        fetch:      id => adapter.getSalesInvoicePaymentState(id),
    });

    const purchase = await pollOne({
        table:      "purchase_orders",
        idColumn:   "parasut_bill_id",
        numberCol:  "po_number",
        entityType: "purchase_order",
        fetch:      id => adapter.getPurchaseBillPaymentState(id),
    });

    return {
        checked: sales.checked + purchase.checked,
        updated: sales.updated + purchase.updated,
        failed:  sales.failed  + purchase.failed,
        overdue: sales.overdue + purchase.overdue,
    };
}
