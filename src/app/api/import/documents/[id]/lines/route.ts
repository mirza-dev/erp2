/**
 * Faz 3b — GET /api/import/documents/[id]/lines
 *
 * Belgeden çıkarılan tüm satırları line_number sırasında listeler.
 * Auth: middleware zaten authenticated requirement (viewer dahil okuyabilir).
 */
import { NextRequest, NextResponse } from "next/server";
import { dbGetImportDocument } from "@/lib/supabase/import-documents";
import { dbListLinesByDocument } from "@/lib/supabase/import-document-lines";
import { handleApiError } from "@/lib/api-error";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await ctx.params;
        if (!id) return NextResponse.json({ error: "Belge ID zorunludur." }, { status: 400 });

        const doc = await dbGetImportDocument(id);
        if (!doc) return NextResponse.json({ error: "Belge bulunamadı." }, { status: 404 });

        const lines = await dbListLinesByDocument(id);
        return NextResponse.json({ items: lines });
    } catch (err) {
        return handleApiError(err, "GET /api/import/documents/[id]/lines");
    }
}
