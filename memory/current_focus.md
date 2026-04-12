---
name: Current Focus
description: Aktif sprint, son tamamlanan iş ve sonraki adımlar
type: project
---

**Aktif:** —

**Son tamamlanan (2026-04-12):**

1. **Faz 3 — Stok Eskime Raporu (5 bug fix):**
   - Hammadde eskime semantiği düzeltildi: `dbGetLastComponentUsageDates()` yeni fonksiyon eklendi — `inventory_movements WHERE movement_type='production' AND quantity < 0` (BOM tüketimi) — `production_entries` değil
   - `boundCapital` cost_price kullanıyor: `on_hand * (cost_price ?? price)`, response'a `costPrice` alanı eklendi
   - `finishedItems` build-breaker düzeltildi: `purchase/suggested/page.tsx` satır 720/887 → `manufacturedItems.length + commercialItems.length`
   - Aging page gereksiz setState kaldırıldı: `useState(true)` varken `setLoadingX(true)` çağrısı silindi
   - E2E selector düzeltildi: `getByText(/bağlanan sermaye/i).first()` — çoklu eleman sorunu çözüldü
   - **Test:** 67 dosya, 1339 test — hepsi geçiyor | Build: temiz

2. **product_type 3-yollu enum genişletme (2026-04-12 öncesi):**
   - `finished` → `manufactured` / `commercial`
   - Eskime raporu 3 tab, form akıllı default'lar, badge 3 renk

**Bilinen açık sorunlar:** —

**Sonraki adım:** yuksek-etki.md → Faz 4 (Sipariş Son Tarihi / Order Deadline)

**Why:** Yeni session'da Claude aktif konuyu bilsin, context kaybı yaşanmasın.
**How to apply:** Her büyük özellik başlarken "Aktif" alanını güncelle; bitince "Son tamamlanan"a taşı.
