import { cookies } from "next/headers";
import { NextResponse } from "next/server";

// Mask a credential value: show first 4 chars + 8 bullet placeholders.
// Returns null when the env var is not set.
function mask(val: string | undefined): string | null {
    if (!val) return null;
    return val.slice(0, 4) + "•".repeat(8);
}

// GET /api/parasut/config
// Authenticated users: masked credential identifiers + secret boolean.
// Demo/anonymous users: enabled flag only — no partial credential values.
export async function GET() {
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

    return NextResponse.json({
        enabled: process.env.PARASUT_ENABLED === "true",
        companyId: mask(process.env.PARASUT_COMPANY_ID),
        clientId: mask(process.env.PARASUT_CLIENT_ID),
        clientSecretConfigured: !!process.env.PARASUT_CLIENT_SECRET,
    });
}
