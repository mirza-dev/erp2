-- ============================================================
-- Migration 045: user_notification_preferences + user-avatars storage
-- ============================================================

-- Per-user bildirim kanal tercihleri (e-posta + tarayıcı toggles)
-- notification_type: stock_critical | order_pending | order_new | sync_error | order_shipped
create table if not exists user_notification_preferences (
    id                uuid primary key default gen_random_uuid(),
    user_id           uuid not null references auth.users(id) on delete cascade,
    notification_type text not null,
    email_enabled     boolean not null default true,
    browser_enabled   boolean not null default true,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now(),
    unique (user_id, notification_type)
);

create index if not exists ix_unp_user_id on user_notification_preferences(user_id);

alter table user_notification_preferences enable row level security;

create policy "service_user_notification_preferences_all" on user_notification_preferences
    for all using (auth.role() = 'service_role');

-- ── Supabase Storage bucket: user-avatars ────────────────────
-- Public bucket: avatar URL doğrudan <img src> olarak kullanılabilir
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'user-avatars',
    'user-avatars',
    true,
    1048576,  -- 1MB
    array['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp']
)
on conflict (id) do nothing;

create policy "user_avatars_service_all" on storage.objects
    for all
    using (bucket_id = 'user-avatars' and auth.role() = 'service_role');
