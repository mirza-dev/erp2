-- ============================================================
-- Migration 033: company_settings + company-assets storage bucket
-- ============================================================

-- Firma ayarları tablosu (singleton — sadece bir satır)
create table company_settings (
    id          uuid        default gen_random_uuid() primary key,
    name        text        not null default '',
    tax_office  text        not null default '',
    tax_no      text        not null default '',
    address     text        not null default '',
    phone       text        not null default '',
    email       text        not null default '',
    website     text        not null default '',
    logo_url    text,
    currency    char(3)     not null default 'USD',
    updated_at  timestamptz not null default now()
);

-- Singleton garantisi: tabloda yalnızca bir satır olabilir
create unique index company_settings_singleton on company_settings ((true));

-- RLS
alter table company_settings enable row level security;

create policy "service_company_settings_all" on company_settings
    for all using (auth.role() = 'service_role');

-- Default boş satır (upsert pattern için gerekli)
insert into company_settings (name) values ('') on conflict do nothing;

-- ── Supabase Storage bucket ──────────────────────────────────
-- Public bucket: logo URL doğrudan <img src> olarak kullanılabilir
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'company-assets',
    'company-assets',
    true,
    2097152,  -- 2MB
    array['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp']
)
on conflict (id) do nothing;

-- Storage RLS: sadece service role yazabilir, public bucket olduğu için okuma açık
create policy "company_assets_service_all" on storage.objects
    for all
    using (bucket_id = 'company-assets' and auth.role() = 'service_role');
