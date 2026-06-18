import { NextRequest, NextResponse } from "next/server";
import { dbListCustomers, dbCreateCustomer, type CreateCustomerInput } from "@/lib/supabase/customers";
import { handleApiError, safeParseJson, validateStringLengths } from "@/lib/api-error";
import { getCurrentUserPermissions, requirePermission } from "@/lib/auth/role-guard";
import { redactCustomersForPerms } from "@/lib/auth/redact";
import { unstable_cache, revalidateTag } from "next/cache";

const getCachedCustomers = unstable_cache(
    () => dbListCustomers(),
    ["customers-list"],
    { tags: ["customers"], revalidate: 30 }
);

// GET /api/customers
export async function GET(req: NextRequest) {
    try {
        // RBAC: view_customers guard. Redaction (aşağıda) yalnız finansal alanı
        // (total_revenue) maskeler — müşteri PII'sini (ad/e-posta/telefon/adres/
        // vergi) korumaz. view_customers production'da YOK + /dashboard/customers
        // page-access ile production'a kapalı → guard'sız GET production'a (ve
        // proxy-fail-open/anon'a) PII sızdırıyordu. Demo=viewer (view_customers
        // taşır) + tüm tüketici UI'ları view_customers-tier → guard hiçbir
        // erişilebilir yüzeyi kırmaz, yalnız production'ı kapatır.
        const guard = await requirePermission(req, "view_customers");
        if (guard) return guard;

        const customers = await getCachedCustomers();
        // RBAC R3: redaction cache SONRASI, per-request (perms cache key'ine girmez).
        const perms = await getCurrentUserPermissions();
        return NextResponse.json(redactCustomersForPerms(customers, perms));
    } catch (err) {
        return handleApiError(err, "GET /api/customers");
    }
}

// POST /api/customers
export async function POST(req: NextRequest) {
    try {
        const guard = await requirePermission(req, "manage_customers");
        if (guard) return guard;

        const parsed = await safeParseJson(req);
        if (!parsed.ok) return parsed.response;
        const body = parsed.data as CreateCustomerInput;
        const lengthErr = validateStringLengths(body as unknown as Record<string, unknown>);
        if (lengthErr) return NextResponse.json({ error: lengthErr }, { status: 400 });

        if (body.country && (body.country as string).length > 2) {
            return NextResponse.json({ error: "Ülke kodu en fazla 2 karakter olabilir (ISO 3166-1 alpha-2)" }, { status: 400 });
        }
        const customer = await dbCreateCustomer(body);
        revalidateTag("customers", "max");
        return NextResponse.json(customer, { status: 201 });
    } catch (err) {
        return handleApiError(err, "POST /api/customers");
    }
}
