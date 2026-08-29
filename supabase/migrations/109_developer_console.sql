-- ============================================================
-- Migration 109: Developer Console / System Health telemetry
-- ============================================================
--
-- ERP'nin üstüne eklenen observability katmanı. Tasarım kısıtları:
--   · İş tablolarına DOKUNULMAZ — yalnız yeni tablolar eklenir.
--   · Tüm erişim service_role üzerinden (API katmanı internalOperator ile korur),
--     bu yüzden RLS açık + yalnız service_role policy'si (097 kalıbı).
--   · Sonsuz büyüme yasak: her olay tablosunda `expires_at` + purge fonksiyonu
--     (096'nın email_logs.body_expires_at kalıbı).
--   · Hata kaydı TEK RPC ile atomik: grup upsert + örnekleme tavanlı olay
--     insert'i aynı transaction'da (yarış koşulu ve 3 round-trip yok).

-- ── 1. Hata grupları (fingerprint bazlı) ─────────────────────────────────

create table if not exists system_error_groups (
    id                 uuid primary key default gen_random_uuid(),
    fingerprint        text not null unique,
    title              text not null,
    error_type         text,
    normalized_message text not null,
    severity           text not null default 'error'
                       check (severity in ('info', 'warning', 'error', 'critical')),
    module             text,
    endpoint           text,
    environment        text not null default 'development',
    status             text not null default 'open'
                       check (status in ('open', 'investigating', 'ignored', 'resolved')),
    occurrence_count   bigint not null default 0 check (occurrence_count >= 0),
    first_seen_at      timestamptz not null default now(),
    last_seen_at       timestamptz not null default now(),
    resolved_at        timestamptz,
    resolved_by        uuid references auth.users(id) on delete set null,
    updated_at         timestamptz not null default now()
);

create index if not exists ix_error_groups_last_seen
    on system_error_groups(last_seen_at desc);
create index if not exists ix_error_groups_open
    on system_error_groups(severity, last_seen_at desc)
    where status = 'open';
create index if not exists ix_error_groups_module
    on system_error_groups(module, last_seen_at desc);
create index if not exists ix_error_groups_env
    on system_error_groups(environment, last_seen_at desc);

alter table system_error_groups enable row level security;
drop policy if exists "service_system_error_groups_all" on system_error_groups;
create policy "service_system_error_groups_all" on system_error_groups
    for all using (auth.role() = 'service_role');

-- ── 2. Tekil hata oluşumları (örneklenmiş) ───────────────────────────────

create table if not exists system_error_events (
    id           uuid primary key default gen_random_uuid(),
    group_id     uuid not null references system_error_groups(id) on delete cascade,
    occurred_at  timestamptz not null default now(),
    request_id   text,
    endpoint     text,
    method       text,
    status_code  int,
    user_id      uuid references auth.users(id) on delete set null,
    environment  text not null default 'development',
    user_agent   text,
    stack        text,
    context      jsonb,
    expires_at   timestamptz not null default (now() + interval '30 days')
);

create index if not exists ix_error_events_group
    on system_error_events(group_id, occurred_at desc);
create index if not exists ix_error_events_occurred
    on system_error_events(occurred_at desc);
create index if not exists ix_error_events_request
    on system_error_events(request_id)
    where request_id is not null;
create index if not exists ix_error_events_expiry
    on system_error_events(expires_at);

alter table system_error_events enable row level security;
drop policy if exists "service_system_error_events_all" on system_error_events;
create policy "service_system_error_events_all" on system_error_events
    for all using (auth.role() = 'service_role');

-- ── 3. Genel olay akışı ──────────────────────────────────────────────────
-- Yalnız telemetrinin KENDİ ürettikleri (yavaş istek, retention turu,
-- telemetri arızası). ERP'nin iş olayları zaten audit_log /
-- integration_sync_logs / email_logs'ta; onlar KOPYALANMAZ, Kayıtlar ekranı
-- okurken birleştirir.

create table if not exists system_events (
    id          uuid primary key default gen_random_uuid(),
    occurred_at timestamptz not null default now(),
    level       text not null default 'info'
                check (level in ('info', 'warning', 'error', 'critical')),
    message     text not null,
    module      text,
    endpoint    text,
    request_id  text,
    user_id     uuid references auth.users(id) on delete set null,
    environment text not null default 'development',
    context     jsonb,
    expires_at  timestamptz not null default (now() + interval '14 days')
);

create index if not exists ix_system_events_occurred
    on system_events(occurred_at desc);
create index if not exists ix_system_events_level
    on system_events(level, occurred_at desc);
create index if not exists ix_system_events_request
    on system_events(request_id)
    where request_id is not null;
create index if not exists ix_system_events_expiry
    on system_events(expires_at);

alter table system_events enable row level security;
drop policy if exists "service_system_events_all" on system_events;
create policy "service_system_events_all" on system_events
    for all using (auth.role() = 'service_role');

-- ── 4. Bug takibi (developer tarafından yönetilen) ───────────────────────
-- Error = sistemin ürettiği teknik olay. Bug = geliştiricinin takip ettiği
-- problem. İkisi ayrı tablodur; bağ 5. tabloda.

create table if not exists developer_bugs (
    id               uuid primary key default gen_random_uuid(),
    title            text not null check (length(btrim(title)) > 0),
    description      text,
    status           text not null default 'open'
                     check (status in ('open', 'investigating', 'in_progress', 'fixed', 'closed', 'ignored')),
    priority         text not null default 'medium'
                     check (priority in ('low', 'medium', 'high', 'critical')),
    developer_notes  text,
    created_by       uuid references auth.users(id) on delete set null,
    assigned_to      uuid references auth.users(id) on delete set null,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now(),
    closed_at        timestamptz
);

create index if not exists ix_developer_bugs_status
    on developer_bugs(status, created_at desc);
create index if not exists ix_developer_bugs_priority
    on developer_bugs(priority, created_at desc);

alter table developer_bugs enable row level security;
drop policy if exists "service_developer_bugs_all" on developer_bugs;
create policy "service_developer_bugs_all" on developer_bugs
    for all using (auth.role() = 'service_role');

-- ── 5. Bug ↔ hata grubu bağı ─────────────────────────────────────────────
-- Dizi kolonu yerine join tablosu: retention bir grubu silerse bağ FK cascade
-- ile kendini temizler; dizi olsaydı sessizce çürük id taşırdı.

create table if not exists developer_bug_errors (
    bug_id         uuid not null references developer_bugs(id) on delete cascade,
    error_group_id uuid not null references system_error_groups(id) on delete cascade,
    linked_at      timestamptz not null default now(),
    primary key (bug_id, error_group_id)
);

create index if not exists ix_bug_errors_group
    on developer_bug_errors(error_group_id);

alter table developer_bug_errors enable row level security;
drop policy if exists "service_developer_bug_errors_all" on developer_bug_errors;
create policy "service_developer_bug_errors_all" on developer_bug_errors
    for all using (auth.role() = 'service_role');

-- ── 6. İstek metrikleri (saatlik kova) ───────────────────────────────────
-- Ham örnek SAKLANMAZ. Endpoint × method × saat başına tek satır; süre
-- dağılımı 10 sabit kovalı histogramda tutulur (p50/p95/p99 buradan türer).
-- Büyüme: aktif endpoint sayısı × 24 satır/gün.

create table if not exists request_metrics (
    id           uuid primary key default gen_random_uuid(),
    bucket_at    timestamptz not null,
    endpoint     text not null,
    method       text not null,
    sample_count int not null default 0 check (sample_count >= 0),
    sum_ms       bigint not null default 0 check (sum_ms >= 0),
    max_ms       int not null default 0 check (max_ms >= 0),
    histogram    int[] not null default array[0,0,0,0,0,0,0,0,0,0]
                 check (array_length(histogram, 1) = 10),
    status_2xx   int not null default 0,
    status_3xx   int not null default 0,
    status_4xx   int not null default 0,
    status_5xx   int not null default 0,
    expires_at   timestamptz not null default (now() + interval '30 days'),
    updated_at   timestamptz not null default now(),
    unique (bucket_at, endpoint, method)
);

create index if not exists ix_request_metrics_bucket
    on request_metrics(bucket_at desc);
create index if not exists ix_request_metrics_expiry
    on request_metrics(expires_at);

alter table request_metrics enable row level security;
drop policy if exists "service_request_metrics_all" on request_metrics;
create policy "service_request_metrics_all" on request_metrics
    for all using (auth.role() = 'service_role');

-- ── RPC 1: hata oluşumu kaydı (atomik) ───────────────────────────────────

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
    on conflict (fingerprint) do update
    set occurrence_count = system_error_groups.occurrence_count + 1,
        last_seen_at     = greatest(system_error_groups.last_seen_at, excluded.last_seen_at),
        endpoint         = coalesce(excluded.endpoint, system_error_groups.endpoint),
        -- Ciddiyet yalnız YUKARI çıkar: aynı kusur bir kez critical görüldüyse
        -- sonraki hafif oluşum onu warning'e düşürmemeli.
        severity         = case
            when array_position(v_levels, excluded.severity)
               > array_position(v_levels, system_error_groups.severity)
            then excluded.severity
            else system_error_groups.severity
        end,
        -- Çözülmüş bir hata yeniden patlarsa grup yeniden açılır (regresyon
        -- sessizce "resolved" kalmasın).
        status           = case
            when system_error_groups.status = 'resolved' then 'open'
            else system_error_groups.status
        end,
        resolved_at      = case
            when system_error_groups.status = 'resolved' then null
            else system_error_groups.resolved_at
        end,
        updated_at       = now()
    returning id into v_group_id;

    -- Örnekleme tavanı (§23): aynı grup için saatte en fazla N ham olay saklanır.
    -- Üstü yalnız occurrence_count'u artırır — sayım doğru kalır, tablo şişmez.
    select count(*) into v_recent_count
    from system_error_events
    where group_id = v_group_id
      and occurred_at >= now() - interval '1 hour';

    if v_recent_count < greatest(1, p_hourly_sample_cap) then
        insert into system_error_events (
            group_id, occurred_at, request_id, endpoint, method, status_code,
            user_id, environment, user_agent, stack, context, expires_at
        ) values (
            v_group_id, p_occurred_at, p_request_id, p_endpoint, p_method, p_status_code,
            p_user_id, p_environment, p_user_agent, p_stack, p_context,
            now() + make_interval(days => greatest(1, p_event_ttl_days))
        );
    end if;

    return v_group_id;
end;
$$;

revoke all on function record_error_occurrence(
    text, text, text, text, text, text, text, text, timestamptz,
    text, text, int, uuid, text, text, jsonb, int, int
) from public;
grant execute on function record_error_occurrence(
    text, text, text, text, text, text, text, text, timestamptz,
    text, text, int, uuid, text, text, jsonb, int, int
) to service_role;

-- ── RPC 2: istek metriği toplama ─────────────────────────────────────────
-- Kova sınırları TS tarafında (`src/lib/telemetry/endpoint.ts`) tanımlı ve
-- histogram oraya göre hazır gelir; burası yalnız ATOMİK TOPLAYICI.
-- Böylece kova tanımı tek yerde kalır ve testlenebilir.

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
    insert into request_metrics as rm (
        bucket_at, endpoint, method, sample_count, sum_ms, max_ms,
        histogram, status_2xx, status_3xx, status_4xx, status_5xx, expires_at
    )
    select
        (r->>'bucket_at')::timestamptz,
        r->>'endpoint',
        r->>'method',
        (r->>'sample_count')::int,
        (r->>'sum_ms')::bigint,
        (r->>'max_ms')::int,
        array[
            (r->'histogram'->>0)::int, (r->'histogram'->>1)::int,
            (r->'histogram'->>2)::int, (r->'histogram'->>3)::int,
            (r->'histogram'->>4)::int, (r->'histogram'->>5)::int,
            (r->'histogram'->>6)::int, (r->'histogram'->>7)::int,
            (r->'histogram'->>8)::int, (r->'histogram'->>9)::int
        ],
        (r->>'status_2xx')::int,
        (r->>'status_3xx')::int,
        (r->>'status_4xx')::int,
        (r->>'status_5xx')::int,
        now() + make_interval(days => greatest(1, p_ttl_days))
    from jsonb_array_elements(p_rows) as r
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

revoke all on function record_request_metrics(jsonb, int) from public;
grant execute on function record_request_metrics(jsonb, int) to service_role;

-- ── RPC 3: retention temizliği ───────────────────────────────────────────

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

    return jsonb_build_object(
        'error_events',   v_error_events,
        'system_events',  v_system_events,
        'request_metrics', v_metrics,
        'error_groups',   v_groups
    );
end;
$$;

revoke all on function purge_telemetry() from public;
grant execute on function purge_telemetry() to service_role;

-- ── Yorumlar ─────────────────────────────────────────────────────────────

comment on table system_error_groups is
    'Fingerprint bazlı hata grupları; occurrence_count tüm oluşumları sayar (örneklenen olay sayısından fazla olabilir).';
comment on table system_error_events is
    'Örneklenmiş tekil hata oluşumları; expires_at ile retention. Ham gövde/PII yazılmaz (redaction API katmanında).';
comment on table system_events is
    'Telemetrinin kendi ürettiği olaylar. ERP iş olayları audit_log/integration_sync_logs/email_logs''ta kalır, kopyalanmaz.';
comment on table request_metrics is
    'Saatlik kova; süre dağılımı 10 sabit kovalı histogramda. Ham istek örneği saklanmaz.';
comment on column request_metrics.histogram is
    'Kova üst sınırları (ms): 50,100,200,400,800,1600,3200,6400,12800,+sonsuz — src/lib/telemetry/endpoint.ts ile birebir.';
