import { NextRequest, NextResponse } from "next/server";
import {
    dbGetProductType,
    dbGetProductTypeWithFields,
    dbUpdateProductType,
    dbDeleteProductType,
} from "@/lib/supabase/product-types";
import { handleApiError, safeParseJson, validateStringLengths } from "@/lib/api-error";
import { requireRole } from "@/lib/auth/role-guard";
import { revalidateTag } from "next/cache";

// GET /api/product-types/[id]?withFields=1
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const { id } = await params;
        const { searchParams } = new URL(req.url);
        const withFields = searchParams.get("withFields") === "1";

        if (withFields) {
            const type = await dbGetProductTypeWithFields(id);
            if (!type) return NextResponse.json({ error: "Tip bulunamadı." }, { status: 404 });
            return NextResponse.json(type);
        }

        const type = await dbGetProductType(id);
        if (!type) return NextResponse.json({ error: "Tip bulunamadı." }, { status: 404 });
        return NextResponse.json(type);
    } catch (err) {
        return handleApiError(err, "GET /api/product-types/[id]");
    }
}

// PATCH /api/product-types/[id]  (admin only)
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const forbidden = await requireRole(req, ["admin"]);
    if (forbidden) return forbidden;

    try {
        const { id } = await params;

        const existing = await dbGetProductType(id);
        if (!existing) return NextResponse.json({ error: "Tip bulunamadı." }, { status: 404 });

        const parsed = await safeParseJson(req);
        if (!parsed.ok) return parsed.response;

        const body = parsed.data as Record<string, unknown>;
        const lengthErr = validateStringLengths(body);
        if (lengthErr) return NextResponse.json({ error: lengthErr }, { status: 400 });

        const updated = await dbUpdateProductType(id, {
            name: body.name !== undefined ? String(body.name) : undefined,
            description: body.description as string | null | undefined,
            icon: body.icon as string | null | undefined,
            sort_order: body.sort_order != null ? Number(body.sort_order) : undefined,
        });

        revalidateTag("product-types", "max");
        return NextResponse.json(updated);
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
        if (err instanceof Error && err.message.includes("bulunamadı")) {
            return NextResponse.json({ error: err.message }, { status: 404 });
        }
        return handleApiError(err, "PATCH /api/product-types/[id]");
    }
}

// DELETE /api/product-types/[id]  (admin only)
export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const forbidden = await requireRole(req, ["admin"]);
    if (forbidden) return forbidden;

    try {
        const { id } = await params;

        const existing = await dbGetProductType(id);
        if (!existing) return NextResponse.json({ error: "Tip bulunamadı." }, { status: 404 });

        await dbDeleteProductType(id);
        revalidateTag("product-types", "max");
        return NextResponse.json({ success: true });
    } catch (err) {
        if (err instanceof Error && err.message.includes("Sistem tipi")) {
            return NextResponse.json({ error: err.message }, { status: 409 });
        }
        if (err instanceof Error && err.message.includes("ürün var")) {
            return NextResponse.json({ error: err.message }, { status: 409 });
        }
        if (err instanceof Error && err.message.includes("bulunamadı")) {
            return NextResponse.json({ error: err.message }, { status: 404 });
        }
        return handleApiError(err, "DELETE /api/product-types/[id]");
    }
}
