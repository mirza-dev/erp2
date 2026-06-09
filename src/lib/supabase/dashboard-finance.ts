import { createServiceClient } from "./service";

/** Aylık COGS satırı — ürün para birimi bazında (normalizasyon istemcide). */
export interface MonthlyCogsRow {
    month: string;        // "YYYY-MM"
    currency: string;
    cogs: number;
}

/**
 * Aylık COGS (satılan malın maliyeti) — `dashboard_monthly_cogs` RPC (mig.087).
 * `Σ(order_lines.qty × products.cost_price)`, sipariş ayı + ürün para birimi bazında,
 * iptal/taslak hariç. RBAC: çağrı view_purchase_costs ile gate'lenir (endpoint seviyesi).
 */
export async function dbGetMonthlyCogs(startDate: string): Promise<MonthlyCogsRow[]> {
    const sb = createServiceClient();
    const { data, error } = await sb.rpc("dashboard_monthly_cogs", { p_start: startDate });
    if (error) throw new Error(`dashboard_monthly_cogs: ${error.message}`);
    return ((data ?? []) as { month: string; currency: string; cogs: number | string }[]).map((r) => ({
        month: r.month,
        currency: String(r.currency).trim().toUpperCase(),
        cogs: Number(r.cogs) || 0,
    }));
}
