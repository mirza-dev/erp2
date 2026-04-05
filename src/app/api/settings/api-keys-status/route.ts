import { cookies } from "next/headers";
import { NextResponse } from "next/server";

// GET /api/settings/api-keys-status
// Authenticated users: boolean presence flags for each integration key.
// Demo/anonymous users: all false — internal integration setup is not revealed.
export async function GET() {
    const cookieStore = await cookies();
    const isDemo = cookieStore.get("demo_mode")?.value === "1";

    if (isDemo) {
        return NextResponse.json({ parasut: false, claude: false, vercel: false });
    }

    return NextResponse.json({
        parasut: !!process.env.PARASUT_CLIENT_SECRET,
        claude: !!process.env.ANTHROPIC_API_KEY,
        vercel: !!process.env.VERCEL_API_KEY,
    });
}
