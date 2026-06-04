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
import { dbGetImportDocument } from "@/lib/supabase/import-documents";
import { dbGetProductById } from "@/lib/supabase/products";
import { dbGetProductType, dbGetProductTypeWithFields } from "@/lib/supabase/product-types";
import { requireRole } from "@/lib/auth/role-guard";
import { createClient } from "@/lib/supabase/server";
import { handleApiError } from "@/lib/api-error";
import { normalizeTechnicalEvidence } from "@/lib/technical-templates";
import type { TechnicalExtractionEvidence } from "@/lib/database.types";

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

        // Faz 3c Review P3: applied belgede satır PATCH'i 409 — apply ile
        // doc terminal state'e geçti, satır düzenlemenin operational etkisi
        // yok ve UI tutarlılığı bozulur. Extract route paterniyle uyumlu.
        const parentDoc = await dbGetImportDocument(existing.document_id);
        if (parentDoc?.status === "applied") {
            return NextResponse.json(
                { error: "Belge uygulandı, satır düzenlenemez." },
                { status: 409 },
            );
        }

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

        // Review 3b 3.tur: product_type_id override (multi-type satır bazlı override).
        // undefined → patch yok; null → clear; string → UUID + existence check.
        let productTypeIdPatch: string | null | undefined = undefined;
        if (body.product_type_id !== undefined) {
            if (body.product_type_id === null) {
                productTypeIdPatch = null;
            } else if (typeof body.product_type_id === "string") {
                if (!UUID_RE.test(body.product_type_id)) {
                    return NextResponse.json({ error: "Geçersiz ürün tipi UUID." }, { status: 400 });
                }
                const type = await dbGetProductType(body.product_type_id);
                if (!type) {
                    return NextResponse.json({ error: "Belirtilen ürün tipi bulunamadı." }, { status: 400 });
                }
                productTypeIdPatch = body.product_type_id;
            } else {
                return NextResponse.json({ error: "product_type_id string veya null olmalı." }, { status: 400 });
            }
        }

        let attributesPatch: Record<string, unknown> | undefined = undefined;
        if (body.extracted_attributes !== undefined) {
            if (!body.extracted_attributes || typeof body.extracted_attributes !== "object" || Array.isArray(body.extracted_attributes)) {
                return NextResponse.json({ error: "extracted_attributes obje olmalı." }, { status: 400 });
            }
            attributesPatch = body.extracted_attributes as Record<string, unknown>;
        }

        let evidencePatch: TechnicalExtractionEvidence | undefined = undefined;
        const shouldRevalidateAttributes = attributesPatch !== undefined || productTypeIdPatch !== undefined;
        if (shouldRevalidateAttributes) {
            const effectiveTypeId = productTypeIdPatch !== undefined ? productTypeIdPatch : existing.product_type_id;
            let nextAttributes = attributesPatch ?? existing.extracted_attributes ?? {};

            if (!effectiveTypeId) {
                if (Object.keys(nextAttributes).length > 0) {
                    return NextResponse.json({ error: "Teknik özellik için önce teknik şablon seçin." }, { status: 400 });
                }
                evidencePatch = {};
            } else {
                const typeWithFields = await dbGetProductTypeWithFields(effectiveTypeId);
                if (!typeWithFields || typeWithFields.is_active === false) {
                    return NextResponse.json({ error: "Teknik şablon aktif değil veya bulunamadı." }, { status: 400 });
                }
                const allowedKeys = new Set(typeWithFields.fields.map(f => f.field_key));
                if (attributesPatch === undefined && productTypeIdPatch !== undefined) {
                    nextAttributes = Object.fromEntries(
                        Object.entries(nextAttributes).filter(([key]) => allowedKeys.has(key)),
                    );
                    attributesPatch = nextAttributes;
                }
                const unknownKeys = Object.keys(nextAttributes).filter(key => !allowedKeys.has(key));
                if (unknownKeys.length > 0) {
                    return NextResponse.json(
                        { error: `Teknik şablonda olmayan alanlar: ${unknownKeys.join(", ")}` },
                        { status: 400 },
                    );
                }
                const rawEvidence = (
                    body.extraction_evidence && typeof body.extraction_evidence === "object" && !Array.isArray(body.extraction_evidence)
                        ? body.extraction_evidence
                        : existing.extraction_evidence ?? {}
                ) as Record<string, unknown>;
                evidencePatch = normalizeTechnicalEvidence(rawEvidence, new Set(Object.keys(nextAttributes)));
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
            product_type_id: productTypeIdPatch,
            extracted_attributes: attributesPatch,
            extraction_evidence: evidencePatch,
        });

        return NextResponse.json({ ok: true, line: updated });
    } catch (err) {
        return handleApiError(err, "PATCH /api/import/document-lines/[id]");
    }
}
