import { NextResponse } from "next/server";
import { getInternalAccessContext } from "@/lib/auth/internal-access";
import { handleApiError } from "@/lib/api-error";

/**
 * GET /api/auth/me — geçerli kullanıcının rolleri + effective permission'ları
 * + müşteri rollerinden bağımsız internal operator durumu.
 * Sidebar UX filtresi + (ileride Faz 7) dashboard kart maskeleme buradan okur.
 * Güvenlik enforcement DEĞİL — gerçek koruma proxy.ts page-gate + API guard'da.
 *
 * Auth: middleware /api/** zaten gate'ler. Demo/anon → user yok → ["viewer"].
 */
export async function GET() {
    try {
        const access = await getInternalAccessContext();
        return NextResponse.json({
            roles: access.roles,
            permissions: Array.from(access.permissions),
            internalOperator: access.internalOperator,
        });
    } catch (err) {
        return handleApiError(err, "GET /api/auth/me");
    }
}
