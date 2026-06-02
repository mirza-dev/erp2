import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireRole } from "@/lib/auth/role-guard";
import {
    serviceCreatePOFromRecommendations,
    type CreatePOFromRecsLine,
} from "@/lib/services/purchase-order-service";
import { handleApiError, safeParseJson } from "@/lib/api-error";
import { validateStringLengths } from "@/lib/validation/string-lengths";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CURRENCY_WHITELIST = new Set(["TRY", "USD", "EUR"]);

export async function POST(req: NextRequest) {
    try {
        const guard = await requireRole(req, ["admin", "purchaser"]);
        if (guard) return guard;

        const parsed = await safeParseJson(req);
        if (!parsed.ok) return parsed.response;
        const body = parsed.data as Record<string, unknown>;

        const lenErr = validateStringLengths(body);
        if (lenErr) return NextResponse.json({ error: lenErr }, { status: 400 });

        if (typeof body.vendor_id !== "string" || !UUID_RE.test(body.vendor_id))
            return NextResponse.json({ error: "vendor_id geçerli UUID olmalıdır." }, { status: 400 });
        if (typeof body.currency !== "string" || !CURRENCY_WHITELIST.has(body.currency))
            return NextResponse.json({ error: "Geçersiz para birimi (TRY/USD/EUR)." }, { status: 400 });
        if (!Array.isArray(body.lines) || body.lines.length === 0)
            return NextResponse.json({ error: "En az 1 satır gereklidir." }, { status: 400 });

        const lines: CreatePOFromRecsLine[] = [];
        for (const [i, l] of (body.lines as unknown[]).entries()) {
            const ln = l as Record<string, unknown>;
            if (typeof ln.recommendation_id !== "string" || !UUID_RE.test(ln.recommendation_id))
                return NextResponse.json(
                    { error: `Satır ${i + 1}: recommendation_id UUID olmalıdır.` },
                    { status: 400 },
                );
            if (ln.quantity === undefined || ln.quantity === null || ln.quantity === "")
                return NextResponse.json(
                    { error: `Satır ${i + 1}: quantity zorunludur.` },
                    { status: 400 },
                );
            const qty = Number(ln.quantity);
            if (!Number.isFinite(qty) || !Number.isInteger(qty) || qty <= 0)
                return NextResponse.json(
                    { error: `Satır ${i + 1}: quantity pozitif integer olmalıdır.` },
                    { status: 400 },
                );
            if (ln.unit_price === undefined || ln.unit_price === null || ln.unit_price === "")
                return NextResponse.json(
                    { error: `Satır ${i + 1}: unit_price zorunludur.` },
                    { status: 400 },
                );
            const price = Number(ln.unit_price);
            if (!Number.isFinite(price) || price <= 0)
                return NextResponse.json(
                    { error: `Satır ${i + 1}: unit_price geçersiz, sıfır veya negatif olamaz.` },
                    { status: 400 },
                );
            if (ln.discount_pct !== undefined && ln.discount_pct !== null && ln.discount_pct === "")
                return NextResponse.json(
                    { error: `Satır ${i + 1}: discount_pct boş bırakılamaz; alanı tamamen çıkarın.` },
                    { status: 400 },
                );
            const disc = ln.discount_pct != null ? Number(ln.discount_pct) : 0;
            if (!Number.isFinite(disc) || disc < 0 || disc > 100)
                return NextResponse.json(
                    { error: `Satır ${i + 1}: discount_pct 0-100 arası olmalıdır.` },
                    { status: 400 },
                );
            lines.push({
                recommendation_id: ln.recommendation_id,
                quantity: qty,
                unit_price: price,
                discount_pct: disc,
                notes: typeof ln.notes === "string" ? ln.notes : null,
            });
        }

        const result = await serviceCreatePOFromRecommendations(
            {
                vendor_id: body.vendor_id,
                expected_date: typeof body.expected_date === "string" ? body.expected_date : null,
                currency: body.currency,
                notes: typeof body.notes === "string" ? body.notes : null,
                lines,
            },
            typeof body.actor === "string" ? body.actor : undefined,
        );

        revalidateTag("purchase-orders", "max");
        revalidateTag("products", "max");
        return NextResponse.json(result, { status: 201 });
    } catch (err) {
        if (err instanceof Error && (
            err.message.includes("bulunamadı") ||
            err.message.includes("pasif") ||
            err.message.includes("purchase_suggestion") ||
            err.message.includes("ürün ile ilişkili") ||
            err.message.includes("aktif siparişe bağlı")
        )) {
            return NextResponse.json({ error: err.message }, { status: 400 });
        }
        return handleApiError(err, "POST /api/purchase-orders/from-recommendations");
    }
}
