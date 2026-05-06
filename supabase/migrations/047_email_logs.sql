-- ============================================================
-- Migration 047: email_logs (bildirim e-posta gönderim audit'i)
-- ============================================================
-- Resend üzerinden gönderilen bildirim e-postalarının kaydı.
-- - Dedup penceresi (entity_type, entity_id, notification_type, user_id) son N saat
-- - Retry mekanizması: status='failed' + attempt_count<3 olanlar retry CRON ile yeniden denenir
-- - Audit / debug için: hangi user'a hangi konuda hangi tetikten gitmiş

create table if not exists email_logs (
    id                uuid primary key default gen_random_uuid(),
    user_id           uuid not null references auth.users(id) on delete cascade,
    notification_type text not null,
    entity_type       text,                  -- 'product' | 'sales_order' | null
    entity_id         uuid,                  -- ilgili kaynağın id'si (dedup anahtarı)
    recipient_email   text not null,
    subject           text not null,
    status            text not null check (status in ('pending', 'sent', 'failed')),
    error_message     text,
    attempt_count     int  not null default 0,
    last_attempt_at   timestamptz,
    sent_at           timestamptz,
    metadata          jsonb,                 -- { resend_message_id, ... }
    created_at        timestamptz not null default now()
);

-- Retry CRON için: failed + son N saat
create index if not exists ix_email_logs_status_attempt
    on email_logs(status, last_attempt_at)
    where status in ('pending', 'failed');

-- Dedup look-up için: aynı user'a aynı entity için aynı tipte son N saatte e-posta gitti mi
create index if not exists ix_email_logs_dedup
    on email_logs(user_id, notification_type, entity_type, entity_id, created_at desc);

alter table email_logs enable row level security;

create policy "service_email_logs_all" on email_logs
    for all using (auth.role() = 'service_role');
