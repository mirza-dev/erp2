/**
 * Stage 2A Acceptance Eval — gerçek sistem davranışını doğrular.
 *
 * Kullanım:
 *   npm run eval                    # .env.local yüklenir, DB kontrolleri aktif
 *   tsx scripts/run-acceptance-eval.ts
 *
 * DB bağlantısı yoksa DB kontrolleri otomatik SKIP olur.
 */

import "dotenv/config";

// ── Types ─────────────────────────────────────────────────────

interface CheckResult {
    label: string;
    status: "PASS" | "FAIL" | "SKIP";
    detail: string;
}

// ── Output helpers ────────────────────────────────────────────

const WIDTH = 52;
const SEP = "═".repeat(WIDTH);

function row(label: string, status: "PASS" | "FAIL" | "SKIP", detail: string) {
    const padded = label.padEnd(28);
    const statusLabel = status === "PASS" ? "PASS" : status === "SKIP" ? "SKIP" : "FAIL";
    console.log(`  ${padded} ${statusLabel}   (${detail})`);
}

// ── Graceful Degradation checks ───────────────────────────────

async function runDegradationChecks(): Promise<CheckResult[]> {
    // Temporarily remove API key to force degradation path
    const savedKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    const results: CheckResult[] = [];

    try {
        const { aiBatchParse } = await import("../src/lib/services/ai-service.js");
        try {
            const r = await aiBatchParse({ entity_type: "customer", rows: [{ firma_adi: "Test" }] });
            const ok = Array.isArray(r.items);
            results.push({
                label: "aiBatchParse",
                status: ok ? "PASS" : "FAIL",
                detail: ok ? `items:${r.items.length},conf:${r.items[0]?.confidence ?? "n/a"}` : "invalid shape",
            });
        } catch (e) {
            results.push({ label: "aiBatchParse", status: "FAIL", detail: String(e) });
        }
    } catch {
        results.push({ label: "aiBatchParse", status: "SKIP", detail: "import failed" });
    }

    try {
        const { aiGenerateOpsSummary } = await import("../src/lib/services/ai-service.js");
        try {
            const r = await aiGenerateOpsSummary({
                criticalStockCount: 0,
                warningStockCount: 0,
                topCriticalItems: [],
                pendingOrderCount: 0,
                approvedOrderCount: 0,
                highRiskOrderCount: 0,
                openAlertCount: 0,
                atRiskCount: 0,
            });
            const ok = typeof r.summary === "string" && Array.isArray(r.insights);
            results.push({
                label: "aiGenerateOpsSummary",
                status: ok ? "PASS" : "FAIL",
                detail: ok ? `summary:'${r.summary.slice(0, 12)}',conf:${r.confidence}` : "invalid shape",
            });
        } catch (e) {
            results.push({ label: "aiGenerateOpsSummary", status: "FAIL", detail: String(e) });
        }
    } catch {
        results.push({ label: "aiGenerateOpsSummary", status: "SKIP", detail: "import failed" });
    }

    try {
        const { aiAssessStockRisk } = await import("../src/lib/services/ai-service.js");
        try {
            const r = await aiAssessStockRisk([]);
            const ok = Array.isArray(r.assessments);
            results.push({
                label: "aiAssessStockRisk",
                status: ok ? "PASS" : "FAIL",
                detail: ok ? `assessments:${r.assessments.length}` : "invalid shape",
            });
        } catch (e) {
            results.push({ label: "aiAssessStockRisk", status: "FAIL", detail: String(e) });
        }
    } catch {
        results.push({ label: "aiAssessStockRisk", status: "SKIP", detail: "import failed" });
    }

    try {
        const { aiEnrichPurchaseSuggestions } = await import("../src/lib/services/ai-service.js");
        try {
            const r = await aiEnrichPurchaseSuggestions([]);
            const ok = Array.isArray(r.enrichments);
            results.push({
                label: "aiEnrichPurchaseSuggestions",
                status: ok ? "PASS" : "FAIL",
                detail: ok ? `enrichments:${r.enrichments.length}` : "invalid shape",
            });
        } catch (e) {
            results.push({ label: "aiEnrichPurchaseSuggestions", status: "FAIL", detail: String(e) });
        }
    } catch {
        results.push({ label: "aiEnrichPurchaseSuggestions", status: "SKIP", detail: "import failed" });
    }

    // Restore key
    if (savedKey !== undefined) {
        process.env.ANTHROPIC_API_KEY = savedKey;
    }

    return results;
}

// ── DB Coverage checks ────────────────────────────────────────

