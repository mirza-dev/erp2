import { NextResponse } from "next/server";
import { dbListCustomers } from "@/lib/supabase/customers";

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
