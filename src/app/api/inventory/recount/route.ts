import { NextRequest, NextResponse } from "next/server";
import { dbRecountStock, dbTryResolveShortages } from "@/lib/supabase/products";
import { safeParseJson } from "@/lib/api-error";
import { requirePermission, getCurrentUserId } from "@/lib/auth/role-guard";
import { revalidateTag } from "next/cache";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/inventory/recount — fiziksel stok sayımı düzeltmesi.
 *
 * KOBİ-sim K3: `recount_stock` RPC'si (mig.105) ve `dbRecountStock` sarmalayıcısı
 * hazırdı ama TEK çağıranı Excel içe aktarım yoluydu (`import-service.ts`).
 * Vardiya sorumlusunun 2 adetlik sayım farkını girmesi için Excel dosyası
 * hazırlayıp import sihirbazından geçmesi gerekiyordu — pratikte yapılmaz,
 * stok kayması kalıcılaşır. Bu uç o boşluğu kapatır.
 *
 * RPC MUTLAK atama yapar (`on_hand = counted`), delta'yı transaction içinde
 * `for update` kilidiyle hesaplar → eşzamanlı harekette lost-update olmaz.
 *
 * Guard: kardeş `inventory/movements` POST kalıbı. `stock_adjust_general`
 * (admin + üretim) veya `stock_adjust_sales_context` (satış) — vardiya
 * sorumlusu `production` rolüyle sayım girebilir.
 */
export async function POST(req: NextRequest) {
    try {
        const guard = await requirePermission(req, ["stock_adjust_general", "stock_adjust_sales_context"]);
        if (guard) return guard;

        const parsed = await safeParseJson(req);
        if (!parsed.ok) return parsed.response;
        const body = parsed.data as Record<string, unknown>;

        const productId = body.product_id;
        if (typeof productId !== "string" || !UUID_RE.test(productId)) {
            return NextResponse.json({ error: "product_id geçerli bir UUID olmalıdır." }, { status: 400 });
        }

        const counted = Number(body.counted_qty);
        if (!Number.isFinite(counted) || !Number.isInteger(counted) || counted < 0) {
            return NextResponse.json(
                { error: "Sayılan adet 0 veya pozitif tam sayı olmalıdır." },
                { status: 400 },
            );
        }

        const rawNotes = body.notes;
        if (rawNotes !== undefined && rawNotes !== null && typeof rawNotes !== "string") {
            return NextResponse.json({ error: "notes metin olmalıdır." }, { status: 400 });
        }
        const notes = typeof rawNotes === "string" ? rawNotes.trim().slice(0, 500) : undefined;

        // Actor sunucu-otoriter (O1 kalıbı): stok hareketi created_by + audit
        // istemci gövdesinden DEĞİL oturumdan beslenir.
        const actor = (await getCurrentUserId()) ?? "system";

        const result = await dbRecountStock({
            product_id:  productId,
            counted_qty: counted,
            notes:       notes || undefined,
            created_by:  actor,
        });

        if (!result.success) {
            return NextResponse.json({ error: result.error ?? "Sayım kaydedilemedi." }, { status: 409 });
        }

        // Sayım stoğu ARTIRDIYSA açık eksikleri çözmeyi dene (movements route
        // kalıbı — non-fatal; sayım kaydı bu adıma bağlı değil).
        if ((result.delta ?? 0) > 0) {
            try {
                await dbTryResolveShortages(productId);
            } catch {
                console.warn("[POST /api/inventory/recount] shortage resolution failed (non-fatal)", productId);
            }
        }

        revalidateTag("products", "max");
        return NextResponse.json({
            ok: true,
            new_on_hand: result.new_on_hand,
            delta:       result.delta,
        }, { status: 201 });
    } catch (err) {
        console.error("[POST /api/inventory/recount]", err);
        return NextResponse.json({ error: "Sayım kaydedilemedi." }, { status: 500 });
    }
}
