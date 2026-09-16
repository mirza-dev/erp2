import { createServiceClient } from "@/lib/supabase/service";
import { dbGetCompanySettings } from "@/lib/supabase/company-settings";
import { dbCreateEmailLog, dbUpdateEmailLogStatus } from "@/lib/supabase/email-logs";
import { getEmailRuntimeStatus, sendDirectEmail } from "@/lib/services/email-service";
import { renderUserInvite } from "@/lib/email/templates";
import { RECOVERY_PATH } from "@/lib/auth/recovery-route";
import { ROLE_LABELS, type Role } from "@/lib/auth/permissions";

/**
 * Kullanıcı daveti — parolasız açılan hesaba "parolanı belirle" e-postası
 * (onboarding, 2026-09-16).
 *
 * NEDEN BÖYLE: Admin eskiden parola yazıp elden iletiyordu (davet yoktu);
 * admin sıfırlama da geçici parola yazıyordu çünkü e-posta altyapısı yoktu ve
 * Supabase'in yerleşik SMTP'si saatte 2–4 e-postayla sınırlıydı.
 *
 * Çözüm iki parçayı birleştirir: bağlantıyı Supabase ÜRETİR
 * (`auth.admin.generateLink({ type: "recovery" })` — SMTP'ye dokunmaz), e-postayı
 * BİZ göndeririz (Resend, `sendDirectEmail`). Bağlantı mevcut kurtarma zincirine
 * düşer: `/auth/callback?next=/sifre-yenile` → kullanıcı parolasını belirler.
 * Yeni bir `next` hedefi AÇILMAZ (`resolveNextPath` allowlist'i aynen).
 *
 * `inviteAvailable()` eşiği yalnız `RESEND_API_KEY ∧ EMAIL_FROM` — doğrudan
 * gönderim eşiği; outbox'ın istediği webhook sırrı burada gerekmez.
 */

export const USER_INVITE_ENTITY_TYPE = "user_invite";

/** Davet gönderilebilir mi (doğrudan e-posta eşiği). */
export function inviteAvailable(): boolean {
    const s = getEmailRuntimeStatus();
    return s.hasApiKey && s.hasFrom;
}

export interface SendUserInviteInput {
    userId: string;
    email: string;
    roles: Role[];
    /** Daveti gönderen admin (audit actor + e-postada "davet eden"). */
    inviter: { id: string | null; email: string | null };
    /** Bağlantının döneceği origin — `NEXT_PUBLIC_APP_URL` yoksa istek origin'i. */
    origin: string;
}

export type SendUserInviteResult =
    | { ok: true; logId: string | null }
    | { ok: false; error: string };

export async function sendUserInvite(input: SendUserInviteInput): Promise<SendUserInviteResult> {
    const svc = createServiceClient();

    const redirectTo = `${input.origin.replace(/\/$/, "")}/auth/callback?next=${RECOVERY_PATH}`;
    const { data: linkData, error: linkErr } = await svc.auth.admin.generateLink({
        type: "recovery",
        email: input.email,
        options: { redirectTo },
    });
    const actionLink = linkData?.properties?.action_link;
    if (linkErr || !actionLink) {
        return { ok: false, error: linkErr?.message ?? "Davet bağlantısı üretilemedi." };
    }

    let companyName: string | null = null;
    try {
        companyName = (await dbGetCompanySettings())?.name?.trim() || null;
    } catch { /* firma adı süs; yoksa "Roven" */ }

    const body = renderUserInvite({
        email: input.email,
        roleLabels: input.roles.map(r => ROLE_LABELS[r] ?? r),
        inviterEmail: input.inviter.email,
        actionLink,
        companyName,
    });

    // Log (pending) — başarısız olursa gönderimi yine de dene (best-effort audit;
    // quote-service ile aynı desen).
    let logId: string | null = null;
    try {
        logId = await dbCreateEmailLog({
            user_id: input.inviter.id ?? "00000000-0000-0000-0000-000000000000",
            notification_type: "user_invite",
            entity_type: USER_INVITE_ENTITY_TYPE,
            entity_id: input.userId,
            recipient_email: input.email,
            subject: body.subject,
        });
    } catch (err) {
        console.error("[user-invite] email log create failed", err);
    }

    const sendRes = await sendDirectEmail({
        to: input.email,
        subject: body.subject,
        html: body.html,
        text: body.text,
        ...(logId ? { idempotencyKey: `user-invite-log-${logId}` } : {}),
    });

    if (logId) {
        try {
            await dbUpdateEmailLogStatus(
                logId,
                sendRes.ok ? "sent" : "failed",
                sendRes.ok ? { resend_message_id: sendRes.messageId } : { error: sendRes.error },
            );
        } catch (err) {
            console.error("[user-invite] email log status update failed", err);
        }
    }

    if (!sendRes.ok) return { ok: false, error: sendRes.error ?? "send_failed" };

    // Başkası adına hesap açıp davet göndermek iz bırakmalı. `{ error }` ÇÖZÜLÜR
    // (dış inceleme #7): PostgREST hatayı reject etmez, sonuçta döndürür.
    try {
        const { error: auditErr } = await svc.from("audit_log").insert({
            actor: input.inviter.email ?? null,
            action: "user_invited",
            entity_type: "user",
            entity_id: null,
            source: "ui",
            before_state: null,
            after_state: { user_id: input.userId, email: input.email, roles: input.roles },
        });
        if (auditErr) {
            console.error(JSON.stringify({ audit_insert_failed: auditErr.message, action: "user_invited", targetUserId: input.userId }));
        }
    } catch (auditErr) {
        console.error(JSON.stringify({ audit_insert_threw: String(auditErr), action: "user_invited", targetUserId: input.userId }));
    }

    return { ok: true, logId };
}

/** Rastgele, politikayı aşan geçici parola — kullanıcı asla görmez, davetle değiştirir. */
export function randomInvitePassword(): string {
    // 32 bayt → 43 karakter base64url; büyük/küçük/rakam garantisi için ek karakterler.
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
    const b64 = Buffer.from(bytes).toString("base64url");
    return `Rv1!${b64}`;
}
