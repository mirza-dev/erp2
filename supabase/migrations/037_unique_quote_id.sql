-- Migration 037: Aynı teklif iki kez siparişe dönüştürülmesin
-- Partial unique index: sadece quote_id NOT NULL olan satırlarda tekil
CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_orders_quote_id
    ON sales_orders (quote_id)
    WHERE quote_id IS NOT NULL;
