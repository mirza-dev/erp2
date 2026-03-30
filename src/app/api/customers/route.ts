import { NextRequest, NextResponse } from "next/server";
import { dbListCustomers, dbCreateCustomer } from "@/lib/supabase/customers";
import { handleApiError } from "@/lib/api-error";

// GET /api/customers
export async function GET() {
    try {
        const customers = await dbListCustomers();
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
        return NextResponse.json(customer, { status: 201 });
    } catch (err) {
        return handleApiError(err, "POST /api/customers");
    }
}
