-- ============================================================
-- Migration 097: reliable internal-email outbox + delivery state
-- ============================================================

create table if not exists notification_outbox (
    id                uuid primary key default gen_random_uuid(),
    event_key         text not null unique,
    notification_type text not null check (notification_type in (
        'stock_critical', 'order_pending', 'sync_error', 'order_shipped'
    )),
    entity_type       text,
    entity_id         text,
    render_payload    jsonb not null,
    actor_user_id     uuid references auth.users(id) on delete set null,
    actor_label       text,
    status            text not null default 'queued' check (status in (
        'queued', 'processing', 'waiting_config', 'failed', 'completed'
    )),
    attempt_count     int not null default 0 check (attempt_count >= 0),
    next_attempt_at   timestamptz not null default now(),
    locked_at         timestamptz,
    locked_by         text,
    last_error        text,
    completed_at      timestamptz,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now()
);

create index if not exists ix_notification_outbox_ready
    on notification_outbox(status, next_attempt_at, created_at)
    where status in ('queued', 'waiting_config', 'failed');

-- order_new artık gerçek bir olay değildir; taslak sipariş e-posta üretmez.
-- Geçmiş email_logs audit kayıtları korunur, yalnız işlevsiz kullanıcı tercihleri temizlenir.
delete from user_notification_preferences
where notification_type = 'order_new';

alter table notification_outbox enable row level security;
drop policy if exists "service_notification_outbox_all" on notification_outbox;
create policy "service_notification_outbox_all" on notification_outbox
    for all using (auth.role() = 'service_role');

create table if not exists email_suppressions (
    id                uuid primary key default gen_random_uuid(),
    recipient_email   text not null,
    scope_key         text not null default '*',
    reason            text not null check (reason in ('hard_bounce', 'complaint')),
    active            boolean not null default true,
    source_email_log_id uuid references email_logs(id) on delete set null,
    created_at        timestamptz not null default now(),
    resolved_at       timestamptz,
    resolved_by       uuid references auth.users(id) on delete set null,
    unique (recipient_email, scope_key)
);

create index if not exists ix_email_suppressions_active
    on email_suppressions(recipient_email, scope_key)
    where active = true;

alter table email_suppressions enable row level security;
drop policy if exists "service_email_suppressions_all" on email_suppressions;
create policy "service_email_suppressions_all" on email_suppressions
    for all using (auth.role() = 'service_role');

create table if not exists resend_webhook_events (
    svix_id           text primary key,
    event_type        text not null,
    provider_event_at timestamptz,
    created_at        timestamptz not null default now()
);

alter table resend_webhook_events enable row level security;
drop policy if exists "service_resend_webhook_events_all" on resend_webhook_events;
create policy "service_resend_webhook_events_all" on resend_webhook_events
    for all using (auth.role() = 'service_role');

create table if not exists maintenance_incidents (
    id                uuid primary key default gen_random_uuid(),
    incident_key      text not null unique,
    kind              text not null check (kind in ('email_config', 'email_retry_exhausted')),
    severity          text not null default 'warning' check (severity in ('warning', 'critical')),
    status            text not null default 'open' check (status in ('open', 'resolved')),
    title             text not null,
    description       text,
    metadata          jsonb,
    opened_at         timestamptz not null default now(),
    resolved_at       timestamptz,
    resolved_by       uuid references auth.users(id) on delete set null,
    updated_at        timestamptz not null default now()
);

create index if not exists ix_maintenance_incidents_open
    on maintenance_incidents(opened_at desc)
    where status = 'open';

alter table maintenance_incidents enable row level security;
drop policy if exists "service_maintenance_incidents_all" on maintenance_incidents;
create policy "service_maintenance_incidents_all" on maintenance_incidents
    for all using (auth.role() = 'service_role');

alter table email_logs
    add column if not exists outbox_id uuid references notification_outbox(id) on delete set null,
    add column if not exists resend_message_id text,
    add column if not exists delivery_status text not null default 'queued',
    add column if not exists provider_event_at timestamptz,
    add column if not exists delivered_at timestamptz,
    add column if not exists bounced_at timestamptz,
    add column if not exists complained_at timestamptz;

