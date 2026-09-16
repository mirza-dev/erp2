import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { dbGetImportSetupStatus, dbCountAuthUsers } from "@/lib/supabase/import-setup-status";
import type { ImportSetupStatus } from "@/lib/supabase/import-setup-status";
import { requireAnyRole, getCurrentUserRoles } from "@/lib/auth/role-guard";
import { ROLES } from "@/lib/auth/permissions";
import { handleApiError } from "@/lib/api-error";

/**
 * GET /api/import/setup-status — kurulum rehberi sayaçları (Veri Aktarım
 * Merkezi paneli + pano bandı).
 *
 * Panel "neyi taşıdın, neyi taşımadın" sorusunu GERÇEK veriden cevaplar;
 * kullanıcının elle işaretlediği bir kontrol listesi değildir.
 *
 * Guard (2026-09-16, kullanıcı kararı "herkes görsün"): eskiden `view_import`
 * idi → satış ve viewer pano bandını HİÇ görmüyordu. Uç yalnız sayaç döner
 * (PII yok), o yüzden oturumu olan her rol okur; hangi adımın kime görüneceği
 * istemcide yetkiyle süzülür (`buildSetupSteps(status, perms)`). Import
 * SAYFASININ yetkisi değişmedi.
 *
 * Cache: `dashboard/counters` emsali. `products` etiketi ürün mutasyonlarında,
 * `company-settings` etiketi firma profili PATCH'inde atılıyor; cari/tedarikçi/
 * teklif/sipariş sayıları en geç 60 sn içinde tazelenir (realtime kanalı da
 * bu anahtarı orders/quotes/customers/vendors domain'lerinde geçersiz kılar).
 *
 * `users` alanı KASTEN cache dışında: yalnız admin görür (listUsers admin API)
 * ve `unstable_cache` anahtarı global — kişiye göre değişen alan cache'e
 * girseydi ilk isteyen kişinin görünümü herkese servis edilirdi.
 */
export const dynamic = "force-dynamic";

const getCachedSetupStatus = unstable_cache(
    () => dbGetImportSetupStatus(),
    ["import-setup-status"],
    { tags: ["products", "company-settings"], revalidate: 60 },
);

export async function GET(req: NextRequest) {
    try {
        const guard = await requireAnyRole(req, [...ROLES]);
        if (guard) return guard;

        const status: ImportSetupStatus = { ...(await getCachedSetupStatus()) };

        const roles = await getCurrentUserRoles(req);
        if (roles.includes("admin")) {
            status.users = { total: await dbCountAuthUsers() };
        }

        return NextResponse.json(status);
    } catch (err) {
        return handleApiError(err, "GET /api/import/setup-status");
    }
}
