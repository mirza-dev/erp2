import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

type Supabase = ReturnType<typeof createServiceClient>;

async function pingTable(supabase: Supabase, table: string): Promise<string> {
    const { error } = await supabase.from(table).select("id").limit(1);
    return error ? `error: ${error.message}` : "ok";
}

export async function GET() {
    const checks: Record<string, string> = {};

    // ── Env checks ──────────────────────────────────────────────────────
    checks["env.SUPABASE_URL"]       = process.env.NEXT_PUBLIC_SUPABASE_URL    ? "ok" : "MISSING";
    checks["env.SERVICE_ROLE_KEY"]   = process.env.SUPABASE_SERVICE_ROLE_KEY   ? "ok" : "MISSING";
    // Optional — AI özet/puanlama/parse; eksikse sistem çalışır, AI özellikleri devre dışı
    checks["ai.ANTHROPIC_API_KEY"]   = process.env.ANTHROPIC_API_KEY
        ? "ok"
        : "disabled (AI features unavailable)";
    // Optional — Paraşüt entegrasyonu; eksikse 503 dönmez
    checks["env.PARASUT_CLIENT_ID"]  = process.env.PARASUT_CLIENT_ID
        ? "ok (optional)"
        : "MISSING (optional)";

    // ── DB + migration checks ────────────────────────────────────────────
    try {
        const supabase = createServiceClient();

        // Migration 001 — core tables (001_initial_schema.sql)
        const [customers, salesOrders, productionEntries, alerts] = await Promise.all([
            pingTable(supabase, "customers"),
            pingTable(supabase, "sales_orders"),
            pingTable(supabase, "production_entries"),
            pingTable(supabase, "alerts"),
        ]);
        checks["db.customers"]          = customers;
        checks["db.sales_orders"]       = salesOrders;
        checks["db.production_entries"] = productionEntries;
        checks["db.alerts"]             = alerts;

        // Migration 002 — stock RPC functions (002_stock_rpc_functions.sql)
        // Calling with a nil UUID triggers "Product not found" inside the function (expected).
        // PGRST202 means the function itself doesn't exist → migration not applied.
        const { error: rpcError } = await supabase.rpc("increment_reserved", {
            p_product_id: "00000000-0000-0000-0000-000000000000",
            p_qty: 0,
        });
        checks["db.rpc_stock_functions"] = rpcError?.code === "PGRST202"
            ? `missing: ${rpcError.message}`
            : "ok";

        // Migration 003 — order RPCs (approve_order_with_allocation, ship_order_full, cancel_order)
        const { error: rpc3Error } = await supabase.rpc("approve_order_with_allocation", {
            p_order_id: "00000000-0000-0000-0000-000000000000",
        });
        checks["db.rpc_order_functions"] = rpc3Error?.code === "PGRST202"
            ? `missing: ${rpc3Error.message}`
            : "ok";

        // Migration 004 — inventory RPCs (record_stock_movement, complete_production, etc.)
        const { error: rpc4Error } = await supabase.rpc("record_stock_movement", {
            p_product_id: "00000000-0000-0000-0000-000000000000",
            p_movement_type: "adjustment",
            p_quantity: 0,
        });
        checks["db.rpc_inventory_functions"] = rpc4Error?.code === "PGRST202"
            ? `missing: ${rpc4Error.message}`
            : "ok";

        // Migration 005 — ai_risk_level column on sales_orders
        const { error: col5Error } = await supabase
            .from("sales_orders")
            .select("ai_risk_level")
            .limit(1);
        checks["db.migration_005"] = col5Error
            ? `missing_or_error: ${col5Error.message}`
            : "ok";

        // Migration 006 — lead_time_days column on products
        const { error: col6Error } = await supabase
            .from("products")
            .select("lead_time_days")
            .limit(1);
        checks["db.migration_006"] = col6Error
            ? `missing_or_error: ${col6Error.message}`
            : "ok";

        // Migration 009 — audit_log.entity_id should be text
        // Text column accepts arbitrary string comparison; uuid column throws.
        const { error: col9Error } = await supabase
            .from("audit_log")
            .select("id")
            .eq("entity_id", "__healthcheck_text__")
            .limit(1);
        checks["db.migration_009"] = col9Error
            ? `missing_or_error: ${col9Error.message}`
            : "ok";

        // Migration 010 — ai_recommendations table (AI karar yaşam döngüsü)
        const { error: mig010Error } = await supabase
            .from("ai_recommendations")
            .select("id")
            .limit(1);
        checks["db.migration_010"] = mig010Error
            ? `missing_or_error: ${mig010Error.message}`
            : "ok";

        // Migration 012 — Excel import alanları (incoterm, cost_price vb. — sales_orders genişletmesi)
        const { error: mig012Error } = await supabase
            .from("sales_orders")
            .select("incoterm")
            .limit(1);
        checks["db.migration_012"] = mig012Error
            ? `missing_or_error: ${mig012Error.message}`
            : "ok";

        // Migration 013 — ai_entity_aliases table (import dedup öğrenme)
        const { error: mig013Error } = await supabase
            .from("ai_entity_aliases")
            .select("id")
            .limit(1);
        checks["db.migration_013"] = mig013Error
            ? `missing_or_error: ${mig013Error.message}`
            : "ok";

        // Migration 014 — ai_runs table (opsiyonel — observability, uygulama bloklamaz)
        const { error: mig014Error } = await supabase
            .from("ai_runs")
            .select("id")
            .limit(1);
        checks["db.migration_014"] = mig014Error
            ? `missing_or_error: ${mig014Error.message}`
            : "ok";

        // Migration 015 — products identity fields (opsiyonel — drawer display)
        const { error: mig015Error } = await supabase
            .from("products")
            .select("material_quality")
            .limit(1);
        checks["db.migration_015"] = mig015Error
            ? `missing_or_error: ${mig015Error.message}`
            : "ok";

    } catch (e) {
        checks["db.error"] = `exception: ${e}`;
    }

    // ── Overall status ───────────────────────────────────────────────────
    // Optional keys (PARASUT_CLIENT_ID) are excluded from the required set.
    const requiredKeys = [
        "env.SUPABASE_URL",
        "env.SERVICE_ROLE_KEY",
        "db.customers",
        "db.sales_orders",
        "db.production_entries",
        "db.alerts",
        "db.rpc_stock_functions",       // 002
        "db.rpc_order_functions",       // 003
        "db.rpc_inventory_functions",   // 004
        "db.migration_005",             // 005 — ai_risk_level
        "db.migration_006",             // 006 — lead_time_days
        "db.migration_009",             // 009 — audit_log.entity_id text hotfix
        "db.migration_010",             // 010 — ai_recommendations table
        "db.migration_012",             // 012 — sales_orders.incoterm (Excel import alanları)
        "db.migration_013",             // 013 — ai_entity_aliases table (import dedup)
        // db.migration_014 (ai_runs) ve db.migration_015 (product identity) opsiyonel — 503 tetiklemez
    ];
    const allOk = requiredKeys.every((k) => checks[k] === "ok");

    return NextResponse.json(checks, { status: allOk ? 200 : 503 });
}
