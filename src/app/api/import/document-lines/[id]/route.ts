/**
 * Faz 3b — PATCH /api/import/document-lines/[id]
 *
 * Çıkarılan bir satırın match aksiyonunu günceller (review override):
 *   - matched_product_id + match_action='matched'  → kullanıcı manuel match
 *   - match_action='skipped'                       → bu satırı atla
 *   - match_action='new_product'                   → yeni ürün olarak işaretle
 *   - match_action='reviewed'                      → kullanıcı kararı kilitli
 *
 * Auth: requireRole(["admin","purchaser"]) — write işlemi.
 */
import { NextRequest, NextResponse } from "next/server";
import {
    dbGetLine,
    dbUpdateLineMatch,
    isValidMatchAction,
} from "@/lib/supabase/import-document-lines";
import { requireRole } from "@/lib/auth/role-guard";
import { createClient } from "@/lib/supabase/server";
import { handleApiError } from "@/lib/api-error";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
        const guard = await requireRole(req, ["admin", "purchaser"]);
        if (guard) return guard;

        const { id } = await ctx.params;
        if (!id) return NextResponse.json({ error: "Satır ID zorunludur." }, { status: 400 });

        const existing = await dbGetLine(id);
        if (!existing) return NextResponse.json({ error: "Satır bulunamadı." }, { status: 404 });

        const body = await req.json().catch(() => ({})) as Record<string, unknown>;

        if (!isValidMatchAction(body.match_action)) {
            return NextResponse.json({ error: "Geçersiz match_action." }, { status: 400 });
        }

        const matchedRaw = body.matched_product_id;
        const matchedId = typeof matchedRaw === "string" && matchedRaw.length > 0 ? matchedRaw : null;

        // matched aksiyonu için product_id zorunlu
        if (body.match_action === "matched" && !matchedId) {
            return NextResponse.json({ error: "matched aksiyonu için matched_product_id zorunlu." }, { status: 400 });
        }

        // Reviewer bilgisi
        const sb = await createClient();
        const { data: { user } } = await sb.auth.getUser();

        const confidence = typeof body.match_confidence === "number" ? body.match_confidence : null;

        const updated = await dbUpdateLineMatch(id, {
            matched_product_id: matchedId,
            match_action: body.match_action,
            match_confidence: confidence,
            reviewed_by: user?.id ?? null,
        });

        return NextResponse.json({ ok: true, line: updated });
    } catch (err) {
        return handleApiError(err, "PATCH /api/import/document-lines/[id]");
    }
}