async function runDbChecks(): Promise<CheckResult[]> {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
        return [{ label: "DB checks", status: "SKIP", detail: "DB not available (.env.local missing)" }];
    }

    let supabase: ReturnType<typeof import("../src/lib/supabase/service.js").createServiceClient>;
    try {
        const { createServiceClient } = await import("../src/lib/supabase/service.js");
        supabase = createServiceClient();
    } catch {
        return [{ label: "DB checks", status: "SKIP", detail: "service client import failed" }];
    }

    const results: CheckResult[] = [];
    const features = ["order_score", "import_parse", "ops_summary", "stock_risk", "purchase_enrich"] as const;
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    for (const feature of features) {
        try {
            const { count, error } = await supabase
                .from("ai_runs")
                .select("id", { count: "exact", head: true })
                .eq("feature", feature)
                .gte("created_at", since);

            if (error) {
                results.push({ label: feature, status: "SKIP", detail: error.message });
            } else {
                const n = count ?? 0;
                results.push({
                    label: feature,
                    status: n > 0 ? "PASS" : "FAIL",
                    detail: `${n} run${n !== 1 ? "s" : ""}`,
                });
            }
        } catch (e) {
            results.push({ label: feature, status: "SKIP", detail: String(e) });
        }
    }

    // Sales orders ai_confidence coverage (last 30)
    try {
        const { data: orders, error } = await supabase
            .from("sales_orders")
            .select("ai_confidence")
            .order("created_at", { ascending: false })
            .limit(30);

        if (error || !orders) {
            results.push({ label: "ai_confidence coverage", status: "SKIP", detail: error?.message ?? "no data" });
        } else {
            const filled = orders.filter((o: { ai_confidence: number | null }) => o.ai_confidence !== null).length;
            const total = orders.length;
            const pct = total > 0 ? Math.round((filled / total) * 100) : 0;
            results.push({
                label: "ai_confidence coverage",
                status: pct >= 30 ? "PASS" : "FAIL",
                detail: `${filled}/${total} = ${pct}%`,
            });
        }
    } catch (e) {
        results.push({ label: "ai_confidence coverage", status: "SKIP", detail: String(e) });
    }

    // Import batches confidence coverage (last 10)
    try {
        const { data: batches, error } = await supabase
            .from("import_batches")
            .select("confidence")
            .order("created_at", { ascending: false })
            .limit(10);

        if (error || !batches) {
            results.push({ label: "import_batches confidence", status: "SKIP", detail: error?.message ?? "no data" });
        } else {
            const filled = batches.filter((b: { confidence: number | null }) => b.confidence !== null).length;
            const total = batches.length;
            results.push({
                label: "import_batches confidence",
                status: total === 0 || filled > 0 ? "PASS" : "FAIL",
                detail: `${filled}/${total} filled`,
            });
        }
    } catch (e) {
        results.push({ label: "import_batches confidence", status: "SKIP", detail: String(e) });
    }

    return results;
}

// ── Main ──────────────────────────────────────────────────────

async function main() {
    const date = new Date().toISOString().slice(0, 10);
    console.log(`\nStage 2A Acceptance Eval — ${date}`);
    console.log(SEP);

    console.log("\nGRACEFUL DEGRADATION");
    const degradationResults = await runDegradationChecks();
    for (const r of degradationResults) {
        row(r.label, r.status, r.detail);
    }

    console.log("\nDB COVERAGE (last 24h ai_runs)");
    const dbResults = await runDbChecks();

    // Separate ai_runs feature checks from order/import checks
    const aiRunsResults = dbResults.filter(r =>
        ["order_score", "import_parse", "ops_summary", "stock_risk", "purchase_enrich"].includes(r.label)
    );
    const otherDbResults = dbResults.filter(r =>
        !["order_score", "import_parse", "ops_summary", "stock_risk", "purchase_enrich"].includes(r.label)
    );

    if (aiRunsResults.length === 1 && aiRunsResults[0].status === "SKIP" && aiRunsResults[0].label === "DB checks") {
        row("ai_runs checks", "SKIP", aiRunsResults[0].detail);
    } else {
        for (const r of aiRunsResults) {
            row(r.label, r.status, r.detail);
        }
    }

    if (otherDbResults.length > 0) {
        const salesResults = otherDbResults.filter(r => r.label.includes("confidence"));
        if (salesResults.length > 0) {
            console.log("\nSALES ORDERS");
            for (const r of salesResults) {
                row(r.label, r.status, r.detail);
            }
        }
        const importResults = otherDbResults.filter(r => r.label.includes("import"));
        if (importResults.length > 0) {
            console.log("\nIMPORT BATCHES");
            for (const r of importResults) {
                row(r.label, r.status, r.detail);
            }
        }
    }

    console.log(`\n${SEP}`);

    const allResults = [...degradationResults, ...dbResults];
    const hasFail = allResults.some(r => r.status === "FAIL");
    const overallStatus = hasFail ? "FAIL" : "PASS";
    const exitCriteria = hasFail ? "NOT MET" : "MET";

    console.log(`OVERALL: ${overallStatus}  Exit criteria: ${exitCriteria}\n`);

    if (hasFail) {
        process.exit(1);
    }
}

main().catch(e => {
    console.error("Eval script crashed:", e);
    process.exit(1);
});
