---
name: KokpitERP — Güvenlik ve Demo Mode
description: RLS, auth middleware, demo mode mimarisi, credential güvenliği, audit fix durumu
type: project
originSessionId: 9b856903-3698-4fae-92be-9c687d469cdf
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
- ~~M-3: Rate limiting~~ — ✅ TAMAMLANDI (2026-05-25, commit pending). Yaklaşım B uygulandı:
  Coolify self-hosted Redis (Resource olarak panel'den eklenir, REDIS_URL auto-inject).
  Backend: `ioredis` + `rate-limiter-flexible` (sliding window, atomic Lua scripts).
  Helper `src/lib/rate-limit.ts`: singleton Redis + POLICIES (LOGIN 5/15dk, DEMO 5/15dk,
  AI 10/dk, PARASUT_SYNC 30/dk, API_AUTH 300/dk, API_ANON 30/dk) + `selectPolicy` +
  `extractClientIp` + `detectSupabaseAuthCookie` (getUser maliyetine girmeden auth proxy).
  Middleware sıralaması: (1) /api/health absolute bypass, (2) CRON_SECRET bypass,
  (3) rate-limit (auth-cookie hibrit, IP-anchor key), (4) ALWAYS_PUBLIC bypass,
  (5) CRON 401, (6) Supabase auth gate. Fail-open: REDIS_URL boş veya bağlantı hatası
  → tüm istekler geçer + console.error (site downtime'a sebep olmaz).
  +26 test (helper 11 + pure 6 + middleware 9). Deploy adımları: Coolify panel → Redis
  Resource ekle → REDIS_URL doğrula → redeploy. Smoke: 6 hızlı POST /login → 6. 429.
- `purchase_commitments` + `column_mappings` RLS — 029'da ENABLE ROW LEVEL SECURITY mevcut ✅; explicit policy yok (proje genelinde aynı pattern)
- `purchase_commitments` + `column_mappings` RLS — 029'da ENABLE ROW LEVEL SECURITY mevcut ✅; explicit policy yok (proje genelinde aynı pattern)
