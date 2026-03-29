-- Migration 014: AI Run Audit Trail
-- Tracks every AI call for observability and future confidence calibration.
-- fire-and-forget insert from logAiRun() — never blocks main flow.

CREATE TABLE ai_runs (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    feature     text NOT NULL,       -- 'order_score' | 'stock_risk' | 'import_parse' | 'ops_summary' | 'purchase_enrich'
    entity_id   text,                -- nullable (ops_summary, import_parse have no single entity)
    input_hash  text,                -- sha256(JSON.stringify(input)) — audit, not raw data
    confidence  numeric(4,3),        -- 0.000–1.000
    latency_ms  integer,
    model       text,                -- e.g. 'claude-haiku-4-5-20251001'
    created_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_ai_runs_feature_created ON ai_runs (feature, created_at DESC);
