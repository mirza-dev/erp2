import { NextRequest, NextResponse } from "next/server";
import { dbGetCompanySettings, dbUpdateCompanySettings } from "@/lib/supabase/company-settings";
import { handleApiError, safeParseJson } from "@/lib/api-error";
import { unstable_cache, revalidateTag } from "next/cache";

const getCachedCompanySettings = unstable_cache(
    async () => {
        return dbGetCompanySettings();
    },
    ["company-settings"],
    { tags: ["company-settings"], revalidate: 300 }
);

// Yalnızca bu alanlar dışarıya döner. Tabloya ileride eklenen kimlik/token alanları sızmaz.
const SAFE_COMPANY_FIELDS = [
    "id", "name", "tax_office", "tax_no", "address",
    "phone", "email", "website", "logo_url", "currency", "updated_at",
] as const;

// GET /api/settings/company
export async function GET() {
    try {
        const settings = await getCachedCompanySettings();
        if (!settings) return NextResponse.json({});
        const safe: Record<string, unknown> = {};
        for (const key of SAFE_COMPANY_FIELDS) {
            if (key in settings) safe[key] = (settings as unknown as Record<string, unknown>)[key];
        }
        return NextResponse.json(safe);
    } catch (err) {
        return handleApiError(err, "GET /api/settings/company");
    }
}

// PATCH /api/settings/company
export async function PATCH(req: NextRequest) {
    try {
        const parsed = await safeParseJson(req);
        if (!parsed.ok) return parsed.response;
        const body = parsed.data as Record<string, unknown>;
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
