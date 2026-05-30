/**
 * Faz 1 — sync_issue alert'ten Paraşüt retry tetiklemesi.
 *
 * POST /api/alerts/[id]/sync-retry
 *
 * Davranış:
 *   - Alert 'sync_issue' tipinde olmalı (aksi → 400).
 *   - Status zaten resolved/dismissed → 400 ("zaten kapalı").
 *   - entity_id == ALERT_ENTITY_PARASUT_AUTH → OAuth token refresh (serviceParasutOAuthRefresh).
 *   - Diğer Paraşüt alertleri (shipment/invoice/edoc/stock_invariant) → serviceSyncAllPending.
 *   - Başarılı her iki yolda alert 'resolved' olarak işaretlenir (reason='sync-retry-from-alert').
 *
 * Auth: middleware session zorunluluğu zaten geçerli (ALWAYS_PUBLIC değil).
 *       Demo modda mutasyon middleware tarafından 403'le bloklanır.
 *
 * Not: /api/parasut/oauth/refresh admin email gate'li; bu endpoint öyle değil
 *      çünkü kullanıcı zaten alert'i görüyor + retry mantığı kapsam olarak daha
 *      dar (sadece o alert'in çözümü için tek seferlik refresh).
 */
import { NextRequest, NextResponse } from "next/server";
import { dbGetAlertById, dbUpdateAlertStatus } from "@/lib/supabase/alerts";
import { serviceSyncAllPending } from "@/lib/services/parasut-service";
import { serviceParasutOAuthRefresh } from "@/lib/services/parasut-oauth";
import {
    ALERT_ENTITY_PARASUT_AUTH,
    PARASUT_SYNC_ALERT_ENTITY_IDS,
    PARASUT_ALERT_ENTITY_TYPES,
} from "@/lib/parasut-constants";
import { handleApiError } from "@/lib/api-error";
import { requirePermission } from "@/lib/auth/role-guard";

export async function POST(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const guard = await requirePermission(_req, "manage_alerts");
        if (guard) return guard;

        const { id } = await params;
        const alert = await dbGetAlertById(id);
        if (!alert) {
            return NextResponse.json({ error: "Uyarı bulunamadı." }, { status: 404 });
        }
        if (alert.type !== "sync_issue") {
            return NextResponse.json(
                { error: "Bu uyarı tipi için sync retry desteklenmiyor." },
                { status: 400 },
            );
        }
        // Faz 1 (advisor P3): "sync_issue" tipi gelecekte Paraşüt dışı kullanımlara
        // genişlerse, bu endpoint sadece bilinen Paraşüt entity_id whitelist'iyle
        // (entity_type parasut/parasut_auth) eşleşen alertleri kabul eder.
        // Defense-in-depth: hem entity_type hem entity_id kontrolü.
        const entityType = alert.entity_type ?? "";
        const entityId   = alert.entity_id ?? "";
        const isParasutEntityType = PARASUT_ALERT_ENTITY_TYPES.has(entityType);
        const isKnownParasutId    = PARASUT_SYNC_ALERT_ENTITY_IDS.has(entityId);
        if (!isParasutEntityType || !isKnownParasutId) {
            return NextResponse.json(
                { error: "Bu uyarı Paraşüt sync alanına ait değil; retry desteklenmiyor." },
                { status: 400 },
            );
        }
        if (alert.status === "resolved" || alert.status === "dismissed") {
            return NextResponse.json(
                { error: "Uyarı zaten kapatılmış." },
                { status: 400 },
            );
        }

        let action: "oauth_refresh" | "sync_all";
        if (alert.entity_id === ALERT_ENTITY_PARASUT_AUTH) {
            action = "oauth_refresh";
            const result = await serviceParasutOAuthRefresh();
            if (!result.success) {
                return NextResponse.json(
                    { error: "OAuth bağlantısı kurulmamış. Paraşüt sayfasından yeniden yetkilendirme yapın." },
                    { status: 409 },
                );
            }
        } else {
            action = "sync_all";
            const result = await serviceSyncAllPending();
            // serviceSyncAllPending hata listesi döner ama tek bir başarı bile alert'i çözmek için yeterli
            // değil — mantıklı: kullanıcı sync'i tetikledi, akış bitti, alert kapatılır. Yeniden hata
            // oluşursa scan tekrar açar (dedup zaten alert tipinden geliyor).
            if (result.failed > 0 && result.synced === 0) {
                return NextResponse.json(
                    {
                        error: "Sync başarısız oldu, uyarı açık kaldı.",
                        details: result.errors.slice(0, 3),
                    },
                    { status: 502 },
                );
            }
        }

        await dbUpdateAlertStatus(id, "resolved", "sync-retry-from-alert");

        return NextResponse.json({ success: true, action });
    } catch (err) {
        return handleApiError(err, "POST /api/alerts/[id]/sync-retry");
    }
}
