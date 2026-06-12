-- ============================================================
-- Migration 096: email retry body snapshots
-- ============================================================
-- İç operasyon e-postaları başarısız olduğunda aynı HTML/text gövdesiyle
-- yeniden gönderilebilsin. Snapshot'lar kısa ömürlüdür; servis başarılı
-- gönderimde, retry hakkı bitince veya 24 saat dolunca gövdeleri temizler.

alter table email_logs
    add column if not exists html_body text,
    add column if not exists text_body text,
    add column if not exists body_expires_at timestamptz;

create index if not exists ix_email_logs_body_expiry
    on email_logs(body_expires_at)
    where body_expires_at is not null;

comment on column email_logs.html_body is
    'Short-lived internal notification HTML snapshot used only for retry.';
comment on column email_logs.text_body is
    'Short-lived internal notification plain-text snapshot used only for retry.';
comment on column email_logs.body_expires_at is
    'Expiry time for retry body snapshots; body is cleared after success/expiry/max attempts.';

