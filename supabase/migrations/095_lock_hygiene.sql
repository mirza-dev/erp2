-- ============================================================================
-- Migration 095 — SECURITY DEFINER hijyeni: 019 lock RPC'leri + 016 health probe
--                  (denetim Y7, 2026-06)
-- ============================================================================
-- Bulgu: 019'un 4 advisory-lock fonksiyonu ve 016'nın health probe'u
-- SECURITY DEFINER olduğu hâlde `SET search_path` ve REVOKE/GRANT içermiyordu:
--  - Authenticated HERKES EXECUTE edebiliyordu → herhangi bir oturum scan/AI
--    kilidini tutup cron taramalarını süresiz engelleyebilir (DoS).
--  - search_path sabitlenmemiş DEFINER = şema-gölgeleme vektörü.
-- Düzeltme: gövdeler BİREBİR aynı; yalnız `SET search_path` + REVOKE +
-- GRANT service_role eklenir (039/054/087 kalıbı). Tüm çağıranlar zaten
-- service-role client kullanıyor (alert-scan + ai-suggest route'ları) →
-- davranış değişikliği yok.
-- Not: pg_try_advisory_lock SESSION-level kalır (acquire/release ayrı
-- istek/transaction'larda — xact-lock bu akışta kullanılamaz; release her
-- iki route'ta finally ile garanti).
-- ============================================================================

CREATE OR REPLACE FUNCTION try_acquire_scan_lock()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
    SELECT pg_try_advisory_lock(hashtext('alert_scan'));
$$;

CREATE OR REPLACE FUNCTION release_scan_lock()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
    PERFORM pg_advisory_unlock(hashtext('alert_scan'));
END;
$$;

CREATE OR REPLACE FUNCTION try_acquire_ai_suggest_lock()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
    SELECT pg_try_advisory_lock(hashtext('ai_suggest'));
$$;

CREATE OR REPLACE FUNCTION release_ai_suggest_lock()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
    PERFORM pg_advisory_unlock(hashtext('ai_suggest'));
END;
$$;

CREATE OR REPLACE FUNCTION check_migration_011_applied()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT COALESCE(
    (
      SELECT prosrc LIKE '%FIX: was p_order_id::text%'
      FROM   pg_proc
      WHERE  proname        = 'ship_order_full'
        AND  pronamespace   = 'public'::regnamespace
    ),
    false
  );
$$;

REVOKE ALL ON FUNCTION try_acquire_scan_lock() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION release_scan_lock() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION try_acquire_ai_suggest_lock() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION release_ai_suggest_lock() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION check_migration_011_applied() FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION try_acquire_scan_lock() TO service_role;
GRANT EXECUTE ON FUNCTION release_scan_lock() TO service_role;
GRANT EXECUTE ON FUNCTION try_acquire_ai_suggest_lock() TO service_role;
GRANT EXECUTE ON FUNCTION release_ai_suggest_lock() TO service_role;
GRANT EXECUTE ON FUNCTION check_migration_011_applied() TO service_role;

-- ROLLBACK: 019 ve 016'daki orijinal CREATE OR REPLACE bloklarını yeniden
-- çalıştır (search_path'siz) + GRANT'ları geri al.
