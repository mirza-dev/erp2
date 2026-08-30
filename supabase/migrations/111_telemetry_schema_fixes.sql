-- ============================================================
-- 111 — Developer Console telemetri şeması: inceleme bulgularının kapanışı
--
-- Kaynak: docs/audit/2026-08-developer-console-review.md (Y7 · O3 · D3 · D4 + Nit)
--
-- UYGULAMA NOTU: bu migration yazıldığında altı telemetri tablosu da 0 satır
-- taşıyordu (canlıda doğrulandı) → anahtar değişikliği ve NOT NULL kolon
-- ekleme tek seferlik ve veri taşımasızdır. Dolu bir tabloda aynı adımlar
-- yeniden anahtarlama gerektirir; sıra bozulursa ÖNCE veriyi boşaltın.
-- ============================================================


-- ── Y7: hata grupları ortamları KARIŞTIRIYOR ─────────────────────────────
--
-- Parmak izi `environment` içermiyordu ve `on conflict (fingerprint)` bu
-- kolonu güncellemiyordu → tek Supabase projesi kullanıldığı sürece (bu
-- projede öyle) geliştirme makinesindeki hata ile canlıdaki AYNI hata tek
-- gruba düşüyor, grup ilk gören ortamın etiketiyle kalıyor, `occurrence_count`
-- iki ortamın toplamı oluyordu. Panel "environment: production" yazarken
-- development sayılarını gösteriyordu — etiket yalan söylüyordu.
--
-- Çözüm: grup anahtarı (fingerprint, environment).

alter table system_error_groups
    drop constraint if exists system_error_groups_fingerprint_key;

create unique index if not exists uq_error_groups_fingerprint_env
    on system_error_groups(fingerprint, environment);


-- ── O3: olay bazında ciddiyet ────────────────────────────────────────────
--
-- `system_error_events` ciddiyet TAŞIMIYORDU; pencere istatistiği olayları
-- gruba join edip GRUBUN mevcut seviyesini sayıyordu. Grup seviyesi monoton
-- (yalnız yukarı çıkar) olduğu için "son 15 dakikada N kritik hata" ifadesi,
-- o pencerede kritik sınıflanmamış oluşumlarla üretilebiliyordu ve panel
-- kırmızıda takılabiliyordu. Olay bazlı seviye saklanmadığı için okuma
-- tarafında düzeltmek de mümkün değildi.

alter table system_error_events
    add column if not exists severity text not null default 'error';

do $$
begin
    if not exists (
        select 1 from pg_constraint where conname = 'system_error_events_severity_check'
    ) then
        alter table system_error_events
            add constraint system_error_events_severity_check
            check (severity in ('info', 'warning', 'error', 'critical'));
    end if;
end $$;

create index if not exists ix_error_events_severity
    on system_error_events(severity, occurred_at desc);


-- ── Nit: istek metriği sayaçlarında negatif koruması ─────────────────────
-- `sample_count`/`sum_ms`/`max_ms` CHECK taşıyordu, status sayaçları taşımıyordu.

do $$
begin
    if not exists (
        select 1 from pg_constraint where conname = 'request_metrics_status_nonneg_check'
    ) then
        alter table request_metrics
            add constraint request_metrics_status_nonneg_check
            check (status_2xx >= 0 and status_3xx >= 0 and status_4xx >= 0 and status_5xx >= 0);
    end if;
end $$;


-- ── RPC 1: record_error_occurrence (109 halefi) ──────────────────────────
-- Değişenler: on conflict hedefi (fingerprint, environment) · olay satırına
-- severity yazılır · title/normalized_message/module `excluded` ile TAZELENİR
-- (eski gövde onları hiç güncellemiyordu → mesaj iyileştirilse bile grup eski
-- başlığı taşıyordu). Ciddiyet yalnız-yukarı kuralı, yeniden-açılma kuralı ve
-- saatlik örnekleme tavanı 109'daki gibi KORUNDU.

