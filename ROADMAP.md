# KokpitERP Test & Kalite Yol Haritası

Tüm maddeler tamamlandığında bu dosya silinecek.

## Aktif Görevler

- [x] parasut-service.ts branch coverage (27% → 95.45%)
- [x] import-service.ts branch coverage — order_line, parseNumeric TR, shipment/invoice/payment branches, meta processing
- [x] ai-service.ts — aiParseEntity() ve error path'leri, aiDetectColumns
- [x] vitest.config.ts — branches: 80 threshold eklendi
- [x] .github/workflows/test.yml — npm run test:coverage (threshold CI'da zorunlu)

## Dış Araçlar Yol Haritası

### Kısa vadeli
- [x] Codecov — PR'da branch/line diff + badge (lcov reporter + codecov.yml + upload adımı)
- [x] GitHub branch protection — test geçmeden merge engeli

### Orta vadeli
- [x] Sentry — production hata takibi (@sentry/nextjs kuruldu, error.tsx entegre)
  - ⚠️ Manuel: sentry.io'da proje oluştur → NEXT_PUBLIC_SENTRY_DSN + SENTRY_DSN değerlerini .env.local'a ekle
- [ ] Supabase local + integration tests — DB/RLS/migration gerçek DB'de
  - ⚠️ Manuel: `brew install supabase/tap/supabase` → `supabase init` → `supabase start`

### Uzun vadeli
- [x] k6 load test — tests/load/alert-scan.k6.js + import-wizard.k6.js + load-test.yml CI workflow
  - ⚠️ Manuel: `brew install k6` (local çalıştırma için)
- [x] Playwright CI — GitHub Secrets eklendi (2026-04-23) ✅

