import { NextRequest, NextResponse } from "next/server";
import {
    serviceListOrders,
    serviceCreateOrder,
    serviceGetOrder,
    serviceTransitionOrder,
    validateOrderCreate,
    type ShortageInfo,
} from "@/lib/services/order-service";
import { aiScoreOrder } from "@/lib/services/ai-service";
import type { CommercialStatus } from "@/lib/database.types";
import type { CreateOrderInput } from "@/lib/supabase/orders";
import { handleApiError, safeParseJson, validateStringLengths } from "@/lib/api-error";
import { actorFromAuthContext, getCurrentUserPermissions, resolveAuthContext, requirePermissionFor } from "@/lib/auth/role-guard";
import { redactOrdersForPerms } from "@/lib/auth/redact";
import { revalidateTag } from "next/cache";
import { appendServerTiming, startSpan } from "@/lib/server-timing";

// GET /api/orders?commercial_status=approved&customer_id=xxx&page=1
// GET /api/orders?all=1[&commercial_status=...&customer_id=...]
//   → pagination'sız (UI global state / liste için; tab sayaçları + müşteri
//     cirosu eksiksiz olur). Önceden default page=1 (50 sipariş) → 50'den
//     eski siparişler görünmez, sayaçlar yanlıştı (products ?all=1 paterni).
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = req.nextUrl;
        const status = searchParams.get("commercial_status") as CommercialStatus | null;
        const customer_id = searchParams.get("customer_id") ?? undefined;
        const all = searchParams.get("all") === "1";
        const page = Math.max(1, parseInt(searchParams.get("page") ?? "1") || 1);

        const dbSpan = startSpan();
        const orders = await serviceListOrders({
            commercial_status: status ?? undefined,
            customer_id,
            page: all ? 1 : page,
            pageSize: all ? 10000 : undefined,
        });
        const dbMs = dbSpan();

        // RBAC R3: redaction per-request (serviceListOrders cache'siz; yine de perms ayrı).
        const authSpan = startSpan();
        const perms = await getCurrentUserPermissions(req);
        const authMs = authSpan();
        return appendServerTiming(
            NextResponse.json(redactOrdersForPerms(orders, perms)),
            [{ name: "auth", ms: authMs }, { name: "db", ms: dbMs }],
        );
    } catch (err) {
        return handleApiError(err, "GET /api/orders");
    }
}

// POST /api/orders — creates a new order (draft or pending_approval)
export async function POST(req: NextRequest) {
    try {
        // Tek getUser: guard + created_by aynı auth context'ten (perf Faz 1).
        const ctx = await resolveAuthContext();
        const guard = requirePermissionFor(ctx, "manage_sales_orders");
        if (guard) return guard;

        const parsed = await safeParseJson(req);
        if (!parsed.ok) return parsed.response;
        const body = parsed.data as CreateOrderInput;

        // Populate created_by from the current session user (session always wins)
        body.created_by = ctx.userId ?? undefined;

        const lengthErr = validateStringLengths(body as unknown as Record<string, unknown>);
        if (lengthErr) return NextResponse.json({ error: lengthErr }, { status: 400 });

        const validation = validateOrderCreate(body);
        if (!validation.valid) {
            return NextResponse.json({ errors: validation.errors }, { status: 400 });
        }

        // Yeni invariant (migration 082): pending_approval HARD rezervasyon ister.
        // Doğrudan pending INSERT etme (rezervsiz pending oluşur) → önce DRAFT
        // oluştur, sonra "Onaya Gönder" geçişiyle allocate et. "Taslak Kaydet"
        // yolu değişmez.
        const requestedPending = body.commercial_status === "pending_approval";
        if (requestedPending) body.commercial_status = "draft";

        const result = await serviceCreateOrder(body);

        // Create-and-send: draft'ı onaya gönder → stok rezervasyonu + shortage
        let finalOrder = result;
        let createShortages: ShortageInfo[] | undefined;
        let submitError: string | undefined;
        if (requestedPending) {
            const submit = await serviceTransitionOrder(
                result.id,
                "pending_approval",
                undefined,
                actorFromAuthContext(ctx),
            );
            if (submit.success) {
                createShortages = submit.shortages;
                finalOrder = (await serviceGetOrder(result.id)) ?? result;
            } else {
                // Allocation başarısız (ör. yeterli stok yok) → sipariş DRAFT kalır.
                submitError = submit.error;
            }
        }

        // Fire-and-forget AI scoring — don't block the response
        aiScoreOrder(result.id).catch(err =>
            console.error("[AI Score] fire-and-forget:", err)
        );

        revalidateTag("products", "max");
        return NextResponse.json(
            submitError ? { ...result, submitError }
                : createShortages?.length ? { ...finalOrder, shortages: createShortages }
                : finalOrder,
            { status: 201 },
        );
    } catch (err) {
        return handleApiError(err, "POST /api/orders");
    }
}
