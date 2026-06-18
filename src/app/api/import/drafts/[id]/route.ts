import { NextRequest, NextResponse } from "next/server";
import { dbGetDraft, dbUpdateDraft } from "@/lib/supabase/import";
import type { ImportDraftStatus } from "@/lib/database.types";
import { safeParseJson } from "@/lib/api-error";
import { requirePermission } from "@/lib/auth/role-guard";
import type { ImportFieldApproval } from "@/lib/import-center";

// GET /api/import/drafts/[id]
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        // Denetim O1 (2026-06): view_import şartı — draft raw_data/parsed_data tedarikçi/
        // fiyat/maliyet verisi taşıyabilir (Y1'in kardeş [batchId]/drafts list GET'ine
        // view_import eklerken belirttiği gerekçe). Bu tekil GET Y1'de atlanmıştı; proxy
        // demo'ya GET /api/* izni verdiğinden view_import'suz roller + demo okuyabiliyordu.
        const guard = await requirePermission(req, "view_import");
        if (guard) return guard;
        const { id } = await params;
        const draft = await dbGetDraft(id);
        if (!draft) return NextResponse.json({ error: "Draft bulunamadı." }, { status: 404 });
        return NextResponse.json(draft);
    } catch (err) {
        console.error("[GET /api/import/drafts/[id]]", err);
        return NextResponse.json({ error: "Draft alınamadı." }, { status: 500 });
    }
}

// PATCH /api/import/drafts/[id]
// Body: { status?: "confirmed"|"rejected", user_corrections?, field_approvals? }
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const guard = await requirePermission(req, "manage_import");
        if (guard) return guard;

        const { id } = await params;
        const safeParsed = await safeParseJson(req);
        if (!safeParsed.ok) return safeParsed.response;
        const { status, user_corrections } = safeParsed.data as {
            status?: ImportDraftStatus;
            user_corrections?: Record<string, unknown>;
            field_approvals?: Record<string, ImportFieldApproval>;
        };
        const { field_approvals } = safeParsed.data as { field_approvals?: Record<string, ImportFieldApproval> };

        const validStatuses: ImportDraftStatus[] = ["confirmed", "rejected", "pending"];
        if (status && !validStatuses.includes(status)) {
            return NextResponse.json({ error: `Geçersiz status: ${status}` }, { status: 400 });
        }

        if (field_approvals) {
            const allowed = new Set(["apply", "skip", "clear"]);
            const invalid = Object.values(field_approvals).find(v => !allowed.has(v));
            if (invalid) {
                return NextResponse.json({ error: `Geçersiz alan onayı: ${invalid}` }, { status: 400 });
            }
        }

        const updated = await dbUpdateDraft(id, { status, user_corrections, field_approvals });
        return NextResponse.json(updated);
    } catch (err) {
        console.error("[PATCH /api/import/drafts/[id]]", err);
        return NextResponse.json({ error: "Draft güncellenemedi." }, { status: 500 });
    }
}
