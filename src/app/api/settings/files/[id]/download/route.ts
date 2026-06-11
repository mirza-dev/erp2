import { NextRequest, NextResponse } from "next/server";
import { dbGetCompanyFile, dbGetCompanyFileSignedUrl } from "@/lib/supabase/company-files";
import { requirePermission } from "@/lib/auth/role-guard";
import { handleApiError } from "@/lib/api-error";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const dynamic = "force-dynamic";

// GET /api/settings/files/[id]/download — imzalı URL (1 saat).
// ?download=1 → attachment disposition (tarayıcı indirir).
// SVG her zaman attachment'a ZORLANIR: inline render stored-XSS riski
// (046_user_avatars_no_svg precedent'i) — önizleme yerine indirme.
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const guard = await requirePermission(req, "view_settings");
        if (guard) return guard;

        const { id } = await params;
        if (!UUID_RE.test(id)) {
            return NextResponse.json({ error: "Geçersiz dosya id." }, { status: 400 });
        }

        const row = await dbGetCompanyFile(id);
        if (!row || !row.file_path) {
            return NextResponse.json({ error: "Dosya bulunamadı." }, { status: 404 });
        }

        const wantsDownload = req.nextUrl.searchParams.get("download") === "1";
        const isSvg = row.mime_type === "image/svg+xml";
        const asAttachment = wantsDownload || isSvg;

        const url = await dbGetCompanyFileSignedUrl(
            row.file_path,
            asAttachment ? { download: row.display_name } : undefined,
        );
        if (!url) {
            return NextResponse.json({ error: "İndirme bağlantısı oluşturulamadı." }, { status: 502 });
        }
        return NextResponse.json({ url, expires_in: 3600 });
    } catch (err) {
        return handleApiError(err, "GET /api/settings/files/[id]/download");
    }
}
