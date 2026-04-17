-- Performans: eksik index'ler eklendi
-- Analiz: tam tablo taraması yapan sorgular tespit edildi.

-- order_lines: product_id — quote breakdown JOIN + incoming stok hesabı
CREATE INDEX IF NOT EXISTS idx_order_lines_product_id ON order_lines(product_id);

-- order_lines: order_id — sipariş detay sayfası (2. sorgu hızlanır)
CREATE INDEX IF NOT EXISTS idx_order_lines_order_id ON order_lines(order_id);

-- sales_orders: commercial_status — sipariş listesi filtresi
CREATE INDEX IF NOT EXISTS idx_sales_orders_commercial_status ON sales_orders(commercial_status);

-- sales_orders: customer_id — cari bazlı sipariş sorgulama
CREATE INDEX IF NOT EXISTS idx_sales_orders_customer_id ON sales_orders(customer_id);
