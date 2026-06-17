import { resolveAuthContext } from "@/lib/auth/role-guard";
import { redactQuotesForPerms } from "@/lib/auth/redact";
import { mapQuoteSummary } from "@/lib/api-mappers";
import {
    dbListQuotesPaged,
    dbCountQuotesByStatus,
    QUOTES_DEFAULT_PAGE_SIZE,
    type QuoteTab,
} from "@/lib/supabase/quotes";
import type { QuoteStatus } from "@/lib/database.types";
import { firstStr, parsePage } from "@/lib/list-query";
import QuotesClient from "./QuotesClient";

// Sunucu tarafı filtre + sayfalama (A1). Auth/cookie okur → dinamik.
export const dynamic = "force-dynamic";

const VALID_TABS: readonly QuoteTab[] = ["ALL", "draft", "sent", "accepted", "rejected", "expired", "revised"];

export default async function QuotesPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const sp = await searchParams;
    const tabRaw = firstStr(sp.tab);
    const tab: QuoteTab = VALID_TABS.includes(tabRaw as QuoteTab) ? (tabRaw as QuoteTab) : "ALL";
    const search = firstStr(sp.search).trim();
    const currency = firstStr(sp.currency);
    const dateFrom = firstStr(sp.from);
    const dateTo = firstStr(sp.to);
    const page = parsePage(sp.page);

    const [paged, counts, ctx] = await Promise.all([
        dbListQuotesPaged({
            status: tab === "ALL" ? undefined : (tab as QuoteStatus),
            search: search || undefined,
            currency: currency || undefined,
            date_from: dateFrom || undefined,
            date_to: dateTo || undefined,
            page,
            pageSize: QUOTES_DEFAULT_PAGE_SIZE,
        }),
        dbCountQuotesByStatus(),
        resolveAuthContext(),
    ]);

    // RBAC R3 (route ile birebir): view_sales_prices yoksa grandTotal null.
    // mapQuoteSummary ÖNCE (redactQuotesForPerms mapped summary üzerinde çalışır).
    const quotes = redactQuotesForPerms(paged.rows.map(mapQuoteSummary), ctx.perms);

    return (
        <QuotesClient
            quotes={quotes}
            total={paged.total}
            counts={counts}
            page={page}
            pageSize={QUOTES_DEFAULT_PAGE_SIZE}
            tab={tab}
            search={search}
            currency={currency}
            dateFrom={dateFrom}
            dateTo={dateTo}
        />
    );
}
