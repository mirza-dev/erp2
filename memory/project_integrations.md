---
name: Roven — Entegrasyonlar, AI ve Test Altyapısı
description: Paraşüt entegrasyonu (Faz 1-16, gerçek HTTP adapter dahil), AI kolon eşleştirme, health check, test altyapısı
type: project
originSessionId: 51d75dba-8151-4d4a-b842-f092a8ea93c9
---
## Paraşüt Entegrasyonu

**Durum: Faz 1-16 KOD OLARAK TAMAMLANDI (2026-08-29). Canlı doğrulama bekliyor.**

### Faz 12-16 (2026-08-29 — muhasebe/vergilendirme kapanışı)
Kullanıcı: "stoklar siparişler satışlar vs her şey muhasebe ve vergilendirme için
Paraşüt ile entegre, hatasız eksiksiz akmalı."

**Kritik tespit:** Faz 1-11 olgundu ama **fişi takılı değildi** —
`getParasutAdapter()` `PARASUT_USE_MOCK=false` iken THROW ediyordu; gerçek API'ye
giden TEK SATIR kod yoktu. Ayrıca alış tarafı (indirilecek KDV), tahsilat ve stok
girişi tamamen eksikti.

| Faz | Commit | Özet |
|-----|--------|------|
| 12 | `21497bf` | **Gerçek HTTP adapter** (`parasut-http-adapter.ts`, JSON:API). Spec'ten 4 düzeltme: e-fatura ilişki anahtarı `invoice` / e-arşiv `sales_invoice` (ASİMETRİK) · e-belge `issue_date` readOnly → gönderilmez · `internet_sale` OBJE (boolean 422 verirdi) · irsaliye kalemleri `stock_movements` ilişkisi. **İmport döngüsü** `serviceParasutOAuthRefresh(adapter)` imzasıyla kaynakta kırıldı. Ayrıca `exchange_rate` (TCMB alış) + `order_no` boşluğu kapandı. 5930 test |
| 13 | `7adc040` | **Alış faturası** — mig.107. `vendors.parasut_contact_id`+lease · PO `parasut_*` · **`purchase_order_lines.vat_rate`** (KDV yalnız başlıktaydı, karışık oranda yanlış fatura) · **`vendor_invoice_no/date`** (KDV indiriminin resmî künyesi, mal kabulde girilir). Tetik yalnız `received` (kısmi kabulde gider yazmak yanlış). `listPurchaseBills`'te invoice_no filtresi YOK → tedarikçi bazlı sayfalama + açıklamada PO no eşleşmesi. 5995 test |
| 14 | `0ba37ef` | **Tahsilat geri okuma** — mig.108. `payment_status`/`remaining`/`remaining_try` · poll CRON (claim yok, `paid` terminal) · **Açık Alacak KPI'ı GERİ GELDİ** (2026-06'da proxy olduğu için kaldırılmıştı; artık Paraşüt gerçeği) · `payment_overdue` uyarısı. Toplama YALNIZ TL üzerinden. 6045 test |
| 15 | `26333b5` | **Stok mutabakatı** — `stock_updates` MUTLAK yazar (delta değil) → olay tekrarı yerine mutabakat. **Varsayılan yalnız-rapor**; yazma `PARASUT_STOCK_AUTOCORRECT=true` ile. `inventory_levels` boş → `null` (0 DEĞİL). 6083 test |
| 16 | `1cf8ee3` | **`scripts/parasut-gate.ts`** (`npm run parasut:gate [--write]`) — stok invariant'ını gerçek API'de ÖLÇER, ihlalde exit 1. **Kapalı-teslim kanıtı** testi. `docs/parasut-golive-runbook.md` (mali müşavir belge eşleme tablosu dahil). 6100 test |

**Teslim yapılandırması:** `PARASUT_ENABLED=false` + `PARASUT_USE_MOCK=true` →
kapalı teslim (kullanıcı kararı). İKİ anahtar da gerekli.

**Kullanıcı tarafı kalan:** Paraşüt API başvurusu (`destek@parasut.com`) + redirect
URI kaydı · **mig.107 + 108 APPLY** · `npm run parasut:gate -- --write` (deneme
şirketinde) · anahtarları açma. Sıra: `docs/parasut-golive-runbook.md`.

