import {
    dbListVendorsPaged,
    VENDORS_DEFAULT_PAGE_SIZE,
} from "@/lib/supabase/vendors";
import { firstStr, parsePage } from "@/lib/list-query";
import VendorsClient from "./VendorsClient";

// Sunucu tarafı filtre + sayfalama (A1).
export const dynamic = "force-dynamic";

export default async function VendorsPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const sp = await searchParams;
    const search = firstStr(sp.search).trim();
    const showAll = firstStr(sp.all) === "1";
    const page = parsePage(sp.page);

    // showAll=false → yalnız aktif; showAll=true → tümü (aktif+pasif).
    const paged = await dbListVendorsPaged({
        search: search || undefined,
        isActive: showAll ? undefined : true,
        page,
        pageSize: VENDORS_DEFAULT_PAGE_SIZE,
    });

    return (
        <VendorsClient
            vendors={paged.rows}
            total={paged.total}
            page={page}
            pageSize={VENDORS_DEFAULT_PAGE_SIZE}
            search={search}
            showAll={showAll}
        />
    );
}
