---
name: KokpitERP — Entegrasyonlar, AI ve Test Altyapısı
description: Paraşüt mock, AI kolon eşleştirme, health check, test altyapısı ve mock pattern'ler
type: project
---

## Paraşüt Entegrasyonu

- `src/lib/parasut.ts` — **şu an MOCK** (%90 başarı, 1-1.8s rastgele gecikme)
- Gerçek API'ye geçmek için `sendInvoiceToParasut()` içini değiştir
- `src/lib/services/parasut-service.ts` — `serviceSyncOrderToParasut`, `serviceSyncAllPending`, `serviceRetrySyncLog`
- **`PARASUT_ENABLED=true`** → sync aktif; boş/false → DB'ye yazmadan erken döner
- UI bağlantı durumu `config.enabled`'dan türetiliyor
- Sipariş detay → sevk → `await serviceSyncOrderToParasut(id)` (fire-and-forget değil)
- Regression: `src/__tests__/parasut-disabled.test.ts`

---

## AI Katmanı (Claude Haiku)

**5 yetenek:** Import Column Detection · Order Review Risk · AI Ops Summary · Stock Risk Forecast · Purchase Copilot v1

**Import AI (Faz 8 yenileme — 2026-04-11):**
- `aiDetectColumns()` — sheet başına TEK AI çağrısı, kolon adı + 5 örnek satır + entity_type ile
- Algılama sırası: `column_mappings` hafıza → `FALLBACK_FIELD_MAP` → AI (sadece gerçekten bilinmeyen kolonlar için)
- `normalizeColumnName()` — Türkçe transliterasyon (İ→i, ğ→g, ü→u vb.), tüm route'lar ve fallback paylaşıyor
- Hafıza: `column_mappings` tablosu (usage_count, success_count) — success_count sadece confirm sonrası artırılıyor
- Import sonrası yeni kategoriler products/page.tsx'te otomatik filtre seçeneklerine yansır (dinamik useMemo)

**Stage 2A:** AI memory layer, audit trail, guardrails (G1-G4), run logging (`ai_runs` tablosu)

**Stage 2B:** `ai_recommendations` lifecycle (suggested→accepted/edited/rejected/expired), kullanıcı feedback, observability metrics
- `GET /api/ai/observability` → son 7 gün istatistik; her zaman 200 (DB hatası non-fatal)

**Settings AiTab:** 8s AbortController timeout, retry butonu

---

## Health Check (2026-04-23 — B-04 fix)

- `GET /api/health` — ALWAYS_PUBLIC (middleware kontrolü yok)
- **Anonim (default):** env var + tek DB ping → `{"status":"ok"|"degraded"}` + 200/503. İç detay sızmaz.
- **`?detail=true` + `Authorization: Bearer CRON_SECRET`:** Tam çıktı — env, DB tabloları, migration ID'leri, RPC varlıkları
- `REQUIRED_KEYS` export: hangi key'lerin zorunlu olduğunu kilitler (test tarafından import edilir)
- `interpretMigration011Result` export: migration 011 probe sonucunu string'e çevirir
- Regression: `src/__tests__/health-migration-011.test.ts` (12 test, pure function testi)

---

## Test Altyapısı

- **Framework:** Vitest · `src/__tests__/` · node environment
- **1609 test** (2026-04-23 itibarıyla, 0 fail) · 83 dosya
- **E2E:** `@playwright/test` · Chromium · `tests/` — 23 test, tümü yeşil
  - `tests/helpers/test-data.ts` — API üzerinden test müşteri/ürün/sipariş oluşturma/silme
  - `tests/fixtures.ts` — `demoPage` fixture (demo_mode=1 cookie)
  - `tests/global-setup.ts` — Supabase signIn → storageState persist
- **Smoke testler:** `scripts/smoke.ts` — **24 endpoint**, response shape validation
  - `npm run smoke` (dev server çalışırken)
- **k6 load testleri:** `tests/load/` — 6 script (alert-scan, breakpoint-scan, concurrency-quote-convert, concurrency-stock-reservation, capacity-endpoints, breakpoint-api)
  - `.github/workflows/load-test.yml` — manuel tetiklemeli CI (`workflow_dispatch`)
  - Audit sonuçları: `results/` klasörü, rapor: `docs/audit/faz4-capacity-matrix.md`
  - Kırılma noktaları: stok rezervasyon soft limit 50 VU, tam çöküş 100 VU
- **Eval suite:** `src/__tests__/eval/` — AI kalite değerlendirmesi
- **Playwright CI:** Testler yazılı (23 test, yeşil) ama CI'da çalışmıyor — **6 GitHub Secret eksik:**
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY` (zaten var), `E2E_USER_EMAIL`, `E2E_USER_PASSWORD`
- **Sentry:** `@sentry/nextjs` — kod + DSN tam kurulu ✅ (2026-04-22'de DSN `.env.local` + GitHub Secrets'a eklendi)

**Mock pattern:**
```ts
vi.mock("@/lib/supabase/orders", () => ({ dbGetOrderById: vi.fn() }));
// route handler'ı doğrudan import et, mock'lanmış bağımlılıklarla test et
```

**next/headers mock (cookies kullanan route'larda):**
```ts
vi.mock("next/headers", () => ({
    cookies: () => Promise.resolve({ get: () => undefined }),
}));
```

**@supabase/ssr mock (middleware testlerinde):**
```ts
vi.mock("@supabase/ssr", () => ({
    createServerClient: () => ({ auth: { getUser: mockGetUser } }),
}));
```

**@/lib/supabase/server mock (session gerektiren route testlerinde):**
```ts
vi.mock("@/lib/supabase/server", () => ({
    createClient: () => Promise.resolve({
        auth: { getUser: () => Promise.resolve({ data: { user: { id: "test-user" } } }) },
    }),
}));
```
