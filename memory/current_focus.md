---
name: Current Focus
description: Aktif sprint, son tamamlanan iş ve sonraki adımlar
type: project
---

**Aktif:** —

**Son tamamlanan (2026-04-13):**

1. **Faz 4 bulgular — Tur 2 (timezone fix):**
   - `localISODate(ts)` yardımcısı: `toISOString()` yerine `getDate()` (yerel TZ) kullanır
   - `computeOrderDeadline` + `dateDaysFromToday`: her ikisi de yerel tarih referansı alır
   - 4 client-side call site (`products/page`, `suggested/page`, `StatsCards`) → `dateDaysFromToday()` ile değiştirildi
   - Regresyon testleri: 00:30 yerel saat penceresi (TZ=Europe/Istanbul'da yanlış sonuç veren eski kodu yakalar)
   - **Test:** 67 dosya, 1347 test — hepsi geçiyor | Build: temiz

2. **Faz 4 bulgular — Tur 1 (3 bug fix):**
   - `dateDaysFromToday()`: `Date.now()` tabanlı UTC normalizasyonu — timezone drift (TRT gibi UTC+ zone'larda "bugün" deadline "Geçti" görünürdü)
   - `activeSet` → `activeMap`: `order_deadline` severity değişimini (warning→critical) tespit ve güncelle; eski alert resolve + yeni create pattern
   - `dbListAllActiveProducts()`: pagination olmadan tüm aktif ürünler — 500 ürün scan limiti kaldırıldı
   - `serviceCheckOverdueShipments` isim çakışması (activeMap→activeSet), `dbListProducts` import eksikliği düzeltildi
   - **Test:** 67 dosya, 1344 test — hepsi geçiyor | Build: temiz

2. **Faz 4 — Sipariş Son Tarihi (frontend görünürlüğü):**
   - `alerts/page.tsx`: `order_deadline` alert → "Satın alma planla" CTA
   - `products/page.tsx`: `getAlertContext("order_deadline")` + drawer'a Sipariş Son Tarihi bloğu
   - `suggested/page.tsx`: Tükenme kolonuna gerçek tarihler (stockoutDate + orderDeadline)
   - `StatsCards.tsx`: Kritik Seviye kartı deadline yaklaşan ürün sayısını gösteriyor

3. **dbGetQuotedQuantities hata semantiği düzeltildi (2026-04-13):**
   - Supabase hata → boş Map yerine throw

**Bilinen açık sorunlar:** —

**Sonraki adım:** yuksek-etki.md → Faz 5 (Sevkiyat → Fatura Otomasyonu)

**Why:** Yeni session'da Claude aktif konuyu bilsin, context kaybı yaşanmasın.
**How to apply:** Her büyük özellik başlarken "Aktif" alanını güncelle; bitince "Son tamamlanan"a taşı.
