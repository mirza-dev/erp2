-- ============================================================
-- 064 — Import Documents 'applying' transient status
--
-- Faz 3c Review 3.tur (P2 race condition):
-- serviceApplyImportDocument başta `doc.status !== "classified"` JS check
-- yapıyordu, ama apply işlemi atomic claim/lock yoktu. İki paralel apply
-- isteği (örn. iki sekme veya retry race) classified status'unu aynı anda
-- görüp ikisi de işleme girebiliyordu → duplicate cert/product riski.
--
-- Faz 8 (Sprint B G3) import_batches paterni: 'confirming' ara state +
-- atomic CAS. Aynı disiplin import_documents'a uygulanır:
--   classified → applying  (atomic claim, yarışı kazanan iş yapar)
--   applying → applied      (success path)
--   applying → classified   (rollback: all-fail veya exception)
--
-- Migration: CHECK constraint genişletilir; mevcut transitions korunur.
-- ============================================================

ALTER TABLE import_documents DROP CONSTRAINT IF EXISTS import_documents_status_check;
ALTER TABLE import_documents ADD CONSTRAINT import_documents_status_check
    CHECK (status IN ('pending','classifying','classified','applying','error','applied'));

-- ROLLBACK:
-- ALTER TABLE import_documents DROP CONSTRAINT IF EXISTS import_documents_status_check;
-- ALTER TABLE import_documents ADD CONSTRAINT import_documents_status_check
--     CHECK (status IN ('pending','classifying','classified','error','applied'));
