import { NextRequest, NextResponse } from "next/server";
import {
    dbUpdateProductTypeField,
    dbDeleteProductTypeField,
} from "@/lib/supabase/product-types";
import type { ProductFieldType } from "@/lib/database.types";
import { handleApiError, safeParseJson, validateStringLengths } from "@/lib/api-error";
import { requireRole } from "@/lib/auth/role-guard";
import { revalidateTag } from "next/cache";

// PATCH /api/product-types/[id]/fields/[fieldId]  (admin only)
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string; fieldId: string }> },
) {
    const forbidden = await requireRole(req, ["admin"]);
    if (forbidden) return forbidden;

    try {
        const { id, fieldId } = await params;

        const parsed = await safeParseJson(req);
        if (!parsed.ok) return parsed.response;

        const body = parsed.data as Record<string, unknown>;
        const lengthErr = validateStringLengths(body);
        if (lengthErr) return NextResponse.json({ error: lengthErr }, { status: 400 });

        if (body.options !== undefined && body.options !== null && !Array.isArray(body.options)) {
            return NextResponse.json({ error: "Seçenekler dizi olmalıdır." }, { status: 400 });
        }

        const field = await dbUpdateProductTypeField(fieldId, {
            label_tr: body.label_tr !== undefined ? String(body.label_tr) : undefined,
            label_en: body.label_en as string | null | undefined,
            field_type: body.field_type as ProductFieldType | undefined,
            unit: body.unit as string | null | undefined,
            options: body.options as string[] | null | undefined,
            required: body.required !== undefined ? Boolean(body.required) : undefined,
            placeholder: body.placeholder as string | null | undefined,
            help_text: body.help_text as string | null | undefined,
            sort_order: body.sort_order != null ? Number(body.sort_order) : undefined,
        }, id);

        revalidateTag("product-types", "max");
        return NextResponse.json(field);
    } catch (err) {
        if (err instanceof Error && (
            err.message.includes("zorunludur") ||
            err.message.includes("aşamaz") ||
            err.message.toLowerCase().includes("geçersiz") ||
            err.message.includes("dizi olmalı") ||
            err.message.includes("metinler olmalı") ||
            err.message.includes("tam sayı")
        )) {
            return NextResponse.json({ error: err.message }, { status: 400 });
        }
        if (err instanceof Error && (
            err.message.includes("bulunamadı") ||
            err.message.includes("bu tipe ait değil")
        )) {
            return NextResponse.json({ error: err.message }, { status: 404 });
        }
        return handleApiError(err, "PATCH /api/product-types/[id]/fields/[fieldId]");
    }
}

// DELETE /api/product-types/[id]/fields/[fieldId]  (admin only)
export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string; fieldId: string }> },
) {
    const forbidden = await requireRole(req, ["admin"]);
    if (forbidden) return forbidden;

    try {
        const { id, fieldId } = await params;

        await dbDeleteProductTypeField(fieldId, id);
        revalidateTag("product-types", "max");
        return NextResponse.json({ success: true });
    } catch (err) {
        if (err instanceof Error && (
            err.message.includes("bulunamadı") ||
            err.message.includes("bu tipe ait değil")
        )) {
            return NextResponse.json({ error: err.message }, { status: 404 });
        }
        return handleApiError(err, "DELETE /api/product-types/[id]/fields/[fieldId]");
    }
}
