-- ============================================================
-- Migration 013: AI Entity Aliases
-- Import akışında tekrar eden entity eşleştirmelerini öğrenir.
-- Her başarılı customer/product resolution → alias kaydedilir.
-- Sonraki import'ta aynı ham değer → alias tablosu önce kontrol edilir.
-- ============================================================

CREATE TABLE ai_entity_aliases (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    raw_value     text        NOT NULL,               -- Excel'den gelen orijinal değer
    normalized    text        NOT NULL,               -- lower(trim(raw_value))
    entity_type   text        NOT NULL
        CHECK (entity_type IN ('customer', 'product')),
    resolved_id   uuid        NOT NULL,               -- customers.id veya products.id
    resolved_name text,                               -- Okunabilirlik için entity'nin mevcut adı
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (normalized, entity_type)
);

-- Hızlı lookup için index
CREATE INDEX idx_aliases_lookup ON ai_entity_aliases (normalized, entity_type);

-- updated_at trigger (mevcut update_updated_at() fonksiyonu kullanılır)
CREATE TRIGGER trg_ai_entity_aliases_updated_at
    BEFORE UPDATE ON ai_entity_aliases
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
