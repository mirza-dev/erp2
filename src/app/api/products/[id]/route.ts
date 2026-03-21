import { NextRequest, NextResponse } from "next/server";
import {
    dbGetProductById,
    dbUpdateProduct,
    dbDeleteProduct,
    type CreateProductInput,
} from "@/lib/supabase/products";

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
        console.error("[GET /api/products/[id]]", err);
        return NextResponse.json({ error: "Ürün alınamadı." }, { status: 500 });
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
        console.error("[PATCH /api/products/[id]]", err);
        return NextResponse.json({ error: "Ürün güncellenemedi." }, { status: 500 });
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
        console.error("[DELETE /api/products/[id]]", err);
        return NextResponse.json({ error: "Ürün silinemedi." }, { status: 500 });
    }
}
