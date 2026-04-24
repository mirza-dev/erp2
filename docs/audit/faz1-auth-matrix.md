# Faz 1 — Auth Erişim Matrisi
_Tarih: 2026-04-22 | Ortam: Kod analizi (statik)_

## Persona Tanımları

| Persona | Tanım |
|---------|-------|
| **anonymous** | Session yok, demo_mode cookie yok |
| **demo** | Session yok, `demo_mode=1` cookie var |
| **user** | Geçerli Supabase oturumu, ADMIN_EMAILS'de değil |
| **admin** | Geçerli Supabase oturumu, ADMIN_EMAILS'de |

## Middleware Katmanı (Önce Bu Çalışır)

```
ALWAYS_PUBLIC  → middleware bypass: /api/health, /api/auth/demo, /api/seed
CRON_PATHS     → CRON_SECRET Bearer ile bypass VEYA session gerektirir
anonymous      → /api/** → 401  |  /dashboard/** → /login redirect
demo           → GET /api/** → 200  |  POST/PATCH/DELETE /api/** → 403  |  /dashboard/** → 200
user / admin   → tüm rotalar geçer (route-level check'e düşer)
```

---

## Auth Erişim Matrisi

> Gösterim: ✅ İzin var | ❌ Reddedilir | ⚠️ Kısmi/Koşullu | 🔓 PUBLIC (auth yok)

### 1. Public & Kimlik Doğrulama

| Endpoint | Method | anonymous | demo | user | admin | Koruma Katmanı |
|----------|--------|-----------|------|------|-------|----------------|
| `/api/health` | GET | 🔓✅ | 🔓✅ | 🔓✅ | 🔓✅ | Yok (ALWAYS_PUBLIC) |
| `/api/auth/demo` | POST | 🔓✅ | 🔓✅ | 🔓✅ | 🔓✅ | Yok (ALWAYS_PUBLIC) |
| `/api/auth/logout` | POST | ❌401 | ❌403 | ✅ | ✅ | Middleware |

### 2. Seed / Admin

| Endpoint | Method | anonymous | demo | user | admin | Koruma Katmanı |
|----------|--------|-----------|------|------|-------|----------------|
| `/api/seed` | POST | ⚠️¹ | ⚠️¹ | ⚠️¹ | ⚠️¹ | ALWAYS_PUBLIC + route checkAuth() |
| `/api/seed` | DELETE | ⚠️¹ | ⚠️¹ | ⚠️¹ | ⚠️¹ | ALWAYS_PUBLIC + route checkAuth() |
| `/api/admin/users` | GET | ❌401 | ❌403 | ❌403² | ✅ | Middleware + requireAdmin() |
| `/api/admin/users` | POST | ❌401 | ❌403 | ❌403² | ✅ | Middleware + requireAdmin() |
| `/api/admin/users/[id]` | DELETE | ❌401 | ❌403 | ❌403² | ✅ | Middleware + requireAdmin() |

> ¹ `/api/seed` ALWAYS_PUBLIC (middleware pas geçer), ama route handler `CRON_SECRET Bearer` olmadan 401 döner. User/session ile erişim yok — sadece CRON_SECRET.
> ² `ADMIN_EMAILS` boşsa tüm auth'd kullanıcılara açılır (kırılmasız default).

### 3. Siparişler

| Endpoint | Method | anonymous | demo | user | admin | Koruma |
|----------|--------|-----------|------|------|-------|--------|
| `/api/orders` | GET | ❌401 | ✅ | ✅ | ✅ | Middleware |
| `/api/orders` | POST | ❌401 | ❌403 | ✅ | ✅ | Middleware |
| `/api/orders/[id]` | GET | ❌401 | ✅ | ✅ | ✅ | Middleware |
| `/api/orders/[id]` | PATCH | ❌401 | ❌403 | ✅ | ✅ | Middleware |
| `/api/orders/[id]` | DELETE | ❌401 | ❌403 | ✅ | ✅ | Middleware |
| `/api/orders/expire-quotes` | POST | ❌401 | ❌403 | ✅³ | ✅³ | Middleware+CRON |
| `/api/orders/check-shipments` | POST | ❌401 | ❌403 | ✅³ | ✅³ | Middleware+CRON |

> ³ CRON_PATHS: CRON_SECRET ile bypass VEYA session varsa erişim. Authenticated user session'la çağırabilir.

### 4. Ürünler & Stok

