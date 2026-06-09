export type ValidUntilBadge = { text: string; type: "expired" | "urgent" | "ok" };

export function getValidUntilBadge(validUntil: string | null): ValidUntilBadge | null {
    if (!validUntil) return null;
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    if (validUntil < todayStr) return { text: "Süresi Doldu", type: "expired" };
    const days = Math.round(
        (new Date(validUntil + "T12:00:00").getTime() - new Date(todayStr + "T12:00:00").getTime()) / 86400000
    );
    if (days <= 3) return { text: `${days} gün kaldı`, type: "urgent" };
    return { text: `${days} gün kaldı`, type: "ok" };
}

export function canDeleteQuote(status: string): boolean {
    // Bulgu 2 (2. review tur, 2026-05-30): sadece draft silinebilir. Faz 4'te
    // sent teklifin immutable arşivi var (quote_pdf_archives ON DELETE CASCADE);
    // sent silinince arşiv de düşerdi. Sent değişmek istenirse revize edilir.
    return status === "draft";
}

/**
 * Bulgu 3 / P2-A (2026-05-30): toplu silmede YALNIZ başarılı (fulfilled + res.ok)
 * id'leri döndürür. Local state'ten yalnız bunlar düşürülür — 409 (sent draft-only
 * kilidi) veya network fail eden satır ekranda kalır (refresh'te geri gelip
 * UI'ı yanıltmasın). `results`, `ids` ile index-hizalı olmalıdır.
 */
export function pickSucceededIds(
    ids: string[],
    results: PromiseSettledResult<{ ok: boolean }>[],
): string[] {
    return ids.filter((_, i) => {
        const r = results[i];
        return r.status === "fulfilled" && r.value.ok;
    });
}

// ── Status transition helpers ────────────────────────────────────────────────

import type { QuoteStatus } from "@/lib/database.types";

export type QuoteAction = {
    transition: "sent" | "accepted" | "rejected";
    label: string;
    variant: "primary" | "danger";
    confirm?: { title: string; message: string; confirmLabel: string };
};

export function getQuoteActions(status: QuoteStatus, quoteNumber: string): QuoteAction[] {
    switch (status) {
        case "draft":
            return [{
                transition: "sent",
                label: "Gönder",
                variant: "primary",
                confirm: {
                    title: "Teklifi Gönder",
                    message: `${quoteNumber} numaralı teklif "gönderildi" olarak işaretlenecek ve belgesi dondurulacak (immutable arşiv).`,
                    confirmLabel: "Gönder",
                },
            }];
        case "sent":
            return [
                {
                    transition: "rejected",
                    label: "Reddet",
                    variant: "danger",
                    confirm: {
                        title: "Teklifi Reddet",
                        message: `${quoteNumber} numaralı teklifi reddetmek istediğinize emin misiniz? Bu işlem geri alınamaz.`,
                        confirmLabel: "Evet, Reddet",
                    },
                },
                {
                    // Faz 6: accept + taslak sipariş tek atomik işlem (POST /accept).
                    transition: "accepted",
                    label: "Kabul Et ve Siparişe Dönüştür",
                    variant: "primary",
                    confirm: {
                        title: "Teklifi Kabul Et ve Siparişe Dönüştür",
                        message: `${quoteNumber} numaralı teklif kabul edilip taslak sipariş olarak oluşturulacak. Devam etmek istiyor musunuz?`,
                        confirmLabel: "Kabul Et ve Dönüştür",
                    },
                },
            ];
        default:
            return [];
    }
}

export function isQuoteEditable(status: QuoteStatus): boolean {
    return status === "draft";
}

// ── Revizyon (Faz 5) ─────────────────────────────────────────
// sent/rejected/expired teklif revize edilebilir (düzenlenebilir kopya yaratır).
// draft zaten düzenlenebilir; accepted sipariş bağı taşır; revised terminal.
export function getQuoteReviseEligible(status: QuoteStatus): boolean {
    return status === "sent" || status === "rejected" || status === "expired";
}

// ── Siparişe Dönüştür ────────────────────────────────────────

export interface QuoteConvertInfo {
    label: string;
    confirmTitle: string;
    confirmMessage: string;
    confirmLabel: string;
}

export function getQuoteConvertAction(quoteNumber: string): QuoteConvertInfo {
    return {
        label: "Siparişe Dönüştür",
        confirmTitle: "Teklifi Siparişe Dönüştür",
        confirmMessage: `${quoteNumber} numaralı teklif taslak sipariş olarak oluşturulacak. Devam etmek istiyor musunuz?`,
        confirmLabel: "Evet, Dönüştür",
    };
}
