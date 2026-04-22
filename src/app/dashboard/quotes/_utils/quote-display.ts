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
    return status === "draft" || status === "sent";
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
            return [{ transition: "sent", label: "Gönder", variant: "primary" }];
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
                    transition: "accepted",
                    label: "Kabul Et",
                    variant: "primary",
                    confirm: {
                        title: "Teklifi Kabul Et",
                        message: `${quoteNumber} numaralı teklifi kabul etmek istediğinize emin misiniz?`,
                        confirmLabel: "Kabul Et",
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
