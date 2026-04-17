-- 031_drop_duplicate_indexes.sql
-- 030_perf_indexes.sql, 001_initial_schema.sql'deki index'leri
-- farklı isimle tekrar yarattı. Duplicate'ler kaldırılıyor.
-- Orijinal index'ler (001'den) korunuyor.

DROP INDEX IF EXISTS idx_order_lines_product_id;
DROP INDEX IF EXISTS idx_order_lines_order_id;
DROP INDEX IF EXISTS idx_sales_orders_commercial_status;
DROP INDEX IF EXISTS idx_sales_orders_customer_id;
