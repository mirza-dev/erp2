import { NextResponse } from "next/server";

// Mask a credential value: show first 4 chars + 8 bullet placeholders.
// Returns null when the env var is not set.
function mask(val: string | undefined): string | null {
    if (!val) return null;
    return val.slice(0, 4) + "•".repeat(8);
}

// GET /api/parasut/config
// Returns masked credential identifiers and a boolean for the secret.
// Full secret values are NEVER sent to the client.
export async function GET() {
    return NextResponse.json({
        enabled: process.env.PARASUT_ENABLED === "true",
        companyId: mask(process.env.PARASUT_COMPANY_ID),
        clientId: mask(process.env.PARASUT_CLIENT_ID),
        clientSecretConfigured: !!process.env.PARASUT_CLIENT_SECRET,
    });
}
