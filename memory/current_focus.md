---
name: Current Focus
description: Aktif sprint, son tamamlanan iş ve sonraki adımlar
type: project
---

**Aktif:** —

**Son tamamlanan (2026-04-15 — Per-page fetch refactor + Seed fix):**

1. **Her sayfa kendi verisini çeker:**
   - Dashboard: `refetchAll` + Yenile butonu (DataContext child'larını günceller)
   - Orders: DataContext bağımlılığı kaldırıldı, kendi `/api/orders` fetch'i, Yenile butonu
   - Products: DataContext bağımlılığı kaldırıldı, direkt `POST/DELETE /api/products`, Yenile butonu
   - Alerts: önceki oturumda zaten yapılmıştı

2. **Seed fix + auth:**
   - `/api/seed` → ALWAYS_PUBLIC, kendi içinde CRON_SECRET veya session kontrolü
   - `inventory_movements.reference_type` düzeltmesi: `'sales_order'` → `'order'`, `'purchase_commitment'` → `'manual'`
   - DELETE handler FK sırası: `payments, invoices, shipments` → `sales_orders`

3. **Alerts "Silinmiş Ürün" fix:**
   - Alerts sayfası artık kendi `/api/products` fetch'ini yapıyor → DataContext stale etkisi yok
   - "Tara" butonu `?force=true` parametresiyle scan lock'u zorla açıyor

4. **Settings DemoTab:**
   - Server actions kaldırıldı (Next.js prod build hatası)
   - Basit `fetch()` pattern'ine döndürüldü
   - `/api/seed` ALWAYS_PUBLIC olduğu için middleware bypass gerekmedi

**Test:** TypeScript temiz | Build temiz

**Bilinen açık sorunlar:**
- `purchase_commitments` ve `column_mappings` tablolarında RLS migration eksik (migration 020/026, sonra 017'de RLS aktifleştirildi)

**Why:** Yeni session'da Claude aktif konuyu bilsin, context kaybı yaşanmasın.
**How to apply:** Her büyük özellik başlarken "Aktif" alanını güncelle; bitince "Son tamamlanan"a taşı.
