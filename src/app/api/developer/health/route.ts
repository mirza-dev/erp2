import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-error";
import { requireInternalOperatorFor } from "@/lib/auth/internal-access";
import { resolveAuthContext } from "@/lib/auth/role-guard";
import { collectHealth } from "@/lib/services/developer-console-service";

/**
 * Servis sağlığı (§4).
 *
 * Mevcut `/api/health`'in YERİNE GEÇMEZ: o uç anonim izleme (Coolify/uptime)
 * ve `?detail=true` ile CRON_SECRET'lı derin migration kontrolü içindir. Bu
 * uç panel içindir — internalOperator korumalı, hafif sondalar, insan-okur
 * açıklamalar. İkisi farklı iş yapar, biri diğerini tekrar etmez.
 */
export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const auth = await resolveAuthContext();
        const guard = requireInternalOperatorFor(auth);
        if (guard) return guard;

        return NextResponse.json(await collectHealth());
    } catch (err) {
        return handleApiError(err, "GET /api/developer/health");
    }
}
