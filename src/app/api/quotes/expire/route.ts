import { NextRequest, NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/auth/cron-guard";
import { revalidateTag } from "next/cache";
import { serviceExpireQuotes } from "@/lib/services/quote-service";
import { handleApiError } from "@/lib/api-error";
import { broadcastDataChange } from "@/lib/realtime/broadcast";

// POST /api/quotes/expire
// CRON: Süresi dolmuş teklifleri (draft/sent + valid_until < today) expired yapar.
export async function POST(req?: NextRequest) {
    // Denetim D4 (2026-06): route-içi CRON_SECRET (derinlemesine savunma —
    // proxy CRON_PATHS tek hat olmasın). `req` opsiyonel: unit testler POST()
    // ile çağırır (stock-risk guardAiRoute kalıbı); prod'da Next her zaman geçirir.
    if (req) {
        const guard = requireCronSecret(req);
        if (guard) return guard;
    }

    try {
        const result = await serviceExpireQuotes();
        if (result.expired > 0) {
            revalidateTag("quotes", "immediate");
            for (const id of result.expiredIds) {
                revalidateTag(`quote-${id}`, "immediate");
            }
            // Yayın DÖNGÜNÜN DIŞINDA: koşum başına TEK sinyal. İçeride olsaydı
            // 40 süresi dolmuş teklif 40 yayın üretirdi ve her istemci 40 kez
            // yeniden çekerdi. `orders`+`products` de dahil: mig.088'den beri
            // süresi dolan teklif bağlı bekleyen siparişi iptal eder ve
            // rezervasyonu çözer.
            void broadcastDataChange(["quotes", "orders", "products", "alerts"]);
        }
        return NextResponse.json(result);
    } catch (err) {
        return handleApiError(err, "POST /api/quotes/expire");
    }
}
