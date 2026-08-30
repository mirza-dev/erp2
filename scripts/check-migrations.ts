/**
 * GATE: migration drift kontrolü (READ-ONLY, OpenAPI-probe yaklaşımı).
 *
 * Bu projede migration'lar Studio SQL editor'den elle uygulanıyor →
 * supabase_migrations.schema_migrations kaydı DÜŞMÜYOR (CLI `migration list`
 * 082+ için boş gösterir, yanıltıcı). Bu yüzden drift, migration'ların
 * yarattığı GERÇEK nesneler üzerinden ölçülür: PostgREST'in OpenAPI spec'i
 * (`GET /rest/v1/`) tabloları, kolonları ve RPC'leri listeler — tek read-only
 * istek, canlı veriye dokunmaz.
 *
 * Kullanım (deploy ÖNCESİ): npx tsx scripts/check-migrations.ts
 * Çıkış: eksik nesne → migration adıyla listelenir, exit 1.
 *
 * YENİ migration eklerken: PROBES'a bir kayıt düşün (probe'suz migration
 * "manuel doğrulama" satırı olarak raporlanır, sessiz kalmaz).
 * Arka plan: K5 (docs/audit/2026-06-guvenlik-dogruluk-bulgulari.md).
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// .env.local'ı elle yükle (dotenv bağımlılığı eklememek için)
const envPath = join(process.cwd(), ".env.local");
if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
    }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
    console.error("[mig-gate] NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY gerekli (.env.local).");
    process.exit(2);
}

type Probe =
    | { kind: "table"; table: string }
    | { kind: "column"; table: string; column: string }
    | { kind: "rpc"; fn: string };

/** Migration prefix → canlıda varlığı kanıtlayan nesne. */
const PROBES: Record<string, Probe> = {
    "073": { kind: "table", table: "quote_yearly_counters" },
    "075": { kind: "table", table: "quote_pdf_archives" },
    "079": { kind: "table", table: "note_templates" },
    "080": { kind: "column", table: "order_lines", column: "description" },
    "084": { kind: "table", table: "product_vendor_links" },
    "085": { kind: "column", table: "import_document_lines", column: "extracted_core_fields" },
    "086": { kind: "column", table: "import_document_lines", column: "source_page" },
    "087": { kind: "rpc", fn: "dashboard_monthly_cogs" },
    "088": { kind: "rpc", fn: "send_quote_and_create_pending_order" },
    "090": { kind: "column", table: "alerts", column: "due_date" },
    "091": { kind: "table", table: "company_files" },
    "092": { kind: "table", table: "calendar_notes" },
    "096": { kind: "column", table: "email_logs", column: "body_expires_at" },
    "097": { kind: "table", table: "notification_outbox" },
    "098": { kind: "column", table: "quote_line_items", column: "note" },
    "099": { kind: "column", table: "quote_line_items", column: "unit" },
    "100": { kind: "table", table: "supplier_rfqs" },
    "106": { kind: "column", table: "company_settings", column: "quote_validity_days" },
    // Faz 13 — Paraşüt alış tarafı. Tek kolon yeterli sinyal: 107 tek dosyada
    // vendors/purchase_orders/purchase_order_lines'ı birlikte değiştirir.
    "107": { kind: "column", table: "purchase_orders", column: "parasut_bill_id" },
    "108": { kind: "column", table: "sales_orders", column: "parasut_payment_status" },
    "109": { kind: "table", table: "system_error_groups" },
    "111": { kind: "column", table: "system_error_events", column: "severity" },
};

/** OpenAPI'den görünmeyen migration'lar — elle SQL doğrulaması gerekir.
 *  (Fonksiyon REDEFINE'ları OpenAPI'de görünmez — rpc path'i zaten vardı.) */
const MANUAL: Record<string, string> = {
    "089": "alerts type CHECK 'po_overdue' içeriyor mu: SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'alerts'::regclass AND contype = 'c';",
    "093": "order/quote RPC recompute: SELECT prosrc LIKE '%v_line_total%' FROM pg_proc WHERE proname='create_order_with_lines';",
    "094": "send fix: SELECT prosrc LIKE '%qli.description%' FROM pg_proc WHERE proname='send_quote_and_create_pending_order'; + index: SELECT indexdef FROM pg_indexes WHERE indexname='uq_sales_orders_quote_id'; (cancelled hariç olmalı)",
    "095": "lock hijyeni: SELECT proname, proconfig FROM pg_proc WHERE proname LIKE '%scan_lock%'; (search_path set olmalı)",
    "101": "alerts type CHECK 'rfq_response_due' içeriyor mu: SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'alerts'::regclass AND contype = 'c';",
    "102": "create_rfq_with_lines ambiguity fix: SELECT prosrc NOT LIKE '%ON CONFLICT (rfq_id%' FROM pg_proc WHERE proname='create_rfq_with_lines'; (DISTINCT'li, ON CONFLICT'siz sürüm)",
    "103": "award_rfq_create_pos bütünlük: SELECT prosrc LIKE '%fiyat vermedi%' FROM pg_proc WHERE proname='award_rfq_create_pos'; (O2 sunucu-otoriter fiyat + D2 mükerrer satır guard)",
    "104": "reverse_production REDEFINE — entry select satır kilidi: SELECT prosrc LIKE '%for update%' FROM pg_proc WHERE proname='reverse_production'; (O1 eşzamanlı çift-DELETE → stok 2× düşme fix)",
    "105": "recount_stock RPC var mı + FOR UPDATE: SELECT prosrc LIKE '%for update%' FROM pg_proc WHERE proname='recount_stock'; (D-O1 atomik stok sayımı — mutlak on_hand ataması)",
    // RLS ve yetki değişiklikleri OpenAPI'de GÖRÜNMEZ → tek doğrulama yolu elle SQL.
    "110": "5 DEFINER RPC'sinde anon/authenticated EXECUTE kapalı mı (hepsi false dönmeli): SELECT p.proname, has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec, has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname='public' AND p.proname IN ('purge_telemetry','record_error_occurrence','record_request_metrics','claim_notification_outbox','update_email_delivery_from_provider');",
    "017": "23 çekirdek tabloda RLS açık mı (hepsi true dönmeli): SELECT c.relname, c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('customers','products','sales_orders','order_lines','quotes','audit_log','alerts','inventory_movements','production_entries','invoices','payments','shipments','bills_of_materials','stock_reservations','shortages','import_batches','import_drafts','ai_entity_aliases','ai_feedback','ai_recommendations','ai_runs','order_counters','integration_sync_logs');",
    "029": "purchase_commitments + column_mappings RLS açık mı: SELECT c.relname, c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('purchase_commitments','column_mappings');",
};

