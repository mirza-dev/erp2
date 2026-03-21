import { NextRequest, NextResponse } from "next/server";
import { dbDeleteProductionEntry } from "@/lib/supabase/production";
import { handleApiError } from "@/lib/api-error";

// DELETE /api/production/[id]
export async function DELETE(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        await dbDeleteProductionEntry(id);
        return NextResponse.json({ ok: true });
    } catch (err) {
        return handleApiError(err, "DELETE /api/production/[id]");
    }
}
