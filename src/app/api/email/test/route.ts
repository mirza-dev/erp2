/**
 * POST /api/email/test — internal operator e-posta smoke test endpoint
 *
 * Production deploy sonrası Resend + DNS + EMAIL_FROM doğrulamasını
 * recipient_lookup/dedup BYPASS ederek hızlı yapar.
 *
 * Body: { to: string (email), type: NotificationTypeKey | "quote_customer_send" }
 * Auth: INTERNAL_OPERATOR_EMAILS allowlist + view_settings (fail-closed)
 * Demo guard: 403 — middleware zaten /api/** demo POST'u bloklar, ek savunma
 *
 * 2026-08-29: gönderim zinciri `email-test-service.ts`'e taşındı; ikinci
 * tüketici `POST /api/settings/user/notifications/test` (kullanıcının kendi
 * adresine). Bu ucun sözleşmesi ve guard'ı DEĞİŞMEDİ — serbest `to` yalnız iç
 * operatörde kalır.
 *
 * Smoke akışı (deploy sonrası):
 *   1. Coolify env'de RESEND_API_KEY + EMAIL_FROM set edilmiş
 *   2. Migration 047 production DB'de uygulanmış
 *   3. Internal operator login → POST /api/email/test {"to":"sen@example.com","type":"stock_critical"}
 *   4. Inbox'a "[Roven] Kritik stok · Test Ürün" maili düşmeli
 */
import { NextRequest, NextResponse } from "next/server";
import { resolveAuthContext } from "@/lib/auth/role-guard";
import { requireInternalOperatorFor } from "@/lib/auth/internal-access";
import { handleApiError } from "@/lib/api-error";
import { EMAIL_TEST_TYPES, sendSampleNotificationEmail } from "@/lib/services/email-test-service";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
    try {
        // 1. Internal operator guard — müşteri adminleri buradan serbest adrese
        //    test atamaz (kendi adreslerine atmak için settings/user ucu var).
        const auth = await resolveAuthContext();
        const internalGuard = requireInternalOperatorFor(auth);
        if (internalGuard) return internalGuard;

        // 2. Body validation
        const body = await request.json().catch(() => null) as { to?: unknown; type?: unknown } | null;
        if (!body) return NextResponse.json({ error: "Geçersiz JSON body." }, { status: 400 });

        const to = typeof body.to === "string" ? body.to.trim() : "";
        const type = typeof body.type === "string" ? body.type : "";

        if (!EMAIL_RE.test(to)) {
            return NextResponse.json({ error: "Geçerli bir e-posta adresi gerekli (to)." }, { status: 400 });
        }
        if (!EMAIL_TEST_TYPES.has(type)) {
            return NextResponse.json(
                { error: `Geçersiz bildirim tipi (type). Geçerli: ${[...EMAIL_TEST_TYPES].join(", ")}` },
                { status: 400 },
            );
        }

        const user = auth.user;
        if (!user) return NextResponse.json({ error: "Oturum bulunamadı." }, { status: 401 });

        // 3. Gönder (config kontrolü + log + Resend helper'da)
        const result = await sendSampleNotificationEmail({ userId: user.id, to, type });

        if (result.status === "config_missing") {
            return NextResponse.json(
                { status: "config_missing", error: "E-posta gönderim yapılandırması tamamlanmamış." },
                { status: 503 },
            );
        }
        if (result.status === "log_failed") {
            return NextResponse.json(
                { status: "error", error: `Email log create failed: ${result.error}` },
                { status: 500 },
            );
        }
        if (result.status === "failed") {
            return NextResponse.json(
                { status: "failed", error: result.error, log_id: result.logId },
                { status: 502 },
            );
        }
        // Fırlatan gönderim (ağ/SDK) — eski sözleşmede ayrı `status: "error"`.
        if (result.status === "send_error") {
            return NextResponse.json(
                { status: "error", error: result.error, log_id: result.logId },
                { status: 502 },
            );
        }
        return NextResponse.json({
            status: "sent",
            resend_message_id: result.messageId,
            log_id: result.logId,
            to: result.to,
            subject: result.subject,
        });
    } catch (err) {
        return handleApiError(err, "POST /api/email/test");
    }
}
