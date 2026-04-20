import { NextRequest, NextResponse } from "next/server";
import { dbGetCompanySettings, dbUpdateCompanySettings } from "@/lib/supabase/company-settings";
import { handleApiError } from "@/lib/api-error";
import { unstable_cache, revalidateTag } from "next/cache";

const getCachedCompanySettings = unstable_cache(
    async () => {
        return dbGetCompanySettings();
    },
    ["company-settings"],
    { tags: ["company-settings"], revalidate: 300 }
);

// GET /api/settings/company
export async function GET() {
    try {
        const settings = await getCachedCompanySettings();
        return NextResponse.json(settings ?? {});
    } catch (err) {
        return handleApiError(err, "GET /api/settings/company");
    }
}

// PATCH /api/settings/company
export async function PATCH(req: NextRequest) {
    try {
        const body = await req.json();
        // Sadece izin verilen alanları al
        // logo_url burada intentionally yok — logo değişimi için /logo endpoint kullanılmalı (MIME/size doğrulama)
        const allowed = ["name", "tax_office", "tax_no", "address", "phone", "email", "website", "currency"] as const;
        const patch: Record<string, unknown> = {};
        for (const key of allowed) {
            if (key in body) patch[key] = body[key];
        }
        const updated = await dbUpdateCompanySettings(patch);
        revalidateTag("company-settings", "max");
        return NextResponse.json(updated);
    } catch (err) {
        return handleApiError(err, "PATCH /api/settings/company");
    }
}
