/**
 * Resend-friendly e-posta şablonları.
 *
 * İki ayrı açık-kurumsal aile:
 * - İç operasyon bildirimleri: Roven markalı, kompakt ve aksiyon odaklı.
 * - Müşteri teklifleri: yalnız gönderen firma markalı.
 *
 * E-posta istemcisi uyumluluğu için layout tablolarla ve inline CSS ile kurulur.
 */
import type { NotificationTypeKey } from "@/lib/notification-types";

export interface EmailContent {
    subject: string;
    html: string;
    text: string;
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://erp.getmedspace.com";
const COLORS = {
    canvas: "#eef2f7",
    surface: "#ffffff",
    surfaceSubtle: "#f7f9fc",
    border: "#dbe3ed",
    borderStrong: "#c7d2df",
    text: "#172033",
    muted: "#64748b",
    subtle: "#94a3b8",
    accent: "#2563eb",
    accentSoft: "#eaf2ff",
    danger: "#dc2626",
    dangerSoft: "#fff1f2",
    warning: "#b45309",
    warningSoft: "#fff8e8",
    success: "#15803d",
    successSoft: "#edf9f0",
};

type DetailRow = readonly [label: string, value: string];

interface InternalShellOpts {
    title: string;
    preheader: string;
    eyebrow: string;
    tone: "accent" | "danger" | "warning" | "success";
    intro: string;
    rows: DetailRow[];
    ctaLabel: string;
    ctaUrl: string;
    noteHtml?: string;
}

export interface QuoteToCustomerCtx {
    quoteNumber: string;
    customerName: string;
    validUntil?: string | null;
    companyName?: string | null;
    companyLogoUrl?: string | null;
    companyPhone?: string | null;
    companyEmail?: string | null;
    companyWebsite?: string | null;
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function escapeAttr(value: string): string {
    return escapeHtml(value);
}

function safeHttpUrl(value: string | null | undefined): string | null {
    const trimmed = value?.trim();
    if (!trimmed) return null;
    try {
        const url = new URL(trimmed);
        return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
    } catch {
        return null;
    }
}

function appUrl(path: string): string {
    try {
        return new URL(path, APP_URL).toString();
    } catch {
        return `${APP_URL.replace(/\/$/, "")}${path}`;
    }
}

function preheader(text: string): string {
    return `<span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all">${escapeHtml(text)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</span>`;
}

function detailsTable(rows: DetailRow[]): string {
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;background:${COLORS.surfaceSubtle};border:1px solid ${COLORS.border};border-radius:6px">
      ${rows.map(([label, value], index) => `<tr>
        <td style="padding:11px 14px;color:${COLORS.muted};font-size:12px;font-weight:600;line-height:18px;${index < rows.length - 1 ? `border-bottom:1px solid ${COLORS.border};` : ""}">${escapeHtml(label)}</td>
        <td align="right" style="padding:11px 14px;color:${COLORS.text};font-size:13px;font-weight:600;line-height:18px;word-break:break-word;${index < rows.length - 1 ? `border-bottom:1px solid ${COLORS.border};` : ""}">${escapeHtml(value)}</td>
      </tr>`).join("")}
    </table>`;
}

function ctaButton(label: string, url: string): string {
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate">
      <tr>
        <td bgcolor="${COLORS.accent}" style="border-radius:6px">
          <a href="${escapeAttr(url)}" style="display:inline-block;padding:11px 18px;color:#ffffff;font-size:13px;font-weight:700;line-height:18px;text-decoration:none;border-radius:6px">${escapeHtml(label)}</a>
        </td>
      </tr>
    </table>`;
}

function emailDocument(preheaderText: string, content: string): string {
    return `<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <title>${escapeHtml(preheaderText)}</title>
</head>
<body style="margin:0;padding:0;background:${COLORS.canvas};color:${COLORS.text};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%">
  ${preheader(preheaderText)}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.canvas}" style="width:100%;border-collapse:collapse;background:${COLORS.canvas}">
    <tr>
      <td align="center" style="padding:32px 14px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;border-collapse:separate">
          <tr><td>${content}</td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function toneColors(tone: InternalShellOpts["tone"]): { fg: string; bg: string; label: string } {
    switch (tone) {
        case "danger": return { fg: COLORS.danger, bg: COLORS.dangerSoft, label: "Acil işlem" };
        case "warning": return { fg: COLORS.warning, bg: COLORS.warningSoft, label: "İşlem bekliyor" };
        case "success": return { fg: COLORS.success, bg: COLORS.successSoft, label: "Tamamlandı" };
        default: return { fg: COLORS.accent, bg: COLORS.accentSoft, label: "Bilgilendirme" };
    }
}

function internalShell(opts: InternalShellOpts): string {
    const tone = toneColors(opts.tone);
    return emailDocument(opts.preheader, `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse">
        <tr>
          <td style="padding:0 4px 16px;color:${COLORS.text};font-size:18px;font-weight:800;line-height:24px;letter-spacing:0.2px">Roven</td>
          <td align="right" style="padding:0 4px 16px;color:${COLORS.subtle};font-size:11px;font-weight:700;line-height:18px;text-transform:uppercase;letter-spacing:0.8px">Operasyon Bildirimi</td>
        </tr>
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.surface}" style="width:100%;border-collapse:separate;background:${COLORS.surface};border:1px solid ${COLORS.borderStrong};border-radius:8px">
        <tr>
          <td style="padding:26px 26px 8px">
            <span style="display:inline-block;padding:5px 9px;background:${tone.bg};color:${tone.fg};border-radius:4px;font-size:10px;font-weight:800;line-height:14px;text-transform:uppercase;letter-spacing:0.7px">${escapeHtml(tone.label)}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 26px 0;color:${COLORS.muted};font-size:11px;font-weight:700;line-height:17px;text-transform:uppercase;letter-spacing:0.8px">${escapeHtml(opts.eyebrow)}</td>
        </tr>
        <tr>
          <td style="padding:5px 26px 0;color:${COLORS.text};font-size:22px;font-weight:800;line-height:29px">${escapeHtml(opts.title)}</td>
        </tr>
        <tr>
          <td style="padding:12px 26px 20px;color:${COLORS.muted};font-size:14px;font-weight:400;line-height:22px">${escapeHtml(opts.intro)}</td>
        </tr>
        <tr>
          <td style="padding:0 26px 22px">${detailsTable(opts.rows)}</td>
        </tr>
        ${opts.noteHtml ? `<tr><td style="padding:0 26px 22px">${opts.noteHtml}</td></tr>` : ""}
        <tr>
          <td style="padding:0 26px 28px">${ctaButton(opts.ctaLabel, opts.ctaUrl)}</td>
        </tr>
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse">
        <tr>
          <td style="padding:16px 4px 0;color:${COLORS.subtle};font-size:11px;line-height:18px">
            Bu bildirimi <a href="${escapeAttr(appUrl("/dashboard/settings?tab=bildirimler"))}" style="color:${COLORS.muted};text-decoration:underline">bildirim tercihlerinizden</a> yönetebilirsiniz.
          </td>
        </tr>
      </table>`);
}

function fmtCurrency(amount: number, currency: string): string {
    try {
        return new Intl.NumberFormat("tr-TR", {
            style: "currency",
            currency,
            minimumFractionDigits: 2,
        }).format(amount);
    } catch {
        return `${amount.toFixed(2)} ${currency}`;
    }
}

function fmtDateTr(iso: string): string {
    try {
        return new Date(`${iso}T00:00:00Z`).toLocaleDateString("tr-TR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            timeZone: "UTC",
        });
    } catch {
        return iso;
    }
}

function recordUrl(kind: "product" | "order", id?: string): string {
    const base = kind === "product" ? "/dashboard/products" : "/dashboard/orders";
    return appUrl(id ? `${base}/${encodeURIComponent(id)}` : base);
}

export interface StockCriticalCtx {
    productId?: string;
    productName: string;
    sku: string;
    available: number;
    min: number;
}

export function renderStockCritical(ctx: StockCriticalCtx): EmailContent {
    const subject = `[Roven] Kritik stok · ${ctx.productName}`;
    const html = internalShell({
        title: "Stok seviyesi kritik eşiğin altında",
        preheader: `${ctx.productName} için kullanılabilir stok ${ctx.available}.`,
        eyebrow: "Stok ve ürünler",
        tone: "danger",
        intro: "Aşağıdaki ürünün kullanılabilir stoğu tanımlı minimum seviyenin altına düştü.",
        rows: [
            ["Ürün", ctx.productName],
            ["SKU", ctx.sku],
            ["Kullanılabilir stok", `${ctx.available}`],
            ["Minimum seviye", `${ctx.min}`],
        ],
        ctaLabel: "Ürün detayını aç",
        ctaUrl: recordUrl("product", ctx.productId),
    });
    const text = `${subject}\n\n${ctx.productName} ürününün stoğu minimum seviyenin altına düştü.\n` +
        `SKU: ${ctx.sku}\nKullanılabilir stok: ${ctx.available}\nMinimum seviye: ${ctx.min}\n\n` +
        `Ürün detayı: ${recordUrl("product", ctx.productId)}`;
    return { subject, html, text };
}

export interface OrderPendingCtx {
    orderId?: string;
    orderNumber: string;
    customerName: string;
    total: number;
    currency: string;
}

export function renderOrderPending(ctx: OrderPendingCtx): EmailContent {
    const subject = `[Roven] Onay bekleyen sipariş · ${ctx.orderNumber}`;
    const html = internalShell({
        title: "Sipariş onayınızı bekliyor",
        preheader: `${ctx.orderNumber} numaralı sipariş onay bekliyor.`,
        eyebrow: "Satış siparişleri",
        tone: "warning",
        intro: "Sipariş işleme devam edebilmek için onayınızı bekliyor.",
        rows: [
            ["Sipariş numarası", ctx.orderNumber],
            ["Müşteri", ctx.customerName],
            ["Sipariş tutarı", fmtCurrency(ctx.total, ctx.currency)],
        ],
        ctaLabel: "Sipariş detayını aç",
        ctaUrl: recordUrl("order", ctx.orderId),
    });
    const text = `${subject}\n\nSipariş onayınızı bekliyor.\nSipariş: ${ctx.orderNumber}\n` +
        `Müşteri: ${ctx.customerName}\nTutar: ${fmtCurrency(ctx.total, ctx.currency)}\n\n` +
        `Sipariş detayı: ${recordUrl("order", ctx.orderId)}`;
    return { subject, html, text };
}

export interface OrderNewCtx {
    orderId?: string;
    orderNumber: string;
    customerName: string;
    total: number;
    currency: string;
}

export function renderOrderNew(ctx: OrderNewCtx): EmailContent {
    const subject = `[Roven] Yeni sipariş · ${ctx.orderNumber}`;
    const html = internalShell({
        title: "Yeni sipariş oluşturuldu",
        preheader: `${ctx.orderNumber} numaralı yeni sipariş oluşturuldu.`,
        eyebrow: "Satış siparişleri",
        tone: "accent",
        intro: "Sisteme yeni bir satış siparişi eklendi.",
        rows: [
            ["Sipariş numarası", ctx.orderNumber],
            ["Müşteri", ctx.customerName],
            ["Sipariş tutarı", fmtCurrency(ctx.total, ctx.currency)],
        ],
        ctaLabel: "Sipariş detayını aç",
        ctaUrl: recordUrl("order", ctx.orderId),
    });
    const text = `${subject}\n\nYeni sipariş oluşturuldu.\nSipariş: ${ctx.orderNumber}\n` +
        `Müşteri: ${ctx.customerName}\nTutar: ${fmtCurrency(ctx.total, ctx.currency)}\n\n` +
        `Sipariş detayı: ${recordUrl("order", ctx.orderId)}`;
    return { subject, html, text };
}

export interface SyncErrorCtx {
    entityName: string;
    errorMessage: string;
}

export function renderSyncError(ctx: SyncErrorCtx): EmailContent {
    const subject = `[Roven] Paraşüt senkronizasyon sorunu · ${ctx.entityName}`;
    const html = internalShell({
        title: "Paraşüt senkronizasyonu tamamlanamadı",
        preheader: `${ctx.entityName} için senkronizasyon işlemi kontrol edilmeli.`,
        eyebrow: "Finans entegrasyonu",
        tone: "danger",
        intro: "Bir Paraşüt senkronizasyon işlemi tamamlanamadı. Güvenli teknik ayrıntıları uygulama içinden inceleyin.",
        rows: [["İlgili kayıt", ctx.entityName]],
        noteHtml: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.dangerSoft}" style="width:100%;border-collapse:separate;background:${COLORS.dangerSoft};border:1px solid #fecdd3;border-radius:6px">
          <tr><td style="padding:12px 14px;color:${COLORS.danger};font-size:12px;font-weight:600;line-height:19px">Tam hata ayrıntısı güvenlik nedeniyle e-postaya eklenmedi.</td></tr>
        </table>`,
        ctaLabel: "Paraşüt yönetimini aç",
        ctaUrl: appUrl("/dashboard/parasut"),
    });
    const text = `${subject}\n\n${ctx.entityName} için senkronizasyon tamamlanamadı. ` +
        `Tam hata ayrıntısını uygulama içinden inceleyin.\n\nParaşüt yönetimi: ${appUrl("/dashboard/parasut")}`;
    return { subject, html, text };
}

