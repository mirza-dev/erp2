import { NextRequest, NextResponse } from "next/server";
import { dbListProducts, dbListAllActiveProducts, dbCreateProduct, dbGetQuotedQuantities, type CreateProductInput } from "@/lib/supabase/products";
import { dbGetIncomingQuantities } from "@/lib/supabase/purchase-commitments";
import { handleApiError, safeParseJson, validateStringLengths } from "@/lib/api-error";
import { ConfigError } from "@/lib/supabase/service";
import { computeOrderDeadline } from "@/lib/stock-utils";
import { unstable_cache, revalidateTag } from "next/cache";

type EnrichedProduct = Awaited<ReturnType<typeof dbListProducts>>[number] & {
    quoted: number;
    promisable: number;
    incoming: number;
    forecasted: number;
    stockoutDate: string | null;
    orderDeadline: string | null;
};

function enrichProducts(
    products: Awaited<ReturnType<typeof dbListProducts>>,
    quotedMap: Map<string, number>,
    incomingMap: Map<string, number>,
): EnrichedProduct[] {
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
}

const getCachedProducts = unstable_cache(
    async (category: string, productType: string, isActive: boolean, page: number) => {
        const [products, quotedMap, incomingMap] = await Promise.all([
            dbListProducts({
                category: category || undefined,
                product_type: (productType || undefined) as "manufactured" | "commercial" | undefined,
                is_active: isActive,
                page,
            }),
            dbGetQuotedQuantities(),
            dbGetIncomingQuantities(),
        ]);
        return enrichProducts(products, quotedMap, incomingMap);
    },
    ["products-list"],
    { tags: ["products"], revalidate: 30 }
);

// Audit 4. tur Bulgu 3: DataContext (UI global state) tüm aktif ürünleri çekiyor.
// /api/products?all=1 → pagination'sız full active list. Kategorik filtreler
// client-side uygulanır. Cache key ayrı tutulur (paginated cache'le karışmasın).
const getCachedAllActiveProducts = unstable_cache(
    async () => {
        const [products, quotedMap, incomingMap] = await Promise.all([
            dbListAllActiveProducts(),
            dbGetQuotedQuantities(),
            dbGetIncomingQuantities(),
        ]);
        return enrichProducts(products, quotedMap, incomingMap);
    },
    ["products-all-active"],
    { tags: ["products"], revalidate: 30 }
);

// GET /api/products?category=xxx&product_type=manufactured&is_active=false&page=1
// GET /api/products?all=1 — pagination'sız tüm aktif ürünler (UI global state için)
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = req.nextUrl;
        if (searchParams.get("all") === "1") {
            const enriched = await getCachedAllActiveProducts();
            return NextResponse.json(enriched);
        }
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
        const parsed = await safeParseJson(req);
        if (!parsed.ok) return parsed.response;
        const body = parsed.data as CreateProductInput;

        const lengthErr = validateStringLengths(body as unknown as Record<string, unknown>);
        if (lengthErr) return NextResponse.json({ error: lengthErr }, { status: 400 });

        if (!body.name?.trim()) {
            return NextResponse.json({ error: "Ürün adı zorunludur." }, { status: 400 });
        }
        if (!body.sku?.trim()) {
            return NextResponse.json({ error: "SKU zorunludur." }, { status: 400 });
        }
        if (!body.unit?.trim()) {
            return NextResponse.json({ error: "Birim zorunludur." }, { status: 400 });
        }
        const MAX_NUM = 999_999_999;
        if (body.price !== undefined && body.price > MAX_NUM)
            return NextResponse.json({ error: "Fiyat çok büyük." }, { status: 400 });
        if (body.on_hand !== undefined && body.on_hand > MAX_NUM)
            return NextResponse.json({ error: "Stok miktarı çok büyük." }, { status: 400 });
        if (body.min_stock_level !== undefined && body.min_stock_level > MAX_NUM)
            return NextResponse.json({ error: "Minimum stok seviyesi çok büyük." }, { status: 400 });
        if (body.cost_price !== undefined && body.cost_price > MAX_NUM)
            return NextResponse.json({ error: "Maliyet fiyatı çok büyük." }, { status: 400 });

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
