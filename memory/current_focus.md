---
name: Current Focus
description: Aktif sprint, son tamamlanan iş ve sonraki adımlar
type: project
---

**Aktif:** —

**Son tamamlanan (2026-04-08):**
1. **Faz 3 — Stok Eskime Raporu:**
   - `src/lib/supabase/aging.ts`: `dbGetLastSaleDates`, `dbGetLastIncomingDates`, `computeAgingCategory`, `pickMax`
   - `GET /api/products/aging`: 3-way parallel fetch, on_hand > 0 filtresi, boundCapital hesabı
   - `src/app/dashboard/products/aging/page.tsx`: özet kartlar + filtre sekmeler + tablo
   - Ürünler sayfasına "Eskime Raporu →" linki eklendi
   - **52 dosya · 1205 test**

2. **Faz 2 Bug Fix — 5 kritik hata düzeltildi** (2026-04-08)

3. **Faz 2 — Giriş Takibi (incoming/forecasted + purchase_commitments)** (2026-04-08)

4. **Faz 1 — Teklif Görünürlüğü (quoted/promisable)** (2026-04-08)

**Sonraki adım:** Faz 4 — yuksek-etki.md'deki sıradaki özellik

**Why:** Yeni session'da Claude aktif konuyu bilsin, context kaybı yaşanmasın.
**How to apply:** Her büyük özellik başlarken "Aktif" alanını güncelle; bitince "Son tamamlanan"a taşı.
