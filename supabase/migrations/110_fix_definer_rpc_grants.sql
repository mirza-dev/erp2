-- ============================================================
-- 110 — GÜVENLİK: SECURITY DEFINER RPC'lerinde anon/authenticated EXECUTE kapatma
--
-- SORUN (canlıda doğrulandı, 2026-08-30):
--   Supabase projelerinde `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON FUNCTIONS
--   TO postgres, anon, authenticated, service_role` varsayılanı, yeni oluşturulan
--   her fonksiyona anon/authenticated için DOĞRUDAN EXECUTE grant'i verir.
--   `REVOKE ALL ON FUNCTION ... FROM public` bu DOĞRUDAN grant'leri KALDIRMAZ —
--   yalnız PUBLIC pseudo-rolünün grant'ini kaldırır.
--
--   Bu fonksiyonlar SECURITY DEFINER olduğu için çağıranın RLS'ine değil,
--   fonksiyon sahibinin haklarına tabidir → tabloların `service_role`-only
--   policy'leri bu yolda hiç devreye girmez.
--
-- KANIT (A/B, salt-okunur probe):
--   POST /rest/v1/rpc/record_request_metrics {"p_rows": []}   anon key → HTTP 200 (çalıştı)
--   POST /rest/v1/rpc/dashboard_monthly_cogs {"p_start": ...} anon key → HTTP 401
--       {"code":"42501","message":"permission denied for function ..."}
--   Tek fark: 087 `from public, anon, authenticated` revoke ediyor, 109 yalnız `from public`.
--   NEXT_PUBLIC_SUPABASE_ANON_KEY tanımı gereği tarayıcı bundle'ındadır = herkese açıktır.
--
-- ETKİ (düzeltme öncesi):
--   · purge_telemetry()                    → oturumsuz saldırgan hata kanıtlarını SİLER
--   · record_error_occurrence(...)         → redaksiyonu ve boyut tavanlarını atlayarak yazma
--   · record_request_metrics(...)          → sahte metrik, sınırsız satır (depolama DoS)
--   · claim_notification_outbox(...)       → bildirim lease'lerini çalma → sessiz teslimat DoS
--   · update_email_delivery_from_provider  → e-posta teslimat durumunu sahteleme (denetim izi bozulur)
--
-- Emsal: 055_revoke_ai_feedback_rpc_authenticated.sql — proje bu tuzağı bir kez yedi.
-- Repo standardı `FROM public, anon, authenticated` (087/088/095/099/107/039 …).
--
-- İDEMPOTENT: REVOKE zaten kaldırılmış bir hak için de hatasız çalışır.
-- ============================================================

-- ── 109: Developer Console telemetri RPC'leri ────────────────────────────
revoke all on function record_error_occurrence(
    text, text, text, text, text, text, text, text, timestamptz,
    text, text, int, uuid, text, text, jsonb, int, int
) from public, anon, authenticated;

revoke all on function record_request_metrics(jsonb, int)
    from public, anon, authenticated;

revoke all on function purge_telemetry()
    from public, anon, authenticated;

-- ── 097: dahili e-posta kuyruğu (aynı sapma, ZATEN UYGULANMIŞ) ───────────
revoke all on function claim_notification_outbox(text, int, int, uuid)
    from public, anon, authenticated;

revoke all on function update_email_delivery_from_provider(uuid, text, timestamptz)
    from public, anon, authenticated;

-- ── service_role grant'leri korunur (REVOKE üstüne yeniden yazılır) ──────
grant execute on function record_error_occurrence(
    text, text, text, text, text, text, text, text, timestamptz,
    text, text, int, uuid, text, text, jsonb, int, int
) to service_role;
grant execute on function record_request_metrics(jsonb, int)              to service_role;
grant execute on function purge_telemetry()                               to service_role;
grant execute on function claim_notification_outbox(text, int, int, uuid)  to service_role;
grant execute on function update_email_delivery_from_provider(uuid, text, timestamptz) to service_role;

-- ============================================================
-- DOĞRULAMA (uyguladıktan sonra çalıştır — hepsi false dönmeli):
--
--   select p.proname,
--          has_function_privilege('anon',          p.oid, 'EXECUTE') as anon_exec,
--          has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--     and p.proname in ('purge_telemetry','record_error_occurrence','record_request_metrics',
--                       'claim_notification_outbox','update_email_delivery_from_provider');
--
-- ROLLBACK (gerekmez; bu migration yalnız fazla hakkı kaldırır):
--   grant execute on function <fn> to authenticated;
-- ============================================================
