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
    checks["env.ANTHROPIC_API_KEY"]  = process.env.ANTHROPIC_API_KEY           ? "ok" : "MISSING";
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

    } catch (e) {
        checks["db.error"] = `exception: ${e}`;
    }

    // ── Overall status ───────────────────────────────────────────────────
    // Optional keys (PARASUT_CLIENT_ID) are excluded from the required set.
    const requiredKeys = [
        "env.SUPABASE_URL",
        "env.SERVICE_ROLE_KEY",
        "env.ANTHROPIC_API_KEY",
        "db.customers",
        "db.sales_orders",
        "db.production_entries",
        "db.alerts",
        "db.rpc_stock_functions",
    ];
    const allOk = requiredKeys.every((k) => checks[k] === "ok");

    return NextResponse.json(checks, { status: allOk ? 200 : 503 });
}
