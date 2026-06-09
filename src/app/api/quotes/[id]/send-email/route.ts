import { NextRequest, NextResponse } from "next/server";
import { serviceSendQuoteToCustomer } from "@/lib/services/quote-service";
import { requirePermission, getCurrentUserId } from "@/lib/auth/role-guard";
import { handleApiError } from "@/lib/api-error";

/**
 * POST /api/quotes/[id]/send-email
 *
 * Teklif belgesini (dondurulmuş HTML ek) teklifte yazan müşteri e-postasına gönderir.
 * Status transition'dan bağımsız — frontend "Gönder" onayında checkbox işaretliyse,
 * başarılı transition SONRASI çağırır. RBAC = send transition ile aynı (manage_quotes).
 *
 * Map: notFound→404, no_email→400, config_missing→503, Resend fail→502, ok→200.
 * Demo: middleware /api/** POST'u zaten 403'ler.
 */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const guard = await requirePermission(req, "manage_quotes");
        if (guard) return guard;

        const { id } = await params;
        const actor = await getCurrentUserId();
        const result = await serviceSendQuoteToCustomer(id, actor);

        if (result.ok) {
            return NextResponse.json({ status: "sent", messageId: result.messageId });
        }
        if (result.notFound) {
            return NextResponse.json({ error: "Teklif bulunamadı." }, { status: 404 });
        }
        if (result.reason === "no_email") {
            return NextResponse.json(
                { error: "Bu teklifte müşteri e-postası yok. Önce teklife geçerli bir e-posta ekleyin." },
                { status: 400 },
            );
        }
        if (result.error === "config_missing") {
            return NextResponse.json(
                { error: "E-posta gönderimi yapılandırılmamış (sunucu)." },
                { status: 503 },
            );
        }
        return NextResponse.json(
            { error: `E-posta gönderilemedi: ${result.error ?? "bilinmeyen hata"}` },
            { status: 502 },
        );
    } catch (err) {
        return handleApiError(err, "POST /api/quotes/[id]/send-email");
    }
}
