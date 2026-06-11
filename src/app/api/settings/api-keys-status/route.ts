import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-error";
import { requireInternalOperator } from "@/lib/auth/internal-access";

// GET /api/settings/api-keys-status
// Internal operator: boolean presence flags for each integration key.
// Müşteri/anon kullanıcılar guard tarafından reddedilir; secret değer dönmez.
export async function GET() {
    try {
        const guard = await requireInternalOperator();
        if (guard) return guard;

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
    } catch (err) {
        return handleApiError(err, "GET /api/settings/api-keys-status");
    }
}
