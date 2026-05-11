import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export type Role = "admin" | "purchaser" | "viewer";

export async function getCurrentUserRole(_req: NextRequest): Promise<Role> {
    const sb = await createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return "viewer";
    // app_metadata: server-only (kullanıcı kendini admin yapamaz);
    // user_metadata auth.updateUser ile kullanıcı tarafından yazılabilir → güvenli değil.
    const role = user.app_metadata?.role;
    if (role === "admin" || role === "purchaser" || role === "viewer") return role as Role;
    return "purchaser";  // varsayılan
}

export async function requireRole(req: NextRequest, allowed: Role[]): Promise<NextResponse | null> {
    const role = await getCurrentUserRole(req);
    if (!allowed.includes(role)) {
        return NextResponse.json({ error: "Yetkiniz yok." }, { status: 403 });
    }
    return null;
}
