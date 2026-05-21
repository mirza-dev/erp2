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
import { serviceApplyImportDocument } from "@/lib/services/import-apply-service";
import { requireRole } from "@/lib/auth/role-guard";
import { createClient } from "@/lib/supabase/server";
import { handleApiError } from "@/lib/api-error";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
        const guard = await requireRole(req, ["admin", "purchaser"]);
        if (guard) return guard;

        const { id } = await ctx.params;
        if (!id) return NextResponse.json({ error: "Belge ID zorunludur." }, { status: 400 });

        // Actor (audit + uploadedBy için)
        const sb = await createClient();
        const { data: { user } } = await sb.auth.getUser();

        const result = await serviceApplyImportDocument(id, user?.id ?? null);

        revalidateTag("products", "max");
        return NextResponse.json({ ok: true, result }, { status: 200 });
    } catch (err) {
        if (err instanceof Error) {
            const msg = err.message;
            // Pre-check failures → 400 (not found, wrong status)
            if (msg.includes("bulunamadı") || msg.includes("uygulanmaya hazır değil")) {
                return NextResponse.json({ error: msg }, { status: 400 });
            }
        }
        return handleApiError(err, "POST /api/import/documents/[id]/apply");
    }
}
