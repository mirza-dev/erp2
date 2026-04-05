---
name: KokpitERP Project Context
description: PMT Endüstriyel için AI destekli ERP projesi — stack, kurallar, mimari ve mevcut durum
type: project
---

KokpitERP, PMT Endüstriyel'e ait B2B sanayi vana satışı için AI destekli ERP sistemidir.

**Çalışma dizini:** `/Users/mirzasaribiyik/Projects/erp2`
**GitHub:** `mirza-dev/erp2` (public repo)

**Stack:** Next.js 15 · TypeScript · Supabase (14 tablo, 18+ migration) · Tailwind kurulu ama kullanılmıyor
**Font:** `geist` npm paketi (`geist/font/sans`, `geist/font/mono`) — `next/font/google` değil; build sırasında ağ bağımlılığı yok

---

## Kritik kodlama kuralları
- Sadece inline styles + CSS variables — Tailwind class YASAK
- Framer Motion import YASAK
- Her interaktif component için `"use client";`
- Renk değerleri: `var(--text-primary)`, `var(--bg-primary)` vb. CSS variables

---

## Mimari
- DB katmanı: snake_case (`database.types.ts`)
- Frontend katmanı: camelCase (`mock-data.ts`)
- Dönüşüm: `api-mappers.ts` (`mapProduct()`, `mapCustomer()`, `mapOrderDetail()`)
- Çift eksen sipariş: `commercial_status` (draft→pending_approval→approved→cancelled) + `fulfillment_status` (unallocated→...→shipped)
- Rezervasyon sadece `commercial_status = APPROVED` olunca tetiklenir
- Hata yönetimi: `src/lib/api-error.ts` — `handleApiError()` tüm route handler'larda kullanılır

---

## Güvenlik
- **RLS:** Supabase'deki tüm 23 tablo için Row Level Security aktif
- **Auth middleware:** `middleware.ts` (proje kökünde) — Supabase session kontrolü
  - `/` ve `/login` herkese açık; auth'd kullanıcı `/`'e gelirse `/dashboard`'a yönlendiriliyor
  - `/dashboard/**` ve `/api/**` oturum gerektirir
  - Cron route bypass: `CRON_SECRET` Bearer token — `/api/alerts/scan`, `/api/alerts/ai-suggest`, `/api/parasut/sync-all`
- **Secret leak kapatıldı:** Gerçek key değerleri client'a hiç gönderilmiyor; demo/anonim kullanıcılara daha az bilgi gönderiliyor
  - `GET /api/parasut/config` → auth'd: masked (ilk 4 kar + ••••••••) + boolean; demo: `{ enabled, companyId: null, clientId: null, clientSecretConfigured: false }`
  - `GET /api/settings/api-keys-status` → auth'd: boolean flag'ler; demo: `{ parasut: false, claude: false, vercel: false }`
  - Cookie check: `cookies()` from `next/headers`, demo_mode=1 → azaltılmış response
  - Test dosyalarında `vi.mock("next/headers")` eklenmiş (request scope dışı çağrı sorunu)
  - Regression: `src/__tests__/credentials-no-leak.test.ts`

---

## Auth & Kullanıcı Yönetimi
- `src/app/login/page.tsx` — email/password login (Supabase signInWithPassword)
- `src/app/api/auth/logout/route.ts` — POST ile çıkış
- `src/app/dashboard/settings/users/page.tsx` — liste, ekle, sil (self-delete engelli)
- `src/app/api/admin/users/route.ts` — GET/POST (service role key ile)
- `src/app/api/admin/users/[id]/route.ts` — DELETE
- `scripts/create-admin.ts` — CLI ile ilk admin: `npm run create-admin email şifre`
- Tüm kullanıcılar Supabase `auth.users`'da

---

## Paraşüt Entegrasyonu
- `src/lib/parasut.ts` — **şu an MOCK** (90% başarı, 1-1.8s rastgele gecikme); gerçek API'ye geçmek için `sendInvoiceToParasut()` içini değiştir
- `src/lib/services/parasut-service.ts` — `serviceSyncOrderToParasut`, `serviceSyncAllPending`, `serviceRetrySyncLog`
- **`PARASUT_ENABLED=true`** → sync aktif (production); boş/false → tüm sync fonksiyonları DB'ye yazmadan erken döner (staging/dev)
- UI bağlantı durumu `config.enabled`'dan türetiliyor — hardcoded local state yok
- Sipariş detay sayfasında sevk → `await serviceSyncOrderToParasut(id)` (fire-and-forget değil); 3 escape hatch ile stale state engellendi
- Regression: `src/__tests__/parasut-disabled.test.ts`

---

