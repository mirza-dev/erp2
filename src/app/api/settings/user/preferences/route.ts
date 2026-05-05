import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
    dbListUserPrefs,
    dbUpsertUserPrefs,
    type NotificationPref,
} from "@/lib/supabase/user-preferences";
import { handleApiError, safeParseJson } from "@/lib/api-error";

// GET /api/settings/user/preferences
// Response: NotificationPref[] (5 satır, default true/true if no DB row)
export async function GET() {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
        const prefs = await dbListUserPrefs(user.id);
        return NextResponse.json(prefs);
    } catch (err) {
        return handleApiError(err, "GET /api/settings/user/preferences");
    }
}

// PATCH /api/settings/user/preferences
// Body: { prefs: NotificationPref[] }
export async function PATCH(req: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });

        const parsed = await safeParseJson(req);
        if (!parsed.ok) return parsed.response;
        const body = parsed.data as { prefs?: unknown };
        if (!Array.isArray(body.prefs)) {
            return NextResponse.json({ error: "prefs dizisi gerekli." }, { status: 400 });
        }
        // Boolean kontratı strict: typeof === "boolean" değilse 400.
        // !!value coercion gevşek davranış (örn. "false" string → true) — API tarafında
        // sıkı tip kontrolü ile garbage input erkenden reddedilir.
        for (let i = 0; i < body.prefs.length; i++) {
            const p = body.prefs[i] as Record<string, unknown> | null;
            if (!p || typeof p !== "object") continue;
            if (p.type !== undefined && typeof p.type !== "string") {
                return NextResponse.json({ error: `prefs[${i}].type string olmalı.` }, { status: 400 });
            }
            if (p.emailEnabled !== undefined && typeof p.emailEnabled !== "boolean") {
                return NextResponse.json({ error: `prefs[${i}].emailEnabled boolean olmalı.` }, { status: 400 });
            }
            if (p.browserEnabled !== undefined && typeof p.browserEnabled !== "boolean") {
                return NextResponse.json({ error: `prefs[${i}].browserEnabled boolean olmalı.` }, { status: 400 });
            }
        }
        const sanitized: NotificationPref[] = body.prefs
            .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
            .map(p => ({
                type: typeof p.type === "string" ? p.type : "",
                emailEnabled: typeof p.emailEnabled === "boolean" ? p.emailEnabled : true,
                browserEnabled: typeof p.browserEnabled === "boolean" ? p.browserEnabled : true,
            }))
            .filter(p => p.type.length > 0);

        await dbUpsertUserPrefs(user.id, sanitized);
        const fresh = await dbListUserPrefs(user.id);
        return NextResponse.json(fresh);
    } catch (err) {
        return handleApiError(err, "PATCH /api/settings/user/preferences");
    }
}
