import { NextRequest, NextResponse } from "next/server";
import { probeAIKey } from "@/lib/services/ai-service";
import { handleApiError } from "@/lib/api-error";
import { requirePermission } from "@/lib/auth/role-guard";

/**
 * GET /api/ai/health — AI'nın GERÇEKTEN çalışıp çalışmadığı.
 *
 * 2026-08-29: `ANTHROPIC_API_KEY` dolu ama geçersizdi (HTTP 401
 * `invalid x-api-key`). Eski `isAIAvailable()` yalnız env değişkeninin dolu
 * olmasına baktığı için sistem AI'yı açık sanıyor, her çağrı sessizce graceful
 * degradation'a düşüyordu. Kullanıcı Veri Aktarım Merkezi'ne PDF bırakıp
 * hiçbir açıklama görmeden `unknown` sınıflandırmayla kalıyordu.
 *
 * Bu uç ayrımı taşır:
 *   no_key      → anahtar hiç tanımlı değil
 *   auth_failed → anahtar var ama Anthropic reddediyor (401/403)
 *   ok          → çalışıyor
 *
 * Maliyet: `probeAIKey` yalnız gerçekten gerekirse 1 token'lık istek atar ve
 * sonucu 10 dk saklar; anahtar yoksa veya mandal kuruluysa hiç istek atmaz.
 *
 * Guard: AI durumu tutar/fiyat sızdırmaz ama token yakabilen bir uçtur —
 * AI'yı fiilen kullanan ekranların izinleriyle sınırlı.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    try {
        const guard = await requirePermission(req, ["view_import", "view_alerts", "view_products"]);
        if (guard) return guard;

        const availability = await probeAIKey();
        return NextResponse.json(availability);
    } catch (err) {
        return handleApiError(err, "GET /api/ai/health");
    }
}
