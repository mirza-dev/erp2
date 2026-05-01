-- Sprint B G3: serviceConfirmBatch race condition fix.
--
-- Eski akış: SELECT → JS koşul → UPDATE arasında lock yoktu. Aynı batch'i
-- iki sekmeden aynı anda confirm etmek mümkündü → ürün/müşteri/sipariş
-- duplicate insert riski.
--
-- Yeni akış: 'confirming' ara durumu + atomik CAS UPDATE.
-- dbClaimBatchForConfirm: tek SQL'le pending/review → confirming'e geçer.
-- Yarışı kazanan iş yapar, kaybeden 0 satır döner → "zaten işleniyor" hatası.

-- import_batches.status check'inde 'review' var ama 'confirming' yok. Genişlet.
ALTER TABLE import_batches DROP CONSTRAINT IF EXISTS import_batches_status_check;
ALTER TABLE import_batches ADD CONSTRAINT import_batches_status_check
    CHECK (status IN ('pending', 'processing', 'review', 'confirming', 'confirmed', 'failed'));
