import { NextRequest, NextResponse } from "next/server";
import {
    dbGetPurchaseOrderById,
    dbPatchPurchaseOrder,
    dbSetVendorInvoiceIdentity,
    isValidPoCurrency,
} from "@/lib/supabase/purchase-orders";
import { handleApiError, safeParseJson } from "@/lib/api-error";
import { validateStringLengths } from "@/lib/validation/string-lengths";
import { requirePermission, getCurrentUserPermissions } from "@/lib/auth/role-guard";
import { redactPurchaseOrderForPerms } from "@/lib/auth/redact";
import { revalidateTag } from "next/cache";

// GET /api/purchase-orders/[id]
export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const guard = await requirePermission(_req, "view_purchase_orders");
        if (guard) return guard;

        const { id } = await params;
        const po = await dbGetPurchaseOrderById(id);
        if (!po) return NextResponse.json({ error: "PO bulunamadı." }, { status: 404 });
        // RBAC R3 (Faz 4 tamamlama): purchase-financial — view_purchase_costs yoksa
        // subtotal/vat_total/grand_total + satır unit_price/line_total null.
        const perms = await getCurrentUserPermissions();
        return NextResponse.json(redactPurchaseOrderForPerms(po, perms));
    } catch (err) {
        return handleApiError(err, "GET /api/purchase-orders/[id]");
    }
}

// PATCH /api/purchase-orders/[id] — updates metadata (expected_date, notes, currency)
// Only allowed on draft status
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const guard = await requirePermission(req, "manage_purchase_orders");
        if (guard) return guard;

        const { id } = await params;

        const existing = await dbGetPurchaseOrderById(id);
        if (!existing) return NextResponse.json({ error: "PO bulunamadı." }, { status: 404 });

        const parsed = await safeParseJson(req);
        if (!parsed.ok) return parsed.response;

        const body = parsed.data as Record<string, unknown>;

        // KOBİ-sim K2 — tedarikçi fatura künyesi ayrı daldan güncellenir.
        //
        // Draft kısıtının DIŞINDA olmak zorunda: fatura fiziksel olarak malla
        // birlikte gelir, yani PO çoktan `received`/`partially_received`
        // durumundadır. Mal kabulde girilmemişse (ya da yanlış girilmişse)
        // muhasebenin künyeyi sonradan tamamlayabileceği TEK yol burasıdır —
        // eskiden hiç yoktu, fatura kutuda kalıyordu.
        //
        // Dal yalnız bu iki alanı yazar; miktar/tutar/durum değiştirmez.
        const touchesInvoice =
            "vendor_invoice_no" in body || "vendor_invoice_date" in body;
        if (touchesInvoice) {
            const rawNo   = body.vendor_invoice_no;
            const rawDate = body.vendor_invoice_date;
            if (rawNo !== undefined && rawNo !== null) {
                if (typeof rawNo !== "string" || rawNo.length > 100) {
                    return NextResponse.json(
                        { error: "vendor_invoice_no en fazla 100 karakter metin olmalıdır." },
                        { status: 400 },
                    );
                }
            }
            if (rawDate !== undefined && rawDate !== null && rawDate !== "") {
                if (typeof rawDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
                    return NextResponse.json(
                        { error: "vendor_invoice_date YYYY-MM-DD biçiminde olmalıdır." },
                        { status: 400 },
                    );
                }
            }
            if (existing.status === "cancelled") {
                return NextResponse.json(
                    { error: "İptal edilmiş PO'ya fatura künyesi yazılamaz." },
                    { status: 409 },
                );
            }
            await dbSetVendorInvoiceIdentity(id, {
                vendor_invoice_no:   typeof rawNo   === "string" ? rawNo.trim() : rawNo as null | undefined,
                vendor_invoice_date: typeof rawDate === "string" ? (rawDate || null) : rawDate as null | undefined,
            });
            revalidateTag("purchase-orders", "max");
            const refreshed = await dbGetPurchaseOrderById(id);
            return NextResponse.json(refreshed ?? { ok: true });
        }

        if (existing.status !== "draft") {
            return NextResponse.json(
                { error: "PO sadece draft durumunda düzenlenebilir." },
                { status: 409 },
            );
        }

        const lenErr = validateStringLengths(body);
        if (lenErr) return NextResponse.json({ error: lenErr }, { status: 400 });

        if (body.currency !== undefined && !isValidPoCurrency(body.currency)) {
            return NextResponse.json(
                { error: "Geçersiz para birimi. Kabul edilenler: TRY, USD, EUR." },
                { status: 400 },
            );
        }

        const updated = await dbPatchPurchaseOrder(id, {
            expected_date: body.expected_date as string | null | undefined,
            notes:         body.notes as string | null | undefined,
            currency:      body.currency as string | undefined,
        });

        revalidateTag("purchase-orders", "max");
        return NextResponse.json(updated);
    } catch (err) {
        return handleApiError(err, "PATCH /api/purchase-orders/[id]");
    }
}
