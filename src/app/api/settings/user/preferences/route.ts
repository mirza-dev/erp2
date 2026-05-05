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
        const sanitized: NotificationPref[] = body.prefs
            .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
            .map(p => ({
                type: typeof p.type === "string" ? p.type : "",
                emailEnabled: !!p.emailEnabled,
                browserEnabled: !!p.browserEnabled,
            }))
            .filter(p => p.type.length > 0);

        await dbUpsertUserPrefs(user.id, sanitized);
        const fresh = await dbListUserPrefs(user.id);
        return NextResponse.json(fresh);
    } catch (err) {
        return handleApiError(err, "PATCH /api/settings/user/preferences");
    }
}
