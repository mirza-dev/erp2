-- Hotfix: audit_log.entity_id should be text, not uuid.
-- Rationale:
-- - audit_log is a generic cross-entity table
-- - several RPCs log entity IDs as text
-- - current uuid column causes runtime failures like:
--   column "entity_id" is of type uuid but expression is of type text

alter table audit_log
    alter column entity_id type text using entity_id::text;

comment on column audit_log.entity_id is
    'Generic entity reference. Stored as text because audit_log spans multiple entity types and runtime sources.';
