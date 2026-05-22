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
