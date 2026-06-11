import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserPermissions } from "@/lib/auth/role-guard";
import { dbGetCompanySettings } from "@/lib/supabase/company-settings";
import { dbGetMonthlyCogs, type MonthlyCogsRow } from "@/lib/supabase/dashboard-finance";
import { handleApiError } from "@/lib/api-error";
import { appendServerTiming, startSpan } from "@/lib/server-timing";
import { unstable_cache } from "next/cache";

export const dynamic = "force-dynamic";

// Perf Faz 5: aylık COGS RPC'si (mig.087) ~1.7s sürüyordu ve her dashboard
// açılışında cache'siz koşuyordu. COGS = order_lines × cost_price → sipariş ve
// ürün maliyeti değişiminde oynar; order/quote/production mutasyonları zaten
// revalidateTag("products") atıyor → "products" tag'i pratik invalidasyonu
// sağlar ("finance-cogs" ileride hassas invalidasyon için rezerve).
// RBAC DİKKAT: canViewCosts ve reportingCurrency cache DIŞINDA — redaction
// per-request kalır (customers route kalıbı), cache key'ine perms sızmaz.
const getCachedMonthlyCogs = unstable_cache(
    async (startStr: string) => dbGetMonthlyCogs(startStr),
    ["dashboard-monthly-cogs"],
    { tags: ["products", "finance-cogs"], revalidate: 300 },
);

/**
 * GET /api/dashboard/finance
 * Genel Bakış paneli için maliyet (COGS) + raporlama para birimi.
 * - reportingCurrency: company_settings.currency (default USD).
 * - cogs: aylık COGS satırları (view_purchase_costs varsa); yoksa null (RPC çağrılmaz).
 * Normalizasyon + brüt kâr/marj istemci view-model'inde (ciro ile aynı yol).
 */
export async function GET(req: NextRequest) {
    try {
        const authSpan = startSpan();
        const perms = await getCurrentUserPermissions(req);
        const authMs = authSpan();
        const canViewCosts = perms.has("view_purchase_costs");

        const dbSpan = startSpan();
        const settings = await dbGetCompanySettings();
        const reportingCurrency = (settings?.currency ?? "USD").trim().toUpperCase() || "USD";

        let cogs: MonthlyCogsRow[] | null = null;
        if (canViewCosts) {
            // son 12 ay penceresinin başlangıcı (ayın 1'i)
            const now = new Date();
            const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
            const startStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-01`;
            cogs = await getCachedMonthlyCogs(startStr);
        }
        const dbMs = dbSpan();

        return appendServerTiming(
            NextResponse.json({ reportingCurrency, canViewCosts, cogs }),
            [{ name: "auth", ms: authMs }, { name: "db", ms: dbMs }],
        );
    } catch (err) {
        return handleApiError(err, "GET /api/dashboard/finance");
    }
}
