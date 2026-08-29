import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { dbGetImportSetupStatus } from "@/lib/supabase/import-setup-status";
import { requirePermission } from "@/lib/auth/role-guard";
import { handleApiError } from "@/lib/api-error";

/**
 * GET /api/import/setup-status — Veri Aktarım Merkezi kurulum paneli sayaçları.
 *
 * Panel "neyi taşıdın, neyi taşımadın" sorusunu GERÇEK veriden cevaplar;
 * kullanıcının elle işaretlediği bir kontrol listesi değildir.
 *
 * Cache: `dashboard/counters` emsali. Repoda fiilen YALNIZ `revalidateTag("products")`
 * atılıyor (cari/tedarikçi/tip mutasyonları etiket atmıyor) — o yüzden ürün
 * sayıları anında, diğerleri en geç 60 sn içinde tazelenir. Kurulum paneli için
 * bu kabul edilebilir: sayılar bir aktarımın hemen ardından okunuyor ve aktarım
 * ürün tablosuna da dokunuyor.
 */
export const dynamic = "force-dynamic";

const getCachedSetupStatus = unstable_cache(
    () => dbGetImportSetupStatus(),
    ["import-setup-status"],
    { tags: ["products"], revalidate: 60 },
);

export async function GET(req: NextRequest) {
    try {
        const guard = await requirePermission(req, "view_import");
        if (guard) return guard;

        return NextResponse.json(await getCachedSetupStatus());
    } catch (err) {
        return handleApiError(err, "GET /api/import/setup-status");
    }
}
