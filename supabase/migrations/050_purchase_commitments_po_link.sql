-- ============================================================
-- 050 — purchase_commitments PO link + received_qty (B1 partial fix)
-- ============================================================

ALTER TABLE purchase_commitments
    ADD COLUMN IF NOT EXISTS po_line_id uuid
        REFERENCES purchase_order_lines(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS received_qty integer NOT NULL DEFAULT 0
        CHECK (received_qty >= 0);

-- received_qty <= quantity invariant (B1)
ALTER TABLE purchase_commitments
    ADD CONSTRAINT chk_pc_received_le_qty CHECK (received_qty <= quantity);

CREATE INDEX IF NOT EXISTS idx_pc_po_line
    ON purchase_commitments(po_line_id) WHERE po_line_id IS NOT NULL;

-- Idempotent unique constraint: bir PO line için aktif tek commitment
CREATE UNIQUE INDEX IF NOT EXISTS uniq_pc_active_po_line
    ON purchase_commitments(po_line_id)
    WHERE po_line_id IS NOT NULL AND status IN ('pending', 'received');

-- ROLLBACK:
-- DROP INDEX IF EXISTS uniq_pc_active_po_line;
-- DROP INDEX IF EXISTS idx_pc_po_line;
-- ALTER TABLE purchase_commitments DROP CONSTRAINT IF EXISTS chk_pc_received_le_qty;
-- ALTER TABLE purchase_commitments DROP COLUMN IF EXISTS received_qty;
-- ALTER TABLE purchase_commitments DROP COLUMN IF EXISTS po_line_id;
