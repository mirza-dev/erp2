import { NextRequest, NextResponse } from "next/server";
import { dbDeleteProductionEntry } from "@/lib/supabase/production";

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
        console.error("[DELETE /api/production/[id]]", err);
        return NextResponse.json({ error: "Üretim kaydı silinemedi." }, { status: 500 });
    }
}
