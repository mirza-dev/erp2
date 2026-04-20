import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { dbUpdateCompanySettings } from "@/lib/supabase/company-settings";
import { handleApiError } from "@/lib/api-error";
import { revalidateTag } from "next/cache";

const ALLOWED_MIME = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];
const MAX_SIZE = 2 * 1024 * 1024; // 2MB

// POST /api/settings/company/logo
// Content-Type: multipart/form-data — field: "file"
export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get("file");
        if (!(file instanceof File)) {
            return NextResponse.json({ error: "Dosya bulunamadı." }, { status: 400 });
        }
        if (!ALLOWED_MIME.includes(file.type)) {
            return NextResponse.json({ error: "Geçersiz dosya türü. PNG, JPEG, SVG veya WebP yükleyin." }, { status: 400 });
        }
        if (file.size > MAX_SIZE) {
            return NextResponse.json({ error: "Dosya 2MB'ı aşıyor." }, { status: 400 });
        }

        const ext = file.name.split(".").pop() ?? "png";
        const path = `logo/company-logo.${ext}`;
        const buffer = Buffer.from(await file.arrayBuffer());

        const sb = createServiceClient();
        const { error: uploadError } = await sb.storage
            .from("company-assets")
            .upload(path, buffer, { upsert: true, contentType: file.type });

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = sb.storage
            .from("company-assets")
            .getPublicUrl(path);

        // Cache-bust: timestamp param
        const logo_url = `${publicUrl}?t=${Date.now()}`;

        await dbUpdateCompanySettings({ logo_url });
        revalidateTag("company-settings", "max");

        return NextResponse.json({ logo_url });
    } catch (err) {
        return handleApiError(err, "POST /api/settings/company/logo");
    }
}
