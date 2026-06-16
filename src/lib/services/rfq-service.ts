/**
 * RFQ servis katmanı: gönderim (PDF/HTML arşiv + tedarikçi e-postası) ve arşiv
 * yardımcıları. quote-service serviceSendQuoteToCustomer / serviceArchiveQuotePdf
 * desenini tedarikçiye uyarlar. Belge bir TALEP — fiyat içermez.
 *
 * v1: tedarikçiye gönderilen ek, self-contained HTML belgesidir
 * (`Fiyat-Talebi-<no>.html`). Müşteri tarafındaki @react-pdf PDF üretimi ileride
 * RfqPdfDocument ile birebir aynalanabilir; veri hattı (arşiv + e-posta) aynı kalır.
 */
import { createHash } from "crypto";
import { dbGetRfqById, dbMarkRfqSent } from "@/lib/supabase/supplier-rfqs";
import { dbCreateRfqArchive } from "@/lib/supabase/rfq-archives";
import { buildRfqDocData, renderRfqArchiveHtml } from "@/lib/rfq-archive-html";
import { dbGetCompanySettings } from "@/lib/supabase/company-settings";
import { sendDirectEmail } from "@/lib/services/email-service";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** E-posta gövdesine gömülen değerleri HTML-escape eder (templates.ts konvansiyonu). */
function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

export interface SendRfqResult {
    sent: boolean;
    archived: number;
    emailed: number;
    /** E-postası olmayan / gönderilemeyen tedarikçiler (UX uyarısı). */
    warnings: string[];
}

/**
 * RFQ'yu gönder: her davet tedarikçi için belgeyi arşivle + (e-postası varsa) gönder,
 * sonra RFQ'yu `sent`'e taşı. Arşiv/e-posta başarısızlığı NON-FATAL (warning) —
 * durum geçişi yine de yapılır (tedarikçiyle harici iletişim mümkün).
 */
export async function serviceSendRfq(rfqId: string, actor: string): Promise<SendRfqResult> {
    const detail = await dbGetRfqById(rfqId);
    if (!detail) throw new Error("RFQ bulunamadı.");
    if (detail.status !== "draft" && detail.status !== "sent") {
        throw new Error(`RFQ gönderilemez (durum: ${detail.status}).`);
    }

    const company = await dbGetCompanySettings().catch(() => null);
    const warnings: string[] = [];
    let archived = 0;
    let emailed = 0;

    for (const vendor of detail.vendors) {
        let html: string;
        try {
            const data = buildRfqDocData(detail, vendor, company);
            html = await renderRfqArchiveHtml(data);
            const contentHash = createHash("sha256").update(html).digest("hex");
            await dbCreateRfqArchive({
                rfqId,
                vendorId: vendor.vendor_id,
                html,
                contentHash,
                byteSize: Buffer.byteLength(html, "utf-8"),
                createdBy: actor,
            });
            archived++;
        } catch (err) {
            warnings.push(`${vendor.vendor_name}: belge arşivlenemedi (${err instanceof Error ? err.message : "hata"}).`);
            continue;
        }

        if (!vendor.vendor_email || !EMAIL_RE.test(vendor.vendor_email)) {
            warnings.push(`${vendor.vendor_name}: e-posta adresi yok, belge elle iletilmeli.`);
            continue;
        }

        // Gerçek PDF eki (react-pdf). Üretim başarısızsa o tedarikçi için warning —
        // belgesiz/HTML'siz mail GİTMEZ (arşiv HTML zaten in-app "Belge" view'da durur).
        let pdf: Buffer;
        try {
            const { renderRfqPdfBuffer } = await import("@/lib/rfq-pdf");
            pdf = await renderRfqPdfBuffer(buildRfqDocData(detail, vendor, company));
        } catch (err) {
            warnings.push(`${vendor.vendor_name}: PDF üretilemedi, e-posta atlandı (${err instanceof Error ? err.message : "hata"}).`);
            continue;
        }

        const subject = `Fiyat Talebi ${detail.rfq_number}${detail.title ? ` — ${detail.title}` : ""}`;
        const text = `Sayın ${vendor.vendor_name},\n\n${detail.rfq_number} numaralı fiyat talebimiz ektedir. Lütfen kalemler için birim fiyat, teslim süresi ve geçerlilik bildiriniz.${detail.due_date ? `\nYanıt son tarihi: ${detail.due_date}` : ""}\n\nTeşekkürler.`;
        const res = await sendDirectEmail({
            to: vendor.vendor_email,
            subject,
            html: `<p>Sayın ${escapeHtml(vendor.vendor_name)},</p><p><strong>${escapeHtml(detail.rfq_number)}</strong> numaralı fiyat talebimiz ektedir. Lütfen kalemler için birim fiyat, teslim süresi ve geçerlilik bildiriniz.${detail.due_date ? `<br>Yanıt son tarihi: <strong>${escapeHtml(detail.due_date)}</strong>` : ""}</p><p>Teşekkürler.</p>`,
            text,
            attachments: [{ filename: `Fiyat-Talebi-${detail.rfq_number}.pdf`, content: pdf }],
            replyTo: company?.email ?? undefined,
        });
        if (res.ok) emailed++;
        else warnings.push(`${vendor.vendor_name}: e-posta gönderilemedi (${res.error ?? "hata"}).`);
    }

    await dbMarkRfqSent(rfqId, actor);
    return { sent: true, archived, emailed, warnings };
}
