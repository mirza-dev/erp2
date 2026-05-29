-- ============================================================
-- Migration 066 — Faz 1a: products master alanları (GTİP + Ölçü)
--
-- V4-B3 (QUOTES_V2_PLAN.md): Teklif satırı ürün seçilince GTİP (hs_code)
-- ve ölçü (size_text) master üründen auto-fill edilir. Bu alanlar bugün
-- ürün kataloğunda dedicated kolon olarak yok; tip attribute'larında da
-- universal değil (057 seed'de yalnız instrument'ta process_connection_size).
-- Cross-cutting per-product alanlar olduğu için dedicated kolon doğru karar.
--
-- Tüm alanlar TEXT NULL — serbest text. Backfill yok (mevcut ürünler NULL).
-- Audit yazılmaz → V4-A1 (audit_log.source enum) tetiklenmez.
-- ============================================================

ALTER TABLE products
    ADD COLUMN IF NOT EXISTS hs_code   text,
    ADD COLUMN IF NOT EXISTS size_text text;

-- ROLLBACK:
-- ALTER TABLE products DROP COLUMN IF EXISTS hs_code;
-- ALTER TABLE products DROP COLUMN IF EXISTS size_text;
