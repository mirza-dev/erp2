import { NextRequest, NextResponse } from "next/server";
import { safeParseJson, handleApiError } from "@/lib/api-error";
import { sendDirectEmail } from "@/lib/services/email-service";
import {
    validateContactLead,
    renderContactLeadEmail,
    type ContactLeadInput,
} from "@/lib/marketing/contact-lead";

/**
 * Pazarlama sayfasının "Kurulum görüşmesi" formu.
 *
 * ALWAYS_PUBLIC (proxy) — oturumsuz ziyaretçi doldurur. Bu yüzden üç katman:
 *   1. Bal küpü alanı (`website`) — dolu ise 200 döner, HİÇBİR ŞEY göndermez.
 *   2. Rate limit — `POLICIES.CONTACT` (proxy'de seçilir): 3 / 15 dk / IP.
 *   3. Alan doğrulama + uzunluk tavanları (`contact-lead.ts`).
 *
 * Veritabanına YAZMAZ. Bilerek: lead depolamak migration + RLS + KVKK saklama
 * süresi demek; bugünkü hacimde e-posta kutusu yeterli ve kişisel veriyi
 * sistemde tutmamak KVKK açısından daha temiz. Hacim büyürse ayrı tur.
 */
export async function POST(req: NextRequest) {
    try {
        const parsed = await safeParseJson(req);
        if (!parsed.ok) return parsed.response;

        const result = validateContactLead((parsed.data ?? {}) as ContactLeadInput);

        if (!result.ok) {
            // Bal küpü: bota hata gösterme — düzeltip yeniden dener. Sessiz başarı.
            if ("silent" in result) return NextResponse.json({ ok: true });
            return NextResponse.json(
                { error: result.error, field: result.field },
                { status: 400 },
            );
        }

        // Lead nereye düşecek? Ayrı adres tanımlıysa oraya, yoksa gönderen adrese.
        const to = process.env.CONTACT_EMAIL || process.env.EMAIL_FROM;
        if (!to) {
            // Fail-loud: form sessizce yutulmaz. Sayfa yedek iletişim yolunu gösterir.
            return NextResponse.json(
                { error: "İletişim formu şu anda yapılandırılmamış." },
                { status: 503 },
            );
        }

        const { subject, html, text } = renderContactLeadEmail(result.lead);
        const sent = await sendDirectEmail({
            to,
            subject,
            html,
            text,
            // Yanıtla → doğrudan talebi bırakana gider.
            replyTo: result.lead.email,
        });

        if (!sent.ok) {
            return NextResponse.json(
                { error: "Talebiniz gönderilemedi. Lütfen e-posta ile ulaşın." },
                { status: 502 },
            );
        }

        return NextResponse.json({ ok: true });
    } catch (error) {
        return handleApiError(error, "POST /api/contact", {
            clientMessage: "Talebiniz işlenemedi. Lütfen daha sonra tekrar deneyin.",
        });
    }
}
