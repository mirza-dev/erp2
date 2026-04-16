---
name: Current Focus
description: Aktif sprint, son tamamlanan iş ve sonraki adımlar
type: project
---

**Aktif:** —

**Son tamamlanan (2026-04-17 — Satın Alma Önerileri kart iyileştirmesi):**

1. **"Ortalama Risk Skoru" (NaN%) → "Toplam Sipariş Tutarı"** — `costPrice ?? price` bazında, kabul edilen tutar alt satırda
2. **editedQty kalıcılığı** — `purchase-copilot` route `editedMetadata` döndürüyor; refresh sonrası düzenlenen miktar korunuyor
3. **NaN fix** — `computeSuggestion` `moq = Math.max(1, ...)`, tüm `urgency/stockPct` hesaplarına `minStockLevel > 0` guard
4. **Validasyon** — UI `qty <= 0` guard + route server-side `suggestQty > 0` doğrulama
5. **Semantik fix** — `acceptedOrderCost` sadece `accepted` sayıyor (`edited ≠ accepted`)

**Bekleyen manuel adımlar:**
- Sentry: sentry.io → NEXT_PUBLIC_SENTRY_DSN + SENTRY_DSN → .env.local ve GitHub Secrets
- Supabase local: `brew install supabase/tap/supabase` → `supabase init`
- k6 local: `brew install k6`

**Test:** 1465 vitest (0 fail) + 23 Playwright (0 fail) · Lint: 0 error

**Why:** Yeni session'da Claude aktif konuyu bilsin.
**How to apply:** Her büyük özellik başlarken "Aktif" alanını güncelle; bitince "Son tamamlanan"a taşı.
