import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

type Supabase = ReturnType<typeof createServiceClient>;

/**
 * Fix marker doğrulama — migration 011 (ship_order_full uuid fix).
 * check_migration_011_applied() RPC sonucunu health response string'ine çevirir.
 *
 *   PGRST202  → migration 016 (tanı fonksiyonu) uygulanmamış
 *   false     → 007 uygulandı, 011 uygulanmadı (p_order_id::text cast bug mevcut)
 *   true      → 011 uygulandı, fix marker mevcut
 *
 * Pure function — test edilebilir, side effect yok.
 */
export function interpretMigration011Result(
    data: boolean | null | undefined,
    error: { code?: string; message?: string } | null | undefined,
): string {
    if (error?.code === "PGRST202") return `missing: ${error.message}`;
    if (!data) return "fix_missing: ship_order_full has uuid cast bug — apply migration 011";
    return "ok";
}

async function pingTable(supabase: Supabase, table: string): Promise<string> {
    const { error } = await supabase.from(table).select("id").limit(1);
    return error ? `error: ${error.message}` : "ok";
}

async function pingColumn(supabase: Supabase, table: string, column: string): Promise<string> {
    const { error } = await supabase.from(table).select(column).limit(1);
    return error ? `missing_or_error: ${error.message}` : "ok";
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

        // Phase 1 — Migration 001 core tables (001_initial_schema.sql)
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

        // Phase 2 — RPC existence + column checks (all independent → parallel)
        //
        // RPC checks: PGRST202 = function doesn't exist (migration not applied).
        // Calling with a nil UUID triggers a domain error inside the function (expected).
        // Column checks: any error means column missing (migration not applied).
        // Migration 009 is special: eq("entity_id", text) verifies column type is text, not uuid.
        const [
            { error: rpcError },    // 002 — stock RPCs
            { error: rpc3Error },   // 003/007 — order RPCs
            { error: rpc4Error },   // 004/008 — inventory RPCs
            { data: m011ok, error: m011Err },  // 011 — ship_order_full uuid fix (via 016 diagnostic)
            col005,                 // 005 — sales_orders.ai_risk_level
            col006,                 // 006 — products.lead_time_days
            col009,                 // 009 — audit_log.entity_id text type
            tbl010,                 // 010 — ai_recommendations table
            col012,                 // 012 — sales_orders.incoterm
            tbl013,                 // 013 — ai_entity_aliases table
            tbl014,                 // 014 — ai_runs table (optional)
            col015,                 // 015 — products identity fields
        ] = await Promise.all([
            supabase.rpc("increment_reserved", {
                p_product_id: "00000000-0000-0000-0000-000000000000",
                p_qty: 0,
            }),
            supabase.rpc("approve_order_with_allocation", {
                p_order_id: "00000000-0000-0000-0000-000000000000",
            }),
            supabase.rpc("record_stock_movement", {
                p_product_id: "00000000-0000-0000-0000-000000000000",
                p_movement_type: "adjustment",
                p_quantity: 0,
            }),
            // 011: fix marker doğrulama — 016 tanı fonksiyonu pg_proc.prosrc'yi okur.
            // true / false / PGRST202 → interpretMigration011Result() ile map edilir.
            supabase.rpc("check_migration_011_applied"),
            pingColumn(supabase, "sales_orders", "ai_risk_level"),
            pingColumn(supabase, "products", "lead_time_days"),
            // 009: text/uuid type probe — eq with a string value throws on uuid columns
            supabase.from("audit_log").select("id").eq("entity_id", "__healthcheck_text__").limit(1),
            pingTable(supabase, "ai_recommendations"),
            pingColumn(supabase, "sales_orders", "incoterm"),
            pingTable(supabase, "ai_entity_aliases"),
            pingTable(supabase, "ai_runs"),
            pingColumn(supabase, "products", "material_quality"),
        ]);

        checks["db.rpc_stock_functions"]     = rpcError?.code === "PGRST202"
            ? `missing: ${rpcError.message}` : "ok";
        checks["db.rpc_order_functions"]     = rpc3Error?.code === "PGRST202"
            ? `missing: ${rpc3Error.message}` : "ok";
        checks["db.rpc_inventory_functions"] = rpc4Error?.code === "PGRST202"
            ? `missing: ${rpc4Error.message}` : "ok";
        checks["db.migration_011"]           = interpretMigration011Result(m011ok, m011Err);
        checks["db.migration_005"] = col005;
        checks["db.migration_006"] = col006;
        checks["db.migration_009"] = col009.error
            ? `missing_or_error: ${col009.error.message}` : "ok";
        checks["db.migration_010"] = tbl010;
        checks["db.migration_012"] = col012;
        checks["db.migration_013"] = tbl013;
        checks["db.migration_014"] = tbl014;
        checks["db.migration_015"] = col015;

    } catch (e) {
        checks["db.error"] = `exception: ${e}`;
    }

    // ── Overall status ───────────────────────────────────────────────────
    // Optional keys (PARASUT_CLIENT_ID, migration_014) excluded from required set.
    // migration_014 (ai_runs) opsiyonel — fire-and-forget audit, eksikse 503 dönmez
    const requiredKeys = [
        "env.SUPABASE_URL",
        "env.SERVICE_ROLE_KEY",
        "db.customers",
        "db.sales_orders",
        "db.production_entries",
        "db.alerts",
        "db.rpc_stock_functions",        // 002
        "db.rpc_order_functions",        // 003/007
        "db.rpc_inventory_functions",    // 004/008
        "db.migration_011",              // ship_order_full (sevkiyat RPC)
        "db.migration_005",              // ai_risk_level
        "db.migration_006",              // lead_time_days
        "db.migration_009",              // audit_log.entity_id text
        "db.migration_010",              // ai_recommendations table
        "db.migration_012",              // sales_orders.incoterm
        "db.migration_013",              // ai_entity_aliases table
        "db.migration_015",              // products identity fields (CRUD bağımlı)
    ];
    const allOk = requiredKeys.every((k) => checks[k] === "ok");

    return NextResponse.json(checks, { status: allOk ? 200 : 503 });
}
