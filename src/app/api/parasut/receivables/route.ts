import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requirePermission } from "@/lib/auth/role-guard";
import { handleApiError } from "@/lib/api-error";

/**
 * GET /api/parasut/receivables — Genel Bakış "Açık Alacak" kartının verisi.
 *
 * Paraşüt'ün tahsilat gerçeği (migration 108 ile geri okunmuş). Kart 2026-06'da
 * güvenilmez bir proxy olduğu için kaldırılmıştı; bu uç onu gerçek veriyle
 * geri getirir.
 *
 * RBAC `view_parasut` (= admin + accounting) — açık alacak toplamı finansal
 * bilgidir. Diğer roller 403 alır → dashboard fetch'i null bırakır → kart hiç
 * render edilmez (Yoldaki Mal kartının fail-soft kalıbı).
 *
 * DAR KOLON: yalnız kartın ihtiyaç duyduğu iki alan döner; müşteri/tutar
 * ayrıntısı taşınmaz.
 */
export async function GET(req: NextRequest) {
    try {
        const guard = await requirePermission(req, "view_parasut");
        if (guard) return guard;

        const supabase = createServiceClient();
        const { data, error } = await supabase
            .from("sales_orders")
            .select("parasut_payment_status, parasut_remaining_try")
            .not("parasut_invoice_id", "is", null)
            .in("parasut_payment_status", ["unpaid", "partially_paid", "overdue"])
            .limit(2000);

        if (error) throw new Error(error.message);

        const rows = (data ?? []).map(r => ({
            paymentStatus: (r as { parasut_payment_status: string | null }).parasut_payment_status,
            remainingTry:  (r as { parasut_remaining_try: number | null }).parasut_remaining_try,
        }));

        return NextResponse.json(rows);
    } catch (err) {
        return handleApiError(err, "GET /api/parasut/receivables");
    }
}
