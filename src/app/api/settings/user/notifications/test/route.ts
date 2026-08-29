/**
 * POST /api/settings/user/notifications/test — "bildirim e-postam geliyor mu?"
 *
 * 2026-08-29: fabrika admini bildirim tercihlerini açıyor ama gerçekten
 * e-posta gelip gelmediğini HİÇBİR YERDEN göremiyordu — `/api/email/test` ve
 * E-posta Teslimatları sayfası yalnız iç operatöre açık. Kurulum gününde
 * "açtım, çalışıyor mu?" sorusunun cevabı yoktu.
 *
 * GÜVENLİK TASARIMI — alıcı gövdeden OKUNMAZ:
 * `to` her zaman oturum sahibinin kendi adresidir. Keyfi adrese gönderim bir
 * doğrulama kuralıyla değil, YAPISAL olarak imkânsızdır (istekte böyle bir alan
 * yok) → bu uç bir spam/relay yüzeyi açmaz. Serbest `to` yalnız iç operatörün
 * `/api/email/test`'inde kalır.
 *
 * Tür seçimi: kullanıcının ROL MATRİSİNE uygun türlerden ilki
 * (`eligibleNotificationTypes`). Kullanıcı yalnız kendisine gelecek bildirimi
 * test eder; hiç uygun tür yoksa 400.
 *
 * Guard sınıfı: self-auth (kardeş `settings/user/*` uçlarıyla aynı) — yan
 * etkisi yalnız kendi gelen kutusu. Gate baseline'ında kayıtlı.
 */
import { NextResponse } from "next/server";
import { resolveAuthContext } from "@/lib/auth/role-guard";
import { hasInternalOperatorAccess } from "@/lib/auth/internal-access";
import { eligibleNotificationTypes } from "@/lib/notification-policy";
import { NOTIFICATION_TYPES } from "@/lib/notification-types";
import { sendSampleNotificationEmail } from "@/lib/services/email-test-service";
import { rateLimitCheck } from "@/lib/rate-limit";
import { handleApiError } from "@/lib/api-error";

/**
 * 5 dakikada 3 test. Yarıçap kullanıcının KENDİ gelen kutusu olduğu için sıkı
 * olmasına gerek yok; amaç kazara üst üste tıklamayı ve Resend kotasını
 * korumak. Redis yoksa `rateLimitCheck` fail-open döner — bilinçli kabul.
 */
const TEST_EMAIL_POLICY = { name: "notif-test", points: 3, duration: 300 } as const;

export async function POST() {
    try {
        const auth = await resolveAuthContext();
        if (!auth.user?.email) {
            return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
        }

        const internalOperator = hasInternalOperatorAccess(auth.user.email, auth.perms);
        const eligible = eligibleNotificationTypes(auth.roles, internalOperator);
        if (eligible.length === 0) {
            return NextResponse.json(
                { error: "Rolünüze atanmış bir bildirim türü yok — test gönderilemez." },
                { status: 400 },
            );
        }

        const limit = await rateLimitCheck(`notif-test:${auth.user.id}`, TEST_EMAIL_POLICY);
        if (!limit.ok) {
            return NextResponse.json(
                { error: "Çok sık test gönderdiniz. Birkaç dakika sonra tekrar deneyin.", retryAfter: limit.retryAfter },
                { status: 429 },
            );
        }

        const type = eligible[0];
        const result = await sendSampleNotificationEmail({
            userId: auth.user.id,
            to: auth.user.email,   // ← gövdeden DEĞİL, oturumdan
            type,
        });

        if (result.status === "config_missing") {
            return NextResponse.json(
                {
                    status: "config_missing",
                    error: "E-posta gönderimi yapılandırılmamış (RESEND_API_KEY / EMAIL_FROM).",
                },
                { status: 503 },
            );
        }
        if (result.status === "log_failed") {
            return NextResponse.json({ status: "error", error: result.error }, { status: 500 });
        }
        if (result.status === "failed" || result.status === "send_error") {
            return NextResponse.json({ status: "failed", error: result.error }, { status: 502 });
        }

        return NextResponse.json({
            status: "sent",
            to: result.to,
            type,
            typeLabel: NOTIFICATION_TYPES.find(t => t.key === type)?.label ?? type,
        });
    } catch (err) {
        return handleApiError(err, "POST /api/settings/user/notifications/test");
    }
}
