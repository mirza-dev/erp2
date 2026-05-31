import { NextRequest, NextResponse } from "next/server";
import {
    dbGetVendorById,
    dbUpdateVendor,
    dbDeactivateVendor,
} from "@/lib/supabase/vendors";
import { handleApiError, safeParseJson, validateStringLengths } from "@/lib/api-error";
import { requirePermission } from "@/lib/auth/role-guard";
import { revalidateTag } from "next/cache";

// GET /api/vendors/[id]
export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const guard = await requirePermission(_req, "view_vendors");
        if (guard) return guard;

        const { id } = await params;
        const vendor = await dbGetVendorById(id);
        if (!vendor) return NextResponse.json({ error: "Tedarikçi bulunamadı." }, { status: 404 });
        return NextResponse.json(vendor);
    } catch (err) {
        return handleApiError(err, "GET /api/vendors/[id]");
    }
}

// PATCH /api/vendors/[id]
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const guard = await requirePermission(req, "manage_vendors");
        if (guard) return guard;

        const { id } = await params;

        const existing = await dbGetVendorById(id);
        if (!existing) return NextResponse.json({ error: "Tedarikçi bulunamadı." }, { status: 404 });

        const parsed = await safeParseJson(req);
        if (!parsed.ok) return parsed.response;

        const body = parsed.data as Record<string, unknown>;
        const lengthErr = validateStringLengths(body);
        if (lengthErr) return NextResponse.json({ error: lengthErr }, { status: 400 });

        const updated = await dbUpdateVendor(id, {
            name: body.name !== undefined ? String(body.name) : undefined,
            contact_email: body.contact_email as string | null | undefined,
            contact_phone: body.contact_phone as string | null | undefined,
            contact_person: body.contact_person as string | null | undefined,
            tax_number: body.tax_number as string | null | undefined,
            address: body.address as string | null | undefined,
            currency: body.currency as string | undefined,
            payment_terms_days: body.payment_terms_days !== undefined
                ? (body.payment_terms_days != null ? Number(body.payment_terms_days) : null)
                : undefined,
            lead_time_days: body.lead_time_days !== undefined
                ? (body.lead_time_days != null ? Number(body.lead_time_days) : null)
                : undefined,
            notes: body.notes as string | null | undefined,
            is_active: body.is_active !== undefined ? Boolean(body.is_active) : undefined,
        });

        revalidateTag("vendors", "max");
        return NextResponse.json(updated);
    } catch (err) {
        if (err instanceof Error && (
            err.message.includes("zorunludur") ||
            err.message.toLowerCase().includes("geçersiz") ||
            err.message.includes("negatif")
        )) {
            return NextResponse.json({ error: err.message }, { status: 400 });
        }
        return handleApiError(err, "PATCH /api/vendors/[id]");
    }
}

// DELETE /api/vendors/[id]  — soft delete (is_active=false)
export async function DELETE(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const guard = await requirePermission(_req, "delete_vendors");
        if (guard) return guard;

        const { id } = await params;

        const existing = await dbGetVendorById(id);
        if (!existing) return NextResponse.json({ error: "Tedarikçi bulunamadı." }, { status: 404 });
        if (!existing.is_active) return NextResponse.json({ error: "Tedarikçi zaten pasif." }, { status: 409 });

        await dbDeactivateVendor(id);
        revalidateTag("vendors", "max");
        return NextResponse.json({ success: true });
    } catch (err) {
        if (err instanceof Error && err.message.includes("aktif PO")) {
            return NextResponse.json({ error: err.message }, { status: 409 });
        }
        return handleApiError(err, "DELETE /api/vendors/[id]");
    }
}
