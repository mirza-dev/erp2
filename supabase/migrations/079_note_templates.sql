-- ============================================================
-- 079 — Not Şablonları (note_templates) — Teklif V7 Faz 7
-- Tekrar kullanılabilir metin şablonları: QuoteForm'un 3 serbest-metin
-- alanı (Notlar & Şartlar / Teslimat Şekli / Ödeme Şekli) için.
-- kind: notes | delivery | payment | general (general = her alanda görünür)
-- RLS service_role (proje paterni); idempotent + seed (PMT standartları)
-- NOT: buradaki sort_order = ŞABLON listesi sıralaması. Master-plandaki
--      "080 quote_line_items.sort_order" KALICI DÜŞÜRÜLDÜ (position zaten var).
-- ============================================================

-- ── note_templates ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS note_templates (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kind        text NOT NULL DEFAULT 'general'
                  CHECK (kind IN ('notes', 'delivery', 'payment', 'general')),
    title       text NOT NULL CHECK (length(trim(title)) > 0),
    body        text NOT NULL CHECK (length(trim(body)) > 0),
    sort_order  integer NOT NULL DEFAULT 0,
    is_active   boolean NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_note_templates_kind_active
    ON note_templates (kind, sort_order) WHERE is_active;

ALTER TABLE note_templates ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION note_templates_set_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_note_templates_updated_at ON note_templates;
CREATE TRIGGER trg_note_templates_updated_at
    BEFORE UPDATE ON note_templates FOR EACH ROW EXECUTE FUNCTION note_templates_set_updated_at();

-- ── Seed: PMT standart şablonları ──────────────────────────────
-- Deterministik UUID (057 paterni); product_types band'inden ayrık (a-prefix node).
-- ON CONFLICT DO NOTHING → re-run güvenli; kullanıcı düzenlemesi EZİLMEZ (update yok).
INSERT INTO note_templates (id, kind, title, body, sort_order) VALUES
    -- Teslimat
    ('00000000-0000-4000-8000-000000a00001'::uuid, 'delivery',
        'İstanbul Depo Teslim', 'İSTANBUL PMT DEPO TESLİMİ', 10),
    ('00000000-0000-4000-8000-000000a00002'::uuid, 'delivery',
        'EXWORKS İstanbul', 'EXWORKS PMT İSTANBUL DEPO', 20),
    -- Ödeme
    ('00000000-0000-4000-8000-000000a00011'::uuid, 'payment',
        '%50 Avans / %50 Sevk', '%50 AVANS, %50 SEVKE HAZIR OLUNCA', 10),
    ('00000000-0000-4000-8000-000000a00012'::uuid, 'payment',
        '%100 Peşin', '%100 PEŞİN', 20),
    ('00000000-0000-4000-8000-000000a00013'::uuid, 'payment',
        '30 Gün Vadeli', '30 GÜN VADELİ', 30),
    -- Notlar & Şartlar
    ('00000000-0000-4000-8000-000000a00021'::uuid, 'notes',
        'Teklif Geçerlilik', 'Teklifimiz 30 gün geçerlidir.', 10),
    ('00000000-0000-4000-8000-000000a00022'::uuid, 'notes',
        'KDV Hariç', 'Fiyatlarımıza KDV dahil değildir.', 20),
    ('00000000-0000-4000-8000-000000a00023'::uuid, 'notes',
        'Teslim Süresi', 'Teslim süremiz sipariş onayından itibaren belirtilen gün sayısıdır.', 30)
ON CONFLICT (id) DO NOTHING;

-- ROLLBACK:
-- DROP TRIGGER IF EXISTS trg_note_templates_updated_at ON note_templates;
-- DROP FUNCTION IF EXISTS note_templates_set_updated_at();
-- DROP INDEX IF EXISTS idx_note_templates_kind_active;
-- DROP TABLE IF EXISTS note_templates CASCADE;
