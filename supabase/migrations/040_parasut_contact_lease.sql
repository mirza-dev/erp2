-- Migration 040: TTL-based lease columns for parasut contact creation mutex
-- Allows atomic claim-or-skip without polluting parasut_contact_id with placeholder values.
-- Mirrors the OAuth token refresh_lock_until/refresh_lock_owner pattern.

ALTER TABLE customers ADD COLUMN parasut_contact_creating_until timestamptz;
ALTER TABLE customers ADD COLUMN parasut_contact_creating_owner uuid;

CREATE INDEX idx_customers_parasut_contact_creating_until
    ON customers (parasut_contact_creating_until)
    WHERE parasut_contact_creating_until IS NOT NULL;
