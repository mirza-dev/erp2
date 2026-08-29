import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-error";
import { requireInternalOperatorFor } from "@/lib/auth/internal-access";
import { resolveAuthContext } from "@/lib/auth/role-guard";
import { dbPerformanceSummary } from "@/lib/supabase/telemetry";
import { parseTimeRange, rangeStartISO } from "@/lib/telemetry/health";

/**
 * Performans (§12).
 *
 * ÖLÇÜM KAYNAĞI İSTEMCİDİR (RUM): `swr-config.ts`'teki ortak fetcher her
 * isteği süre + status ile ölçüp `/api/developer/rum`'a yollar. Bunun sebebi
 * mimari bir kısıt: Next.js middleware handler'dan ÖNCE çalışıp biter, yanıt
 * süresini ve status kodunu göremez — 148 route'a dokunmadan sunucu tarafı
 * latency ölçmenin yolu yok.
 *
 * Sonuç: rakamlar AĞ SÜRESİNİ DE İÇERİR ve yalnız arayüzün çağırdığı uçları
 * kapsar (cron/server-to-server yok). Panel bunu açıkça yazar; "sunucu süresi"
 * gibi sunulmaz (§28).
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    try {
        const auth = await resolveAuthContext();
        const guard = requireInternalOperatorFor(auth);
        if (guard) return guard;

        const range = parseTimeRange(req.nextUrl.searchParams.get("range"));
        const summary = await dbPerformanceSummary(rangeStartISO(range));

        return NextResponse.json({
            ...summary,
            range,
            measurement: "client",
            note: "İstemci gözlemli (RUM) — ağ süresi dahildir; yalnız arayüzün "
                + "çağırdığı uçları kapsar.",
        });
    } catch (err) {
        return handleApiError(err, "GET /api/developer/performance");
    }
}
