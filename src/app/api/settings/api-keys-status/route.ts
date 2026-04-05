import { NextResponse } from "next/server";

// GET /api/settings/api-keys-status
// Returns boolean presence flags for each integration key.
// Actual key values are never exposed to the client.
export async function GET() {
    return NextResponse.json({
        parasut: !!process.env.PARASUT_CLIENT_SECRET,
        claude: !!process.env.ANTHROPIC_API_KEY,
        vercel: !!process.env.VERCEL_API_KEY,
    });
}
