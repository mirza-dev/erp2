-- Faz 6: Paraşüt product create mutex — TTL lease (mirrors customer lease in 040)
-- parasut_product_id stays clean: always NULL or a real Paraşüt UUID.

ALTER TABLE products ADD COLUMN parasut_product_creating_until timestamptz;
ALTER TABLE products ADD COLUMN parasut_product_creating_owner uuid;

-- Stale lease tarama indexi (CRON sweep için ileride faydalı)
CREATE INDEX idx_products_parasut_product_creating_until
    ON products (parasut_product_creating_until)
    WHERE parasut_product_creating_until IS NOT NULL;