**Bilinçli kapsam dışı (v1):** iade/iade faturası · kısmi sevkiyat faturası ·
çift yönlü senkron · çok depolu stok · e-Defter/BA-BS · ihracat `item_type: export`.

---

### Faz 1-11 (2026-04, mock altyapısı)

### Tamamlanan Fazlar
| Faz | Özet | Test |
|-----|------|------|
| 1 | Migration + adapter interface + sabitler + mock | 1683 |
| 2 | OAuth token lease + CAS + start/callback route | 1704 |
| 3 | parasutApiCall() wrapper (429 Retry-After + log) | 1719 |
| 4 | Error classification + step backoff + stats | 1743 |
| 5 | Contact upsert + TTL lease mutex (migration 040) + 6 bulgu fix | 1791 |
| 6 | Product upsert + TTL lease mutex (migration 041) | 1810 |
| 7 | Claim/lease RPC + parasutInvoiceNumberInt + mapCurrency(GBP) + stubs + bulgu fix | 1824 |
| 8 | Shipment document: idempotent, recovery pagination, durable marker, create | 1852 |
| 9 | Sales invoice: idempotent, fast lookup, durable marker, stok invariant, computeDueDate | 1880 |
| 10 | E-belge: idempotent, recovery 1/2, type detection (VKN normalize), poll CRON, idempotent guards | 1914 |

### Mimari (plan: parasut_plan.md)
- `ParasutAdapter` interface (`parasut-adapter.ts`) — **gerçek adapter Faz 12'de eklendi** (`parasut-http-adapter.ts`)
- `MockParasutAdapter` (`parasut.ts`) — in-memory, tri-state error injection, invariant assertions
- `parasut-constants.ts` — ParasutStep, ParasutErrorKind, ALERT_ENTITY_* UUID'leri
- `parasut-api-call.ts` — parasutApiCall() wrapper (429 retry, structured log)
- `parasut-service.ts` — serviceEnsureParasutContact (TTL lease mutex), classifyAndPatch, markStepDone, checkAuthAlertThreshold
- `parasut-oauth.ts` — getAccessToken, CAS lease
- **`PARASUT_ENABLED=true` VE `PARASUT_USE_MOCK=false`** → gerçek sync; biri eksikse ölü yol

### DB alanları (migration 039)
- `parasut_oauth_tokens` tablosu (singleton lease, CAS)
- `sales_orders`: parasut_step, parasut_error_kind, claim/release lock, crash marker'lar, e-doc alanları
- `customers`: parasut_contact_id, city, district, parasut_contact_creating_until, parasut_contact_creating_owner (migration 040 — TTL lease)
- `products`: parasut_product_id, parasut_product_creating_until, parasut_product_creating_owner (migration 041 — TTL lease)
- `order_lines`: vat_rate
- Claim/release RPC'leri: SECURITY DEFINER, sadece service_role

### Akış sırası (planlanan)
contact upsert → product upsert → shipment_document (inflow=false) → sales_invoice (shipment_included=false) → e-belge → trackable_job poll

### Testler
- `src/__tests__/parasut-mock-adapter.test.ts` — 36 test (tüm metodlar + invariant)
- `src/__tests__/parasut-service-faz6.test.ts` — 19 test (serviceEnsureParasutProduct)
- `src/__tests__/parasut-service-faz7.test.ts` — 24 test (parasutInvoiceNumberInt, mapCurrency, claim/release, step classification)
- `src/__tests__/parasut-service-faz6.test.ts` — 19 test (serviceEnsureParasutProduct)
- `src/__tests__/parasut-service-faz5.test.ts` — 25 test (serviceEnsureParasutContact)
- `src/__tests__/parasut-service-faz4.test.ts` — 24 test (classifyAndPatch, markStepDone, checkAuthAlertThreshold)
- `src/__tests__/parasut-api-call.test.ts` — 15 test
- `src/__tests__/parasut-oauth.test.ts` — 21 test
- `src/__tests__/parasut-service.test.ts`, `parasut-disabled.test.ts`, `order-ship-parasut.test.ts`
- `src/__tests__/credentials-no-leak.test.ts` — OAuth token sızıntı guard (poisoned fixture)

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
- **Playwright CI:** ✅ GitHub Secrets eklendi (2026-04-23) — 23 test CI'da çalışır durumda
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
