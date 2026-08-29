import { NextRequest, NextResponse } from "next/server";
import { dbListVendorLinks, dbUpsertProductVendorLink } from "@/lib/supabase/product-vendor-links";
import { handleApiError, safeParseJson } from "@/lib/api-error";
import { getCurrentUserId } from "@/lib/auth/role-guard";
import { revalidateTag } from "next/cache";
import { resolveAuthContext, requirePermissionFor } from "@/lib/auth/role-guard";
import { redactVendorLinksForPerms } from "@/lib/auth/redact";

// GET /api/product-vendor-links?vendor_id=<uuid>   (PO formu: tedarikçi son fiyatları)
//   veya ?product_ids=a,b,c                          (RFQ formu: ürünleri tedarik edenler)
// last_unit_price view_purchase_costs ile redakte.
export async function GET(req: NextRequest) {
    try {
        const ctx = await resolveAuthContext();
        // Satın alma yüzeyleri: ürün VEYA tedarikçi görme yetkisi yeterli.
        const guard = requirePermissionFor(ctx, ["view_products", "view_vendors"]);
        if (guard) return guard;

        const { searchParams } = new URL(req.url);
        const vendorId = searchParams.get("vendor_id") ?? undefined;
        const productIdsRaw = searchParams.get("product_ids");
        const productIds = productIdsRaw ? productIdsRaw.split(",").map(s => s.trim()).filter(Boolean) : undefined;

        if (!vendorId && (!productIds || productIds.length === 0)) {
            return NextResponse.json([]);
        }

        const links = await dbListVendorLinks({ vendorId, productIds });
        return NextResponse.json(redactVendorLinksForPerms(links, ctx.perms));
    } catch (err) {
        return handleApiError(err, "GET /api/product-vendor-links");
    }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/product-vendor-links — ürüne tedarikçi bağla / güncelle.
 *
 * KOBİ-sim O5: "Tercihli Tedarikçi" tek bir SERBEST METİN alanıydı; üzerine
 * yazınca öncekini siliyordu. Kerem'in ifadesi: "0 stok + 68 gün gecikmiş
 * sipariş + tek tedarikçi (60 gün temin süresi) durumunda tek-kaynak riskini
 * sistemde hiç görünür kılamıyorum."
 *
 * Veri modeli zaten çoklu tedarikçiyi destekliyordu (`product_vendor_links`,
 * mig.084) ve `products.preferred_vendor_id` kolonu DB'de vardı — okunuyordu
 * (`api-mappers.ts`) ama hiçbir UI yolu YAZMIYORDU. Tek yazıcı Excel import'tu.
 *
 * `dbUpsertProductVendorLink` yeniden kullanılıyor: `is_preferred` işaretlenince
 * ürünün `preferred_vendor_id`/`preferred_vendor` alanlarını da tazeler.
 */
export async function POST(req: NextRequest) {
    try {
        const ctx = await resolveAuthContext();
        // Ürün ana verisini değiştiriyor (tercihli tedarikçi) → manage_product_master.
        const guard = requirePermissionFor(ctx, "manage_product_master");
        if (guard) return guard;

        const parsed = await safeParseJson(req);
        if (!parsed.ok) return parsed.response;
        const body = parsed.data as Record<string, unknown>;

        const productId = body.product_id;
        const vendorId  = body.vendor_id;
        if (typeof productId !== "string" || !UUID_RE.test(productId)) {
            return NextResponse.json({ error: "product_id geçerli bir UUID olmalıdır." }, { status: 400 });
        }
        if (typeof vendorId !== "string" || !UUID_RE.test(vendorId)) {
            return NextResponse.json({ error: "vendor_id geçerli bir UUID olmalıdır." }, { status: 400 });
        }

        const num = (v: unknown, ad: string): number | null | undefined | string => {
            if (v === undefined) return undefined;
            if (v === null || v === "") return null;
            const n = Number(v);
            if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
                return `${ad} 0 veya pozitif tam sayı olmalıdır.`;
            }
            return n;
        };
        const lead = num(body.lead_time_days, "Temin süresi");
        if (typeof lead === "string") return NextResponse.json({ error: lead }, { status: 400 });
        const moq = num(body.moq, "Minimum sipariş adedi");
        if (typeof moq === "string") return NextResponse.json({ error: moq }, { status: 400 });

        const vendorSku = body.vendor_sku;
        if (vendorSku !== undefined && vendorSku !== null && typeof vendorSku !== "string") {
            return NextResponse.json({ error: "vendor_sku metin olmalıdır." }, { status: 400 });
        }

        const link = await dbUpsertProductVendorLink({
            product_id:     productId,
            vendor_id:      vendorId,
            vendor_sku:     typeof vendorSku === "string" ? vendorSku.trim().slice(0, 100) : vendorSku as null | undefined,
            lead_time_days: lead,
            moq,
            is_preferred:   body.is_preferred === true,
            // Actor sunucu-otoriter (vendors D1 kalıbı) — audit_log.actor buradan.
            actor:          await getCurrentUserId(),
        });

        revalidateTag("products", "max");
        return NextResponse.json(link, { status: 201 });
    } catch (err) {
        return handleApiError(err, "POST /api/product-vendor-links");
    }
}
