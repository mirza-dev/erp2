import { NextRequest, NextResponse } from "next/server";
import { dbListProducts, dbCreateProduct, dbGetQuotedQuantities, type CreateProductInput } from "@/lib/supabase/products";
import { dbGetIncomingQuantities } from "@/lib/supabase/purchase-commitments";
import { handleApiError } from "@/lib/api-error";
import { ConfigError } from "@/lib/supabase/service";
import { computeOrderDeadline } from "@/lib/stock-utils";
import { unstable_cache, revalidateTag } from "next/cache";

const getCachedProducts = unstable_cache(
    async (category: string, productType: string, isActive: boolean, page: number) => {
        const [products, quotedMap, incomingMap] = await Promise.all([
            dbListProducts({
                category: category || undefined,
                product_type: (productType || undefined) as "raw_material" | "manufactured" | "commercial" | undefined,
                is_active: isActive,
                page,
            }),
            dbGetQuotedQuantities(),
            dbGetIncomingQuantities(),
        ]);
        return products.map(p => {
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
    },
    ["products-list"],
    { tags: ["products"], revalidate: 30 }
);

// GET /api/products?category=xxx&product_type=manufactured&is_active=false&page=1
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = req.nextUrl;
        const category = searchParams.get("category") ?? "";
        const productType = searchParams.get("product_type") ?? "";
        const isActive = searchParams.get("is_active") !== "false";
        const page = Math.max(1, parseInt(searchParams.get("page") ?? "1") || 1);
        const enriched = await getCachedProducts(category, productType, isActive, page);
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
        revalidateTag("products", "max");
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
