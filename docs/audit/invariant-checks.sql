-- ============================================================
-- ERP2 Invariant Kontrol SQL'leri
-- Her k6 yük kademesi sonrası Supabase SQL Editor'da çalıştır.
-- Sonuç: Her sorgu 0 satır döndürmeli — aksi halde veri bütünlüğü ihlali.
-- ============================================================

-- ── 1. Negatif stok yok ─────────────────────────────────────
-- Hiçbir ürünün available_now (on_hand - reserved) değeri negatif olmamalı
SELECT id, sku, name, on_hand, reserved, (on_hand - reserved) AS available_now
FROM products
WHERE (on_hand - reserved) < 0;

-- ── 2. reserved > on_hand yok ───────────────────────────────
-- Fiziksel stoktan fazla rezervasyon yapılmamalı
SELECT id, sku, name, on_hand, reserved
FROM products
WHERE reserved > on_hand;

-- ── 3. Duplicate aktif alert yok ────────────────────────────
-- Aynı type + entity_id için birden fazla aktif alert olmamalı
SELECT type, entity_id, COUNT(*) AS cnt
FROM alerts
WHERE status = 'active'
GROUP BY type, entity_id
HAVING COUNT(*) > 1;

-- ── 4. Cancelled sipariş ama reserved > 0 ───────────────────
-- İptal edilen siparişlerin rezervasyonu serbest bırakılmış olmalı
-- (fulfillment_status 'unallocated' veya 'allocated' kalabilir — sorun değil)
-- Asıl kontrol: cancelled sipariş kaleme bağlı reserved stok var mı?
SELECT so.id, so.order_number, so.commercial_status, so.fulfillment_status,
       SUM(sol.quantity) AS total_lines
FROM sales_orders so
JOIN order_lines sol ON sol.order_id = so.id
WHERE so.commercial_status = 'cancelled'
  AND so.fulfillment_status NOT IN ('unallocated')
GROUP BY so.id, so.order_number, so.commercial_status, so.fulfillment_status;

-- ── 5. Aynı teklif 2 kez siparişe dönüştürülmemiş ───────────
-- quote_id unique olmalı (migration 037 partial UNIQUE index)
SELECT quote_id, COUNT(*) AS cnt
FROM sales_orders
WHERE quote_id IS NOT NULL
  AND commercial_status != 'cancelled'
GROUP BY quote_id
HAVING COUNT(*) > 1;

-- ── 6. Sipariş durum makinesi ihlali ────────────────────────
-- Geçersiz commercial_status değeri yok
SELECT id, order_number, commercial_status
FROM sales_orders
WHERE commercial_status NOT IN ('draft', 'pending_approval', 'approved', 'cancelled');

-- ── 7. Geçersiz fulfillment_status ──────────────────────────
SELECT id, order_number, fulfillment_status
FROM sales_orders
WHERE fulfillment_status NOT IN (
    'unallocated', 'partially_allocated', 'allocated', 'partially_shipped', 'shipped'
);

-- ── 8. APPROVED olmayan sipariş ama reserved stok var ────────
-- Rezervasyon sadece APPROVED siparişlerde olmalı
-- Bu sorgu: approved olmayan ama stok tüketen satırlar
-- (Bu Supabase RPC'sine güvenir; dolaylı kontrol)
SELECT so.id, so.order_number, so.commercial_status
FROM sales_orders so
WHERE so.commercial_status != 'approved'
  AND so.fulfillment_status NOT IN ('unallocated');

-- ── 9. Negatif quantity'li sipariş satırı ───────────────────
SELECT id, order_id, quantity, unit_price
FROM order_lines
WHERE quantity <= 0;

-- ── 10. Import batch tamamlandı ama hâlâ pending draft var ──
SELECT b.id AS batch_id, b.status AS batch_status,
       COUNT(d.id) AS pending_draft_count
FROM import_batches b
JOIN import_drafts d ON d.batch_id = b.id
WHERE b.status = 'confirmed'
  AND d.status = 'pending'
GROUP BY b.id, b.status
HAVING COUNT(d.id) > 0;

-- ── 11. Test verisi temizlik kontrolü (LOAD- prefix) ─────────
-- Yük testi sonrası bu sorgu 0 döndürmeli
SELECT COUNT(*) AS load_test_orders
FROM sales_orders
WHERE notes LIKE 'LOAD-TEST%';

SELECT COUNT(*) AS load_test_products
FROM products
WHERE sku LIKE 'LOAD-%';

SELECT COUNT(*) AS load_test_customers
FROM customers
WHERE name LIKE 'LOAD-%';