| Endpoint | Method | anonymous | demo | user | admin | Koruma |
|----------|--------|-----------|------|------|-------|--------|
| `/api/products` | GET | ❌401 | ✅ | ✅ | ✅ | Middleware |
| `/api/products` | POST | ❌401 | ❌403 | ✅ | ✅ | Middleware |
| `/api/products/[id]` | GET | ❌401 | ✅ | ✅ | ✅ | Middleware |
| `/api/products/[id]` | PATCH | ❌401 | ❌403 | ✅ | ✅ | Middleware |
| `/api/products/[id]` | DELETE | ❌401 | ❌403 | ✅ | ✅ | Middleware |
| `/api/products/aging` | GET | ❌401 | ✅ | ✅ | ✅ | Middleware |
| `/api/products/[id]/quotes` | GET | ❌401 | ✅ | ✅ | ✅ | Middleware |
| `/api/inventory/movements` | GET | ❌401 | ✅ | ✅ | ✅ | Middleware |
| `/api/inventory/movements` | POST | ❌401 | ❌403 | ✅ | ✅ | Middleware |

### 5. Müşteriler

| Endpoint | Method | anonymous | demo | user | admin | Koruma |
|----------|--------|-----------|------|------|-------|--------|
| `/api/customers` | GET | ❌401 | ✅ | ✅ | ✅ | Middleware |
| `/api/customers` | POST | ❌401 | ❌403 | ✅ | ✅ | Middleware |
| `/api/customers/[id]` | GET | ❌401 | ✅ | ✅ | ✅ | Middleware |
| `/api/customers/[id]` | PATCH | ❌401 | ❌403 | ✅ | ✅ | Middleware |
| `/api/customers/[id]` | DELETE | ❌401 | ❌403 | ✅ | ✅ | Middleware |

### 6. Alerts & Üretim

| Endpoint | Method | anonymous | demo | user | admin | Koruma |
|----------|--------|-----------|------|------|-------|--------|
| `/api/alerts` | GET | ❌401 | ✅ | ✅ | ✅ | Middleware |
| `/api/alerts/[id]` | GET | ❌401 | ✅ | ✅ | ✅ | Middleware |
| `/api/alerts/[id]` | PATCH | ❌401 | ❌403 | ✅ | ✅ | Middleware |
| `/api/alerts/scan` | POST | ❌401 | ❌403 | ✅³ | ✅³ | Middleware+CRON |
| `/api/alerts/ai-suggest` | POST | ❌401 | ❌403 | ✅³ | ✅³ | Middleware+CRON |
| `/api/production` | GET | ❌401 | ✅ | ✅ | ✅ | Middleware |
| `/api/production` | POST | ❌401 | ❌403 | ✅ | ✅ | Middleware |
| `/api/production/[id]` | GET/PATCH/DELETE | ❌401 | ⚠️⁴ | ✅ | ✅ | Middleware |

> ⁴ Demo: GET izinli, PATCH/DELETE 403.

### 7. Teklifler (Quotes)

| Endpoint | Method | anonymous | demo | user | admin | Koruma |
|----------|--------|-----------|------|------|-------|--------|
| `/api/quotes` | GET | ❌401 | ✅ | ✅ | ✅ | Middleware |
| `/api/quotes` | POST | ❌401 | ❌403 | ✅ | ✅ | Middleware |
| `/api/quotes/[id]` | GET | ❌401 | ✅ | ✅ | ✅ | Middleware |
| `/api/quotes/[id]` | PATCH | ❌401 | ❌403 | ✅ | ✅ | Middleware |
| `/api/quotes/[id]` | DELETE | ❌401 | ❌403 | ✅ | ✅ | Middleware |
| `/api/quotes/[id]/convert` | POST | ❌401 | ❌403 | ✅ | ✅ | Middleware |
| `/api/quotes/expire` | POST | ❌401 | ❌403 | ✅³ | ✅³ | Middleware+CRON |

### 8. Import & Purchase

| Endpoint | Method | anonymous | demo | user | admin | Koruma |
|----------|--------|-----------|------|------|-------|--------|
| `/api/import` | GET | ❌401 | ✅ | ✅ | ✅ | Middleware |
| `/api/import` | POST | ❌401 | ❌403 | ✅ | ✅ | Middleware |
| `/api/import/[batchId]/*` | GET | ❌401 | ✅ | ✅ | ✅ | Middleware |
| `/api/import/[batchId]/*` | POST/PATCH | ❌401 | ❌403 | ✅ | ✅ | Middleware |
| `/api/purchase/suggestions` | GET | ❌401 | ✅ | ✅ | ✅ | Middleware |
| `/api/purchase/scan` | POST | ❌401 | ❌403 | ✅ | ✅ | Middleware |
| `/api/purchase-commitments` | GET | ❌401 | ✅ | ✅ | ✅ | Middleware |
| `/api/purchase-commitments` | POST | ❌401 | ❌403 | ✅ | ✅ | Middleware |
| `/api/purchase-commitments/[id]` | DELETE | ❌401 | ❌403 | ✅ | ✅ | Middleware |
| `/api/recommendations` | GET | ❌401 | ✅ | ✅ | ✅ | Middleware |
| `/api/recommendations/[id]` | PATCH | ❌401 | ❌403 | ✅ | ✅ | Middleware |