create or replace function record_error_occurrence(
    p_fingerprint        text,
    p_title              text,
    p_error_type         text,
    p_normalized_message text,
    p_severity           text,
    p_module             text,
    p_endpoint           text,
    p_environment        text,
    p_occurred_at        timestamptz,
    p_request_id         text default null,
    p_method             text default null,
    p_status_code        int default null,
    p_user_id            uuid default null,
    p_user_agent         text default null,
    p_stack              text default null,
    p_context            jsonb default null,
    p_event_ttl_days     int default 30,
    p_hourly_sample_cap  int default 20
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_group_id     uuid;
    v_recent_count int;
    v_levels       text[] := array['info', 'warning', 'error', 'critical'];
begin
    insert into system_error_groups (
        fingerprint, title, error_type, normalized_message, severity,
        module, endpoint, environment, occurrence_count, first_seen_at, last_seen_at
    )
    values (
        p_fingerprint, p_title, p_error_type, p_normalized_message, p_severity,
        p_module, p_endpoint, p_environment, 1, p_occurred_at, p_occurred_at
    )
    on conflict (fingerprint, environment) do update
    set occurrence_count   = system_error_groups.occurrence_count + 1,
        last_seen_at       = greatest(system_error_groups.last_seen_at, excluded.last_seen_at),
        endpoint           = coalesce(excluded.endpoint, system_error_groups.endpoint),
        title              = excluded.title,
        normalized_message = excluded.normalized_message,
        module             = coalesce(excluded.module, system_error_groups.module),
        -- Ciddiyet yalnız YUKARI çıkar: aynı kusur bir kez critical görüldüyse
        -- sonraki hafif oluşum onu warning'e düşürmemeli.
        severity           = case
            when array_position(v_levels, excluded.severity)
               > array_position(v_levels, system_error_groups.severity)
            then excluded.severity
            else system_error_groups.severity
        end,
        -- Çözülmüş bir hata yeniden patlarsa grup yeniden açılır (regresyon
        -- sessizce "resolved" kalmasın).
        status             = case
            when system_error_groups.status = 'resolved' then 'open'
            else system_error_groups.status
        end,
        resolved_at        = case
            when system_error_groups.status = 'resolved' then null
            else system_error_groups.resolved_at
        end,
        updated_at         = now()
    returning id into v_group_id;

    -- Örnekleme tavanı (§23): aynı grup için saatte en fazla N ham olay saklanır.
    -- Üstü yalnız occurrence_count'u artırır — sayım doğru kalır, tablo şişmez.
    select count(*) into v_recent_count
    from system_error_events
    where group_id = v_group_id
      and occurred_at >= now() - interval '1 hour';

    if v_recent_count < greatest(1, p_hourly_sample_cap) then
        insert into system_error_events (
            group_id, occurred_at, severity, request_id, endpoint, method, status_code,
            user_id, environment, user_agent, stack, context, expires_at
        ) values (
            v_group_id, p_occurred_at, p_severity, p_request_id, p_endpoint, p_method,
            p_status_code, p_user_id, p_environment, p_user_agent, p_stack, p_context,
            now() + make_interval(days => greatest(1, p_event_ttl_days))
        );
    end if;

    return v_group_id;
end;
$$;

revoke all on function record_error_occurrence(
    text, text, text, text, text, text, text, text, timestamptz,
    text, text, int, uuid, text, text, jsonb, int, int
) from public, anon, authenticated;
grant execute on function record_error_occurrence(
    text, text, text, text, text, text, text, text, timestamptz,
    text, text, int, uuid, text, text, jsonb, int, int
) to service_role;


-- ── RPC 2: record_request_metrics (109 halefi) ───────────────────────────
-- D3: histogram elemanları `coalesce(..., 0)` ile okunur ve dizi uzunluğu ÖN
-- KONTROLDEN geçer. Eski gövdede 10'dan kısa bir dizi eksik indeksleri NULL
-- yapıyordu; CHECK `array_length = 10` yine geçiyordu (dizi 10 elemanlı,
-- elemanlar NULL) ve `rm.histogram[k] + excluded.histogram[k]` SQL'de
-- `NULL + n = NULL` verdiği için o kova o satırda SONSUZA DEK NULL kalıyordu.
-- Okuma tarafı bunu sessizce 0 sayıyor → p50/p95/p99 sistematik yanlış.

create or replace function record_request_metrics(
    p_rows     jsonb,
    p_ttl_days int default 30
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
    v_rows int;
begin
    -- Girdi sözleşmesi RPC sınırında doğrulanır (tek çağıran doğru üretse bile
    -- bu bir güvenlik/bütünlük sınırıdır).
    if exists (
        select 1 from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) as r
        where jsonb_typeof(r->'histogram') is distinct from 'array'
           or jsonb_array_length(r->'histogram') <> 10
    ) then
        raise exception 'record_request_metrics: histogram 10 elemanlı dizi olmalı';
    end if;

    insert into request_metrics as rm (
        bucket_at, endpoint, method, sample_count, sum_ms, max_ms,
        histogram, status_2xx, status_3xx, status_4xx, status_5xx, expires_at
    )
    select
        (r->>'bucket_at')::timestamptz,
        r->>'endpoint',
        r->>'method',
        coalesce((r->>'sample_count')::int, 0),
        coalesce((r->>'sum_ms')::bigint, 0),
        coalesce((r->>'max_ms')::int, 0),
        array[
            coalesce((r->'histogram'->>0)::int, 0), coalesce((r->'histogram'->>1)::int, 0),
            coalesce((r->'histogram'->>2)::int, 0), coalesce((r->'histogram'->>3)::int, 0),
            coalesce((r->'histogram'->>4)::int, 0), coalesce((r->'histogram'->>5)::int, 0),
            coalesce((r->'histogram'->>6)::int, 0), coalesce((r->'histogram'->>7)::int, 0),
            coalesce((r->'histogram'->>8)::int, 0), coalesce((r->'histogram'->>9)::int, 0)
        ],
        coalesce((r->>'status_2xx')::int, 0),
        coalesce((r->>'status_3xx')::int, 0),
        coalesce((r->>'status_4xx')::int, 0),
        coalesce((r->>'status_5xx')::int, 0),
        now() + make_interval(days => greatest(1, p_ttl_days))
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) as r
    on conflict (bucket_at, endpoint, method) do update
    set sample_count = rm.sample_count + excluded.sample_count,
        sum_ms       = rm.sum_ms + excluded.sum_ms,
        max_ms       = greatest(rm.max_ms, excluded.max_ms),
        -- 10 eleman sabit (check constraint) → açık toplama; döngüden okunaklı.
        histogram    = array[
            rm.histogram[1]  + excluded.histogram[1],
            rm.histogram[2]  + excluded.histogram[2],
            rm.histogram[3]  + excluded.histogram[3],
            rm.histogram[4]  + excluded.histogram[4],
            rm.histogram[5]  + excluded.histogram[5],
            rm.histogram[6]  + excluded.histogram[6],
            rm.histogram[7]  + excluded.histogram[7],
            rm.histogram[8]  + excluded.histogram[8],
            rm.histogram[9]  + excluded.histogram[9],
            rm.histogram[10] + excluded.histogram[10]
        ],
        status_2xx   = rm.status_2xx + excluded.status_2xx,
        status_3xx   = rm.status_3xx + excluded.status_3xx,
        status_4xx   = rm.status_4xx + excluded.status_4xx,
        status_5xx   = rm.status_5xx + excluded.status_5xx,
        updated_at   = now();

    get diagnostics v_rows = row_count;
    return v_rows;
