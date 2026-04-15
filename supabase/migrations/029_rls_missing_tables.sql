-- Migration 029: Enable RLS on tables created after migration 017
-- purchase_commitments (020) and column_mappings (026) were missing
-- from the initial RLS enablement. All API access uses service_role
-- which bypasses RLS — enabling RLS blocks direct anon/authenticated access.

ALTER TABLE purchase_commitments ENABLE ROW LEVEL SECURITY;
ALTER TABLE column_mappings      ENABLE ROW LEVEL SECURITY;
