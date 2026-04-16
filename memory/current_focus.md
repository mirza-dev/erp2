---
name: Current Focus
description: Aktif sprint, son tamamlanan iş ve sonraki adımlar
type: project
---

**Aktif:** —

**Son tamamlanan (2026-04-16 — E2E test kalitesi):**

Bulgular raporuna göre sahte-yeşil E2E testler güçlendirildi:

1. **aging.spec.ts** — `.or().first()` strict-mode fail → exact text match (`"Durgun + Ölü SKU"`)
2. **orders.spec.ts** — Tüm adımlar `if (isVisible)` korumasından çıkarıldı; sipariş oluşturma testi gerçek API akışını test ediyor; URL `/orders$` regex ile doğrulanıyor; arama testi `count>=0` → `rowCount===0 || noResultsMsg`
3. **alerts.spec.ts** — Tab butonları mandatory `toBeVisible` + click; arama kutusu mandatory visible
4. **products.spec.ts** — `void badges` no-op → `rowCount > 0` assertion
5. **Lint temizlendi** — dashboard unused locator, global-setup unused import/param, fixtures eslint-disable

**Sonuç:** 23/23 E2E geçiyor · 0 lint error

**Bekleyen manuel adımlar:**
- Sentry: sentry.io → NEXT_PUBLIC_SENTRY_DSN + SENTRY_DSN → .env.local ve GitHub Secrets
- Supabase local: `brew install supabase/tap/supabase` → `supabase init`
- k6 local: `brew install k6`

**Test:** 1465 vitest (0 fail) + 23 Playwright (0 fail) · Lint: 0 error

**Why:** Yeni session'da Claude aktif konuyu bilsin.
**How to apply:** Her büyük özellik başlarken "Aktif" alanını güncelle; bitince "Son tamamlanan"a taşı.
