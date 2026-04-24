---
name: Current Focus
description: Aktif sprint, son tamamlanan işler ve sonraki adımlar
type: project
originSessionId: 51d75dba-8151-4d4a-b842-f092a8ea93c9
---
**Aktif:** Paraşüt entegrasyonu — Faz 3 sırada (parasutApiCall wrapper)

---

## Son Tamamlanan İş — Paraşüt Faz 2 (2026-04-25, bulgu fix dahil)

OAuth token lease servisi + route'lar + güvenlik düzeltmeleri tamamlandı.

### Tamamlanan dosyalar

| Dosya | Açıklama |
|-------|----------|
| `src/lib/parasut.ts` | `getParasutAdapter()` factory |
| `middleware.ts` | `/api/parasut/oauth/callback` → ALWAYS_PUBLIC |
| `src/lib/services/parasut-oauth.ts` | `getAccessToken(adapter)`: lease + **re-read after lease** (stale refresh_token fix) + CAS + polling + sync_issue alert |
| `src/app/api/parasut/oauth/start/route.ts` | requireAdmin, HMAC-signed state cookie (`CRON_SECRET`), mock bypass |
| `src/app/api/parasut/oauth/callback/route.ts` | CSRF (HMAC verify + timingSafeEqual), 409 lock check, **upsert** (non-atomic INSERT fix), 409/502 hata yolları |
| `src/__tests__/parasut-oauth.test.ts` | 21 test (re-read fresh token testi dahil) |

### Bulgu özeti (kapatıldı)
- HIGH: Stale refresh_token — re-read after lease ile giderildi
- HIGH: Non-atomic first-connection INSERT — `.upsert({ onConflict })` ile giderildi
- MEDIUM: Re-auth CAS doğrulanmıyor — pratik risk sıfır (auth code single-use + 409 guard), yapılmadı
- LOW: State cookie imzasız — HMAC-SHA256 (CRON_SECRET) ile giderildi

**Test sayısı:** 87 dosya · 1704 test (hepsi yeşil) · TS temiz

### Sıradaki adım — Faz 3
`src/lib/services/parasut-api-call.ts` — `parasutApiCall()` wrapper:
- 429 Retry-After desteği
- PARASUT_ENABLED guard
- Context logging (her adapter çağrısı loglanacak)

**Why:** Yeni session'da Claude aktif konuyu eksiksiz bilsin.
**How to apply:** Faz 2 tamamen kapalı. PARASUT_PLAN.md tracker güncel. Faz 3'ten devam et.
