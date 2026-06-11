import { NextRequest, NextResponse } from "next/server";
import { serviceListAlerts } from "@/lib/services/alert-service";
import { dbCreateAlert } from "@/lib/supabase/alerts";
import { requirePermission } from "@/lib/auth/role-guard";
import { createClient } from "@/lib/supabase/server";
import type { AlertStatus, AlertSeverity, AlertType } from "@/lib/database.types";

// GET /api/alerts?status=open&severity=critical&type=stock_critical
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = req.nextUrl;
        const alerts = await serviceListAlerts({
            status:      (searchParams.get("status") as AlertStatus)   ?? undefined,
            severity:    (searchParams.get("severity") as AlertSeverity) ?? undefined,
            type:        (searchParams.get("type") as AlertType)        ?? undefined,
            entity_type: searchParams.get("entity_type") ?? undefined,
            entity_id:   searchParams.get("entity_id")   ?? undefined,
        });
        return NextResponse.json(alerts);
    } catch (err) {
        console.error("[GET /api/alerts]", err);
        return NextResponse.json({ error: "Alertler alınamadı." }, { status: 500 });
    }
}

// POST /api/alerts — kullanıcı notu / hatırlatma oluştur (090).
// YALNIZ type=user_note yazılabilir: sistem/AI uyarıları bu uçtan üretilemez
// (kural-bazlı scan'lerin ve dedup mantığının dışına sahte kayıt sokulamaz).
// RBAC: Uyarılar sayfasını gören herkes not ekleyebilir (view_alerts).
export async function POST(req: NextRequest) {
    try {
        const guard = await requirePermission(req, "view_alerts");
        if (guard) return guard;

        let body: unknown;
        try {
            body = await req.json();
        } catch {
            return NextResponse.json({ error: "Geçersiz JSON." }, { status: 400 });
        }
        const b = (body ?? {}) as { title?: unknown; description?: unknown; due_date?: unknown };

        const title = typeof b.title === "string" ? b.title.trim() : "";
        if (!title) return NextResponse.json({ error: "Başlık zorunludur." }, { status: 400 });
        if (title.length > 200) return NextResponse.json({ error: "Başlık en fazla 200 karakter olabilir." }, { status: 400 });

        const description = typeof b.description === "string" ? b.description.trim() : "";
        if (description.length > 2000) return NextResponse.json({ error: "Açıklama en fazla 2000 karakter olabilir." }, { status: 400 });

        let dueDate: string | null = null;
        if (b.due_date !== undefined && b.due_date !== null && b.due_date !== "") {
            if (typeof b.due_date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(b.due_date)) {
                return NextResponse.json({ error: "Hatırlatma tarihi YYYY-AA-GG biçiminde olmalı." }, { status: 400 });
            }
            const today = new Date().toISOString().slice(0, 10);
            if (b.due_date < today) {
                return NextResponse.json({ error: "Hatırlatma tarihi geçmişte olamaz." }, { status: 400 });
            }
            dueDate = b.due_date;
        }

        // Oluşturan: session kullanıcısının görünen adı (fullName || email snapshot).
        let createdBy: string | null = null;
        try {
            const supabase = await createClient();
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
                createdBy = (typeof meta.full_name === "string" && meta.full_name.trim())
                    ? meta.full_name.trim()
                    : (user.email ?? null);
            }
        } catch { /* createdBy snapshot best-effort — not yine oluşur */ }

        const alert = await dbCreateAlert({
            type: "user_note",
            severity: "info",
            title,
            description: description || undefined,
            source: "ui",
            due_date: dueDate,
            created_by: createdBy,
        });
        if (!alert) {
            // user_note entity_id taşımaz → dedup index çakışması beklenmez; defansif.
            return NextResponse.json({ error: "Not oluşturulamadı." }, { status: 500 });
        }
        return NextResponse.json(alert, { status: 201 });
    } catch (err) {
        console.error("[POST /api/alerts]", err);
        return NextResponse.json({ error: "Not oluşturulamadı." }, { status: 500 });
    }
}
