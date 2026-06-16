import { NextRequest, NextResponse } from "next/server";
import { dbGetRfqArchive, dbDownloadRfqArchiveHtml } from "@/lib/supabase/rfq-archives";
import { handleApiError } from "@/lib/api-error";
import { resolveAuthContext, requirePermissionFor } from "@/lib/auth/role-guard";

// GET /api/rfqs/[id]/archive?vendor=<vendor_uuid>&view=1
// Donmuş RFQ belgesini text/html olarak servis eder (storage signed URL HTML render etmez).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const ctx = await resolveAuthContext();
        const guard = requirePermissionFor(ctx, "view_rfqs");
        if (guard) return guard;

        const { id } = await params;
        const vendorId = req.nextUrl.searchParams.get("vendor");
        if (!vendorId) return NextResponse.json({ error: "vendor parametresi zorunludur." }, { status: 400 });

        const archive = await dbGetRfqArchive(id, vendorId);
        if (!archive) return NextResponse.json({ error: "Arşiv bulunamadı." }, { status: 404 });

        const html = await dbDownloadRfqArchiveHtml(archive.file_path);
        if (html == null) return NextResponse.json({ error: "Arşiv dosyası okunamadı." }, { status: 404 });

        return new NextResponse(html, {
            status: 200,
            headers: { "Content-Type": "text/html; charset=utf-8" },
        });
    } catch (err) {
        return handleApiError(err, "GET /api/rfqs/[id]/archive");
    }
}
