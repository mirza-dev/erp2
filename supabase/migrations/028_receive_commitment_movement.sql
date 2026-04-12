-- ============================================================
-- 028 — receive_purchase_commitment: inventory_movements kaydı
--
-- Teslimat alındığında inventory_movements tablosuna 'receipt'
-- hareketi yazılır. Bu olmadan on_hand artışı stok ledger'ında
-- görünmez — "otoritatif stok kaydı" kuralıyla çelişir.
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

    -- Stok ledger kaydı: her on_hand değişimi inventory_movements'a yazılır.
    -- reference_type='manual', reference_id=commitment uuid → geriye dönük izlenebilir.
    INSERT INTO inventory_movements (
        product_id, movement_type, quantity,
        reference_type, reference_id, notes, source
    )
    VALUES (
        v_product_id,
        'receipt',
        v_quantity,
        'manual',
        p_commitment_id,
        format('Satın alma teslim alındı: +%s adet (commitment %s)', v_quantity, p_commitment_id),
        'system'
    );
END;
$$;
