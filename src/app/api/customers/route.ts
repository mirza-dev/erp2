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
        const customer = await dbCreateCustomer(body);
        return NextResponse.json(customer, { status: 201 });
    } catch (err) {
        return handleApiError(err, "POST /api/customers");
    }
}
