/**
 * Quote Service — business logic layer for quote status lifecycle.
 * Transition map: draft→sent, sent→accepted|rejected.
 * Terminal states: accepted, rejected, expired (CRON-only).
 */

import type { QuoteStatus } from "@/lib/database.types";
import { dbGetQuote, dbUpdateQuoteStatus, dbListExpiredQuotes } from "@/lib/supabase/quotes";

// ── Types ────────────────────────────────────────────────────

export type QuoteTransition = "sent" | "accepted" | "rejected";

export interface QuoteTransitionResult {
    success: boolean;
    error?: string;
    notFound?: boolean;
}

// ── Transition map ───────────────────────────────────────────

const QUOTE_TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = {
    draft:    ["sent"],
    sent:     ["accepted", "rejected"],
    accepted: [],
    rejected: [],
    expired:  [],
};

export function isValidQuoteTransition(from: QuoteStatus, to: QuoteStatus): boolean {
    return QUOTE_TRANSITIONS[from]?.includes(to) ?? false;
}

// ── Status Transition ────────────────────────────────────────

export async function serviceTransitionQuote(
    quoteId: string,
    transition: QuoteTransition
): Promise<QuoteTransitionResult> {
    const quote = await dbGetQuote(quoteId);
    if (!quote) return { success: false, error: "Teklif bulunamadı.", notFound: true };

    const target = transition as QuoteStatus;
    if (!isValidQuoteTransition(quote.status, target)) {
        return {
            success: false,
            error: `'${quote.status}' durumundaki teklif '${target}' durumuna geçirilemez.`,
        };
    }

    await dbUpdateQuoteStatus(quoteId, target);
    return { success: true };
}

// ── Quote Expiry (CRON) ──────────────────────────────────────

/**
 * Süresi dolmuş teklifleri tarar:
 *   - draft/sent + valid_until < today → status = expired
 *
 * Endpoint: POST /api/quotes/expire (CRON_SECRET ile çağrılır)
 */
export async function serviceExpireQuotes(): Promise<{ expired: number }> {
    const expiredQuotes = await dbListExpiredQuotes();
    let expired = 0;
    for (const q of expiredQuotes) {
        await dbUpdateQuoteStatus(q.id, "expired");
        expired++;
    }
    return { expired };
}

// ── Query ────────────────────────────────────────────────────

export async function serviceGetQuote(id: string) {
    return dbGetQuote(id);
}
