-- ============================================================
-- 021 — Fix receive_purchase_commitment race condition
--
-- Önceki implementasyon: SELECT → UPDATE (iki ayrı statement,
-- READ COMMITTED'de eş zamanlı çağrı stoku iki kez artırabilirdi)
--
-- Yeni implementasyon: UPDATE ... WHERE status='pending' RETURNING
-- Check ve status update tek statement → TOCTOU gap sıfır.
-- ============================================================

CREATE OR REPLACE FUNCTION receive_purchase_commitment(p_commitment_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    v_product_id uuid;
    v_quantity   integer;
BEGIN
    -- Atomik check + update: sadece status='pending' olan satır etkilenir.
    -- IF NOT FOUND: ya hiç yoktur ya da zaten received/cancelled.
    UPDATE purchase_commitments
    SET    status = 'received', received_at = now()
    WHERE  id = p_commitment_id AND status = 'pending'
    RETURNING product_id, quantity
    INTO  v_product_id, v_quantity;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Commitment bulunamadı veya pending değil: %', p_commitment_id;
    END IF;

    UPDATE products
    SET on_hand = on_hand + v_quantity
    WHERE id = v_product_id;
END;
$$;
