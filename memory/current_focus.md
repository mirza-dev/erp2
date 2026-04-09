---
name: Current Focus
description: Aktif sprint, son tamamlanan iş ve sonraki adımlar
type: project
---

**Aktif:** —

**Son tamamlanan (2026-04-10):**
1. **Faz 6 — Teklif Süresi & Auto-expire:**
   - `023_quote_valid_until.sql` migration — `quote_valid_until date`, `quote_expired` alert tipi, RPC güncelleme
   - `dbListExpiredQuotes()` + `serviceExpireQuotes()` — draft auto-cancel, pending_approval → alert (dedup)
   - `POST /api/orders/expire-quotes` cron endpoint + middleware CRON_PATHS
   - Yeni sipariş formu date picker (default +14 gün)
   - Sipariş listesi + detay UI (badge, banner, info row)
   - Ürün drawer: isExpired kırmızı border/badge + kalan/geçen gün gösterimi
   - **60 dosya · 1261 test**

2. **Faz 5 — Teklif Kırılımı (Quoted Breakdown):**
   - `dbGetQuotedBreakdownByProduct()` + `dbLookupUserEmails()` (`src/lib/supabase/products.ts`)
   - `GET /api/products/[id]/quotes` endpoint
   - Ürün drawer'ında "Aktif Teklifler" section
   - **58 dosya · 1253 test**

2. **Faz 4.6 — Deadline Tutarlılık Geçişi:**
   - `alert-service.ts`: deadline hesabı `available_now` → `promisable` (quoted dahil edildi), API/UI ile tutarlı
   - `shouldSuggestReorder()` pure helper (`src/lib/stock-utils.ts`)
   - `data-context.tsx` reorderSuggestions: `<` → `<=` (off-by-one fix) + deadline ≤ 7 gün olan ürünler de dahil
   - 2 yeni test: `alert-deadline-promisable.test.ts`, `reorder-suggestions.test.ts`
   - **55 dosya · 1239 test**

2. **Faz 4 — Sipariş Son Tarihi (Order Deadline):** (2026-04-09)
   - `computeOrderDeadline()` pure helper (`src/lib/stock-utils.ts`)
   - `/api/products` → `stockoutDate` + `orderDeadline` alanları
   - `stockoutDate`/`orderDeadline` → `ProductWithStock` + `mapProduct()` üzerinden frontend'e taşınıyor
   - Ürünler sayfasına "Son Tarih" kolonu (kırmızı/sarı/yeşil)
   - Satın alma önerileri → deadline ascending sort
   - `order_deadline` alert tipi + migration `022_add_order_deadline_alert.sql`

3. **Faz 3 — Stok Eskime Raporu** (2026-04-08)
4. **Faz 2 Bug Fix** (2026-04-08)
5. **Faz 2 — Giriş Takibi** (2026-04-08)
6. **Faz 1 — Teklif Görünürlüğü** (2026-04-08)

**Sonraki adım:** yuksek-etki.md'deki sıradaki özellik

**Why:** Yeni session'da Claude aktif konuyu bilsin, context kaybı yaşanmasın.
**How to apply:** Her büyük özellik başlarken "Aktif" alanını güncelle; bitince "Son tamamlanan"a taşı.
