import { NextRequest, NextResponse } from "next/server";
import {
    dbGetProductType,
    dbListProductTypeFields,
    dbAddProductTypeField,
    dbReorderProductTypeFields,
} from "@/lib/supabase/product-types";
import type { ProductFieldType } from "@/lib/database.types";
import { handleApiError, safeParseJson, validateStringLengths } from "@/lib/api-error";
import { requirePermission } from "@/lib/auth/role-guard";
import { revalidateTag } from "next/cache";

// GET /api/product-types/[id]/fields
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const { id } = await params;

        const parent = await dbGetProductType(id);
        if (!parent) return NextResponse.json({ error: "Tip bulunamadı." }, { status: 404 });

        const { searchParams } = new URL(req.url);
        const includeInactive = searchParams.get("includeInactive") === "1";
        const fields = await dbListProductTypeFields(id, { includeInactive });
        return NextResponse.json(fields);
    } catch (err) {
        return handleApiError(err, "GET /api/product-types/[id]/fields");
    }
}

// POST /api/product-types/[id]/fields
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const forbidden = await requirePermission(req, ["manage_product_types", "manage_product_master"]);
    if (forbidden) return forbidden;

    try {
        const { id } = await params;

        const parent = await dbGetProductType(id);
        if (!parent) return NextResponse.json({ error: "Tip bulunamadı." }, { status: 404 });

        const parsed = await safeParseJson(req);
        if (!parsed.ok) return parsed.response;

        const body = parsed.data as Record<string, unknown>;
        const lengthErr = validateStringLengths(body);
        if (lengthErr) return NextResponse.json({ error: lengthErr }, { status: 400 });

        if (body.options !== undefined && body.options !== null && !Array.isArray(body.options)) {
            return NextResponse.json({ error: "Seçenekler dizi olmalıdır." }, { status: 400 });
        }

        const field = await dbAddProductTypeField({
            product_type_id: id,
            field_key: String(body.field_key ?? "").trim(),
            label_tr: String(body.label_tr ?? "").trim(),
            label_en: body.label_en as string | null | undefined,
            field_type: body.field_type as ProductFieldType,
            unit: body.unit as string | null | undefined,
            options: body.options as string[] | null | undefined,
            required: Boolean(body.required),
            placeholder: body.placeholder as string | null | undefined,
            help_text: body.help_text as string | null | undefined,
            sort_order: body.sort_order != null ? Number(body.sort_order) : undefined,
        });

        revalidateTag("product-types", "max");
        return NextResponse.json(field, { status: 201 });
    } catch (err) {
        if (err instanceof Error && (
            err.message.includes("zorunludur") ||
            err.message.includes("aşamaz") ||
            err.message.toLowerCase().includes("geçersiz") ||
            err.message.includes("zaten var") ||
            err.message.includes("dizi olmalı") ||
            err.message.includes("metinler olmalı") ||
            err.message.includes("tam sayı")
        )) {
            return NextResponse.json({ error: err.message }, { status: 400 });
        }
        if (err instanceof Error && err.message.includes("bulunamadı")) {
            return NextResponse.json({ error: err.message }, { status: 404 });
        }
        return handleApiError(err, "POST /api/product-types/[id]/fields");
    }
}

// PUT /api/product-types/[id]/fields — reorder
export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const forbidden = await requirePermission(req, ["manage_product_types", "manage_product_master"]);
    if (forbidden) return forbidden;

    try {
        const { id } = await params;

        const parent = await dbGetProductType(id);
        if (!parent) return NextResponse.json({ error: "Tip bulunamadı." }, { status: 404 });

        const parsed = await safeParseJson(req);
        if (!parsed.ok) return parsed.response;

        const body = parsed.data as Record<string, unknown>;
        const ids = body.ids;
        if (!Array.isArray(ids)) {
            return NextResponse.json({ error: "ids dizisi zorunludur." }, { status: 400 });
        }
        if (ids.some((x) => typeof x !== "string")) {
            return NextResponse.json({ error: "ids dizisindeki tüm değerler metin olmalı." }, { status: 400 });
        }

        await dbReorderProductTypeFields(id, ids as string[]);
        revalidateTag("product-types", "max");
        return NextResponse.json({ success: true });
    } catch (err) {
        if (err instanceof Error && err.message.includes("geçersiz")) {
            return NextResponse.json({ error: err.message }, { status: 400 });
        }
        return handleApiError(err, "PUT /api/product-types/[id]/fields");
    }
}
