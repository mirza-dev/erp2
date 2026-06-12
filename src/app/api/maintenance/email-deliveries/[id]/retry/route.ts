import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-error";
import { requireInternalOperatorFor } from "@/lib/auth/internal-access";
import { resolveAuthContext } from "@/lib/auth/role-guard";
import { retryInternalEmailDelivery } from "@/lib/services/notification-outbox-service";

export async function POST(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const auth = await resolveAuthContext();
        const guard = requireInternalOperatorFor(auth);
        if (guard) return guard;
        const result = await retryInternalEmailDelivery((await params).id);
        if (result.ok) return NextResponse.json({ ok: true });
        if (result.reason === "not_found") return NextResponse.json({ error: "Teslimat bulunamadı." }, { status: 404 });
        if (result.reason === "suppressed") return NextResponse.json({ error: "Alıcı suppression nedeniyle bloke." }, { status: 409 });
        if (result.reason === "expired") return NextResponse.json({ error: "Yeniden deneme gövdesinin süresi dolmuş." }, { status: 410 });
        if (result.reason === "not_retryable") return NextResponse.json({ error: "Bu teslimat yeniden denenemez." }, { status: 409 });
        if (result.reason === "config_missing") return NextResponse.json({ error: "E-posta çalışma zamanı konfigürasyonu eksik." }, { status: 503 });
        return NextResponse.json({ error: "E-posta yeniden gönderilemedi." }, { status: 502 });
    } catch (err) {
        return handleApiError(err, "POST /api/maintenance/email-deliveries/[id]/retry");
    }
}
