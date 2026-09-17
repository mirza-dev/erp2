import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/role-guard";
import { handleApiError } from "@/lib/api-error";
import { probeAIKey } from "@/lib/services/ai-service";
import { buildSystemStatus } from "@/lib/system-status";

/**
 * GET /api/settings/system-status — Ayarlar › Sistem Durumu kartı (onboarding).
 *
 * Guard `view_settings` (admin): müşterinin yöneticisi "e-posta neden
 * gitmiyor"u kendisi görsün (kullanıcı kararı 2026-09-16). Yanıt yalnız VAR/YOK
 * + etiket taşır, env DEĞERİ sızmaz (tek istisna public `NEXT_PUBLIC_APP_URL`).
 * Bu yüzden `api-keys-status`taki internal-operator kilidine gerek yok.
 *
 * AI için `probeAIKey` — anahtar varsa 1 token'lık istek, 10 dk önbellek; yoksa
 * ya da mandal kuruluysa hiç istek atmaz (`/api/ai/health` ile aynı maliyet).
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    try {
        const guard = await requirePermission(req, "view_settings");
        if (guard) return guard;

        const ai = await probeAIKey();
        return NextResponse.json(buildSystemStatus(process.env, { reason: ai.reason, status: ai.status }));
    } catch (err) {
        return handleApiError(err, "GET /api/settings/system-status");
    }
}
