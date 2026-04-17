---
name: Current Focus
description: Aktif sprint, son tamamlanan iş ve sonraki adımlar
type: project
---

**Aktif:** —

**Son tamamlanan (2026-04-17 — Faz 2 DB sorgu + client refresh optimizasyonu):**

1. **Faz 2A** — `dbGetOrderById` 2 sıralı sorgu → 1 Supabase embedded JOIN (`select("*, order_lines(*)")`)
2. **Faz 2B** — `dbCreateOrder` RPC sonrası `SELECT *` ile tam `SalesOrderRow` döndürüyor; `data-context.addOrder` artık `GET /api/orders` refetch yapmıyor, POST response ile state prepend yapıyor
3. **Faz 1** (önceki oturum) — 4 DB index, 30s server cache (`unstable_cache`), email cache 5dk, 9 route'a `revalidateTag`, 24 test, 031 duplicate index cleanup migration

**Önceki (2026-04-17 — navigasyon hızlandırma & donma önleme):**

Commit: `e293a9b perf: navigasyon hızlandırma ve donma önleme`

1. `npm uninstall framer-motion zustand` (kuruluydu ama import edilmiyordu)
2. `React.memo` ile 6 component sarıldı; `useMemo` ile filter/sort
3. Products page mount'ta `POST /api/alerts/scan` kaldırıldı

**Önceki (2026-04-17 — seed data + CI fix + partially_shipped):**

- Seed'e 5 hammadde (raw_material) ürünü eklendi; Hammadde tabı demo'da dolu
- `partially_shipped` badge kaldırıldı → "Sevk Edildi" gösterilir (durum DB'de var ama hiçbir RPC set etmiyor)
- 35 CI vitest hatası düzeltildi (`makeProduct` fixture'larına `is_for_purchase/is_for_sales` eklendi)

**Önceki (2026-04-16 — demo hazırlık & Sentry & smoke testler):**

- **2 kritik semantik hata** düzeltildi: Ship butonu (allocated yerine approved+non-shipped), promisable fallback (available_now - quoted)
- **Sentry** kod tarafı tamamlandı: `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, `next.config.ts` → `withSentryConfig` wrap, `error.tsx` → `Sentry.captureException`
- **k6 load testleri** eklendi: `tests/load/alert-scan.k6.js`, `tests/load/import-wizard.k6.js`; `.github/workflows/load-test.yml` (manual-trigger)
- **Smoke testler** 14 → 24'e genişletildi; her test gerçek bug senaryosunu hedefliyor
- **isForPurchase/isForSales** alan filtrelemesi (stock-utils, purchase-copilot, alerts, purchase-service)

**Bekleyen manuel adımlar:**
- Sentry DSN: sentry.io → `NEXT_PUBLIC_SENTRY_DSN` + `SENTRY_DSN` → `.env.local` ve GitHub Secrets
- Supabase local: `brew install supabase/tap/supabase` → `supabase init`
- k6 local: `brew install k6`

**Test:** 1467 vitest (0 fail) + 23 Playwright (0 fail) · Lint: 0 error

**Yaklaşan:** PMT demo — 2026-04-19 (Cumartesi). Tedarikçi Performansı ve Paraşüt entegrasyonu öncelik değil; odak her şeyin semantik olarak doğru olması.

**Why:** Yeni session'da Claude aktif konuyu bilsin.
**How to apply:** Her büyük özellik başlarken "Aktif" alanını güncelle; bitince "Son tamamlanan"a taşı.
