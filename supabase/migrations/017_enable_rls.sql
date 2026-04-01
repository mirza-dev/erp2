-- ─── Migration 017: Enable RLS on all tables ──────────────────────────────────
-- All API access goes through service_role (bypasses RLS automatically).
-- Enabling RLS blocks direct anon/authenticated access to raw tables.

ALTER TABLE customers              ENABLE ROW LEVEL SECURITY;
ALTER TABLE products               ENABLE ROW LEVEL SECURITY;
ALTER TABLE bills_of_materials     ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_orders           ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_lines            ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_reservations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE shortages              ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements    ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_entries     ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_batches         ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_drafts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_sync_logs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log              ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_counters         ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_recommendations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_feedback            ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipments              ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices               ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments               ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_entity_aliases      ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_runs                ENABLE ROW LEVEL SECURITY;
