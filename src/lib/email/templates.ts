/**
 * E-posta template'leri. 5 bildirim türü için inline HTML + plain-text render.
 * No JSX / external lib — HTML küçük, basit, Resend-friendly.
 *
 * Tasarım: tek <div> container, inline CSS (e-posta client uyumluluğu),
 * branding header (Roven), tek "Detayları Görüntüle" CTA, alt linki
 * "bildirim tercihlerinizi yönetin" → /dashboard/settings.
 */
import type { NotificationTypeKey } from "@/lib/notification-types";

export interface EmailContent {
    subject: string;
    html: string;
    text: string;
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://erp.getmedspace.com";
const COLORS = {
    bg:     "#0d0d0d",
    card:   "#1a1a1a",
    border: "#2a2a2a",
    text:   "#ededed",
    muted:  "#9aa0a6",
    accent: "#3b82f6",
    danger: "#ef4444",
    warn:   "#f59e0b",
    ok:     "#10b981",
};

interface ShellOpts {
    title: string;
    severityColor: string;          // header bandı rengi
    bodyHtml: string;               // ana içerik (paragraflar + key/value satırları)
    ctaLabel?: string;
    ctaUrl?: string;
    /**
     * Alt "bildirim tercihlerinizden yönetebilirsiniz → /dashboard/settings"
     * footer'ını gizler. İç bildirimlerde gösterilir (default); müşteriye giden
     * e-postada (dashboard'a erişimi yok) gizlenir.
     */
    hideManageFooter?: boolean;
}

function shell(opts: ShellOpts): string {
    const { title, severityColor, bodyHtml, ctaLabel, ctaUrl, hideManageFooter } = opts;
    return `<!doctype html>
<html lang="tr">
<head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:${COLORS.bg};font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:${COLORS.text}">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px">
    <div style="font-size:14px;font-weight:600;color:${COLORS.muted};letter-spacing:0.04em;text-transform:uppercase;padding-bottom:12px;border-bottom:1px solid ${COLORS.border}">
      Roven
    </div>
    <div style="background:${COLORS.card};border:1px solid ${COLORS.border};border-left:3px solid ${severityColor};border-radius:8px;padding:20px 22px;margin-top:16px">
      <h1 style="font-size:18px;font-weight:600;margin:0 0 14px;color:${COLORS.text}">${escapeHtml(title)}</h1>
      <div style="font-size:14px;line-height:1.6;color:${COLORS.text}">${bodyHtml}</div>
      ${ctaLabel && ctaUrl ? `
        <div style="margin-top:20px">
          <a href="${escapeAttr(ctaUrl)}" style="display:inline-block;background:${COLORS.accent};color:#fff;font-size:13px;font-weight:500;padding:9px 18px;border-radius:6px;text-decoration:none">
            ${escapeHtml(ctaLabel)}
          </a>
        </div>` : ""}
    </div>
    ${hideManageFooter ? "" : `<div style="margin-top:18px;font-size:11px;color:${COLORS.muted};line-height:1.6">
      Bu bildirimi <a href="${APP_URL}/dashboard/settings" style="color:${COLORS.muted};text-decoration:underline">bildirim tercihlerinizden</a> yönetebilirsiniz.
    </div>`}
  </div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function escapeAttr(s: string): string {
    return s.replace(/"/g, "&quot;");
}

function row(label: string, value: string): string {
    return `<div style="display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-bottom:1px dashed ${COLORS.border}">
      <span style="color:${COLORS.muted};font-size:13px">${escapeHtml(label)}</span>
      <span style="color:${COLORS.text};font-size:13px;font-weight:500">${escapeHtml(value)}</span>
    </div>`;
}

function fmtCurrency(amount: number, currency: string): string {
    try {
        return new Intl.NumberFormat("tr-TR", { style: "currency", currency, minimumFractionDigits: 2 }).format(amount);
    } catch {
        return `${amount.toFixed(2)} ${currency}`;
    }
}

// ─── stock_critical ──────────────────────────────────────────────────────────

export interface StockCriticalCtx {
    productName: string;
    sku: string;
    available: number;
    min: number;
}

export function renderStockCritical(ctx: StockCriticalCtx): EmailContent {
    const subject = `Kritik stok: ${ctx.productName}`;
    const html = shell({
        title: "Kritik stok uyarısı",
        severityColor: COLORS.danger,
        bodyHtml: `
            <p>Aşağıdaki ürünün stoğu minimum seviyenin altına düştü.</p>
            ${row("Ürün", ctx.productName)}
            ${row("SKU", ctx.sku)}
            ${row("Mevcut", `${ctx.available}`)}
            ${row("Minimum", `${ctx.min}`)}
        `,
        ctaLabel: "Ürün Detayını Aç",
        ctaUrl: `${APP_URL}/dashboard/products`,
    });
    const text = `Kritik stok: ${ctx.productName} (${ctx.sku})\n` +
        `Mevcut: ${ctx.available} | Minimum: ${ctx.min}\n` +
        `Detay: ${APP_URL}/dashboard/products`;
    return { subject, html, text };
}

// ─── order_pending ───────────────────────────────────────────────────────────

export interface OrderPendingCtx {
    orderNumber: string;
    customerName: string;
    total: number;
    currency: string;
}

export function renderOrderPending(ctx: OrderPendingCtx): EmailContent {
    const subject = `Onay bekliyor: ${ctx.orderNumber}`;
    const html = shell({
        title: "Sipariş onayınızı bekliyor",
        severityColor: COLORS.warn,
        bodyHtml: `
            <p>${escapeHtml(ctx.customerName)} firmasından gelen sipariş onayınızı bekliyor.</p>
            ${row("Sipariş No", ctx.orderNumber)}
            ${row("Müşteri", ctx.customerName)}
            ${row("Tutar", fmtCurrency(ctx.total, ctx.currency))}
        `,
        ctaLabel: "Siparişi Aç",
        ctaUrl: `${APP_URL}/dashboard/orders`,
    });
    const text = `Sipariş onayı bekliyor: ${ctx.orderNumber}\n` +
        `Müşteri: ${ctx.customerName} | Tutar: ${fmtCurrency(ctx.total, ctx.currency)}\n` +
        `Detay: ${APP_URL}/dashboard/orders`;
    return { subject, html, text };
}

// ─── order_new ───────────────────────────────────────────────────────────────

export interface OrderNewCtx {
    orderNumber: string;
    customerName: string;
    total: number;
    currency: string;
}

export function renderOrderNew(ctx: OrderNewCtx): EmailContent {
    const subject = `Yeni sipariş: ${ctx.orderNumber}`;
    const html = shell({
        title: "Yeni sipariş oluşturuldu",
        severityColor: COLORS.accent,
        bodyHtml: `
            <p>Sisteme yeni bir sipariş eklendi.</p>
            ${row("Sipariş No", ctx.orderNumber)}
            ${row("Müşteri", ctx.customerName)}
            ${row("Tutar", fmtCurrency(ctx.total, ctx.currency))}
        `,
        ctaLabel: "Siparişi Aç",
        ctaUrl: `${APP_URL}/dashboard/orders`,
    });
    const text = `Yeni sipariş: ${ctx.orderNumber}\n` +
        `Müşteri: ${ctx.customerName} | Tutar: ${fmtCurrency(ctx.total, ctx.currency)}\n` +
        `Detay: ${APP_URL}/dashboard/orders`;
    return { subject, html, text };
}

// ─── sync_error ──────────────────────────────────────────────────────────────

export interface SyncErrorCtx {
    entityName: string;
    errorMessage: string;
}

export function renderSyncError(ctx: SyncErrorCtx): EmailContent {
    const subject = `Paraşüt sync hatası: ${ctx.entityName}`;
    const truncatedError = ctx.errorMessage.length > 300
        ? ctx.errorMessage.slice(0, 300) + "..."
        : ctx.errorMessage;
    const html = shell({
        title: "Paraşüt sync hatası",
        severityColor: COLORS.danger,
        bodyHtml: `
            <p>Bir Paraşüt entegrasyon işlemi başarısız oldu.</p>
            ${row("Kayıt", ctx.entityName)}
            <div style="margin-top:10px;padding:10px 12px;background:${COLORS.bg};border-radius:6px;font-size:12px;color:${COLORS.muted};font-family:Menlo,Monaco,monospace;word-break:break-word">${escapeHtml(truncatedError)}</div>
        `,
        ctaLabel: "Sync Loglarını Aç",
        ctaUrl: `${APP_URL}/dashboard/parasut`,
    });
    const text = `Paraşüt sync hatası: ${ctx.entityName}\n` +
        `${truncatedError}\n` +
        `Detay: ${APP_URL}/dashboard/parasut`;
    return { subject, html, text };
}

// ─── order_shipped ───────────────────────────────────────────────────────────

export interface OrderShippedCtx {
    orderNumber: string;
    customerName: string;
}

export function renderOrderShipped(ctx: OrderShippedCtx): EmailContent {
    const subject = `Sevk edildi: ${ctx.orderNumber}`;
    const html = shell({
        title: "Sipariş sevk edildi",
        severityColor: COLORS.ok,
        bodyHtml: `
            <p>Aşağıdaki sipariş sevk edildi.</p>
            ${row("Sipariş No", ctx.orderNumber)}
            ${row("Müşteri", ctx.customerName)}
        `,
        ctaLabel: "Siparişi Aç",
        ctaUrl: `${APP_URL}/dashboard/orders`,
    });
    const text = `Sipariş sevk edildi: ${ctx.orderNumber}\n` +
        `Müşteri: ${ctx.customerName}\n` +
        `Detay: ${APP_URL}/dashboard/orders`;
    return { subject, html, text };
}

// ─── quote_customer_send (müşteriye giden teklif e-postası) ───────────────────

export interface QuoteToCustomerCtx {
    quoteNumber: string;
    customerName: string;
    validUntil?: string | null;   // ISO veya boş — varsa "geçerlilik" satırı
    companyName?: string | null;  // gönderen firma adı (company_settings); yoksa "Roven"
}

function fmtDateTr(iso: string): string {
    try {
        return new Date(`${iso}T00:00:00Z`).toLocaleDateString("tr-TR", {
            day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC",
        });
    } catch {
        return iso;
    }
}

export function renderQuoteToCustomer(ctx: QuoteToCustomerCtx): EmailContent {
    const sender = ctx.companyName?.trim() || "Roven";
    const subject = `Teklifimiz — ${ctx.quoteNumber}`;
    const validRow = ctx.validUntil ? row("Geçerlilik Tarihi", fmtDateTr(ctx.validUntil)) : "";
    const html = shell({
        title: "Teklifimiz",
        severityColor: COLORS.accent,
        hideManageFooter: true,
        bodyHtml: `
            <p>Sayın ${escapeHtml(ctx.customerName)},</p>
            <p>${escapeHtml(ctx.quoteNumber)} numaralı teklifimizi ekte bulabilirsiniz. Ekteki belgeyi tarayıcınızda açıp yazdırarak PDF olarak da kaydedebilirsiniz.</p>
            ${row("Teklif No", ctx.quoteNumber)}
            ${validRow}
            <p style="margin-top:14px">Görüşleriniz için teşekkür eder, iş birliğimizin devamını dileriz.</p>
            <p style="color:${COLORS.muted}">${escapeHtml(sender)}</p>
        `,
    });
    const text = `Sayın ${ctx.customerName},\n\n` +
        `${ctx.quoteNumber} numaralı teklifimizi ekte bulabilirsiniz.\n` +
        (ctx.validUntil ? `Geçerlilik Tarihi: ${fmtDateTr(ctx.validUntil)}\n` : "") +
        `\n${sender}`;
    return { subject, html, text };
}

// ─── Dispatch ────────────────────────────────────────────────────────────────

export type RenderContext =
    | { type: "stock_critical"; ctx: StockCriticalCtx }
    | { type: "order_pending"; ctx: OrderPendingCtx }
    | { type: "order_new"; ctx: OrderNewCtx }
    | { type: "sync_error"; ctx: SyncErrorCtx }
    | { type: "order_shipped"; ctx: OrderShippedCtx };

/**
 * Tipine göre uygun render fonksiyonunu çağırır. Bilinmeyen type → null.
 */
export function renderEmail(input: RenderContext): EmailContent {
    switch (input.type) {
        case "stock_critical": return renderStockCritical(input.ctx);
        case "order_pending":  return renderOrderPending(input.ctx);
        case "order_new":      return renderOrderNew(input.ctx);
        case "sync_error":     return renderSyncError(input.ctx);
        case "order_shipped":  return renderOrderShipped(input.ctx);
    }
}

// Tip-güvenli helper: NotificationTypeKey ile context eşleşmesi
export type ContextForType<K extends NotificationTypeKey> =
    K extends "stock_critical" ? StockCriticalCtx :
    K extends "order_pending"  ? OrderPendingCtx :
    K extends "order_new"      ? OrderNewCtx :
    K extends "sync_error"     ? SyncErrorCtx :
    K extends "order_shipped"  ? OrderShippedCtx :
    never;