### 9. Paraşüt & AI

| Endpoint | Method | anonymous | demo | user | admin | Koruma |
|----------|--------|-----------|------|------|-------|--------|
| `/api/parasut/config` | GET | ❌401 | ⚠️⁵ | ✅ | ✅ | Middleware + cookie demo gate |
| `/api/parasut/logs` | GET | ❌401 | ✅ | ✅ | ✅ | Middleware |
| `/api/parasut/stats` | GET | ❌401 | ✅ | ✅ | ✅ | Middleware |
| `/api/parasut/invoices` | GET | ❌401 | ✅ | ✅ | ✅ | Middleware |
| `/api/parasut/sync` | POST | ❌401 | ❌403 | ✅ | ✅ | Middleware |
| `/api/parasut/retry` | POST | ❌401 | ❌403 | ✅ | ✅ | Middleware |
| `/api/parasut/sync-all` | POST | ❌401 | ❌403 | ✅³ | ✅³ | Middleware+CRON |
| `/api/ai/observability` | GET | ❌401 | ✅ | ✅ | ✅ | Middleware ONLY⁶ |
| `/api/ai/parse` | POST | ❌401 | ❌403 | ✅ | ✅ | Middleware |
| `/api/ai/score` | POST | ❌401 | ❌403 | ✅ | ✅ | Middleware |
| `/api/ai/ops-summary` | POST | ❌401 | ❌403 | ✅ | ✅ | Middleware |
| `/api/ai/stock-risk` | POST | ❌401 | ❌403 | ✅ | ✅ | Middleware |
| `/api/ai/purchase-copilot` | POST | ❌401 | ❌403 | ✅ | ✅ | Middleware |

> ⁵ Demo: `{ enabled: false }` döner — credential bilgisi yok.
> ⁶ Route kendi içinde session kontrolü yapmaz; sadece middleware'e güvenir.

### 10. Settings

| Endpoint | Method | anonymous | demo | user | admin | Koruma |
|----------|--------|-----------|------|------|-------|--------|
| `/api/settings/company` | GET | ❌401 | ✅ | ✅ | ✅ | Middleware |
| `/api/settings/company` | PATCH | ❌401 | ❌403 | ✅ | ✅ | Middleware |
| `/api/settings/company/logo` | POST | ❌401 | ❌403 | ✅ | ✅ | Middleware |
| `/api/settings/api-keys-status` | GET | ❌401 | ⚠️⁷ | ✅ | ✅ | Middleware + cookie demo gate |

> ⁷ Demo: `{ parasut: false, claude: false, vercel: false }` döner.

---

## Önemli Gözlemler

### CRON Endpoint'lerinde Dikkat Edilmesi Gereken Durum
CRON_PATHS'te `CRON_SECRET` yoksa veya eşleşmezse middleware session kontrolüne **düşer** (bypass etmez, reddeder). Yani authenticated bir user bu endpoint'leri session'ıyla tetikleyebilir. Bu mevcut tasarım, bilinçli bir karar olarak değerlendirilmeli.

### Demo Kullanıcının Görebildiği Veriler
Demo mod GET ile her şeyi okuyabilir:
- Sipariş listesi, ürünler, müşteriler, teklifler
- Paraşüt sync logları ve istatistikleri
- AI kullanım istatistikleri (`/api/ai/observability`)
- Import batch'leri, purchase önerileri
- Üretim kayıtları

Bu veriler demo için seed edilmiş sentetik veridir — gerçek üretim verisiyle sorun yaratmaz.

### `ADMIN_EMAILS` Boşsa
`ADMIN_EMAILS` env var tanımsız veya boşsa `requireAdmin()` tüm auth'd kullanıcılara açılır. Lokal dev için uygun, production'da mutlaka doldurulmalı.

### `/api/seed` ALWAYS_PUBLIC Ancak Güvenli
Middleware pas geçer ama route handler `CRON_SECRET Bearer` olmadan 401 döner. Herhangi bir session veya cookie ile erişilemez.