export interface OrderShippedCtx {
    orderId?: string;
    orderNumber: string;
    customerName: string;
}

export function renderOrderShipped(ctx: OrderShippedCtx): EmailContent {
    const subject = `[Roven] Sipariş sevk edildi · ${ctx.orderNumber}`;
    const html = internalShell({
        title: "Sipariş sevk edildi",
        preheader: `${ctx.orderNumber} numaralı sipariş sevk edildi.`,
        eyebrow: "Satış siparişleri",
        tone: "success",
        intro: "Aşağıdaki siparişin sevkiyat işlemi tamamlandı.",
        rows: [
            ["Sipariş numarası", ctx.orderNumber],
            ["Müşteri", ctx.customerName],
        ],
        ctaLabel: "Sipariş detayını aç",
        ctaUrl: recordUrl("order", ctx.orderId),
    });
    const text = `${subject}\n\nSipariş sevk edildi.\nSipariş: ${ctx.orderNumber}\n` +
        `Müşteri: ${ctx.customerName}\n\nSipariş detayı: ${recordUrl("order", ctx.orderId)}`;
    return { subject, html, text };
}

function externalContactRows(ctx: QuoteToCustomerCtx): string {
    const contacts: { label: string; value: string; href?: string }[] = [];
    const email = ctx.companyEmail?.trim();
    const website = ctx.companyWebsite?.trim();
    const websiteUrl = safeHttpUrl(website);
    if (ctx.companyPhone?.trim()) contacts.push({ label: "Telefon", value: ctx.companyPhone.trim() });
    if (email) contacts.push({ label: "E-posta", value: email, href: `mailto:${email}` });
    if (website) contacts.push({ label: "Web", value: website, href: websiteUrl ?? undefined });
    if (contacts.length === 0) return "";

    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse">
      ${contacts.map(item => `<tr>
        <td style="padding:2px 0;color:${COLORS.subtle};font-size:11px;font-weight:700;line-height:17px;text-transform:uppercase;letter-spacing:0.5px">${escapeHtml(item.label)}</td>
        <td align="right" style="padding:2px 0;color:${COLORS.muted};font-size:12px;font-weight:600;line-height:17px;word-break:break-word">${item.href ? `<a href="${escapeAttr(item.href)}" style="color:${COLORS.muted};text-decoration:none">${escapeHtml(item.value)}</a>` : escapeHtml(item.value)}</td>
      </tr>`).join("")}
    </table>`;
}

export function renderQuoteToCustomer(ctx: QuoteToCustomerCtx): EmailContent {
    const companyName = ctx.companyName?.trim() || "";
    const subject = companyName
        ? `${companyName} | Teklif · ${ctx.quoteNumber}`
        : `Teklif · ${ctx.quoteNumber}`;
    const logoUrl = safeHttpUrl(ctx.companyLogoUrl);
    const contactRows = externalContactRows(ctx);
    const brand = logoUrl
        ? `<img src="${escapeAttr(logoUrl)}" width="148" alt="${escapeAttr(companyName || "Firma logosu")}" style="display:block;max-width:148px;max-height:56px;width:auto;height:auto;border:0;outline:none;text-decoration:none">`
        : `<div style="color:${COLORS.text};font-size:19px;font-weight:800;line-height:26px">${escapeHtml(companyName || "Teklif")}</div>`;
    const quoteRows: DetailRow[] = [["Teklif numarası", ctx.quoteNumber]];
    if (ctx.validUntil) quoteRows.push(["Geçerlilik tarihi", fmtDateTr(ctx.validUntil)]);

    const html = emailDocument(
        `${ctx.quoteNumber} numaralı teklif belgesi ekte.`,
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.surface}" style="width:100%;border-collapse:separate;background:${COLORS.surface};border:1px solid ${COLORS.borderStrong};border-radius:8px">
          <tr>
            <td style="padding:26px 28px 20px;border-bottom:1px solid ${COLORS.border}">${brand}</td>
          </tr>
          <tr>
            <td style="padding:28px 28px 0;color:${COLORS.text};font-size:22px;font-weight:800;line-height:30px">Teklifiniz hazır</td>
          </tr>
          <tr>
            <td style="padding:13px 28px 0;color:${COLORS.muted};font-size:14px;line-height:23px">Sayın ${escapeHtml(ctx.customerName)},</td>
          </tr>
          <tr>
            <td style="padding:8px 28px 22px;color:${COLORS.muted};font-size:14px;line-height:23px">${escapeHtml(ctx.quoteNumber)} numaralı teklif belgemizi incelemeniz için ekte iletiyoruz.</td>
          </tr>
          <tr>
            <td style="padding:0 28px 22px">${detailsTable(quoteRows)}</td>
          </tr>
          <tr>
            <td style="padding:0 28px 24px">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.accentSoft}" style="width:100%;border-collapse:separate;background:${COLORS.accentSoft};border:1px solid #c9dcff;border-radius:6px">
                <tr>
                  <td width="38" valign="top" style="padding:14px 0 14px 14px;color:${COLORS.accent};font-size:17px;font-weight:800;line-height:22px">↗</td>
                  <td style="padding:14px;color:${COLORS.text};font-size:13px;font-weight:700;line-height:19px">
                    Teklif belgesi ektedir
                    <div style="padding-top:3px;color:${COLORS.muted};font-size:12px;font-weight:400;line-height:18px">Belgeyi tarayıcınızda açabilir, yazdırabilir veya PDF olarak kaydedebilirsiniz.</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 28px 28px;color:${COLORS.muted};font-size:14px;line-height:23px">Sorularınız ve görüşleriniz için bu e-postayı yanıtlayabilirsiniz.</td>
          </tr>
          ${(companyName || contactRows) ? `<tr>
            <td style="padding:20px 28px 24px;background:${COLORS.surfaceSubtle};border-top:1px solid ${COLORS.border};border-radius:0 0 8px 8px">
              ${companyName ? `<div style="padding-bottom:8px;color:${COLORS.text};font-size:13px;font-weight:800;line-height:19px">${escapeHtml(companyName)}</div>` : ""}
              ${contactRows}
            </td>
          </tr>` : ""}
        </table>`,
    );
    const contacts = [
        ctx.companyPhone?.trim() ? `Telefon: ${ctx.companyPhone.trim()}` : "",
        ctx.companyEmail?.trim() ? `E-posta: ${ctx.companyEmail.trim()}` : "",
        ctx.companyWebsite?.trim() ? `Web: ${ctx.companyWebsite.trim()}` : "",
    ].filter(Boolean).join("\n");
    const text = `Sayın ${ctx.customerName},\n\n${ctx.quoteNumber} numaralı teklif belgemizi ekte iletiyoruz.\n` +
        (ctx.validUntil ? `Geçerlilik tarihi: ${fmtDateTr(ctx.validUntil)}\n` : "") +
        `\nBelgeyi tarayıcınızda açabilir, yazdırabilir veya PDF olarak kaydedebilirsiniz.\n\n` +
        [companyName, contacts].filter(Boolean).join("\n");
    return { subject, html, text };
}

export type RenderContext =
    | { type: "stock_critical"; ctx: StockCriticalCtx }
    | { type: "order_pending"; ctx: OrderPendingCtx }
    | { type: "order_new"; ctx: OrderNewCtx }
    | { type: "sync_error"; ctx: SyncErrorCtx }
    | { type: "order_shipped"; ctx: OrderShippedCtx };

export function renderEmail(input: RenderContext): EmailContent {
    switch (input.type) {
        case "stock_critical": return renderStockCritical(input.ctx);
        case "order_pending": return renderOrderPending(input.ctx);
        case "order_new": return renderOrderNew(input.ctx);
        case "sync_error": return renderSyncError(input.ctx);
        case "order_shipped": return renderOrderShipped(input.ctx);
    }
}

export type ContextForType<K extends NotificationTypeKey> =
    K extends "stock_critical" ? StockCriticalCtx :
    K extends "order_pending" ? OrderPendingCtx :
    K extends "order_new" ? OrderNewCtx :
    K extends "sync_error" ? SyncErrorCtx :
    K extends "order_shipped" ? OrderShippedCtx :
    never;
