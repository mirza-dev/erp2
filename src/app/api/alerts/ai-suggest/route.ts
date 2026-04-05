import { NextResponse } from "next/server";
import { serviceGenerateAiAlerts } from "@/lib/services/alert-service";
import { handleApiError } from "@/lib/api-error";
import { createServiceClient } from "@/lib/supabase/service";

export async function POST() {
    const supabase = createServiceClient();

    // Advisory lock: only one AI generation at a time
    const { data: locked } = await supabase.rpc("try_acquire_ai_suggest_lock");
    if (!locked) {
        return NextResponse.json(
            { error: "AI analiz zaten devam ediyor." },
            { status: 409 }
        );
    }

    try {
        const result = await serviceGenerateAiAlerts();
        return NextResponse.json(result);
    } catch (err) {
        return handleApiError(err, "AI öneri oluşturulamadı.");
    } finally {
        await supabase.rpc("release_ai_suggest_lock").catch(() => {});
    }
}
