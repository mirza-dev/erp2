import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET() {
    const supabase = createServiceClient();
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // ── ai_runs (son 7 gün) ───────────────────────────────────────────────────
    let runRows: Array<{ feature: string; model: string | null }> = [];
    try {
        const { data } = await supabase
            .from("ai_runs")
            .select("feature, model")
            .gte("created_at", since7d);
        runRows = data ?? [];
    } catch {
        // non-fatal
    }

    const byFeature: Record<string, number> = {};
    let fallbackCount = 0;
    for (const row of runRows) {
        byFeature[row.feature] = (byFeature[row.feature] ?? 0) + 1;
        if (!row.model) fallbackCount++;
    }

    // ── ai_recommendations (tümü) ─────────────────────────────────────────────
    let recRows: Array<{ status: string }> = [];
    try {
        const { data } = await supabase
            .from("ai_recommendations")
            .select("status");
        recRows = data ?? [];
    } catch {
        // non-fatal
    }

    const byStatus: Record<string, number> = {
        suggested: 0, accepted: 0, edited: 0, rejected: 0, expired: 0,
    };
    for (const row of recRows) {
        if (row.status in byStatus) byStatus[row.status]++;
    }
    const activeCount = byStatus.suggested + byStatus.accepted + byStatus.edited + byStatus.rejected;
    const decidedCount = byStatus.accepted + byStatus.edited + byStatus.rejected;

    // ── ai_feedback (son 7 gün) ───────────────────────────────────────────────
    let feedbackRows: Array<{ feedback_type: string }> = [];
    try {
        const { data } = await supabase
            .from("ai_feedback")
            .select("feedback_type")
            .gte("created_at", since7d);
        feedbackRows = data ?? [];
    } catch {
        // non-fatal
    }

    const feedbackLast7d: Record<string, number> = { accepted: 0, edited: 0, rejected: 0 };
    for (const row of feedbackRows) {
        if (row.feedback_type in feedbackLast7d) feedbackLast7d[row.feedback_type]++;
    }

    return NextResponse.json({
        runs: {
            last7d: runRows.length,
            byFeature,
            fallbackCount,
        },
        recommendations: {
            byStatus,
            activeCount,
            decidedCount,
        },
        feedback: {
            last7d: feedbackLast7d,
        },
        generatedAt: new Date().toISOString(),
    });
}
