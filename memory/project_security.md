---
name: Roven — Güvenlik ve Demo Mode
description: RLS, auth middleware, demo mode mimarisi, credential güvenliği, audit fix durumu
type: project
originSessionId: 9b856903-3698-4fae-92be-9c687d469cdf
---
## 2026-06 Denetim + Gate Sistemi (GÜNCEL referans)

**Tam bulgular:** `docs/audit/2026-06-guvenlik-dogruluk-bulgulari.md` (5 Kritik · 8 Yüksek · 11 Orta · 6 Düşük + elenen yanlış-pozitifler). **Tur A–E düzeltmeleri TAMAMLANDI (2026-06; rapor §8 durum tablosu):** K1 audit-log guard · K2 mig.093 sunucu-recompute · K3 import KDV · K4+Y3 reconciler · Y4 mig.094 · Y7 mig.095 (093/094/095 apply edildi ✅) · Y6 localISODate · xlsx CDN 0.20.3 · **Next 16.1.7 → 16.2.9 + fast-uri 3.1.2 (2026-06-12, `64c2fd0`) → deps-gate ALLOWLIST BOŞ** — yeni high/critical advisory anında CI kırar. **Y1 da kapandı (2026-06-12):** kalan 7 GET demo-dostu `requirePermissionFor` aldı (anonim→viewer fallback bilinçli — demo yaşar; import uçları fiilen kapalı; baseline ACIK-BULGU boş). Açık: yalnız O5 Upstash rate-limit (ertelendi).

**Gate (sürekli bekçiler):** `src/__tests__/gate/` route-guard matrisi + SQL/migration lint (baseline-allowlist: guard'sız yeni route / hijyensiz yeni DEFINER / kayıtsız RPC redefinition → CI kırmızı) · `scripts/check-deps.mjs` (test.yml deps-gate job) · `scripts/check-migrations.ts` (READ-ONLY OpenAPI-probe drift; **schema_migrations bu projede güvenilmez** — Studio'dan elle apply kayıt düşürmez). Kullanım: runbook Faz 4.

---

## Supabase RLS

Tüm 23 tablo için Row Level Security aktif.

---

## Auth Middleware (`middleware.ts` — proje kökünde)

- `/` ve `/login` → herkese açık; auth'd kullanıcı `/`'e gelirse `/dashboard`'a yönlendir
- `/dashboard/**` ve `/api/**` → oturum gerektirir
- **ALWAYS_PUBLIC:** `/api/health`, `/api/auth/demo`, `/api/seed`, `/api/alerts/scan`
  - `/api/alerts/scan` burada çünkü kendi route handler'ında CRON_SECRET OR session kontrolü yapıyor
- **CRON_PATHS** (sadece CRON_SECRET Bearer token — session bypass YOK — M-1 fix):
  `/api/alerts/ai-suggest`, `/api/parasut/sync-all`, `/api/orders/expire-quotes`, `/api/orders/check-shipments`, `/api/quotes/expire`
- C-1 fix: Supabase init try-catch içinde — init başarısız olursa user=null → kimliksiz işlenir

---

## Demo Mode Mimarisi

**Entry:** Landing "Demo Gez" → `demo_mode=1` cookie → `/dashboard`

**`src/lib/demo-utils.ts`:**
- `useIsDemo(): boolean` — SSR-safe React hook
- `DEMO_DISABLED_TOOLTIP`, `DEMO_BLOCK_TOAST` — canonical Türkçe metinler

**Middleware gate (demo_mode=1 + unauthenticated):**
- `/dashboard/**` → izin ver
- `GET /api/**` → izin ver
- `POST/PATCH/DELETE /api/**` → 403 `{ error: "Demo modunda değişiklik yapılamaz." }`
- Auth'lu kullanıcılar bu bloktan geçmez
- **Not:** CRON_PATHS demo mode kontrolünden ÖNCE çalışır → 401 döner (403 değil)

**Client-side guard pattern (tüm 12 mutation sayfası):**
```tsx
const isDemo = useIsDemo();
if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
<Button disabled={isDemo || ...} title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}>
```

---

## Security Headers (next.config.ts — H-1, M-2, L-1 fix 2026-04-23)

Tüm rotalar için (`/:path*`):
- `X-Content-Type-Options: nosniff` ✅
- `X-Frame-Options: SAMEORIGIN` ✅
- `Referrer-Policy: strict-origin-when-cross-origin` ✅
- `Content-Security-Policy` ✅ (`unsafe-inline` gerekli — inline styles)
- `Strict-Transport-Security` ✅ (max-age=63072000; includeSubDomains; preload)
- `Permissions-Policy` ✅ (camera=(), microphone=(), geolocation=())

---

