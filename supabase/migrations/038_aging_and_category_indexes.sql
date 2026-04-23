-- Migration 038: Performans index'leri — aging ve category filter optimizasyonu
-- Audit bulguları H-2 (aging p95=2.6s) ve H-3 (category filter p99=7.5s)

-- H-2: Aging sorgusu — aktif ve stoğu olan ürünler (partial index)
-- dbListProducts({ is_active: true }) ve on_hand > 0 filtresi için
CREATE INDEX IF NOT EXISTS idx_products_active_onhand
ON products (is_active, on_hand) WHERE is_active = true AND on_hand > 0;

-- H-2: order_lines → product_id lookup (aging'de son satış tarihleri)
-- dbGetLastSaleDates() JOIN order_lines için
CREATE INDEX IF NOT EXISTS idx_order_lines_product_id
ON order_lines (product_id);

-- H-2: purchase_commitments → received ürünlerin son tarihi (aging incoming dates)
-- dbGetLastIncomingDates() için — sadece received status
CREATE INDEX IF NOT EXISTS idx_purchase_commitments_product_received
ON purchase_commitments (product_id, received_at) WHERE status = 'received';

-- H-2: production_entries → ürün başına son üretim tarihi
-- dbGetLastProductionDates() için
CREATE INDEX IF NOT EXISTS idx_production_entries_product_date
ON production_entries (product_id, production_date DESC);

-- H-3: Category filter — products tablosunda category + is_active composite index
-- GET /api/products?category=X sorgusu için
CREATE INDEX IF NOT EXISTS idx_products_category_active
ON products (category, is_active);
