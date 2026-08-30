import { NextRequest, NextResponse } from "next/server";
import { handleApiError, safeParseJson } from "@/lib/api-error";
import { requireInternalOperatorFor } from "@/lib/auth/internal-access";
import { resolveAuthContext } from "@/lib/auth/role-guard";
import {
    dbGetBug,
    dbLinkBugErrors,
    dbUnlinkBugError,
    dbUpdateBug,
    isBugPriority,
    isBugStatus,
} from "@/lib/supabase/developer-bugs";
import { isUuid } from "@/lib/telemetry/api-params";

const MAX_TITLE = 200;
const MAX_TEXT = 8_000;

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
        const auth = await resolveAuthContext();
        const guard = requireInternalOperatorFor(auth);
        if (guard) return guard;

        const { id } = await ctx.params;
        if (!isUuid(id)) return NextResponse.json({ error: "Geçersiz kimlik." }, { status: 400 });

        const bug = await dbGetBug(id);
        if (!bug) return NextResponse.json({ error: "Bug bulunamadı." }, { status: 404 });
        return NextResponse.json(bug);
    } catch (err) {
        return handleApiError(err, "GET /api/developer/bugs/[id]");
    }
}

/**
 * Bug güncelleme: durum/öncelik/metin + hata bağı ekleme-çıkarma.
 * Bağ işlemleri ayrı alanlarda (`linkErrorGroupIds` / `unlinkErrorGroupId`) —
 * bir dizi göndermek tüm bağları SİLİP yeniden yazmak anlamına gelmesin.
 */
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

        if (body.status !== undefined && !isBugStatus(body.status)) {
            return NextResponse.json({ error: "Geçersiz durum." }, { status: 400 });
        }
        if (body.priority !== undefined && !isBugPriority(body.priority)) {
            return NextResponse.json({ error: "Geçersiz öncelik." }, { status: 400 });
        }

        const title = typeof body.title === "string" ? body.title.trim() : undefined;
        if (title !== undefined && (title.length === 0 || title.length > MAX_TITLE)) {
            return NextResponse.json({ error: "Başlık geçersiz." }, { status: 400 });
        }
        for (const key of ["description", "developerNotes"] as const) {
            const v = body[key];
            if (typeof v === "string" && v.length > MAX_TEXT) {
                return NextResponse.json({ error: "Metin alanı çok uzun." }, { status: 400 });
            }
        }

        // 2026-08 D6: bağ işlemleri VARLIK kontrolünden önce yapılıyordu →
        // var olmayan bir bug id'siyle `developer_bug_errors` upsert'i FK
        // ihlaline çarpıyor, kullanıcı 404 yerine "Beklenmeyen bir hata"
        // görüyor VE bu 500 hata merkezine gerçek bir kusur gibi yazılıyordu
        // (panelin kendi gürültüsünü üretmesi). Varlık kararı artık önce.
        if (!(await dbGetBug(id))) {
            return NextResponse.json({ error: "Bug bulunamadı." }, { status: 404 });
        }

        // Bağ işlemleri güncellemeden ÖNCE — böylece dönen gövde güncel bağları taşır.
        const toLink = Array.isArray(body.linkErrorGroupIds)
            ? body.linkErrorGroupIds.filter((v): v is string => typeof v === "string" && isUuid(v))
            : [];
        if (toLink.length > 0) await dbLinkBugErrors(id, toLink.slice(0, 20));

        if (typeof body.unlinkErrorGroupId === "string" && isUuid(body.unlinkErrorGroupId)) {
            await dbUnlinkBugError(id, body.unlinkErrorGroupId);
        }

        const updated = await dbUpdateBug(id, {
            ...(title !== undefined ? { title } : {}),
            ...(body.description !== undefined
                ? { description: typeof body.description === "string" ? body.description : null }
                : {}),
            ...(body.developerNotes !== undefined
                ? { developerNotes: typeof body.developerNotes === "string" ? body.developerNotes : null }
                : {}),
            ...(isBugStatus(body.status) ? { status: body.status } : {}),
            ...(isBugPriority(body.priority) ? { priority: body.priority } : {}),
        });

        if (!updated) return NextResponse.json({ error: "Bug bulunamadı." }, { status: 404 });
        return NextResponse.json(updated);
    } catch (err) {
        return handleApiError(err, "PATCH /api/developer/bugs/[id]");
    }
}