## AI Katmanı (Claude Haiku)
- **5 yetenek:** Import Intelligence, Order Review Risk, AI Ops Summary, Stock Risk Forecast, Purchase Copilot v1
- **Stage 2A:** AI memory layer, audit trail, guardrails (G1-G4), run logging (`ai_runs` tablosu)
- **Stage 2B:** `ai_recommendations` lifecycle (suggested→accepted/edited/rejected/expired), kullanıcı feedback, observability metrics
- `src/app/api/ai/observability/route.ts` → `GET /api/ai/observability` — son 7 gün istatistik; her zaman 200 döner (DB hatası non-fatal)
- Import: AI batch parse 20'lik chunk'larla (100 satır → 5 batch); added/updated/skipped ayrımı
- Settings AiTab: 8s AbortController timeout, r.ok kontrolü, retry butonu

---

## Health Check
- `GET /api/health` — her zaman public (`ALWAYS_PUBLIC` listesinde)
- `REQUIRED_KEYS` export'u: env vars + DB tabloları + RPC'ler — eksik olursa HTTP 503
- Migration 011 probe: `check_migration_011_applied()` RPC ile uuid fix doğrulaması
- Regression: `src/__tests__/health-migration-011.test.ts`

---

## Test Altyapısı
- **Framework:** Vitest, `src/__tests__/` dizini, node environment
- **45 test dosyası, 1059 test:** service, route handler, middleware, AI, import, credentials
- **Eval suite:** `src/__tests__/eval/` — AI kalite değerlendirmesi
- Mocking pattern: `vi.mock("@/lib/supabase/...")` → servis katmanını mock'la; route handler'ı doğrudan import et
- Import contract: `serviceConfirmBatch` → `{ added, updated, skipped, errors }` — yeni SKU=added, mevcut SKU=updated, eksik alan=skipped; eski "hepsi merged" mantığı yok

---

## Landing Page
- `src/app/page.tsx` — herkese açık landing page (hero, 6 feature card, stack footer, GitHub linki)
- Hero'da: "Giriş Yap", "Demo Gez", "Kaynak Kod" butonları
- Auth'd kullanıcı `/`'e gelirse → `/dashboard`'a yönlendiriliyor

---

## Read-Only Demo Modu
- **Entry:** "Demo Gez" (landing) veya "Demo ile gezin" (login) → `demo_mode=1` cookie set → `/dashboard`'a yönlendir
- **`src/lib/demo-utils.ts`** — `isDemoMode()`, `enterDemoMode()`, `clearDemoMode()` cookie yardımcıları
- **`src/components/ui/DemoButton.tsx`** — "Demo Gez" butonu (variant: "button" | "link")
- **Middleware gate:** `demo_mode=1` cookie + unauthenticated →
  - `/dashboard/**` → izin ver
  - `GET /api/**` → izin ver (DataProvider veri çekebilsin)
  - `POST/PATCH/DELETE /api/**` → 403 JSON `{ error: "Demo modunda değişiklik yapılamaz." }`
  - Auth'lu kullanıcılar bu bloktan geçmez (demo cookie'si olsa bile normal auth akışı)
- **DataProvider guard:** `demoGuard()` — tüm 9 mutation metodunun başında; demo modundaysa `clearDemoMode()` + `window.location.href = "/login"`
  - Etkilenen: `addCustomer`, `updateCustomer`, `deleteCustomer`, `addProduct`, `deleteProduct`, `addUretimKaydi`, `deleteUretimKaydi`, `addOrder`, `updateOrderStatus`
- **Dashboard layout:** Demo modda `DemoBanner` gösterir ("giriş yapın" linki ile)
- **Sidebar:** Demo modda "Çıkış Yap" → "Giriş Yap" (accent renginde); tıklayınca `clearDemoMode()` + `/login`
- **Demo config endpoint'leri:** Demo kullanıcılar `/api/parasut/config` → credential null döner; `/api/settings/api-keys-status` → hepsi false döner
- **Settings page PII:** `initialFirmaForm` ve `initialProfileForm` hardcoded gerçek değerler kaldırıldı (boş string default); Firma ve Kullanıcı tabları demo modda placeholder gösteriyor
- **Regression:** `src/__tests__/demo-mode-middleware.test.ts` — 27 test (14 sensitive endpoint + guard + read-only kontroller)

**Why:** Kullanıcı projeyi ilk açıldığında .md dosyalarını okuyarak hatırlamak istedi; bu hafıza gelecek konuşmaları hızlandırır.
**How to apply:** Her konuşmada inline style kuralını, çift eksen sipariş modelini, Paraşüt mock durumunu ve PARASUT_ENABLED gate'ini varsayılan bağlam olarak kullan.
