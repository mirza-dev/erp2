---
name: Current Focus
description: Aktif sprint, son tamamlanan işler ve sonraki adımlar
type: project
originSessionId: 51d75dba-8151-4d4a-b842-f092a8ea93c9
---
**Aktif:** Paraşüt entegrasyonu — Faz 2 sırada (OAuth token lease)

---

## Son Tamamlanan İş — Paraşüt Faz 1 (2026-04-25)

Paraşüt canlıya alma altyapısı kuruldu (API adapter hariç).

### Tamamlanan dosyalar

| Dosya | Açıklama |
|-------|----------|
| `supabase/migrations/039_parasut_integration_prep.sql` | Token tablosu (singleton lease), customers/products/order_lines/sales_orders yeni kolonlar, CHECK constraints, partial unique index'ler, retry CRON index, claim/release RPCs (SECURITY DEFINER + REVOKE/GRANT) + smoke test talimatı |
| `src/lib/parasut-constants.ts` | Sabit UUID'ler, ParasutStep/ErrorKind/InvoiceType/EDocStatus tip alias'ları |
| `src/lib/parasut-adapter.ts` | `ParasutError` + `ParasutAdapter` interface (tüm metodlar + input/output tipleri) |
| `src/lib/parasut.ts` | `MockParasutAdapter`: in-memory, tri-state error injection, e-doc tip tracking, reset(), legacy delegate |
| `src/lib/database.types.ts` | CustomerRow/ProductRow/OrderLineRow/SalesOrderRow/IntegrationSyncLogRow/ParasutOAuthTokensRow güncellendi; 4 yeni Parasut* tipi |
| `src/app/api/settings/company/route.ts` | GET allowlist koruması eklendi (token alanları sızmaz) |
| `src/__tests__/parasut-mock-adapter.test.ts` | 36 yeni test: tüm adapter metodları, invariant assertions, state machine, tip ayrımı |
| `src/__tests__/credentials-no-leak.test.ts` | Poisoned fixture ile güçlendirildi; 4 yeni token sızıntı testi |

**Test sayısı:** 86 dosya · 1683 test (hepsi yeşil) · TS temiz

### Sıradaki adım — Faz 2
OAuth token lease servisi (`src/lib/services/parasut-oauth.ts`):
- `getAccessToken(adapter)` — lease + CAS (token_version)
- Paralel refresh koruması: refresh_lock_until + refresh_lock_owner
- `/api/parasut/oauth/start` — state cookie + redirect
- `/api/parasut/oauth/callback` — CSRF doğrulama + singleton upsert

### Ertelenen / scope dışı
- RPC permission smoke testi (service_role ✓, anon ✗) — gerçek DB gerektirir; talimat migration 039 sonunda. Faz 12 gate'inden önce staging'de elle doğrulanacak.
- Sesli giriş V3: fireNotes → scrap_qty UI, Ctrl+M
- Rate limiting (Upstash Redis)
- `purchase_commitments` + `column_mappings` RLS migration

**Why:** Yeni session'da Claude aktif konuyu eksiksiz bilsin.
**How to apply:** Paraşüt Faz 1 tamamlandı. PARASUT_PLAN.md tracker'ı güncel. Faz 2'den devam et.
