// Paraşüt API v4 entegrasyon servisi
// Gerçek API'ye geçince sadece sendInvoiceToParasut() içini değiştir.

import type { OrderDetail } from "./mock-data";

// ─── Tipler ──────────────────────────────────────────────────────────────────

export interface ParasutDetailAttribute {
    quantity: number;
    unit_price: number;
    vat_rate: 20;
    description: string;
    discount_type: "percentage";
    discount_value: number;
    product: { data: { type: "products"; id: string } };
}

export interface ParasutInvoicePayload {
    data: {
        type: "sales_invoices";
        attributes: {
            item_type: "invoice";
            description: string;
            issue_date: string;
            due_date: string;
            currency: "TRL" | "USD" | "EUR";
            invoice_series: "KE";
            invoice_id: number;
            details_attributes: ParasutDetailAttribute[];
        };
        relationships: {
            contact: { data: { type: "contacts"; id: string } };
        };
    };
}

export type ParasutSyncResult =
    | { success: true; invoiceId: string; sentAt: string }
    | { success: false; error: string };

// ─── Yardımcılar ─────────────────────────────────────────────────────────────

function mapCurrency(c: string): "TRL" | "USD" | "EUR" {
    if (c === "USD") return "USD";
    if (c === "EUR") return "EUR";
    return "TRL"; // TRY ve diğerleri → TRL (Paraşüt'ün kodu)
}

// ─── Mapping ─────────────────────────────────────────────────────────────────

export function mapOrderToInvoice(order: OrderDetail): ParasutInvoicePayload {
    const issued = new Date(order.createdAt);
    const due = new Date(issued);
    due.setDate(due.getDate() + 30);

    // "ORD-2026-0042" → 20260042
    const parts = order.orderNumber.split("-");
    const invoiceId = parts.length >= 3
        ? parseInt(parts[1] + parts[2], 10)
        : Date.now();

    return {
        data: {
            type: "sales_invoices",
            attributes: {
                item_type: "invoice",
                description: `KokpitERP #${order.orderNumber}`,
                issue_date: order.createdAt,
                due_date: due.toISOString().slice(0, 10),
                currency: mapCurrency(order.currency),
                invoice_series: "KE",
                invoice_id: invoiceId,
                details_attributes: order.lines.map(line => ({
                    quantity: line.quantity,
                    unit_price: line.unitPrice,
                    vat_rate: 20,
                    description: `${line.productName} (${line.productSku})`,
                    discount_type: "percentage",
                    discount_value: line.discountPct,
                    product: { data: { type: "products", id: line.productId } },
                })),
            },
            relationships: {
                contact: { data: { type: "contacts", id: order.customerId } },
            },
        },
    };
}

// ─── Mock API çağrısı ────────────────────────────────────────────────────────
// Gerçek API'ye geçince bu fonksiyonu aşağıdaki gibi değiştir:
//
//   const res = await fetch(`https://api.parasut.com/v4/${COMPANY_ID}/sales_invoices`, {
//     method: "POST",
//     headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
//     body: JSON.stringify(payload),
//   });
//   const json = await res.json();
//   if (!res.ok) return { success: false, error: json.errors?.[0]?.title ?? "API hatası" };
//   return { success: true, invoiceId: json.data.id, sentAt: new Date().toISOString() };

export async function sendInvoiceToParasut(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _payload: ParasutInvoicePayload
): Promise<ParasutSyncResult> {
    // 1000–1800ms rastgele gecikme (gerçekçi mock)
    await new Promise(r => setTimeout(r, 1000 + Math.floor(Math.random() * 800)));

    // %90 başarı — hata durumunu UI'da test edebilmek için kasıtlı %10 hata
    if (Math.random() < 0.1) {
        return {
            success: false,
            error: "Paraşüt API bağlantı hatası (mock). Lütfen tekrar deneyin.",
        };
    }

    const invoiceId = `F-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
    return {
        success: true,
        invoiceId,
        sentAt: new Date().toISOString(),
    };
}