## Error Handling (api-error.ts — C-2, C-3, M-4 fix 2026-04-23)

- `safeParseJson(req)`: bozuk JSON/null body → 400 (26 route'da kullanılıyor)
- `handleApiError`: prod'da generic mesaj, dev'de gerçek mesaj; numeric overflow → 400
- `validateStringLengths`: 10KB max string limit (orders/products/customers/quotes POST)
- `limit` param üst sınırı 500: movements, parasut/logs, production GET route'ları

---

## Admin Endpoint Koruması

`GET/POST /api/admin/users` + `DELETE /api/admin/users/[id]` — `requireAdmin()` helper:
- Auth kontrolü: oturum yoksa 401
- `ADMIN_EMAILS` env var; kullanıcı listede değilse 403

---

## Credential Güvenliği

- Auth'd kullanıcı: masked (ilk 4 kar + ••••••••) + boolean flag
- Demo/anon: null veya false
- Regression: `src/__tests__/credentials-no-leak.test.ts`

---

## Audit Durumu (2026-04-23) — TÜM BULGULAR KAPALI ✅

Son kalan ertelenen:
- **M-3: Rate limiting** — 🟡 **AI cost mitigated / global Redis deferred (2026-05-26)**
  Coolify self-hosted Redis Docker network izolasyonu nedeniyle çözülemedi
  (terminal yok, `--network coolify` HTTP-only). REDIS_URL env unset →
  middleware-level `rateLimitCheck` fail-open path (resilience fix `c65ee97`
  ile her durumda <200ms). Yerine route-level in-memory AI guard eklendi
  (`src/lib/ai-route-limit.ts`): `checkAiRateLimit` rolling window 5/dk/IP
  + `guardAiRoute` helper. 5 AI route'unda auth check sonrası, Anthropic
  çağrısı öncesi: purchase-copilot 5/dk, stock-risk 5/dk, parse 10/dk
  (import wizard çoklu çağrı), ops-summary 5/dk, score 5/dk; observability
  guard YOK (Anthropic çağrısı yok). Map cleanup amortize 5dk'da bir.
  429 response: `Retry-After` + `X-RateLimit-*` header. Defense-in-depth —
  middleware bypass olsa bile çalışır (önceki Next 16 Turbopack P0
  bug'ından öğrenildi). Tehdit modeli: login brute-force Supabase GoTrue
  built-in koruması, parasut sync CRON_PATHS Bearer zorunlu, /api/products
  scrape auth gate (401), demo mutation 403 — sadece AI cost
  amplification gerçek risk, kapatıldı.
  **Aşama 3 (1-2 hafta sonra ayrı PR):** Upstash REST migration
  (`@upstash/redis` + `@upstash/ratelimit`) — Docker networking yok,
  Coolify env tek tıkla. Route-level AI guard refactor'da KORUNUR
  (ek savunma katmanı). Free tier: 500K commands/ay (resmi pricing,
  güncel limit dashboard'dan kontrol).
  Test: 25 yeni (10 unit + 15 integration source-regex). 3606 test yeşil.

- ~~M-3: Rate limiting (eski entry — Yaklaşım B Coolify Redis)~~ — Implementation kaldı (fail-open path), Upstash refactor'unda silinecek. Yaklaşım B uygulandı:
  Coolify self-hosted Redis (Resource olarak panel'den eklenir, REDIS_URL auto-inject).
  Backend: `ioredis` + `rate-limiter-flexible` (sliding window, atomic Lua scripts).
  Helper `src/lib/rate-limit.ts`: singleton Redis + POLICIES (LOGIN 5/15dk, DEMO 5/15dk,
  AI 10/dk, PARASUT_SYNC 30/dk, API_AUTH 300/dk, API_ANON 30/dk) + `selectPolicy` +
  `extractClientIp` + `detectSupabaseAuthCookie` (getUser maliyetine girmeden auth proxy).
  Middleware sıralaması: (1) /api/health absolute bypass, (2) CRON_SECRET bypass,
  (3) rate-limit (auth-cookie hibrit, IP-anchor key), (4) ALWAYS_PUBLIC bypass,
  (5) CRON 401, (6) Supabase auth gate. Fail-open: REDIS_URL boş veya bağlantı hatası
  → tüm istekler geçer + console.error (site downtime'a sebep olmaz).
  +36 test (helper 11 + pure 6 + middleware 13 + proxy build manifest 6). Deploy
  adımları: Coolify panel → Redis Resource ekle → REDIS_URL doğrula → redeploy.
  Smoke: `curl /api/auth/demo` 6 kez → 6. 429 (login akışı client-side SDK,
  Supabase GoTrue brute-force koruması).

  **Review 2 (2026-05-25 P0 fix):** İlk implementation `middleware.ts` + Next 16
  `runtime: "nodejs"` config kullanıyordu — TESTLER YEŞİL ama production'da
  middleware INVOKE EDİLMEDİ. Kanıt: `.next/server/functions-config-manifest.json`
  BOŞ kalıyordu (`functions: {}`), HTTP smoke /dashboard auth'suz 200,
  /api/products 401 değil, /api/parasut/sync-all Bearer'sız 200, X-RateLimit-*
  header yok. Next 16 source incelendi: `build/utils.js:1535` `if (staticInfo.runtime
  === 'nodejs' || isProxyFile(page))` koşulu Turbopack'te `middleware.ts` için
  yanlış parse ediyordu. **Çözüm:** `middleware.ts` → `src/proxy.ts` rename
  (Next 16 PROXY_FILENAME convention, otomatik Node runtime). Root-level
  `proxy.ts` Turbopack tarafından discover edilmediği için `src/` altında.
  Build log artık `ƒ Proxy (Middleware)` satırı içerir, functions-config-manifest
  /_middleware entry'si dolar. proxy.ts içinde `export async function proxy(...)`
  + backward-compat `export const middleware = proxy` (test importları korunur).
  +6 regression test (`proxy-build-manifest.test.ts`) — proxy.ts varlığı, root
  middleware.ts yok, named export pattern, alias, matcher, manifest entry.
  Review 1 bulguları: (a) middleware `runtime: "nodejs"` config Next 16 (ioredis TCP
  Edge'de çalışmaz), (b) LOGIN policy dead-code dokümante (login akışı Supabase SDK
  middleware görmez; gelecek server route için hazır), (c) demo test POST→GET fix
  (gerçek route GET), (d) demo_mode cookie API_AUTH limit (auto-reload anon 30/dk
  yetersizdi → 300/dk), (e) `withRateHeaders` helper tüm allow path'lerde, (f)
  PARASUT_SYNC policy dead-code dokümante (UI sync-all CRON_PATHS'te → 401, UX bug
  ayrı tur).

  **Resilience fix (2026-05-26 production outage):** Coolify deploy sonrası Redis
  Docker network izolasyonu nedeniyle ulaşılamadı (`connect ETIMEDOUT`). Önceki
  ioredis options (`enableOfflineQueue:true`, `maxRetriesPerRequest:1`,
  `connectTimeout:3000`) **her isteğe ~6s bloke** ekliyordu → login broken,
  OAuth refresh fail. Kök sorun: `rateLimitCheck` Redis kopukken kullanıcıyı
  bekletmemeli. **Çözüm:** (1) ioredis options sıkılaştırıldı —
  `enableOfflineQueue:false` + `maxRetriesPerRequest:0` + `connectTimeout:1500`
  + `lazyConnect:true` (fire-and-forget `connect().catch(log)`) +
  `retryStrategy:()=>null` (ioredis kendi reconnect denemesin). (2) Module-level
  CIRCUIT BREAKER eklendi: `HARD_TIMEOUT_MS=200` Promise.race + `clearTimeout`
  finally, `CIRCUIT_OPEN_THRESHOLD=3` ardışık fail → `_circuitOpenedAt=Date.now()`
  + console.error, `CIRCUIT_OPEN_DURATION_MS=30_000` boyunca Redis'e dokunma,
  probe başarılı → recordSuccess + console.info "circuit CLOSED", probe fail →
  timestamp yenilenir (yeni 30sn open). 429 (RateLimiterRes) recordSuccess
  sayar (Redis'in başarılı cevabı). Test-only `__resetCircuitForTests` export.
  Performans bütçesi: sağlıklı <5ms, circuit open <1ms, circuit closed+Redis
  kopuk <200ms (HARD_TIMEOUT). In-memory state — multi-instance scale-up
  yapılırsa her instance ayrı circuit (mevcut single-instance için yeterli).
  +6 regression test (hard timeout, 3 fail→OPEN, probe başarılı→CLOSE, probe
  fail→re-OPEN, 429 counter reset, clearTimeout finally). 3581 test yeşil.
  **Üretim önerisi:** REDIS_URL set edilmemiş ise rate limit pasif (fail-open
  path) — Coolify Redis Resource network sorunu çözülene kadar veya alternatif
  backend (Upstash REST, Cloudflare WAF) seçilene kadar güvenli geçici durum.
- `purchase_commitments` + `column_mappings` RLS — 029'da ENABLE ROW LEVEL SECURITY mevcut ✅; explicit policy yok (proje genelinde aynı pattern)
- `purchase_commitments` + `column_mappings` RLS — 029'da ENABLE ROW LEVEL SECURITY mevcut ✅; explicit policy yok (proje genelinde aynı pattern)