interface OpenApiSpec {
    paths?: Record<string, unknown>;
    definitions?: Record<string, { properties?: Record<string, unknown> }>;
}

function probeExists(spec: OpenApiSpec, probe: Probe): boolean {
    if (probe.kind === "table") return Boolean(spec.paths?.[`/${probe.table}`]);
    if (probe.kind === "rpc") return Boolean(spec.paths?.[`/rpc/${probe.fn}`]);
    return Boolean(spec.definitions?.[probe.table]?.properties?.[probe.column]);
}

async function main() {
    // Tek READ-ONLY istek: PostgREST OpenAPI spec'i (veriye dokunmaz).
    const res = await fetch(`${url}/rest/v1/`, {
        headers: { apikey: key!, Authorization: `Bearer ${key}` },
    });
    if (!res.ok) {
        console.error(`[mig-gate] OpenAPI spec alınamadı: HTTP ${res.status}`);
        process.exit(2);
    }
    const spec = (await res.json()) as OpenApiSpec;

    const local = readdirSync(join(process.cwd(), "supabase/migrations"))
        .filter((f) => f.endsWith(".sql"))
        .sort();
    const untrackedCount = local.filter(
        (f) => !PROBES[f.slice(0, 3)] && !MANUAL[f.slice(0, 3)],
    ).length;
    console.log(`[mig-gate] lokal migration: ${local.length} dosya · probe: ${Object.keys(PROBES).length} · manuel: ${Object.keys(MANUAL).length} · kayıtsız: ${untrackedCount}`);

    const missing: string[] = [];
    for (const [prefix, probe] of Object.entries(PROBES)) {
        const file = local.find((f) => f.startsWith(prefix));
        if (!file) continue; // lokalde yoksa konu dışı
        const ok = probeExists(spec, probe);
        const label = probe.kind === "rpc" ? `rpc:${probe.fn}`
            : probe.kind === "column" ? `${probe.table}.${probe.column}`
            : `table:${probe.table}`;
        console.log(`  ${ok ? "✅" : "❌"} ${file} (${label})`);
        if (!ok) missing.push(file);
    }

    const manualFiles: string[] = [];
    for (const [prefix, hint] of Object.entries(MANUAL)) {
        const file = local.find((f) => f.startsWith(prefix));
        if (file) {
            manualFiles.push(file);
            console.log(`  ⚠️  ${file} — otomatik probe yok, elle doğrula: ${hint}`);
        }
    }
    // Hiçbir listede olmayan migration'lar: script bunları eskiden HİÇ anmıyor,
    // yine de "OK" diyordu → bir dosyanın canlıya uygulanmadığı sessizce
    // kaçabiliyordu (2026-08-30: `110` güvenlik yaması tam bu durumdaydı).
    // Uyarı, kapı DEĞİL: birikmiş liste deploy'u bloklamamalı.
    const tracked = new Set([...Object.keys(PROBES), ...Object.keys(MANUAL)]);
    const untracked = local.filter((f) => !tracked.has(f.slice(0, 3)));
    if (untracked.length > 0) {
        console.log(`\n[mig-gate] ${untracked.length} migration'ın doğrulama kaydı yok (bilgi):`);
        for (const f of untracked) console.log(`  ℹ️  ${f}`);
        console.log("→ Yeni migration eklerken PROBES'a (OpenAPI'de görünen nesne) veya"
            + " MANUAL'a (fonksiyon gövdesi/grant/RLS gibi görünmeyen değişiklik) bir kayıt düşün.");
    }

    if (manualFiles.length > 0) {
        // Dokuz sorguyu tek tek koşturmak yerine hepsini tek çalıştırmada
        // döndüren hazır dosya. Son koşum 2026-08-30: 9/9 ✅ (canlı erp2).
        console.log(
            `\n[mig-gate] ${manualFiles.length} dosya elle doğrulama istiyor — hepsini tek sorguda kontrol et:\n`
            + "  Studio → SQL Editor → docs/audit/manual-migration-checks.sql (her satır ✅ olmalı)",
        );
    }

    if (missing.length > 0) {
        console.error(`\n[mig-gate] CANLIDA EKSİK ${missing.length} migration:`);
        for (const m of missing) console.error("  - " + m);
        console.error("→ Studio SQL editor veya `supabase db push` ile uygulayın; deploy ERTELENMELİ.");
        process.exit(1);
    }
    console.log("[mig-gate] OK — problanan tüm migration'lar canlıda mevcut.");
}

main().catch((err) => {
    console.error("[mig-gate] beklenmeyen hata:", err);
    process.exit(2);
});
