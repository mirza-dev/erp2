import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRoles } from "@/lib/auth/role-guard";
import type { CalendarNoteActor } from "@/lib/calendar-notes";

export async function getCalendarNoteActor(): Promise<CalendarNoteActor | null> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
    const fullName = typeof metadata.full_name === "string" ? metadata.full_name.trim() : "";
    const roles = await getCurrentUserRoles();

    return {
        id: user.id,
        label: fullName || user.email || null,
        isAdmin: roles.includes("admin"),
    };
}
