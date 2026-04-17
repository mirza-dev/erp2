---
name: Current Focus
description: Aktif sprint, son tamamlanan iş ve sonraki adımlar
type: project
---

**Aktif:** —

**Son tamamlanan (2026-04-17 — seed dataya 5 hammadde eklendi):**

1. `HM-DK-DN80-WCB` — Döküm Gövde Blank A216 WCB DN80 — CRITICAL (on_hand:8, min:15)
2. `HM-CB-SS316L-40` — Paslanmaz Çelik Bar SS316L Ø40mm — PAST DEADLINE (lead_time:45)
3. `HM-PTFE-ROD-25` — PTFE Yuvarlak Rod Ø25mm — HEALTHY (filtre testi; öneride görünmez)
4. `HM-GRF-1500-3` — Grafit Conta Levhası — PAST DEADLINE (lead_time:35)
5. `HM-DF-DN100-PN40-A105` — Dövme Flanş Blank A105 — STOK SIFIR/CRITICAL
- Hammadde tabı artık demo'da dolu; is_for_sales=false, is_for_purchase=true

**Önceki (2026-04-17 — isForPurchase/isForSales alan filtreleme):**

1. **shouldSuggestReorder** — `isForPurchase` guard eklendi (stock-utils)
2. **data-context** — `reorderSuggestions` filtresine `isForPurchase` geçirildi
3. **purchase-copilot route** — `is_for_purchase &&` filtresi eklendi
4. **alerts sayfası** — product-based alertler `isForSales=false` ürünleri gizler
5. **purchase-service scan** — `!is_for_purchase` ürünler skip; `scanned` metriği düzeltildi
6. **DR-7 fixture** — `is_for_purchase: true` default eklendi (3 test fix); 2 yeni `isForPurchase: false` test senaryosu

**Bekleyen manuel adımlar:**
- Sentry: sentry.io → NEXT_PUBLIC_SENTRY_DSN + SENTRY_DSN → .env.local ve GitHub Secrets
- Supabase local: `brew install supabase/tap/supabase` → `supabase init`
- k6 local: `brew install k6`

**Test:** 1465 vitest (0 fail) + 23 Playwright (0 fail) · Lint: 0 error

**Why:** Yeni session'da Claude aktif konuyu bilsin.
**How to apply:** Her büyük özellik başlarken "Aktif" alanını güncelle; bitince "Son tamamlanan"a taşı.
