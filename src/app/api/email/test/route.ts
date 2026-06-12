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
 * Davranış:
 *   - 5 iç bildirim + müşteri teklif e-postası için makul sample context render
 *   - dbCreateEmailLog → status='pending' (entity_type='test_email')
 *   - Resend direct send (notifyUsersByEmail içindeki dedup ve recipient lookup
 *     bypass edilir — admin'in test attığı kişiye her seferinde gitmeli)
 *   - dbUpdateEmailLogStatus → 'sent' veya 'failed'
 *   - Config eksikse 503 + "config_missing" (RESEND_API_KEY veya EMAIL_FROM yok)
 *
 * Smoke akışı (deploy sonrası):
 *   1. Coolify env'de RESEND_API_KEY + EMAIL_FROM set edilmiş
 *   2. Migration 047 production DB'de uygulanmış
 *   3. Internal operator login → POST /api/email/test {"to":"sen@example.com","type":"stock_critical"}
 *   4. Inbox'a "[Roven] Kritik stok · Test Ürün" maili düşmeli
 */
import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { resolveAuthContext } from "@/lib/auth/role-guard";
import {
    renderEmail,
    renderQuoteToCustomer,
    type EmailContent,
    type RenderContext,
} from "@/lib/email/templates";
import { requireInternalOperatorFor } from "@/lib/auth/internal-access";
import { NOTIFICATION_TYPE_KEYS, type NotificationTypeKey } from "@/lib/notification-types";
import { dbCreateEmailLog, dbUpdateEmailLogStatus } from "@/lib/supabase/email-logs";
import { handleApiError } from "@/lib/api-error";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const QUOTE_TEST_TYPE = "quote_customer_send";
const EMAIL_TEST_TYPES = new Set<string>([...NOTIFICATION_TYPE_KEYS, QUOTE_TEST_TYPE]);

function buildSampleContext(type: NotificationTypeKey): RenderContext {
    switch (type) {
        case "stock_critical":
            return { type, ctx: { productId: "00000000-0000-0000-0000-000000000001", productName: "Test Ürün", sku: "TST-001", available: 0, min: 10 } };
        case "order_pending":
            return { type, ctx: { orderId: "00000000-0000-0000-0000-000000000002", orderNumber: "TST-2026-001", customerName: "Test Müşteri Ltd. Şti.", total: 1500, currency: "TRY" } };
        case "order_new":
            return { type, ctx: { orderId: "00000000-0000-0000-0000-000000000002", orderNumber: "TST-2026-001", customerName: "Test Müşteri Ltd. Şti.", total: 1500, currency: "TRY" } };
        case "sync_error":
            return { type, ctx: { entityName: "Test Müşteri (Paraşüt sync)", errorMessage: "Bu bir test hata mesajıdır — gerçek sync hatası değil." } };
        case "order_shipped":
            return { type, ctx: { orderId: "00000000-0000-0000-0000-000000000002", orderNumber: "TST-2026-001", customerName: "Test Müşteri Ltd. Şti." } };
    }
}

function buildSampleContent(type: string): EmailContent {
    if (type === QUOTE_TEST_TYPE) {
        return renderQuoteToCustomer({
            quoteNumber: "TST-2026-001",
            customerName: "Örnek Müşteri A.Ş.",
            validUntil: "2026-06-30",
            companyName: "Örnek Endüstriyel A.Ş.",
            companyPhone: "+90 212 555 01 23",
            companyEmail: "teklif@example.com",
            companyWebsite: "https://example.com",
        });
    }
    return renderEmail(buildSampleContext(type as NotificationTypeKey));
}

export async function POST(request: NextRequest) {
    try {
        // 1. Internal operator guard — müşteri adminleri gerçek test e-postası atamaz.
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

        // 3. Config check
        const apiKey = process.env.RESEND_API_KEY;
        const from = process.env.EMAIL_FROM?.trim();
        if (!apiKey || !from) {
            return NextResponse.json(
                {
                    status: "config_missing",
                    error: "E-posta gönderim yapılandırması tamamlanmamış.",
                },
                { status: 503 },
            );
        }

        // 4. Mevcut user id (audit/log için) — auth context'ten.
        const user = auth.user;
        if (!user) return NextResponse.json({ error: "Oturum bulunamadı." }, { status: 401 });

        // 5. Render
        const content = buildSampleContent(type);

        // 6. Log (pending)
        let logId: string;
        try {
            logId = await dbCreateEmailLog({
                user_id: user.id,
                notification_type: type,
                entity_type: "test_email",
                entity_id: null,
                recipient_email: to,
                subject: content.subject,
            });
        } catch (err) {
            return NextResponse.json(
                { status: "error", error: `Email log create failed: ${err instanceof Error ? err.message : "unknown"}` },
                { status: 500 },
            );
        }

        // 7. Resend direct send (recipient lookup + dedup BYPASS — test endpoint)
        const resend = new Resend(apiKey);
        try {
            const sendRes = await resend.emails.send({
                from,
                to,
                subject: content.subject,
                html: content.html,
                text: content.text,
            });
            if (sendRes.error) {
                await dbUpdateEmailLogStatus(logId, "failed", { error: sendRes.error.message });
                return NextResponse.json(
                    { status: "failed", error: sendRes.error.message, log_id: logId },
                    { status: 502 },
                );
            }
            await dbUpdateEmailLogStatus(logId, "sent", { resend_message_id: sendRes.data?.id });
            return NextResponse.json({
                status: "sent",
                resend_message_id: sendRes.data?.id,
                log_id: logId,
                to,
                subject: content.subject,
            });
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Resend send error";
            try { await dbUpdateEmailLogStatus(logId, "failed", { error: msg }); }
            catch { /* best-effort */ }
            return NextResponse.json(
                { status: "error", error: msg, log_id: logId },
                { status: 502 },
            );
        }
    } catch (err) {
        return handleApiError(err, "POST /api/email/test");
    }
}
