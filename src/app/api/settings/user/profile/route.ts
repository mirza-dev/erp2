import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { dbGetUserProfile, dbUpdateUserFullName } from "@/lib/supabase/user-profile";
import { handleApiError, safeParseJson } from "@/lib/api-error";

// GET /api/settings/user/profile — current user's profile (full_name, email, avatar)
export async function GET() {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
        const profile = await dbGetUserProfile(user.id);
        return NextResponse.json(profile);
    } catch (err) {
        return handleApiError(err, "GET /api/settings/user/profile");
    }
}

// PATCH /api/settings/user/profile — update full_name only
// Body: { fullName: string }
export async function PATCH(req: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });

        const parsed = await safeParseJson(req);
        if (!parsed.ok) return parsed.response;
        const body = parsed.data as { fullName?: unknown };
        const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";

        if (fullName.length < 2) {
            return NextResponse.json({ error: "Ad soyad en az 2 karakter olmalı." }, { status: 400 });
        }
        if (fullName.length > 100) {
            return NextResponse.json({ error: "Ad soyad en fazla 100 karakter olabilir." }, { status: 400 });
        }

        await dbUpdateUserFullName(user.id, fullName);
        const updated = await dbGetUserProfile(user.id);
        return NextResponse.json(updated);
    } catch (err) {
        return handleApiError(err, "PATCH /api/settings/user/profile");
    }
}
