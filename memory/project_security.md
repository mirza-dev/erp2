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
- Cron bypass: `CRON_SECRET` Bearer token → `/api/alerts/scan`, `/api/alerts/ai-suggest`, `/api/parasut/sync-all`
- `/api/health` ve `/api/auth/demo` → her zaman public

---

## Demo Mode Mimarisi

**Entry:** Landing "Demo Gez" → `demo_mode=1` cookie → `/dashboard`

**`src/lib/demo-utils.ts`:** `isDemoMode()`, `enterDemoMode()`, `clearDemoMode()`

**Middleware gate (demo_mode=1 + unauthenticated):**
- `/dashboard/**` → izin ver
- `GET /api/**` → izin ver
- `POST/PATCH/DELETE /api/**` → 403 `{ error: "Demo modunda değişiklik yapılamaz." }`
- Auth'lu kullanıcılar bu bloktan geçmez

**Client-side guard pattern:** Her mutation handler'ın ilk satırı `if (isDemoMode()) return;`
- 9 DataContext mutasyonu: `demoGuard()` → `clearDemoMode()` + `/login` redirect
- 8 sayfa doğrudan fetch: `isDemoMode()` → erken return (hata toast yok)

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

## Credential Güvenliği

- Gerçek key değerleri client'a hiç gönderilmiyor
- Auth'd kullanıcı: masked (ilk 4 kar + ••••••••) + boolean flag
- Demo/anon: null veya false
- Regression: `src/__tests__/credentials-no-leak.test.ts`
- Demo middleware regression: `src/__tests__/demo-mode-middleware.test.ts` (27 test)
