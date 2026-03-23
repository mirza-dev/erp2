import { NextRequest, NextResponse } from "next/server";
import { dbDeleteCustomer } from "@/lib/supabase/customers";
import { handleApiError } from "@/lib/api-error";

// DELETE /api/customers/[id]
export async function DELETE(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        await dbDeleteCustomer(id);
        return NextResponse.json({ ok: true });
    } catch (err) {
        return handleApiError(err, "DELETE /api/customers/[id]");
    }
}
