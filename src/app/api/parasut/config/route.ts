import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/role-guard";

// Mask a credential value: show first 4 chars + 8 bullet placeholders.
// Returns null when the env var is not set.
function mask(val: string | undefined): string | null {
    if (!val) return null;
    return val.slice(0, 4) + "•".repeat(8);
}

// GET /api/parasut/config
// Demo/anonymous users: enabled flag only — no partial credential values.
// Authenticated users: view_parasut yetkisi gerekir (kardeş stats/logs/invoices
// paritesi) → maskeli kimlik bilgileri + secret boolean.
export async function GET(req: NextRequest) {
    const cookieStore = await cookies();
    const isDemo = cookieStore.get("demo_mode")?.value === "1";

    if (isDemo) {
        return NextResponse.json({
            enabled: process.env.PARASUT_ENABLED === "true",
            companyId: null,
            clientId: null,
            clientSecretConfigured: false,
        });
    }

    const guard = await requirePermission(req, "view_parasut");
    if (guard) return guard;

    return NextResponse.json({
        enabled: process.env.PARASUT_ENABLED === "true",
        companyId: mask(process.env.PARASUT_COMPANY_ID),
        clientId: mask(process.env.PARASUT_CLIENT_ID),
        clientSecretConfigured: !!process.env.PARASUT_CLIENT_SECRET,
    });
}
