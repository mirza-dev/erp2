import { NextRequest, NextResponse } from "next/server";
import { dbListVendors, dbCreateVendor } from "@/lib/supabase/vendors";
import { handleApiError, safeParseJson, validateStringLengths } from "@/lib/api-error";
import { unstable_cache, revalidateTag } from "next/cache";

const getCachedVendors = unstable_cache(
    () => dbListVendors({ isActive: true }),
    ["vendors-list"],
    { tags: ["vendors"], revalidate: 60 },
);

// GET /api/vendors?search=...&all=1
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const search = searchParams.get("search") ?? undefined;
        const showAll = searchParams.get("all") === "1";

        if (!search && !showAll) {
            const vendors = await getCachedVendors();
            return NextResponse.json(vendors);
        }

        const vendors = await dbListVendors({
            isActive: showAll ? undefined : true,
            search,
        });
        return NextResponse.json(vendors);
    } catch (err) {
        return handleApiError(err, "GET /api/vendors");
    }
}

// POST /api/vendors
export async function POST(req: NextRequest) {
    try {
        const parsed = await safeParseJson(req);
        if (!parsed.ok) return parsed.response;

        const body = parsed.data as Record<string, unknown>;

        const lengthErr = validateStringLengths(body);
        if (lengthErr) return NextResponse.json({ error: lengthErr }, { status: 400 });

        const vendor = await dbCreateVendor({
            name: String(body.name ?? "").trim(),
            contact_email: body.contact_email as string | null | undefined,
            contact_phone: body.contact_phone as string | null | undefined,
            contact_person: body.contact_person as string | null | undefined,
            tax_number: body.tax_number as string | null | undefined,
            address: body.address as string | null | undefined,
            currency: (body.currency as string) || "TRY",
            payment_terms_days: body.payment_terms_days != null ? Number(body.payment_terms_days) : null,
            lead_time_days: body.lead_time_days != null ? Number(body.lead_time_days) : null,
            notes: body.notes as string | null | undefined,
        });

        revalidateTag("vendors", "max");
        return NextResponse.json(vendor, { status: 201 });
    } catch (err) {
        if (err instanceof Error && (
            err.message.includes("zorunludur") ||
            err.message.toLowerCase().includes("geçersiz") ||
            err.message.includes("negatif")
        )) {
            return NextResponse.json({ error: err.message }, { status: 400 });
        }
        return handleApiError(err, "POST /api/vendors");
    }
}
