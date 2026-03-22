-- 005_faz8910_hardening.sql
-- AI risk level on orders, Parasut sync indices, customer name lookup

-- AI risk level on orders
ALTER TABLE sales_orders
    ADD COLUMN IF NOT EXISTS ai_risk_level text
    CHECK (ai_risk_level IN ('low', 'medium', 'high'));

-- Index for Parasut synced orders
CREATE INDEX IF NOT EXISTS idx_orders_parasut_synced
    ON sales_orders (parasut_sent_at DESC)
    WHERE parasut_invoice_id IS NOT NULL;

-- Index for failed sync logs (retry queries)
CREATE INDEX IF NOT EXISTS idx_sync_logs_retryable
    ON integration_sync_logs (status, retry_count)
    WHERE status = 'error' AND retry_count < 3;

-- Index for customer name lookup (import dedup)
CREATE INDEX IF NOT EXISTS idx_customers_name_lower
    ON customers (lower(name));
