import { NextRequest, NextResponse } from "next/server";
import { dbGetCompanySettings, dbUpdateCompanySettings } from "@/lib/supabase/company-settings";
import { handleApiError, safeParseJson } from "@/lib/api-error";
import { isValidEmail, isValidTaxNumber, isValidUrl } from "@/lib/validation";
import { requirePermission } from "@/lib/auth/role-guard";
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

const ALLOWED_CURRENCIES: ReadonlySet<string> = new Set(["USD", "EUR", "TRY"]);

/**
 * Server-side validation — UI tarafında zaten validation var ama bu endpoint
 * doğrudan auth'lu kullanıcı tarafından çağrılabildiği için API katmanında da
 * aynı kuralları uygulamak şart (defense in depth).
 */
function validateCompanyPatch(patch: Record<string, unknown>): string | null {
    const name = patch.name;
    if (name !== undefined) {
        if (typeof name !== "string" || name.trim().length === 0) {
            return "Firma adı zorunludur.";
        }
        if (name.length > 200) return "Firma adı en fazla 200 karakter olabilir.";
    }
    const email = patch.email;
    if (typeof email === "string" && email.trim().length > 0 && !isValidEmail(email)) {
        return "Geçerli bir e-posta girin.";
    }
    const taxNo = patch.tax_no;
    if (typeof taxNo === "string" && taxNo.trim().length > 0 && !isValidTaxNumber(taxNo)) {
        return "Vergi numarası 10 veya 11 hane olmalı.";
    }
    const website = patch.website;
    if (typeof website === "string" && website.trim().length > 0 && !isValidUrl(website)) {
        return "Geçerli bir web adresi girin.";
    }
    const currency = patch.currency;
    if (typeof currency === "string" && currency.length > 0 && !ALLOWED_CURRENCIES.has(currency)) {
        return "Para birimi USD, EUR veya TRY olmalı.";
    }
    return null;
}

// PATCH /api/settings/company
export async function PATCH(req: NextRequest) {
    try {
        const guard = await requirePermission(req, "manage_settings");
        if (guard) return guard;

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
        const validationError = validateCompanyPatch(patch);
        if (validationError) {
            return NextResponse.json({ error: validationError }, { status: 400 });
        }
        const updated = await dbUpdateCompanySettings(patch);
        revalidateTag("company-settings", "max");
        return NextResponse.json(updated);
    } catch (err) {
        return handleApiError(err, "PATCH /api/settings/company");
    }
}
