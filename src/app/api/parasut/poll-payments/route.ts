import { NextRequest, NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/auth/cron-guard";
import { serviceParasutPollPayments } from "@/lib/services/parasut-payment-service";
import { handleApiError } from "@/lib/api-error";

// POST /api/parasut/poll-payments — CRON.
// Paraşüt'ün tahsilat gerçeğini ERP'ye geri okur (tek yönlü).
// poll-e-documents kalıbı: claim KULLANMAZ, salt okuma + tek satır güncelleme.
export async function POST(req?: NextRequest) {
    if (req) {
        const guard = requireCronSecret(req);
        if (guard) return guard;
    }

    try {
        const result = await serviceParasutPollPayments();
        return NextResponse.json(result);
    } catch (err) {
        return handleApiError(err, "POST /api/parasut/poll-payments");
    }
}
