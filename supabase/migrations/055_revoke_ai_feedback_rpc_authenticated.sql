-- ============================================================
-- 055 — Faz 8 P3-002: lock down get_recent_rejections_for_products to service_role
-- PostgreSQL functions default to GRANT EXECUTE TO PUBLIC on creation.
-- Migration 054 added REVOKE for new deploys; this migration fixes existing
-- staging/prod databases where PUBLIC execute was already inherited.
-- Route uses createServiceClient() (service_role only) — no other role needs access.
-- ============================================================

REVOKE ALL ON FUNCTION get_recent_rejections_for_products(uuid[], int) FROM public, anon, authenticated;

-- ============================================================
-- ROLLBACK:
-- GRANT EXECUTE ON FUNCTION get_recent_rejections_for_products(uuid[], int) TO authenticated;
-- ============================================================