end;
$$;

revoke all on function record_request_metrics(jsonb, int) from public, anon, authenticated;
grant execute on function record_request_metrics(jsonb, int) to service_role;


-- ── RPC 3: purge_telemetry (109 halefi) ──────────────────────────────────
-- D4: `open`/`investigating` durumundaki gruplar HİÇ silinmiyordu; tablonun
-- `expires_at`'i de yok. "Sonsuz büyüme yasak" sözü grup tablosu için geçerli
-- değildi. Parmak izi bileşenlerinden `topFrame` derleme çıktısına bağlı
-- olduğu için her dağıtım yeni gruplar doğurabilir.
--
-- Eklenen kol: 180 gündür GÖRÜLMEMİŞ, hiç olayı kalmamış ve bug'a bağlı
-- OLMAYAN açık gruplar. Bug'a bağlı grup hâlâ ASLA silinmez.

create or replace function purge_telemetry()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_error_events int;
    v_system_events int;
    v_metrics int;
    v_groups int;
    v_stale_groups int;
begin
    delete from system_error_events where expires_at < now();
    get diagnostics v_error_events = row_count;

    delete from system_events where expires_at < now();
    get diagnostics v_system_events = row_count;

    delete from request_metrics where expires_at < now();
    get diagnostics v_metrics = row_count;

    -- Kapatılmış, 90 gündür görülmemiş ve artık hiçbir olayı/bug bağı olmayan
    -- gruplar. Bug'a bağlı grup ASLA silinmez — takip kaydı çürümesin.
    delete from system_error_groups g
    where g.status in ('resolved', 'ignored')
      and g.last_seen_at < now() - interval '90 days'
      and not exists (select 1 from system_error_events e where e.group_id = g.id)
      and not exists (select 1 from developer_bug_errors b where b.error_group_id = g.id);
    get diagnostics v_groups = row_count;

    -- D4: uzun süredir görülmemiş AÇIK gruplar da sınırsız birikmemeli.
    delete from system_error_groups g
    where g.status in ('open', 'investigating')
      and g.last_seen_at < now() - interval '180 days'
      and not exists (select 1 from system_error_events e where e.group_id = g.id)
      and not exists (select 1 from developer_bug_errors b where b.error_group_id = g.id);
    get diagnostics v_stale_groups = row_count;

    return jsonb_build_object(
        'error_events',    v_error_events,
        'system_events',   v_system_events,
        'request_metrics', v_metrics,
        'error_groups',    v_groups + v_stale_groups
    );
end;
$$;

revoke all on function purge_telemetry() from public, anon, authenticated;
grant execute on function purge_telemetry() to service_role;


-- ============================================================
-- DOĞRULAMA (uyguladıktan sonra):
--
--   -- 1) grup anahtarı ortam içeriyor
--   select indexdef from pg_indexes where indexname = 'uq_error_groups_fingerprint_env';
--   -- 2) olay bazlı ciddiyet kolonu
--   select column_name, is_nullable from information_schema.columns
--    where table_name = 'system_error_events' and column_name = 'severity';
--   -- 3) DEFINER hijyeni (üçü de false dönmeli)
--   select p.proname,
--          has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
--          has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and p.proname in ('record_error_occurrence','record_request_metrics','purge_telemetry');
--
-- ROLLBACK:
--   drop index if exists uq_error_groups_fingerprint_env;
--   alter table system_error_groups add constraint system_error_groups_fingerprint_key unique (fingerprint);
--   alter table system_error_events drop column if exists severity;
--   -- RPC'ler için 109'daki gövdeleri yeniden çalıştırın.
-- ============================================================
