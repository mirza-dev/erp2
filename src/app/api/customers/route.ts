import { NextRequest, NextResponse } from "next/server";
import { dbListCustomers, dbCreateCustomer, type CreateCustomerInput } from "@/lib/supabase/customers";
import { handleApiError, safeParseJson, validateStringLengths } from "@/lib/api-error";
import { unstable_cache, revalidateTag } from "next/cache";

const getCachedCustomers = unstable_cache(
    () => dbListCustomers(),
    ["customers-list"],
    { tags: ["customers"], revalidate: 30 }
);

// GET /api/customers
export async function GET() {
    try {
        const customers = await getCachedCustomers();
        return NextResponse.json(customers);
    } catch (err) {
        return handleApiError(err, "GET /api/customers");
    }
}

// POST /api/customers
export async function POST(req: NextRequest) {
    try {
        const parsed = await safeParseJson(req);
        if (!parsed.ok) return parsed.response;
        const body = parsed.data as CreateCustomerInput;
        const lengthErr = validateStringLengths(body as unknown as Record<string, unknown>);
        if (lengthErr) return NextResponse.json({ error: lengthErr }, { status: 400 });

        if (body.country && (body.country as string).length > 2) {
            return NextResponse.json({ error: "Ülke kodu en fazla 2 karakter olabilir (ISO 3166-1 alpha-2)" }, { status: 400 });
        }
        const customer = await dbCreateCustomer(body);
        revalidateTag("customers", "max");
        return NextResponse.json(customer, { status: 201 });
    } catch (err) {
        return handleApiError(err, "POST /api/customers");
    }
}
