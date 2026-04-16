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
- [ ] Playwright CI — GitHub Secrets ile tam E2E (altyapı var, testler yazılı)
  - ⚠️ Manuel: 6 GitHub Secret ekle (aşağıya bak)

---

## Playwright CI — Eksik Secrets

GitHub → Repo → Settings → Secrets and variables → Actions:

| Secret | Değer |
|--------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | .env.local'dan kopyala |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | .env.local'dan kopyala |
| `SUPABASE_SERVICE_ROLE_KEY` | .env.local'dan kopyala |
| `ANTHROPIC_API_KEY` | Zaten ekli (test.yml'den) |
| `E2E_USER_EMAIL` | Test kullanıcısı e-postası |
| `E2E_USER_PASSWORD` | Test kullanıcısı şifresi |
