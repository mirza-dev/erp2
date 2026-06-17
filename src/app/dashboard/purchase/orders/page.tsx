import { resolveAuthContext } from "@/lib/auth/role-guard";
import { redactPurchaseOrdersForPerms } from "@/lib/auth/redact";
import {
    dbListPurchaseOrdersPaged,
    dbCountPurchaseOrdersByStatus,
    PURCHASE_ORDERS_DEFAULT_PAGE_SIZE,
    type PurchaseOrderTab,
} from "@/lib/supabase/purchase-orders";
import type { PurchaseOrderStatus } from "@/lib/database.types";
import { dbListVendors } from "@/lib/supabase/vendors";
import { firstStr, parsePage } from "@/lib/list-query";
import PurchaseOrdersClient from "./PurchaseOrdersClient";

// Sunucu tarafı filtre + sayfalama (A1).
export const dynamic = "force-dynamic";

const VALID_TABS: readonly PurchaseOrderTab[] =
    ["all", "draft", "sent", "confirmed", "partially_received", "received", "cancelled"];

export default async function PurchaseOrdersPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const sp = await searchParams;
    const tabRaw = firstStr(sp.tab);
    const tab: PurchaseOrderTab = VALID_TABS.includes(tabRaw as PurchaseOrderTab) ? (tabRaw as PurchaseOrderTab) : "all";
    const search = firstStr(sp.search).trim();
    const page = parsePage(sp.page);

    const ctx = await resolveAuthContext();
    if (!ctx.perms.has("view_purchase_orders")) {
        return (
            <div style={{ padding: "40px", textAlign: "center", color: "var(--text-secondary)", fontSize: "14px" }}>
                Bu sayfayı görüntüleme yetkiniz yok.
            </div>
        );
    }

    // Tedarikçi adı hem gösterimde hem aramada lazım → tüm vendor map (küçük tablo).
    const vendors = await dbListVendors({});
    const vendorMap: Record<string, string> = {};
    for (const v of vendors) vendorMap[v.id] = v.name;
    // Arama vendor adını da kapsar → ada göre eşleşen vendor_id'ler.
    const vendorIds = search
        ? vendors.filter(v => v.name.toLowerCase().includes(search.toLowerCase())).map(v => v.id)
        : undefined;

    const [paged, counts] = await Promise.all([
        dbListPurchaseOrdersPaged({
            status: tab === "all" ? undefined : (tab as PurchaseOrderStatus),
            search: search || undefined,
            vendorIds,
            page,
            pageSize: PURCHASE_ORDERS_DEFAULT_PAGE_SIZE,
        }),
        dbCountPurchaseOrdersByStatus(),
    ]);

    // RBAC: view_purchase_costs yoksa maliyet alanları null (route ile birebir).
    const orders = redactPurchaseOrdersForPerms(paged.rows, ctx.perms);

    return (
        <PurchaseOrdersClient
            orders={orders}
            total={paged.total}
            counts={counts}
            page={page}
            pageSize={PURCHASE_ORDERS_DEFAULT_PAGE_SIZE}
            tab={tab}
            search={search}
            vendorMap={vendorMap}
        />
    );
}
