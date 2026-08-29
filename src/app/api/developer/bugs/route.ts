import { NextRequest, NextResponse } from "next/server";
import { handleApiError, safeParseJson } from "@/lib/api-error";
import { requireInternalOperatorFor } from "@/lib/auth/internal-access";
import { resolveAuthContext } from "@/lib/auth/role-guard";
import {
    dbCreateBug,
    dbListBugs,
    isBugPriority,
    isBugStatus,
} from "@/lib/supabase/developer-bugs";
import { isUuid, parseLimit, parseText } from "@/lib/telemetry/api-params";

const MAX_TITLE = 200;
const MAX_TEXT = 8_000;
const MAX_LINKED_ERRORS = 20;

export async function GET(req: NextRequest) {
    try {
        const auth = await resolveAuthContext();
        const guard = requireInternalOperatorFor(auth);
        if (guard) return guard;

        const sp = req.nextUrl.searchParams;
        const statusRaw = sp.get("status");
        const priorityRaw = sp.get("priority");

        const bugs = await dbListBugs({
            status: isBugStatus(statusRaw) ? statusRaw : null,
            priority: isBugPriority(priorityRaw) ? priorityRaw : null,
            search: parseText(sp.get("search"), 120),
            limit: parseLimit(sp.get("limit"), 100, 200),
        });

        return NextResponse.json(bugs);
    } catch (err) {
        return handleApiError(err, "GET /api/developer/bugs");
    }
}

/**
 * Bug oluşturma (§11). `errorGroupIds` verilirse hata gruplarına bağlanır —
 * hata detayındaki "Bug Oluştur" butonu bu yolu kullanır, böylece takip kaydı
 * doğduğu teknik olayla bağlı doğar.
 */
export async function POST(req: NextRequest) {
    try {
        const auth = await resolveAuthContext();
        const guard = requireInternalOperatorFor(auth);
        if (guard) return guard;

        const parsed = await safeParseJson(req);
        if (!parsed.ok) return parsed.response;
        const body = parsed.data as Record<string, unknown>;

        const title = typeof body.title === "string" ? body.title.trim() : "";
        if (!title) return NextResponse.json({ error: "Başlık zorunlu." }, { status: 400 });
        if (title.length > MAX_TITLE) {
            return NextResponse.json({ error: `Başlık en fazla ${MAX_TITLE} karakter.` }, { status: 400 });
        }

        const description = typeof body.description === "string" ? body.description : null;
        const notes = typeof body.developerNotes === "string" ? body.developerNotes : null;
        if ((description?.length ?? 0) > MAX_TEXT || (notes?.length ?? 0) > MAX_TEXT) {
            return NextResponse.json({ error: "Metin alanı çok uzun." }, { status: 400 });
        }

        const rawIds = Array.isArray(body.errorGroupIds) ? body.errorGroupIds : [];
        const errorGroupIds = rawIds
            .filter((v): v is string => typeof v === "string" && isUuid(v))
            .slice(0, MAX_LINKED_ERRORS);
        if (rawIds.length > 0 && errorGroupIds.length === 0) {
            return NextResponse.json({ error: "Geçersiz hata grubu kimliği." }, { status: 400 });
        }

        const bug = await dbCreateBug({
            title,
            description,
            developerNotes: notes,
            priority: isBugPriority(body.priority) ? body.priority : "medium",
            status: isBugStatus(body.status) ? body.status : "open",
            createdBy: auth.userId,
            errorGroupIds,
        });

        return NextResponse.json(bug, { status: 201 });
    } catch (err) {
        return handleApiError(err, "POST /api/developer/bugs");
    }
}
