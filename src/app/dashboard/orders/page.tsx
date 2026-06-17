import { resolveAuthContext } from "@/lib/auth/role-guard";
import { serviceListOrdersPaged, serviceCountOrdersByTab } from "@/lib/services/order-service";
import { redactOrdersForPerms } from "@/lib/auth/redact";
import { mapOrderSummary } from "@/lib/api-mappers";
import { ORDERS_DEFAULT_PAGE_SIZE, type OrderTab } from "@/lib/supabase/orders";
import OrdersClient from "./OrdersClient";

// Sunucu tarafı filtre + sayfalama (A1). Auth/cookie okuduğu için zaten dinamik;
// açıkça force-dynamic ile her gezinmede taze veri.
export const dynamic = "force-dynamic";

const VALID_TABS: readonly OrderTab[] = ["ALL", "draft", "pending_approval", "approved", "shipped", "cancelled"];

function firstStr(v: string | string[] | undefined): string {
    if (Array.isArray(v)) return v[0] ?? "";
    return v ?? "";
}

export default async function OrdersPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const sp = await searchParams;
    const tabRaw = firstStr(sp.tab);
    const tab: OrderTab = VALID_TABS.includes(tabRaw as OrderTab) ? (tabRaw as OrderTab) : "ALL";
    // `search` (yeni) veya `customer` (eski isim-bazlı deep-link) → arama metni.
    const search = (firstStr(sp.search) || firstStr(sp.customer)).trim();
    const customerId = firstStr(sp.customerId);
    const dateFrom = firstStr(sp.from);
    const dateTo = firstStr(sp.to);
    const currency = firstStr(sp.currency);
    const page = Math.max(1, parseInt(firstStr(sp.page) || "1", 10) || 1);

    const ctx = await resolveAuthContext();
    if (!ctx.perms.has("view_sales_orders")) {
        return (
            <div style={{ padding: "40px", textAlign: "center", color: "var(--text-secondary)", fontSize: "14px" }}>
                Bu sayfayı görüntüleme yetkiniz yok.
            </div>
        );
    }

    const [paged, counts] = await Promise.all([
        serviceListOrdersPaged({
            tab,
            search: search || undefined,
            customer_id: customerId || undefined,
            date_from: dateFrom || undefined,
            date_to: dateTo || undefined,
            currency: currency || undefined,
            page,
            pageSize: ORDERS_DEFAULT_PAGE_SIZE,
        }),
        serviceCountOrdersByTab(),
    ]);

    // RBAC redaction (route ile birebir) — fiyat alanları view_sales_prices'sız null.
    const orders = redactOrdersForPerms(paged.rows, ctx.perms).map(mapOrderSummary);

    return (
        <OrdersClient
            orders={orders}
            total={paged.total}
            counts={counts}
            page={page}
            pageSize={ORDERS_DEFAULT_PAGE_SIZE}
            tab={tab}
            search={search}
            customerId={customerId}
            dateFrom={dateFrom}
            dateTo={dateTo}
            currency={currency}
        />
    );
}
