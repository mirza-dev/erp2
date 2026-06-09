// Teklif "Gönder" sonucu — toast cascade + müşteri e-posta gönderimi.
// 088: send transition'ı arşiv/rezervasyon uyarısı veya stok shortage taşıyabilir.
// Bu mantık hem teklif DETAY sayfasında ([id]/page.tsx) hem YENİ teklif formunda
// (QuoteForm inline-send) kullanılır → tek kaynak (drift önleme). Rezervasyon
// mesajı değişince yalnız burada değişir, iki gönderim UX'i kilit adımda kalır.

type ToastType = "success" | "error" | "warning" | "info";
type ToastFn = (opts: { type: ToastType; message: string }) => void;

// PATCH /api/quotes/[id] { transition: "sent" } yanıtının ilgili alanları.
export interface SendTransitionData {
    archiveWarning?: boolean;
    reservationWarning?: boolean;
    shortages?: { shortage: number }[];
    reservedOrderNumber?: string;
}

/**
 * "Gönder" başarılı transition sonrası kullanıcıya gösterilecek toast.
 * Öncelik: arşiv fail > rezervasyon fail > stok shortage > başarı (sessiz değil).
 */
export function applySendResultToast(toast: ToastFn, data: SendTransitionData): void {
    if (data.archiveWarning) {
        toast({ type: "warning", message: "Teklif gönderildi ancak arşiv oluşturulamadı." });
    } else if (data.reservationWarning) {
        toast({ type: "warning", message: "Teklif gönderildi ancak stok rezervasyonu (bekleyen sipariş) oluşturulamadı." });
    } else if (Array.isArray(data.shortages) && data.shortages.length > 0) {
        const total = data.shortages.reduce((s, x) => s + x.shortage, 0);
        toast({ type: "warning", message: `Teklif gönderildi · stok kısmen rezerve edildi (${total} birim yetersiz). Bekleyen sipariş: ${data.reservedOrderNumber ?? "—"}` });
    } else {
        toast({ type: "success", message: "Teklif gönderildi · stok rezerve edildi (bekleyen sipariş)" });
    }
}

/**
 * "Gönder" başarılı olduktan sonra (checkbox işaretliyse) müşteriye teklif
 * belgesini HTML ek olarak e-posta ile gönderir. Transition'dan bağımsız;
 * başarısızlık transition'ı geri almaz — yalnız uyarı toast'ı.
 */
export async function sendQuoteEmail(quoteId: string, toast: ToastFn): Promise<void> {
    try {
        const res = await fetch(`/api/quotes/${quoteId}/send-email`, { method: "POST" });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
            toast({ type: "success", message: "Teklif müşteriye e-posta ile gönderildi." });
        } else {
            toast({ type: "warning", message: data.error || "Teklif gönderildi ancak e-posta iletilemedi." });
        }
    } catch {
        toast({ type: "warning", message: "Teklif gönderildi ancak e-posta iletilemedi." });
    }
}
