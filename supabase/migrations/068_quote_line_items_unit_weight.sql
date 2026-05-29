-- ============================================================
-- Migration 068 — Faz 1a: quote_line_items birim ağırlık + KG override
--
-- V3-B5 (QUOTES_V2_PLAN.md): unit_weight_kg — satır birim ağırlığı.
--   Toplam KG = quantity × unit_weight_kg recompute için (Faz 1b).
-- V4-A7: kg_manual_override — kullanıcı KG'yi elle girdiyse true; recompute
--   bu satırı atlar (kullanıcı override'ı korunur, reload sonrası da).
--
-- Mevcut weight_kg (satır TOPLAM ağırlığı, 034:115) KORUNUR — silinmez.
-- unit_weight_kg per-unit; weight_kg = qty × unit_weight_kg (computed/persisted).
-- ============================================================

ALTER TABLE quote_line_items
    ADD COLUMN IF NOT EXISTS unit_weight_kg     numeric(10,3),
    ADD COLUMN IF NOT EXISTS kg_manual_override boolean NOT NULL DEFAULT false;

-- ROLLBACK:
-- ALTER TABLE quote_line_items DROP COLUMN IF EXISTS unit_weight_kg;
-- ALTER TABLE quote_line_items DROP COLUMN IF EXISTS kg_manual_override;
