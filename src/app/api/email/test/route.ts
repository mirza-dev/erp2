/**
 * POST /api/email/test — Admin-only e-posta smoke test endpoint
 *
 * Production deploy sonrası Resend + DNS + EMAIL_FROM doğrulamasını
 * recipient_lookup/dedup BYPASS ederek hızlı yapar.
 *
 * Body: { to: string (email), type: NotificationTypeKey }
 * Auth: requireRole(["admin"]) — middleware Supabase session zorunlu
 * Demo guard: 403 — middleware zaten /api/** demo POST'u bloklar, ek savunma
 *
 * Davranış:
 *   - 5 NOTIFICATION_TYPE'ın her biri için makul sample context render
 *   - dbCreateEmailLog → status='pending' (entity_type='test_email')
 *   - Resend direct send (notifyUsersByEmail içindeki dedup ve recipient lookup
 *     bypass edilir — admin'in test attığı kişiye her seferinde gitmeli)
 *   - dbUpdateEmailLogStatus → 'sent' veya 'failed'
 *   - Config eksikse 503 + "config_missing" (RESEND_API_KEY veya EMAIL_FROM yok)
 *
 * Smoke akışı (deploy sonrası):
 *   1. Coolify env'de RESEND_API_KEY + EMAIL_FROM set edilmiş
 *   2. Migration 047 production DB'de uygulanmış
 *   3. Admin login → POST /api/email/test {"to":"sen@example.com","type":"stock_critical"}
 *   4. Inbox'a "Kritik stok: Test Ürün" maili düşmeli
 */
import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/role-guard";
import { renderEmail, type RenderContext } from "@/lib/email/templates";
import { NOTIFICATION_TYPE_KEYS, type NotificationTypeKey } from "@/lib/notification-types";
import { dbCreateEmailLog, dbUpdateEmailLogStatus } from "@/lib/supabase/email-logs";
import { handleApiError } from "@/lib/api-error";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function buildSampleContext(type: NotificationTypeKey): RenderContext {
    switch (type) {
        case "stock_critical":
            return { type, ctx: { productName: "Test Ürün", sku: "TST-001", available: 0, min: 10 } };
        case "order_pending":
            return { type, ctx: { orderNumber: "TST-2026-001", customerName: "Test Müşteri Ltd. Şti.", total: 1500, currency: "TRY" } };
        case "order_new":
            return { type, ctx: { orderNumber: "TST-2026-001", customerName: "Test Müşteri Ltd. Şti.", total: 1500, currency: "TRY" } };
        case "sync_error":
            return { type, ctx: { entityName: "Test Müşteri (Paraşüt sync)", errorMessage: "Bu bir test hata mesajıdır — gerçek sync hatası değil." } };
        case "order_shipped":
            return { type, ctx: { orderNumber: "TST-2026-001", customerName: "Test Müşteri Ltd. Şti." } };
    }
}

export async function POST(request: NextRequest) {
    try {
        // 1. Admin guard
        const roleGuard = await requireRole(request, ["admin"]);
        if (roleGuard) return roleGuard;

        // 2. Body validation
        const body = await request.json().catch(() => null) as { to?: unknown; type?: unknown } | null;
        if (!body) return NextResponse.json({ error: "Geçersiz JSON body." }, { status: 400 });

        const to = typeof body.to === "string" ? body.to.trim() : "";
        const type = typeof body.type === "string" ? body.type : "";

        if (!EMAIL_RE.test(to)) {
            return NextResponse.json({ error: "Geçerli bir e-posta adresi gerekli (to)." }, { status: 400 });
        }
        if (!NOTIFICATION_TYPE_KEYS.has(type)) {
            return NextResponse.json(
                { error: `Geçersiz bildirim tipi (type). Geçerli: ${[...NOTIFICATION_TYPE_KEYS].join(", ")}` },
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
                    error: "Email config eksik (RESEND_API_KEY veya EMAIL_FROM tanımsız). Coolify env vars kontrol edin.",
                    has_api_key: !!apiKey,
                    has_email_from: !!from,
                },
                { status: 503 },
            );
        }

        // 4. Mevcut user id'sini al (audit/log için)
        const sb = await createClient();
        const { data: { user } } = await sb.auth.getUser();
        if (!user) return NextResponse.json({ error: "Oturum bulunamadı." }, { status: 401 });

        // 5. Render
        const content = renderEmail(buildSampleContext(type as NotificationTypeKey));

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
                from,
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
