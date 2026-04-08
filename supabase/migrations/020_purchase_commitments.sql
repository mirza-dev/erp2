-- ============================================================
-- 020 — Purchase Commitments (Giriş Takibi)
-- Beklenen stok girişleri: miktar, tarih, tedarikçi
-- incoming = SUM(quantity) WHERE status = 'pending'
-- forecasted = on_hand + incoming - reserved - quoted
-- ============================================================

CREATE TABLE purchase_commitments (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id    uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity      integer NOT NULL CHECK (quantity > 0),
    expected_date date NOT NULL,
    supplier_name text,
    notes         text,
    status        text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'received', 'cancelled')),
    created_at    timestamptz DEFAULT now(),
    received_at   timestamptz
);

CREATE INDEX idx_purchase_commitments_product ON purchase_commitments(product_id);
CREATE INDEX idx_purchase_commitments_status  ON purchase_commitments(status);

-- ── Atomik Receive ────────────────────────────────────────────
-- on_hand artışı + status güncellemesi tek transaction içinde
CREATE OR REPLACE FUNCTION receive_purchase_commitment(p_commitment_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    v_product_id uuid;
    v_quantity   integer;
BEGIN
    SELECT product_id, quantity INTO v_product_id, v_quantity
    FROM purchase_commitments
    WHERE id = p_commitment_id AND status = 'pending';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Commitment bulunamadı veya pending değil: %', p_commitment_id;
    END IF;

    UPDATE purchase_commitments
    SET status = 'received', received_at = now()
    WHERE id = p_commitment_id;

    UPDATE products
    SET on_hand = on_hand + v_quantity
    WHERE id = v_product_id;
END;
$$;
