-- Sprint A G8: Manuel "Yoksay" sonrası 24 saat dedup için severity izlemesi.
--
-- Ana kural:
--   * Yoksay sonrası 24 saat içinde aynı tip+entity için yeni alert oluşturma.
--   * Severity escalation (yoksay edildiği seviyenin daha kötüsüne çıkarsa) bypass et.
--   * purchase_recommended (AI) bu kuraldan muaf — AI'ın kendi tutarlılık mantığı var.
--
-- dismissed_at zaten 001'de mevcut. Eksik olan: yoksay anındaki severity bilgisi.

ALTER TABLE alerts ADD COLUMN dismissed_severity text;

-- 24 saat içindeki dismissed alert'leri hızlı bulmak için index.
-- Sadece dismissed_at NOT NULL olan satırları indeksler (partial index).
CREATE INDEX idx_alerts_dismissed_recent
    ON alerts (type, entity_id, dismissed_at DESC)
    WHERE dismissed_at IS NOT NULL;
