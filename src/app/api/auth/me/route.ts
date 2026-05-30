import { NextResponse } from "next/server";
import { getCurrentUserRoles } from "@/lib/auth/role-guard";
import { permissionsForRoles } from "@/lib/auth/permissions";
import { handleApiError } from "@/lib/api-error";

/**
 * GET /api/auth/me — geçerli kullanıcının rolleri + effective permission'ları.
 * Sidebar UX filtresi + (ileride Faz 7) dashboard kart maskeleme buradan okur.
 * Güvenlik enforcement DEĞİL — gerçek koruma proxy.ts page-gate + API guard'da.
 *
 * Auth: middleware /api/** zaten gate'ler. Demo/anon → user yok → ["viewer"].
 */
export async function GET() {
    try {
        const roles = await getCurrentUserRoles();
        const permissions = Array.from(permissionsForRoles(roles));
        return NextResponse.json({ roles, permissions });
    } catch (err) {
        return handleApiError(err, "GET /api/auth/me");
    }
}
