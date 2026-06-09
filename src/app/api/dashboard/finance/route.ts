import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserPermissions } from "@/lib/auth/role-guard";
import { dbGetCompanySettings } from "@/lib/supabase/company-settings";
import { dbGetMonthlyCogs, type MonthlyCogsRow } from "@/lib/supabase/dashboard-finance";
import { handleApiError } from "@/lib/api-error";

export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/finance
 * Genel Bakış paneli için maliyet (COGS) + raporlama para birimi.
 * - reportingCurrency: company_settings.currency (default USD).
 * - cogs: aylık COGS satırları (view_purchase_costs varsa); yoksa null (RPC çağrılmaz).
 * Normalizasyon + brüt kâr/marj istemci view-model'inde (ciro ile aynı yol).
 */
export async function GET(req: NextRequest) {
    try {
        const perms = await getCurrentUserPermissions(req);
        const canViewCosts = perms.has("view_purchase_costs");

        const settings = await dbGetCompanySettings();
        const reportingCurrency = (settings?.currency ?? "USD").trim().toUpperCase() || "USD";

        let cogs: MonthlyCogsRow[] | null = null;
        if (canViewCosts) {
            // son 12 ay penceresinin başlangıcı (ayın 1'i)
            const now = new Date();
            const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
            const startStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-01`;
            cogs = await dbGetMonthlyCogs(startStr);
        }

        return NextResponse.json({ reportingCurrency, canViewCosts, cogs });
    } catch (err) {
        return handleApiError(err, "GET /api/dashboard/finance");
    }
}
