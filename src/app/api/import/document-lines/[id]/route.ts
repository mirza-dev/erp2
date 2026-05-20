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
import { dbGetProductById } from "@/lib/supabase/products";
import { requireRole } from "@/lib/auth/role-guard";
import { createClient } from "@/lib/supabase/server";
import { handleApiError } from "@/lib/api-error";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

        // Review 3b P3-F: matched_product_id verildiyse UUID kontrolü
        // (DB cast hatası 500 yerine 400'e map).
        if (matchedId !== null && !UUID_RE.test(matchedId)) {
            return NextResponse.json({ error: "Geçersiz ürün UUID." }, { status: 400 });
        }

        // matched aksiyonu için product_id zorunlu
        if (body.match_action === "matched" && !matchedId) {
            return NextResponse.json({ error: "matched aksiyonu için matched_product_id zorunlu." }, { status: 400 });
        }

        // Review 3b P3-F: matched aksiyonu için ürün gerçekten var + aktif mi?
        if (body.match_action === "matched" && matchedId) {
            const product = await dbGetProductById(matchedId);
            if (!product) {
                return NextResponse.json({ error: "Eşleşen ürün bulunamadı." }, { status: 400 });
            }
            if (product.is_active === false) {
                return NextResponse.json({ error: "Eşleşen ürün pasif." }, { status: 400 });
            }
        }

        // Review 3b P3-F: match_confidence 0-100 aralık kontrolü
        // (DB CHECK constraint 500 yerine 400'e map).
        if (body.match_confidence !== undefined && body.match_confidence !== null) {
            const conf = body.match_confidence;
            if (typeof conf !== "number" || !Number.isFinite(conf) || conf < 0 || conf > 100) {
                return NextResponse.json({ error: "match_confidence 0-100 aralığında olmalı." }, { status: 400 });
            }
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
