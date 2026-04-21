---
name: KokpitERP — Güvenlik ve Demo Mode
description: RLS, auth middleware, demo mode mimarisi, credential güvenliği
type: project
---

## Supabase RLS

Tüm 23 tablo için Row Level Security aktif.

---

## Auth Middleware (`middleware.ts` — proje kökünde)

- `/` ve `/login` → herkese açık; auth'd kullanıcı `/`'e gelirse `/dashboard`'a yönlendir
- `/dashboard/**` ve `/api/**` → oturum gerektirir
- **ALWAYS_PUBLIC:** `/api/health`, `/api/auth/demo`, `/api/seed` — middleware kontrolü yok
- **CRON_PATHS** (CRON_SECRET Bearer token bypass): `/api/alerts/scan`, `/api/alerts/ai-suggest`, `/api/parasut/sync-all`, `/api/orders/expire-quotes`, `/api/orders/check-shipments`
- `/api/seed` özel: ALWAYS_PUBLIC ama kendi route handler'ında **CRON_SECRET Bearer token zorunlu** (herhangi auth'd user erişimi kaldırıldı — 2026-04-21)

---

## Demo Mode Mimarisi

**Entry:** Landing "Demo Gez" → `demo_mode=1` cookie → `/dashboard`

**`src/lib/demo-utils.ts`:**
- `isDemoMode()`, `enterDemoMode()`, `clearDemoMode()` (mevcut)
- `useIsDemo(): boolean` — SSR-safe React hook (`useState(() => isDemoMode())`)
- `DEMO_DISABLED_TOOLTIP` — buton title attribute için canonical Türkçe metin
- `DEMO_BLOCK_TOAST` — handler toast için canonical Türkçe metin

**Middleware gate (demo_mode=1 + unauthenticated):**
- `/dashboard/**` → izin ver
- `GET /api/**` → izin ver
- `POST/PATCH/DELETE /api/**` → 403 `{ error: "Demo modunda değişiklik yapılamaz." }`
- Auth'lu kullanıcılar bu bloktan geçmez

**Client-side guard pattern (tüm 12 mutation sayfası):**
```tsx
const isDemo = useIsDemo();
// handler:
if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
// button:
<Button disabled={isDemo || ...} title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}>
```

**DataContext `demoGuard()`:** Pure boolean — `return checkDemoMode()`. Artık `clearDemoMode()` çağırmaz, `/login`'e redirect etmez. Ziyaretçi dashboard'da kalır.

**Etkilenen sayfalar (12 dosya):**
- `settings/users`, `import`, `orders`, `orders/new`, `orders/[id]`, `products`, `customers`, `CustomerDetailPanel`, `production`, `parasut`, `alerts`, `purchase/suggested`

**Settings kısıtlamaları (demo):**
- `GET /api/parasut/config` → `{ enabled, companyId: null, clientId: null, clientSecretConfigured: false }`
- `GET /api/settings/api-keys-status` → `{ parasut: false, claude: false, vercel: false }`
- Settings Firma/Kullanıcı tabları → placeholder mesaj gösterir
- PII (`initialFirmaForm`, `initialProfileForm`) JS bundle'dan çıkarıldı (boş string default)

**Cookie check pattern (route handler'larda):**
```ts
import { cookies } from "next/headers";
const isDemo = (await cookies()).get("demo_mode")?.value === "1";
```
Test dosyalarında `vi.mock("next/headers", () => ({ cookies: () => Promise.resolve({ get: () => undefined }) }))` ile mock'lanır.

---

## Admin Endpoint Koruması (2026-04-21)

`GET/POST /api/admin/users` + `DELETE /api/admin/users/[id]` — `requireAdmin()` helper:
- Auth kontrolü: oturum yoksa 401
- `ADMIN_EMAILS` env var: virgülle ayrılmış email listesi; kullanıcı listede değilse 403
- `ADMIN_EMAILS` tanımsız veya boşsa tüm auth'd kullanıcılara açık (kırılmasız default)

## Security Headers (2026-04-21)

`next.config.ts` → tüm rotalar için (`/:path*`):
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `Referrer-Policy: strict-origin-when-cross-origin`

## Credential Güvenliği

- Gerçek key değerleri client'a hiç gönderilmiyor
- Auth'd kullanıcı: masked (ilk 4 kar + ••••••••) + boolean flag
- Demo/anon: null veya false
- Regression: `src/__tests__/credentials-no-leak.test.ts`
- Demo middleware regression: `src/__tests__/demo-mode-middleware.test.ts` (27 test)
