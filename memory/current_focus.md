---
name: Current Focus
description: Aktif sprint, son tamamlanan işler ve sonraki adımlar
type: project
originSessionId: 51d75dba-8151-4d4a-b842-f092a8ea93c9
---
**Aktif:** Paraşüt entegrasyonu — Faz 4 sırada (error classification + backoff + stats)

---

## Son Tamamlanan İş — Paraşüt Faz 3 (2026-04-25)

`parasutApiCall()` wrapper tamamlandı.

### Tamamlanan dosyalar

| Dosya | Açıklama |
|-------|----------|
| `src/lib/services/parasut-api-call.ts` | `parasutApiCall<T>(ctx, fn)` wrapper |
| `src/__tests__/parasut-api-call.test.ts` | 15 test |

### Faz 3 özeti
- PARASUT_ENABLED guard: false/unset → `ParasutError('validation')` fırlatır, fn hiç çağrılmaz
- 429 Retry-After: `wait = min(retryAfterSec ?? 5, 30)` → tek retry; ikinci hata olursa fırlatır
- Structured logging: success / rate_limited / success_after_retry / error / error_after_retry
- `ApiCallContext`: `{ op, orderId?, step?, attempt? }`

**Test sayısı:** 88 dosya · 1719 test (hepsi yeşil) · TS temiz

### Sıradaki adım — Faz 4
`src/lib/services/parasut-service.ts` içinde:
- `classifyAndPatch()` — step+error_kind → DB patch
- `markStepDone()` — başarılı adım sonrası reset + audit log
- Stats order-state hesaplamaları (failed_syncs, pending_syncs, blocked_syncs)
- CRON query filter (partial index ile birebir)

**Why:** Yeni session'da Claude aktif konuyu eksiksiz bilsin.
**How to apply:** Faz 3 tamamen kapalı. PARASUT_PLAN.md tracker güncel. Faz 4'ten devam et.
