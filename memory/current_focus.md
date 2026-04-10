---
name: Current Focus
description: Aktif sprint, son tamamlanan iş ve sonraki adımlar
type: project
---

**Aktif:** —

**Son tamamlanan (2026-04-11):**

1. **Import Sistemi Yenileme (Faz 8) + 7 Bug Fix:**
   - Yeni akış: `idle → analyzing → sheet_select → column_mapping → preview → importing → done`
   - `026_column_mappings.sql` — kolon hafıza tablosu (normalized, usage_count, success_count)
   - `POST /api/import/[batchId]/detect-columns` — memory → FALLBACK → AI sırasıyla kolon algılama
   - `POST /api/import/[batchId]/apply-mappings` — kullanıcı onaylı deterministik dönüşüm
   - `src/lib/supabase/column-mappings.ts` — dbLookupColumnMappings, dbSaveColumnMappings, dbIncrementMappingSuccess
   - Preview: tüm alanlar (union), required alanlar önce, 500 satır, inline cell edit, toplu doldur UI
   - 7 bug fix: draft duplication (back nav), memory düzeltilemiyor, success_count yanlış kaynak, detection sırası, confidence formülü, preview sınırları, bulk fill eksikliği
   - **63 dosya · 1274 test**

2. **Ürün Kullanım Bayrakları:**
   - `025_product_usage_flags.sql` — `is_for_sales` / `is_for_purchase` kolonları
   - Ürün oluşturma formu, drawer toggle, stok sayfası filtre butonları

3. **Önceki: Geciken Sevkiyat Alertı (overdue_shipment):**
   - `024_overdue_shipment_alert.sql`, `dbListOverdueShipments()`, CRON endpoint

**Bilinen açık sorunlar:**
- Migration 025 ve 026 production Supabase'e henüz uygulanmadı (Supabase SQL editöründe çalıştırılacak)

**Sonraki adım:** yuksek-etki.md'deki sıradaki özellik

**Why:** Yeni session'da Claude aktif konuyu bilsin, context kaybı yaşanmasın.
**How to apply:** Her büyük özellik başlarken "Aktif" alanını güncelle; bitince "Son tamamlanan"a taşı.
