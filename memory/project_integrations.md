---
name: KokpitERP — Entegrasyonlar, AI ve Test Altyapısı
description: Paraşüt mock, AI Stage 2A/2B, health check, test altyapısı ve mock pattern'ler
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

**5 yetenek:** Import Intelligence · Order Review Risk · AI Ops Summary · Stock Risk Forecast · Purchase Copilot v1

**Stage 2A:** AI memory layer, audit trail, guardrails (G1-G4), run logging (`ai_runs` tablosu)

**Stage 2B:** `ai_recommendations` lifecycle (suggested→accepted/edited/rejected/expired), kullanıcı feedback, observability metrics
- `GET /api/ai/observability` → son 7 gün istatistik; her zaman 200 (DB hatası non-fatal)

**Import AI:** Batch parse 20'lik chunk'larla (100 satır → 5 batch)

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
- **45 dosya · 1059 test:** service, route handler, middleware, AI, import, credentials
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
