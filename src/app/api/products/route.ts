import { NextRequest, NextResponse } from "next/server";
import { dbListProducts, dbCreateProduct, type CreateProductInput } from "@/lib/supabase/products";

// GET /api/products?category=xxx&product_type=finished&low_stock=true&page=1
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = req.nextUrl;
        const products = await dbListProducts({
            category: searchParams.get("category") ?? undefined,
            product_type: (searchParams.get("product_type") as "finished" | "raw_material") ?? undefined,
            is_active: searchParams.get("is_active") !== "false",
            page: parseInt(searchParams.get("page") ?? "1"),
        });
        return NextResponse.json(products);
    } catch (err) {
        console.error("[GET /api/products]", err);
        return NextResponse.json({ error: "Ürünler alınamadı." }, { status: 500 });
    }
}

// POST /api/products
export async function POST(req: NextRequest) {
    try {
        const body: CreateProductInput = await req.json();

        if (!body.name?.trim()) {
            return NextResponse.json({ error: "Ürün adı zorunludur." }, { status: 400 });
        }
        if (!body.sku?.trim()) {
            return NextResponse.json({ error: "SKU zorunludur." }, { status: 400 });
        }
        if (!body.unit?.trim()) {
            return NextResponse.json({ error: "Birim zorunludur." }, { status: 400 });
        }

        const product = await dbCreateProduct(body);
        return NextResponse.json(product, { status: 201 });
    } catch (err: unknown) {
        console.error("[POST /api/products]", err);
        const msg = err instanceof Error ? err.message : "Ürün oluşturulamadı.";
        // Duplicate SKU
        if (msg.includes("unique")) {
            return NextResponse.json({ error: "Bu SKU zaten kayıtlı." }, { status: 409 });
        }
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
