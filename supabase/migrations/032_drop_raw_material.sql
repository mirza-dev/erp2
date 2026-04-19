-- 032: raw_material product_type kaldırma + usage flag kolonları silme
--
-- Firma hammadde satın almıyor veya stoklamıyor.
-- Faz 2: raw_material kavramı DB dahil her katmandan kaldırılıyor.

-- 1. Mevcut raw_material ürünleri sil
DELETE FROM products WHERE product_type = 'raw_material';

-- 2. Constraint güncelle (2-değerli: manufactured | commercial)
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_product_type_check;
ALTER TABLE products ADD CONSTRAINT products_product_type_check
    CHECK (product_type IN ('manufactured', 'commercial'));

-- 3. is_for_sales / is_for_purchase kolonları kaldır (artık kullanılmıyor)
ALTER TABLE products DROP COLUMN IF EXISTS is_for_sales;
ALTER TABLE products DROP COLUMN IF EXISTS is_for_purchase;
