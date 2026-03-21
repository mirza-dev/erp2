import { NextRequest, NextResponse } from "next/server";
import { dbListCustomers, dbCreateCustomer } from "@/lib/supabase/customers";

// GET /api/customers
export async function GET() {
    try {
        const customers = await dbListCustomers();
        return NextResponse.json(customers);
    } catch (err) {
        console.error("[GET /api/customers]", err);
        return NextResponse.json({ error: "Müşteriler alınamadı." }, { status: 500 });
    }
}

// POST /api/customers
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const customer = await dbCreateCustomer(body);
        return NextResponse.json(customer, { status: 201 });
    } catch (err) {
        console.error("[POST /api/customers]", err);
        return NextResponse.json({ error: "Müşteri oluşturulamadı." }, { status: 500 });
    }
}
