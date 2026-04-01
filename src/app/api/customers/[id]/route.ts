import { NextRequest, NextResponse } from "next/server";
import { dbDeleteCustomer, dbUpdateCustomer } from "@/lib/supabase/customers";
import { dbCountOrdersByCustomer } from "@/lib/supabase/orders";
import { handleApiError } from "@/lib/api-error";

// PATCH /api/customers/[id]
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await req.json();
        const PATCHABLE = ["name","email","phone","address","tax_number","tax_office","country","currency","notes"];
        if (!PATCHABLE.some(f => f in body)) {
            return NextResponse.json({ error: "Güncellenecek alan bulunamadı." }, { status: 400 });
        }
        if ("name" in body && !body.name?.trim()) {
            return NextResponse.json({ error: "Firma adı boş olamaz." }, { status: 400 });
        }
        if (body.country && body.country.length > 2) {
            return NextResponse.json(
                { error: "Ülke kodu en fazla 2 karakter olabilir (ISO 3166-1 alpha-2)" },
                { status: 400 }
            );
        }
        const customer = await dbUpdateCustomer(id, body);
        return NextResponse.json(customer);
    } catch (err) {
        return handleApiError(err, "PATCH /api/customers/[id]");
    }
}

// DELETE /api/customers/[id]
export async function DELETE(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const orderCount = await dbCountOrdersByCustomer(id);
        if (orderCount > 0) {
            return NextResponse.json(
                { error: `Bu müşteriye ait ${orderCount} sipariş var. Önce siparişleri silin.` },
                { status: 409 }
            );
        }
        await dbDeleteCustomer(id);
        return NextResponse.json({ ok: true });
    } catch (err) {
        return handleApiError(err, "DELETE /api/customers/[id]");
    }
}
