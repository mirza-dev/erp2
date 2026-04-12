-- ============================================================
-- 027: product_type 3-way enum (raw_material, manufactured, commercial)
--
-- "finished" artık geçersiz. Mevcut veriler:
--   finished + is_for_purchase = false → manufactured (üretilip satılan)
--   finished + is_for_purchase = true  → commercial  (alınıp satılan)
-- ============================================================

-- 1. Eski CHECK constraint'i kaldır
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_product_type_check;

-- 2. Mevcut "finished" verileri migre et
UPDATE products SET product_type = 'manufactured'
WHERE product_type = 'finished' AND is_for_purchase = false;

UPDATE products SET product_type = 'commercial'
WHERE product_type = 'finished' AND is_for_purchase = true;

-- 3. Kalan "finished" varsa (güvenlik ağı)
UPDATE products SET product_type = 'manufactured'
WHERE product_type = 'finished';

-- 4. Yeni 3-değerli constraint ekle
ALTER TABLE products ADD CONSTRAINT products_product_type_check
CHECK (product_type IN ('raw_material', 'manufactured', 'commercial'));

-- 5. Default değeri güncelle
ALTER TABLE products ALTER COLUMN product_type SET DEFAULT 'manufactured';
