-- ============================================================
-- Migration 010: AI Recommendations + Feedback tables
-- Implements domain-rules.md §11.4 accept/edit/reject lifecycle
-- ============================================================

-- ai_recommendations: Kullanıcıya gösterilen her AI önerisini izler
create table ai_recommendations (
    id                  uuid default gen_random_uuid() primary key,
    entity_type         text not null,                 -- 'product', 'order'
    entity_id           text not null,                 -- entity UUID as text
    recommendation_type text not null
        check (recommendation_type in ('purchase_suggestion','stock_risk','order_risk')),
    title               text not null,
    body                text,
    confidence          numeric(5,2),
    severity            text not null default 'info'
        check (severity in ('critical','warning','info')),
    status              text not null default 'suggested'
        check (status in ('suggested','accepted','edited','rejected','expired')),
    model_version       text,
    metadata            jsonb,                         -- tip-bazlı payload (suggestQty, urgencyLevel, vb.)
    edited_metadata     jsonb,                         -- kullanıcı değişiklikleri (sadece edited durumda)
    decided_at          timestamptz,
    expired_at          timestamptz,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);

-- ai_feedback: Kullanıcı kararlarını kaydeder
create table ai_feedback (
    id                  uuid default gen_random_uuid() primary key,
    recommendation_id   uuid not null references ai_recommendations(id) on delete cascade,
    feedback_type       text not null
        check (feedback_type in ('accepted','edited','rejected','note')),
    feedback_note       text,
    edited_values       jsonb,
    actor               text,
    created_at          timestamptz not null default now()
);

-- Dedup: aynı entity+type için en fazla 1 aktif "suggested" öneri
-- Kullanıcı kabul/reddet yaptıktan sonra yeni "suggested" satırı eklenebilir
create unique index idx_recs_active_unique
    on ai_recommendations (entity_type, entity_id, recommendation_type)
    where status = 'suggested';

create index idx_recs_entity on ai_recommendations (entity_type, entity_id);
create index idx_recs_status on ai_recommendations (status);
create index idx_feedback_rec on ai_feedback (recommendation_id);

create trigger trg_ai_recommendations_updated_at
    before update on ai_recommendations
    for each row execute function update_updated_at();
