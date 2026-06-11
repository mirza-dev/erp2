import { NextRequest, NextResponse } from "next/server";
import { dbListProducts, dbCreateProduct, dbGetQuotedQuantities, type CreateProductInput } from "@/lib/supabase/products";
import { dbGetIncomingQuantities } from "@/lib/supabase/purchase-commitments";
import { validateProductInput } from "@/lib/validation/product-input";
import { handleApiError, safeParseJson } from "@/lib/api-error";
import { ConfigError } from "@/lib/supabase/service";
import { computeOrderDeadline } from "@/lib/stock-utils";
import { getCurrentUserPermissions, requirePermission } from "@/lib/auth/role-guard";
import { redactProductsForPerms } from "@/lib/auth/redact";
import { unstable_cache, revalidateTag } from "next/cache";
import { appendServerTiming, startSpan } from "@/lib/server-timing";

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

// Audit 4-5. tur: DataContext (UI global state) için tüm filtrelenmiş ürünleri
// pagination'sız çek. /api/products?all=1 → category/product_type/is_active
// query parametreleri normal endpoint'le aynı şekilde uygulanır; sadece
// pagination devre dışı (pageSize: 10000). Cache key filter-aware.
const getCachedAllProducts = unstable_cache(
    async (category: string, productType: string, isActive: boolean) => {
        const [products, quotedMap, incomingMap] = await Promise.all([
            dbListProducts({
                category: category || undefined,
                product_type: (productType || undefined) as "manufactured" | "commercial" | undefined,
                is_active: isActive,
                page: 1,
                pageSize: 10000,
            }),
            dbGetQuotedQuantities(),
            dbGetIncomingQuantities(),
        ]);
        return enrichProducts(products, quotedMap, incomingMap);
    },
    ["products-all-filtered"],
    { tags: ["products"], revalidate: 30 }
);

// GET /api/products?category=xxx&product_type=manufactured&is_active=false&page=1
// GET /api/products?all=1[&category=...&product_type=...&is_active=false]
//   → pagination'sız aktif filtrelerle ürünler (UI global state için)
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = req.nextUrl;
        const category = searchParams.get("category") ?? "";
        const productType = searchParams.get("product_type") ?? "";
        const isActive = searchParams.get("is_active") !== "false";
        // RBAC R3: redaction cache SONRASI, per-request (perms cache key'ine girmez).
        const authSpan = startSpan();
        const perms = await getCurrentUserPermissions(req);
        const authMs = authSpan();
        if (searchParams.get("all") === "1") {
            const dbSpan = startSpan();
            const enriched = await getCachedAllProducts(category, productType, isActive);
            const dbMs = dbSpan();
            return appendServerTiming(
                NextResponse.json(redactProductsForPerms(enriched, perms)),
                [{ name: "auth", ms: authMs }, { name: "db", ms: dbMs }],
            );
        }
        const page = Math.max(1, parseInt(searchParams.get("page") ?? "1") || 1);
        const dbSpan = startSpan();
        const enriched = await getCachedProducts(category, productType, isActive, page);
        const dbMs = dbSpan();
        return appendServerTiming(
            NextResponse.json(redactProductsForPerms(enriched, perms)),
            [{ name: "auth", ms: authMs }, { name: "db", ms: dbMs }],
        );
    } catch (err) {
        return handleApiError(err, "GET /api/products");
    }
}

// POST /api/products
export async function POST(req: NextRequest) {
    try {
        const guard = await requirePermission(req, "manage_product_master");
        if (guard) return guard;

        const parsed = await safeParseJson(req);
        if (!parsed.ok) return parsed.response;
        const body = parsed.data as CreateProductInput;

        const validationErr = validateProductInput(body, { requireCore: true });
        if (validationErr) return NextResponse.json({ error: validationErr }, { status: 400 });

        const product = await dbCreateProduct(body);
        revalidateTag("products", "max");

        // Audit 6. tur Fix 5: response'u quoted/promisable/incoming/forecasted/
        // stockoutDate/orderDeadline ile enrich et — DataContext POST sonrası
        // bu alanları görmesin diye ilk full refetch'e kadar boşluk olmasın.
        const [quotedMap, incomingMap] = await Promise.all([
            dbGetQuotedQuantities(),
            dbGetIncomingQuantities(),
        ]);
        const enriched = enrichProducts([product], quotedMap, incomingMap)[0];
        // RBAC R3: yeni ürün response'unda yetkisiz fiyat/maliyet sızmasın.
        const perms = await getCurrentUserPermissions(req);
        return NextResponse.json(redactProductsForPerms([enriched], perms)[0], { status: 201 });
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
