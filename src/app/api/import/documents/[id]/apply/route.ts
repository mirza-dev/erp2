/**
 * Faz 3c — POST /api/import/documents/[id]/apply
 *
 * `ExtractionReview` ekranındaki kararları gerçek `products` ve
 * `product_attachments` operasyonlarına çeviren transaction'ı tetikler.
 * Auth: admin|purchaser (yeni ürün yaratıyor, attachment yazıyor).
 *
 * Idempotency: serviceApplyImportDocument doc.status='classified' guard'ı
 * sayesinde ikinci çağrı 400'e düşer.
 */
import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import {
    serviceApplyImportDocument,
    type ApplyOptions,
} from "@/lib/services/import-apply-service";
import { requireRole } from "@/lib/auth/role-guard";
import { createClient } from "@/lib/supabase/server";
import { handleApiError } from "@/lib/api-error";

export const dynamic = "force-dynamic";

function normalizeFieldApprovals(raw: unknown): ApplyOptions["fieldApprovals"] | undefined {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
    const out: NonNullable<ApplyOptions["fieldApprovals"]> = {};
    const allowedProductFields = new Set(["name", "sku", "product_type_id"]);
    for (const [lineId, value] of Object.entries(raw as Record<string, unknown>).slice(0, 500)) {
        if (lineId.length > 80) continue;
        if (!lineId || typeof value !== "object" || value === null || Array.isArray(value)) continue;
        const productFieldsRaw = (value as { productFields?: unknown }).productFields;
        const keysRaw = (value as { technicalAttributeKeys?: unknown }).technicalAttributeKeys;
        const productFields = Array.isArray(productFieldsRaw)
            ? productFieldsRaw
                .filter((field): field is string => typeof field === "string" && allowedProductFields.has(field))
                .slice(0, 20)
            : [];
        const keys = Array.isArray(keysRaw) ? keysRaw
            .filter((key): key is string => typeof key === "string" && /^[a-z][a-z0-9_]{0,79}$/.test(key))
            .slice(0, 100) : [];
        out[lineId] = {
            productFields: [...new Set(productFields)],
            technicalAttributeKeys: [...new Set(keys)],
        };
    }
    return Object.keys(out).length > 0 ? out : undefined;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
        const guard = await requireRole(req, ["admin", "purchaser"]);
        if (guard) return guard;

        const { id } = await ctx.params;
        if (!id) return NextResponse.json({ error: "Belge ID zorunludur." }, { status: 400 });

        // Actor (audit + uploadedBy için)
        const sb = await createClient();
        const { data: { user } } = await sb.auth.getUser();

        const body = await req.json().catch(() => ({}));
        const options: ApplyOptions = {
            fieldApprovals: normalizeFieldApprovals((body as { fieldApprovals?: unknown })?.fieldApprovals),
        };

        const result = await serviceApplyImportDocument(id, user?.id ?? null, options);

        revalidateTag("products", "max");
        return NextResponse.json({ ok: true, result }, { status: 200 });
    } catch (err) {
        if (err instanceof Error) {
            const msg = err.message;
            // Faz 3c Review 4.tur (P3): applying = başka oturum aktif (yarış)
            // → 409 Conflict + net mesaj. Faz 8 confirm-yarış paterniyle hizalı.
            // Diğer "hazır değil" durumları (applied / pending / error / classifying)
            // 400'de kalır.
            if (msg.includes("hazır değil") && msg.includes("applying")) {
                return NextResponse.json(
                    { error: "Belge şu anda başka bir oturumda uygulanıyor. Lütfen sayfayı yenileyin." },
                    { status: 409 },
                );
            }
            // Pre-check failures → 400 (not found, wrong status)
            if (msg.includes("bulunamadı") || msg.includes("uygulanmaya hazır değil")) {
                return NextResponse.json({ error: msg }, { status: 400 });
            }
        }
        return handleApiError(err, "POST /api/import/documents/[id]/apply");
    }
}
