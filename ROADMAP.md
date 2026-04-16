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
- [ ] Codecov — PR'da branch/line diff + badge
- [ ] GitHub branch protection — test geçmeden merge engeli

### Orta vadeli
- [ ] Supabase local + integration tests — DB/RLS/migration gerçek DB'de
- [ ] Sentry — production hata takibi

### Uzun vadeli
- [ ] Playwright CI — GitHub Secrets ile tam E2E (altyapı var, secrets eksik)
- [ ] k6 load test — import wizard ve alert scan yük testi
