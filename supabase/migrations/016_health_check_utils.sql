-- 016_health_check_utils.sql
-- Health check diagnostic helper for /api/health.
--
-- Exposes a single boolean probe that verifies whether the
-- ship_order_full UUID fix from migration 011 is actually in place.
--
-- Background: 007 introduced ship_order_full with a p_order_id::text cast
-- in an INSERT into inventory_movements.reference_id (uuid column).
-- 011 fixed this via CREATE OR REPLACE FUNCTION, keeping the same
-- function signature. A nil-UUID health probe cannot distinguish the
-- two versions because the function returns early ("Sipariş bulunamadı")
-- before reaching the buggy INSERT.
--
-- This function inspects pg_proc.prosrc for the comment string that
-- 011 added alongside the fix. That comment is absent in the 007 body.

CREATE OR REPLACE FUNCTION check_migration_011_applied()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (
      SELECT prosrc LIKE '%FIX: was p_order_id::text%'
      FROM   pg_proc
      WHERE  proname        = 'ship_order_full'
        AND  pronamespace   = 'public'::regnamespace
    ),
    false   -- function is missing entirely → 007 + 011 both absent
  );
$$;
