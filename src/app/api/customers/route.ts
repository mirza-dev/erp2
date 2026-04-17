import { NextRequest, NextResponse } from "next/server";
import { dbListCustomers, dbCreateCustomer } from "@/lib/supabase/customers";
import { handleApiError } from "@/lib/api-error";
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
        const body = await req.json();
        if (body.country && body.country.length > 2) {
            return NextResponse.json({ error: "Ülke kodu en fazla 2 karakter olabilir (ISO 3166-1 alpha-2)" }, { status: 400 });
        }
        const customer = await dbCreateCustomer(body);
        revalidateTag("customers", "max");
        return NextResponse.json(customer, { status: 201 });
    } catch (err) {
        return handleApiError(err, "POST /api/customers");
    }
}
