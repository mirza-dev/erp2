/**
 * Uyarı taraması koşucusu — advisory lock + tüm tarama adımları tek yerde.
 *
 * KOBİ-sim Y5 (2026-08-29): mal kabul sonrası tarama tetikleyicisi
 * `purchase-order-service.ts` içinde şöyleydi:
 *
 *     fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/alerts/scan`, …)
 *
 * `NEXT_PUBLIC_APP_URL` set değilken URL **göreli** kalıyor, Node fetch bunu
 * ayrıştıramayıp fırlatıyor ve hemen altındaki boş `catch` yutuyordu. Yani mal
 * kabul sonrası tarama **hiç koşmamıştı** — Sibel'in bulgusunun (tamamen teslim
 * alınmış `PO-2026-0003` hâlâ "41 gün gecikti" uyarısı gösteriyor) sebebi buydu;
 * `po_overdue` çözme mantığı doğru yazılmıştı, sadece tetiklenmiyordu.
 *
 * Çözüm: kendi sunucusuna HTTP atmak yerine servisleri doğrudan çağır. Env
 * bağımlılığı ve bir ağ turu birden kalkıyor. Lock semantiği korunuyor —
 * route da bu koşucuyu kullanıyor, dolayısıyla eşzamanlı iki tarama yine
 * engelleniyor.
 */

import {
    serviceScanStockAlerts,
    serviceCheckOverduePurchaseOrders,
    serviceCheckRfqResponseDue,
} from "@/lib/services/alert-service";
import { serviceReconcileQuoteReservations } from "@/lib/services/quote-service";
import { createServiceClient } from "@/lib/supabase/service";

export interface AlertScanRunResult {
    /** Lock alınamadı — başka bir tarama sürüyor. */
    skipped?: boolean;
    created?: number;
    resolved?: number;
    emailFailed?: number;
    noteEscalated?: number;
    poOverdue: { alerted: number; resolved: number };
    quoteReconcile: { repaired: number; released: number; alerted: number };
    rfqResponseDue: { alerted: number; resolved: number };
}

/**
 * Tarama adımlarını advisory lock altında koşturur.
 *
 * @param force Takılı lock'u zorla bırakır (manuel/demo tetikleme).
 * @throws Stok taraması patlarsa — çağıran karar verir (route 500 döner,
 *         mal kabul yolu yutar: kabul işlemi taramaya bağlı değildir).
 */
export async function serviceRunAlertScan(force = false): Promise<AlertScanRunResult> {
    const supabase = createServiceClient();

    if (force) {
        try { await supabase.rpc("release_scan_lock"); } catch { /* ignore */ }
    }

    const { data: locked } = await supabase.rpc("try_acquire_scan_lock");
    if (!locked) {
        return {
            skipped: true,
            poOverdue:      { alerted: 0, resolved: 0 },
            quoteReconcile: { repaired: 0, released: 0, alerted: 0 },
            rfqResponseDue: { alerted: 0, resolved: 0 },
        };
    }

    try {
        const result = await serviceScanStockAlerts();

        // Aşağıdaki üç adım non-fatal: biri patlarsa stok sonuçları yine döner.
        let poOverdue = { alerted: 0, resolved: 0 };
        try {
            poOverdue = await serviceCheckOverduePurchaseOrders();
        } catch (poErr) {
            console.error("[alert-scan] po_overdue scan", poErr);
        }

        // K4+Y3 reconciler: "sent ama sipariş yok" onarılır, "terminal ama
        // pending order yaşıyor" bırakılır.
        let quoteReconcile = { repaired: 0, released: 0, alerted: 0 };
        try {
            quoteReconcile = await serviceReconcileQuoteReservations();
        } catch (qrErr) {
            console.error("[alert-scan] quote reconcile", qrErr);
        }

        let rfqResponseDue = { alerted: 0, resolved: 0 };
        try {
            rfqResponseDue = await serviceCheckRfqResponseDue();
        } catch (rfqErr) {
            console.error("[alert-scan] rfq_response_due scan", rfqErr);
        }

        return { ...result, poOverdue, quoteReconcile, rfqResponseDue };
    } finally {
        try { await supabase.rpc("release_scan_lock"); } catch { /* ignore */ }
    }
}
