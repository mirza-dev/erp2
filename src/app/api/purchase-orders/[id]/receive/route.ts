import { NextRequest, NextResponse } from "next/server";
import { dbGetPurchaseOrderById } from "@/lib/supabase/purchase-orders";
import { serviceReceivePOLines } from "@/lib/services/purchase-order-service";
import { requireRole, getCurrentUserId } from "@/lib/auth/role-guard";
import { handleApiError, safeParseJson } from "@/lib/api-error";
import { revalidateTag } from "next/cache";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/purchase-orders/[id]/receive — admin|purchaser (B7)
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const guard = await requireRole(req, ["admin", "purchaser"]);
        if (guard) return guard;

        const { id } = await params;

        const existing = await dbGetPurchaseOrderById(id);
        if (!existing) return NextResponse.json({ error: "PO bulunamadı." }, { status: 404 });

        if (!["confirmed", "partially_received"].includes(existing.status)) {
            return NextResponse.json(
                { error: `PO mal kabul edilemez (status=${existing.status}).` },
                { status: 409 },
            );
        }

        const parsed = await safeParseJson(req);
        if (!parsed.ok) return parsed.response;

        const body = parsed.data as Record<string, unknown>;
        const rawLines = body.lines;

        if (!Array.isArray(rawLines) || rawLines.length === 0) {
            return NextResponse.json({ error: "En az 1 satır gereklidir." }, { status: 400 });
        }

        for (const [i, l] of rawLines.entries()) {
            if (!l || typeof l !== "object") {
                return NextResponse.json({ error: `Satır ${i + 1}: geçersiz nesne.` }, { status: 400 });
            }
            const line = l as Record<string, unknown>;
            if (typeof line.line_id !== "string" || !UUID_RE.test(line.line_id)) {
                return NextResponse.json({ error: `Satır ${i + 1}: line_id geçerli UUID olmalıdır.` }, { status: 400 });
            }
            const qty = Number(line.qty);
            if (!Number.isFinite(qty) || !Number.isInteger(qty) || qty <= 0) {
                return NextResponse.json({ error: `Satır ${i + 1}: qty pozitif tam sayı olmalıdır.` }, { status: 400 });
            }
        }

        const lines = rawLines.map((l: Record<string, unknown>) => ({
            line_id: l.line_id as string,
            qty: Number(l.qty),
        }));

        // Tedarikçi fatura künyesi (opsiyonel) — KDV indiriminin resmî kimliği.
        // Boş bırakılabilir: mal kabul bloklanmaz, Paraşüt'e künyesiz gider ve
        // servis katmanı "muhasebeci tamamlasın" uyarısı açar.
        const rawInvoiceNo   = body.vendor_invoice_no;
        const rawInvoiceDate = body.vendor_invoice_date;

        if (rawInvoiceNo !== undefined && rawInvoiceNo !== null) {
            if (typeof rawInvoiceNo !== "string" || rawInvoiceNo.length > 100) {
                return NextResponse.json(
                    { error: "vendor_invoice_no en fazla 100 karakter metin olmalıdır." },
                    { status: 400 },
                );
            }
        }
        if (rawInvoiceDate !== undefined && rawInvoiceDate !== null && rawInvoiceDate !== "") {
            if (typeof rawInvoiceDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(rawInvoiceDate)) {
                return NextResponse.json(
                    { error: "vendor_invoice_date YYYY-MM-DD biçiminde olmalıdır." },
                    { status: 400 },
                );
            }
        }

        const invoice = {
            vendor_invoice_no:   typeof rawInvoiceNo === "string" ? rawInvoiceNo.trim() : undefined,
            vendor_invoice_date: typeof rawInvoiceDate === "string" && rawInvoiceDate ? rawInvoiceDate : undefined,
        };

        // O1: actor sunucu-otoriter (oturum kullanıcısı) — istemci gövdesi DEĞİL.
        // Stok hareketi created_by + audit_log.actor buradan beslenir.
        const actor = (await getCurrentUserId()) ?? "system";
        const result = await serviceReceivePOLines(id, lines, actor, invoice);

        revalidateTag("purchase-orders", "max");
        revalidateTag("products", "max");  // on_hand artar → stok hesapları etkilenir

        return NextResponse.json(result);
    } catch (err) {
        if (err instanceof Error && (
            err.message.includes("mal kabul edilemez") ||
            err.message.includes("Aşırı kabul") ||
            err.message.includes("bulunamadı")
        )) {
            return NextResponse.json({ error: err.message }, { status: 409 });
        }
        return handleApiError(err, "POST /api/purchase-orders/[id]/receive");
    }
}
