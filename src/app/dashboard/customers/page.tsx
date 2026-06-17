import { resolveAuthContext } from "@/lib/auth/role-guard";
import { redactCustomersForPerms } from "@/lib/auth/redact";
import { mapCustomer } from "@/lib/api-mappers";
import {
    dbListCustomersPaged,
    dbCountCustomers,
    CUSTOMERS_DEFAULT_PAGE_SIZE,
    type CustomerTab,
} from "@/lib/supabase/customers";
import { firstStr, parsePage } from "@/lib/list-query";
import CustomersClient from "./CustomersClient";

// Sunucu tarafı filtre + sayfalama (A1).
export const dynamic = "force-dynamic";

const VALID_TABS: readonly CustomerTab[] = ["all", "active", "passive"];

export default async function CustomersPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const sp = await searchParams;
    const tabRaw = firstStr(sp.tab);
    const tab: CustomerTab = VALID_TABS.includes(tabRaw as CustomerTab) ? (tabRaw as CustomerTab) : "all";
    const search = firstStr(sp.search).trim();
    const page = parsePage(sp.page);

    const isActive = tab === "active" ? true : tab === "passive" ? false : undefined;

    const [paged, counts, ctx] = await Promise.all([
        dbListCustomersPaged({
            search: search || undefined,
            is_active: isActive,
            page,
            pageSize: CUSTOMERS_DEFAULT_PAGE_SIZE,
        }),
        dbCountCustomers(),
        resolveAuthContext(),
    ]);

    // RBAC R3 (route ile birebir): view_financial_summary yoksa total_revenue null.
    // Redaction RAW satırda → sonra mapCustomer.
    const customers = redactCustomersForPerms(paged.rows, ctx.perms).map(mapCustomer);

    return (
        <CustomersClient
            customers={customers}
            total={paged.total}
            counts={counts}
            page={page}
            pageSize={CUSTOMERS_DEFAULT_PAGE_SIZE}
            tab={tab}
            search={search}
        />
    );
}
