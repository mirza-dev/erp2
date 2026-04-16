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
- `FALLBACK_FIELD_MAP.product.sektor_uygunlugu = "sector_compatibility"` mevcut; `import-fields.ts`'e 2026-04-15'te eklendi (öncesi import UI "Atla" gösteriyordu)
- Import sonrası yeni kategoriler products/page.tsx'te otomatik filtre seçeneklerine yansır (dinamik useMemo)

**Stage 2A:** AI memory layer, audit trail, guardrails (G1-G4), run logging (`ai_runs` tablosu)

**Stage 2B:** `ai_recommendations` lifecycle (suggested→accepted/edited/rejected/expired), kullanıcı feedback, observability metrics
- `GET /api/ai/observability` → son 7 gün istatistik; her zaman 200 (DB hatası non-fatal)

**Settings AiTab:** 8s AbortController timeout, retry butonu

---

## Health Check

- `GET /api/health` — her zaman public (`ALWAYS_PUBLIC` listesinde)
- `REQUIRED_KEYS` export: env vars + DB tabloları + RPC'ler — eksik → HTTP 503
- Migration 011 probe: `check_migration_011_applied()` RPC ile uuid fix doğrulama
- Regression: `src/__tests__/health-migration-011.test.ts`

---

## Test Altyapısı

- **Framework:** Vitest · `src/__tests__/` · node environment
- **63 dosya · 1274 test** (2026-04-11 itibarıyla)
- **E2E:** `@playwright/test` kurulu (Chromium, Firefox, WebKit), config henüz yok
- **Eval suite:** `src/__tests__/eval/` — AI kalite değerlendirmesi

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
