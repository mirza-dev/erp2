import { NextRequest, NextResponse } from "next/server";
import {
    dbListProductTypes,
    dbListProductTypesWithStats,
    dbCreateProductType,
    dbReorderProductTypes,
} from "@/lib/supabase/product-types";
import { handleApiError, safeParseJson, validateStringLengths } from "@/lib/api-error";
import { requirePermission } from "@/lib/auth/role-guard";
import { unstable_cache, revalidateTag } from "next/cache";

const getCachedTypes = unstable_cache(
    (includeInactive: boolean) => dbListProductTypes({ includeInactive }),
    ["product-types-list"],
    { tags: ["product-types"], revalidate: 60 },
);

// GET /api/product-types
export async function GET(req?: NextRequest) {
    try {
        const { searchParams } = new URL(req?.url ?? "http://localhost/api/product-types");
        const includeInactive = searchParams.get("includeInactive") === "1";
        const withStats = searchParams.get("withStats") === "1";
        if (withStats) {
            const types = await dbListProductTypesWithStats({ includeInactive });
            return NextResponse.json(types);
        }
        const types = await getCachedTypes(includeInactive);
        return NextResponse.json(types);
    } catch (err) {
        return handleApiError(err, "GET /api/product-types");
    }
}

// POST /api/product-types
export async function POST(req: NextRequest) {
    const forbidden = await requirePermission(req, ["manage_product_types", "manage_product_master"]);
    if (forbidden) return forbidden;

    try {
        const parsed = await safeParseJson(req);
        if (!parsed.ok) return parsed.response;

        const body = parsed.data as Record<string, unknown>;
        const lengthErr = validateStringLengths(body);
        if (lengthErr) return NextResponse.json({ error: lengthErr }, { status: 400 });

        const type = await dbCreateProductType({
            name: String(body.name ?? "").trim(),
            description: body.description as string | null | undefined,
            icon: body.icon as string | null | undefined,
            sort_order: body.sort_order != null ? Number(body.sort_order) : undefined,
        });

        revalidateTag("product-types", "max");
        return NextResponse.json(type, { status: 201 });
    } catch (err) {
        if (err instanceof Error && (
            err.message.includes("zorunludur") ||
            err.message.includes("aşamaz") ||
            err.message.toLowerCase().includes("geçersiz") ||
            err.message.includes("zaten var") ||
            err.message.includes("tam sayı")
        )) {
            return NextResponse.json({ error: err.message }, { status: 400 });
        }
        return handleApiError(err, "POST /api/product-types");
    }
}

// PUT /api/product-types — reorder
export async function PUT(req: NextRequest) {
    const forbidden = await requirePermission(req, ["manage_product_types", "manage_product_master"]);
    if (forbidden) return forbidden;

    try {
        const parsed = await safeParseJson(req);
        if (!parsed.ok) return parsed.response;

        const body = parsed.data as Record<string, unknown>;
        const ids = body.ids;
        if (!Array.isArray(ids)) {
            return NextResponse.json({ error: "ids dizisi zorunludur." }, { status: 400 });
        }
        if (ids.some((id) => typeof id !== "string")) {
            return NextResponse.json({ error: "ids dizisindeki tüm değerler metin olmalı." }, { status: 400 });
        }

        await dbReorderProductTypes(ids as string[]);
        revalidateTag("product-types", "max");
        return NextResponse.json({ success: true });
    } catch (err) {
        if (err instanceof Error && err.message.includes("geçersiz")) {
            return NextResponse.json({ error: err.message }, { status: 400 });
        }
        return handleApiError(err, "PUT /api/product-types");
    }
}
