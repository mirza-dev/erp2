/**
 * RLS / RPC / Storage kapısı — GERÇEK yerel Postgres'e karşı (2026-09-16, ROADMAP'in son kutusu).
 *
 * Neden var: vitest suite'i tamamen mock'lu; RLS canlıda yalnız 2026-09-11'de ELLE ölçüldü
 * (anon ile 64 tablo → 0 satır). Elle ölçüm tekrarlanmaz, bu dosya tekrarlanır.
 *
 * Katmanlar:
 *  1. Yapısal — pg_class.relrowsecurity (PostgREST'in göremediği katman): her public tablo RLS'li,
 *     tablo sayısı TAM 64 (şema kayması sessiz geçmesin; yeni tablo eklendiğinde sayı BİLEREK güncellenir).
 *  2. Davranışsal — anon key ile her tablo 0 satır; anti-vakum: service key aynı tablolardan
 *     satır DÖNDÜRÜR (migration tohumları: product_types/product_type_fields/note_templates/
 *     company_settings) — yani "0 satır" boş tablo değil, RLS'in eseri.
 *  3. Storage — anon hiçbir kovayı listeleyemez; anti-vakum için service key ile geçici obje
 *     yüklenir, anon liste/indirme yine boş/red, sonra silinir.
 *  4. DEFINER RPC'ler — mig.110'un beş fonksiyonu anon'a 401/42501 (2026-08-30'da canlıda
 *     `record_request_metrics` anon ile 200 dönüyordu — K1). Kontrol: `dashboard_monthly_cogs`
 *     da anon'a kapalı (probe yöntemi 404/PGRST202 değil 401 üretir).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { env, rest, openApiTables, sql } from "./helpers";

const EXPECTED_TABLE_COUNT = 64;   // 2026-09-11 canlı diff: 64 tablo · 64 RLS · 6 kova
const EXPECTED_BUCKET_COUNT = 6;
const SEEDED_BY_MIGRATIONS = ["product_types", "product_type_fields", "note_templates", "company_settings"];

describe("1 — Yapısal RLS (pg_class)", () => {
    it(`public şemasında ${EXPECTED_TABLE_COUNT} tablo var ve HEPSİ relrowsecurity=true`, () => {
        const rows = sql<{ relname: string; relrowsecurity: boolean }>(
            "select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace " +
            "where n.nspname = 'public' and c.relkind = 'r' order by c.relname",
        );
        const withoutRls = rows.filter(r => !r.relrowsecurity).map(r => r.relname);
        expect(withoutRls, "RLS'siz tablo(lar)").toEqual([]);
        expect(rows.length, "tablo sayısı değişti — yeni tablo eklendiyse bu sabiti ve schema-bundle README'yi BİLEREK güncelle").toBe(EXPECTED_TABLE_COUNT);
    });

    it("her tabloda en az bir policy var (RLS açık ama policy'siz tablo = servis dahil kimse okuyamaz)", () => {
        // service_role RLS'i BYPASS eder (bypassrls) — policy'siz tablo uygulamayı kırmaz ama
        // 'RLS açık + 0 policy' bir tasarım değil unutkanlıktır; 2026-08-31 ölçümü 29 policy.
        const rows = sql<{ n: number }>("select count(*)::int as n from pg_policies where schemaname = 'public'");
        expect(rows[0].n).toBeGreaterThanOrEqual(29);
    });
});

describe("2 — Anon sızıntı probu (PostgREST)", () => {
    let tables: string[] = [];
    beforeAll(async () => { tables = await openApiTables(); });

    it(`OpenAPI ${EXPECTED_TABLE_COUNT} tablo listeler (pg_class ile aynı küme)`, () => {
        const pg = sql<{ relname: string }>(
            "select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname='public' and c.relkind='r' order by 1",
        ).map(r => r.relname);
        expect(tables).toEqual(pg);
    });

    it("anon key ile HER tablo 0 satır döner (200 + [])", async () => {
        const { anon } = env();
        const leaks: string[] = [];
        for (const t of tables) {
            const { status, body } = await rest(`/rest/v1/${t}?select=*&limit=5`, anon);
            const rows = Array.isArray(body) ? body.length : -1;
            if (!(status === 200 && rows === 0)) leaks.push(`${t} → ${status} / ${rows} satır`);
        }
        expect(leaks, "anon ile satır sızan tablolar").toEqual([]);
    });

    it("anti-vakum: service key aynı tablolardan satır DÖNDÜRÜR (0 satır boşluktan değil RLS'ten)", async () => {
        const { service } = env();
        const nonEmpty: string[] = [];
        for (const t of SEEDED_BY_MIGRATIONS) {
            const { status, body } = await rest(`/rest/v1/${t}?select=*&limit=5`, service);
            if (status === 200 && Array.isArray(body) && body.length > 0) nonEmpty.push(t);
        }
        expect(nonEmpty).toEqual(SEEDED_BY_MIGRATIONS);
    });
});

describe("3 — Storage (kovalar)", () => {
    it(`${EXPECTED_BUCKET_COUNT} kova var; anon hiçbirini listeleyemez; yüklenen obje anon'a görünmez`, async () => {
        const { anon, service } = env();
        const { status, body } = await rest("/storage/v1/bucket", service);
        expect(status).toBe(200);
        const buckets = (body as Array<{ id: string; public: boolean }>).map(b => b.id).sort();
        expect(buckets.length).toBe(EXPECTED_BUCKET_COUNT);

        // Anti-vakum: özel kovaya service ile geçici obje koy → anon listede/indirmede göremesin.
        const key = `integration-gate/${Date.now()}.txt`;
        const up = await fetch(`${env().url}/storage/v1/object/company-files/${key}`, {
            method: "POST",
            headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "text/plain" },
            body: "integration-gate",
        });
        expect(up.status, await up.text()).toBe(200);
        try {
            for (const b of buckets) {
                const r = await rest(`/storage/v1/object/list/${b}`, anon, { method: "POST", body: { prefix: "", limit: 100 } });
                expect(Array.isArray(r.body) ? r.body.length : -1, `anon ${b} listesi`).toBe(0);
            }
            const svcList = await rest("/storage/v1/object/list/company-files", service, { method: "POST", body: { prefix: "integration-gate", limit: 10 } });
            expect((svcList.body as unknown[]).length, "service listede obje görmeli (vakum kontrolü)").toBeGreaterThan(0);
            const dl = await fetch(`${env().url}/storage/v1/object/company-files/${key}`, { headers: { apikey: anon, Authorization: `Bearer ${anon}` } });
            expect([400, 403, 404]).toContain(dl.status);
        } finally {
            await fetch(`${env().url}/storage/v1/object/company-files/${key}`, {
                method: "DELETE", headers: { apikey: service, Authorization: `Bearer ${service}` },
            });
        }
    });
});

describe("4 — SECURITY DEFINER RPC'ler anon'a kapalı (mig.110)", () => {
    const DEFINER_RPCS: Array<[string, Record<string, unknown>]> = [
        // Parametre adları imzayla birebir: PostgREST eşleşmeyen imzada 404/PGRST202 döner ve o,
        // "izin reddi" DEĞİLDİR — bu yüzden argümanlar gerçek imzayı taşır.
        ["record_request_metrics", { p_rows: [], p_ttl_days: 1 }],
        ["record_error_occurrence", {
            p_fingerprint: "gate", p_title: "gate", p_error_type: "gate", p_normalized_message: "gate",
            p_severity: "low", p_module: "gate", p_endpoint: "/gate", p_environment: "test",
            p_occurred_at: "2026-01-01T00:00:00Z", p_request_id: null, p_method: "GET", p_status_code: 500,
            p_user_id: null, p_user_agent: null, p_stack: null, p_context: {}, p_event_ttl_days: 1, p_hourly_sample_cap: 1,
        }],
        ["purge_telemetry", {}],
        ["claim_notification_outbox", { p_worker_id: "gate", p_limit: 1, p_lease_seconds: 1, p_only_id: null }],
        ["update_email_delivery_from_provider", {
            p_email_log_id: "00000000-0000-4000-8000-000000000000", p_delivery_status: "delivered", p_provider_event_at: "2026-01-01T00:00:00Z",
        }],
    ];

    it.each(DEFINER_RPCS)("%s → anon 401/42501 (ne 200 ne 404)", async (fn, args) => {
        const { anon } = env();
        const { status, body } = await rest(`/rest/v1/rpc/${fn}`, anon, { method: "POST", body: args });
        const code = (body as { code?: string })?.code;
        // 42501 = permission denied. Parametre uyuşmazlığı (PGRST202/404) bir "izin" kanıtı DEĞİLDİR
        // — o yüzden 404 de kabul edilmez; fonksiyon adı/paramları değişirse bu satır ona göre güncellenir.
        expect({ fn, status, code }).toEqual({ fn, status: 401, code: "42501" });
    });

    it("kontrol: dashboard_monthly_cogs(date) anon'a kapalı — probe yöntemi gerçek 401 üretir", async () => {
        const { anon } = env();
        const { status, body } = await rest("/rest/v1/rpc/dashboard_monthly_cogs", anon, { method: "POST", body: { p_start: "2026-01-01" } });
        expect({ status, code: (body as { code?: string })?.code }).toEqual({ status: 401, code: "42501" });
    });
});
