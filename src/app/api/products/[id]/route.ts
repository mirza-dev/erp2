import { NextRequest, NextResponse } from "next/server";
import {
    dbGetProductById,
    dbUpdateProduct,
    dbDeleteProduct,
    type CreateProductInput,
} from "@/lib/supabase/products";
import { handleApiError } from "@/lib/api-error";

// GET /api/products/[id]
export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const product = await dbGetProductById(id);
        if (!product) {
            return NextResponse.json({ error: "Ürün bulunamadı." }, { status: 404 });
        }
        return NextResponse.json(product);
    } catch (err) {
        return handleApiError(err, "GET /api/products/[id]");
    }
}

// PATCH /api/products/[id] — update fields
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body: Partial<CreateProductInput> = await req.json();
        const product = await dbUpdateProduct(id, body);
        return NextResponse.json(product);
    } catch (err) {
        return handleApiError(err, "PATCH /api/products/[id]");
    }
}

// DELETE /api/products/[id] — soft delete (is_active = false)
export async function DELETE(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        await dbDeleteProduct(id);
        return NextResponse.json({ ok: true });
    } catch (err) {
        return handleApiError(err, "DELETE /api/products/[id]");
    }
}