update email_logs
set resend_message_id = metadata->>'resend_message_id'
where resend_message_id is null
  and metadata ? 'resend_message_id';

update email_logs
set delivery_status = case
    when status = 'sent' then 'accepted'
    when status = 'failed' then 'failed'
    else 'queued'
end
where delivery_status = 'queued';

alter table email_logs drop constraint if exists email_logs_delivery_status_check;
alter table email_logs add constraint email_logs_delivery_status_check check (
    delivery_status in (
        'queued', 'accepted', 'delivered', 'failed',
        'bounced', 'complained', 'suppressed'
    )
);

create unique index if not exists ux_email_logs_outbox_recipient
    on email_logs(outbox_id, user_id)
    where outbox_id is not null;

create index if not exists ix_email_logs_resend_message
    on email_logs(resend_message_id)
    where resend_message_id is not null;

create index if not exists ix_email_logs_delivery_created
    on email_logs(delivery_status, created_at desc);

create or replace function claim_notification_outbox(
    p_worker_id text,
    p_limit int default 20,
    p_lease_seconds int default 120,
    p_only_id uuid default null
)
returns setof notification_outbox
language sql
security definer
set search_path = public
as $$
    with picked as (
        select o.id
        from notification_outbox o
        where o.status in ('queued', 'waiting_config', 'failed')
          and o.attempt_count < 3
          and o.next_attempt_at <= now()
          and (p_only_id is null or o.id = p_only_id)
          and (o.locked_at is null or o.locked_at < now() - make_interval(secs => p_lease_seconds))
        order by o.created_at asc
        for update skip locked
        limit greatest(1, least(p_limit, 100))
    )
    update notification_outbox o
    set status = 'processing',
        locked_at = now(),
        locked_by = p_worker_id,
        updated_at = now()
    from picked
    where o.id = picked.id
    returning o.*;
$$;

revoke all on function claim_notification_outbox(text, int, int, uuid) from public;
grant execute on function claim_notification_outbox(text, int, int, uuid) to service_role;

create or replace function update_email_delivery_from_provider(
    p_email_log_id uuid,
    p_delivery_status text,
    p_provider_event_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    v_current email_logs%rowtype;
    v_current_rank int;
    v_next_rank int;
begin
    if p_delivery_status not in (
        'queued', 'accepted', 'delivered', 'failed',
        'bounced', 'complained', 'suppressed'
    ) then
        raise exception using errcode = '22023', message = 'invalid email delivery status';
    end if;

    select *
    into v_current
    from email_logs
    where id = p_email_log_id
    for update;

    if not found then
        return false;
    end if;

    v_current_rank := case v_current.delivery_status
        when 'queued' then 0
        when 'accepted' then 1
        when 'failed' then 2
        when 'delivered' then 3
        when 'bounced' then 4
        when 'complained' then 5
        when 'suppressed' then 6
        else 0
    end;
    v_next_rank := case p_delivery_status
        when 'queued' then 0
        when 'accepted' then 1
        when 'failed' then 2
        when 'delivered' then 3
        when 'bounced' then 4
        when 'complained' then 5
        when 'suppressed' then 6
    end;

    if v_next_rank < v_current_rank then
        return false;
    end if;
    if v_next_rank = v_current_rank
       and v_current.provider_event_at is not null
       and v_current.provider_event_at > p_provider_event_at then
        return false;
    end if;

    update email_logs
    set delivery_status = p_delivery_status,
        provider_event_at = p_provider_event_at,
        delivered_at = case when p_delivery_status = 'delivered' then p_provider_event_at else delivered_at end,
        bounced_at = case when p_delivery_status = 'bounced' then p_provider_event_at else bounced_at end,
        complained_at = case when p_delivery_status = 'complained' then p_provider_event_at else complained_at end
    where id = p_email_log_id;

    return true;
end;
$$;

revoke all on function update_email_delivery_from_provider(uuid, text, timestamptz) from public;
grant execute on function update_email_delivery_from_provider(uuid, text, timestamptz) to service_role;

comment on table notification_outbox is
    'Internal notification events; recipient delivery is materialized in email_logs.';
comment on table email_suppressions is
    'Global hard-bounce (*) or notification-type complaint suppression.';
