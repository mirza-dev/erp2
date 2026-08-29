import { NextRequest, NextResponse } from "next/server";
import { handleApiError, safeParseJson } from "@/lib/api-error";
import { requireInternalOperatorFor } from "@/lib/auth/internal-access";
import { resolveAuthContext } from "@/lib/auth/role-guard";
import {
    dbGetErrorGroup,
    dbListErrorEvents,
    dbRelatedByRequestId,
    dbUpdateErrorGroupStatus,
} from "@/lib/supabase/telemetry";
import { dbBugsForErrorGroup } from "@/lib/supabase/developer-bugs";
import { isUuid, parseErrorGroupStatus } from "@/lib/telemetry/api-params";

/**
 * Hata detayı (§7).
 *
 * Tek yanıtta: grup + son oluşumlar + EN SON oluşumun request_id'siyle
 * ilişkili diğer olaylar + bu hataya bağlı bug'lar. Sayfa üç ayrı istek
 * atmasın diye birleşik — detay ekranı tek seferde dolar.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
        const auth = await resolveAuthContext();
        const guard = requireInternalOperatorFor(auth);
        if (guard) return guard;

        const { id } = await ctx.params;
        if (!isUuid(id)) return NextResponse.json({ error: "Geçersiz kimlik." }, { status: 400 });

        const group = await dbGetErrorGroup(id);
        if (!group) return NextResponse.json({ error: "Hata grubu bulunamadı." }, { status: 404 });

        const [events, bugs] = await Promise.all([
            dbListErrorEvents(id, 20),
            dbBugsForErrorGroup(id),
        ]);

        // En son oluşumun request_id'si varsa o isteğin tam hikâyesini de ver.
        const latestRequestId = events.find(e => e.request_id)?.request_id ?? null;
        const related = latestRequestId
            ? await dbRelatedByRequestId(latestRequestId)
            : { events: [], errors: [] };

        return NextResponse.json({ group, events, bugs, latestRequestId, related });
    } catch (err) {
        return handleApiError(err, "GET /api/developer/errors/[id]");
    }
}

/** Durum değişimi: open / investigating / ignored / resolved (§8). */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
        const auth = await resolveAuthContext();
        const guard = requireInternalOperatorFor(auth);
        if (guard) return guard;

        const { id } = await ctx.params;
        if (!isUuid(id)) return NextResponse.json({ error: "Geçersiz kimlik." }, { status: 400 });

        const parsed = await safeParseJson(req);
        if (!parsed.ok) return parsed.response;
        const body = parsed.data as Record<string, unknown>;

        const status = parseErrorGroupStatus(
            typeof body.status === "string" ? body.status : null,
        );
        if (!status) {
            return NextResponse.json(
                { error: "Geçersiz durum. open | investigating | ignored | resolved" },
                { status: 400 },
            );
        }

        const updated = await dbUpdateErrorGroupStatus(id, status, auth.userId);
        if (!updated) return NextResponse.json({ error: "Hata grubu bulunamadı." }, { status: 404 });

        return NextResponse.json(updated);
    } catch (err) {
        return handleApiError(err, "PATCH /api/developer/errors/[id]");
    }
}
