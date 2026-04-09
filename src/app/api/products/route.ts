import { NextRequest, NextResponse } from "next/server";
import { dbListProducts, dbCreateProduct, dbGetQuotedQuantities, type CreateProductInput } from "@/lib/supabase/products";
import { dbGetIncomingQuantities } from "@/lib/supabase/purchase-commitments";
import { handleApiError } from "@/lib/api-error";
import { ConfigError } from "@/lib/supabase/service";
import { computeOrderDeadline } from "@/lib/stock-utils";

// GET /api/products?category=xxx&product_type=finished&is_active=false&page=1
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = req.nextUrl;
        const [products, quotedMap, incomingMap] = await Promise.all([
            dbListProducts({
                category: searchParams.get("category") ?? undefined,
                product_type: (searchParams.get("product_type") as "finished" | "raw_material") ?? undefined,
                is_active: searchParams.get("is_active") !== "false",
                page: parseInt(searchParams.get("page") ?? "1"),
            }),
            dbGetQuotedQuantities(),
            dbGetIncomingQuantities(),
        ]);
        const enriched = products.map(p => {
            const quoted   = quotedMap.get(p.id)   ?? 0;
            const incoming = incomingMap.get(p.id) ?? 0;
            const promisable = p.available_now - quoted;
            const { stockoutDate, orderDeadline } = computeOrderDeadline(
                promisable, p.daily_usage, p.lead_time_days
            );
            return {
                ...p,
                quoted,
                promisable,
                incoming,
                forecasted: p.available_now + incoming - quoted,
                stockoutDate,
                orderDeadline,
            };
        });
        return NextResponse.json(enriched);
    } catch (err) {
        return handleApiError(err, "GET /api/products");
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
        // ConfigError (missing env) → 503 before anything else
        if (err instanceof ConfigError) return handleApiError(err, "POST /api/products");
        // Duplicate SKU → 409 (business rule, keep inline)
        const msg = err instanceof Error ? err.message : "Ürün oluşturulamadı.";
        if (msg.includes("unique")) {
            console.error("[POST /api/products] duplicate SKU", err);
            return NextResponse.json({ error: "Bu SKU zaten kayıtlı." }, { status: 409 });
        }
        return handleApiError(err, "POST /api/products");
    }
}
