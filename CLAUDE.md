# Roven — Claude Code Rehberi

## Mevcut Durum
_Son güncelleme: 2026-06-09_

> Bu bölüm yalnız **güncel durumu + açık yükümlülükleri** tutar. Tam oturum geçmişi git log'unda ve `memory/current_focus.md`'de. Aşağıdaki indeks son dönem oturumlarına (commit + konu) hızlı bakış içindir; daha eski dönemler (Faz 2–3d AI Import, Sprint A–C, M-3 Rate Limiting, React Doctor, Teklif V2–V7 plan turları, Paraşüt Faz 1–11) git geçmişinde.

**Son tamamlanan iş:** **Teklif arşiv belgesi render fix + demo e-posta nötrleştirme** (2026-06-09; **PUSH EDİLDİ** `6ea6045`/seed `fe96937`/docs `b546926`; deploy + kullanıcı görsel doğrulaması bekliyor). **(A) Arşiv "Belgeyi Aç" / "Arşivlenmiş Teklif" bug:** yeni sekmede ham HTML kaynağı + UTF-8 mojibake (`ArÅŸivi`/`â€"`) gösteriyordu. **Kök neden:** Supabase storage signed URL'i donmuş arşiv HTML'ini `text/html` render etmiyor (stored-XSS koruması → metin/indirme). **Çözüm:** arşiv route'una **`?view=1` modu** — HTML'i kendi origin'imizden `Content-Type: text/html; charset=utf-8` ile DOĞRUDAN stream eder (yeni `dbDownloadArchiveHtml` helper: `storage.download()`→`.text()`). Buton artık fetch beklemeden **senkron `window.open(?view=1)`** → await-sonrası açılışı engelleyen popup-blocker da elenir (iki sebep tek fix'le çözülür — advisor: download→text→re-encode zinciri hem MIME hem charset hem disposition'a dayanıklı). Eksik arşiv/403 → ham JSON yerine yeni sekmede dostça HTML hata sayfası (`htmlError`). JSON modu (signed URL) geriye uyumlu korundu. `orders/[id]`+`quotes/[id]` butonlarından `archiveLoading`/`loading` kaldırıldı (aksiyon artık senkron). **(B) Demo e-posta mayını:** seed + mock-data'daki 4 müşteri (Tüpraş/Abdi İbrahim/Enerjisa/Ülker) **gerçek firma domain'lerine** işaret ediyordu; smoke'ta kullanıcı yanlışlıkla `procurement@abdibrahim.com.tr`'ye gerçek teklif gönderdi (Resend "Sent", bounce yok → muhtemelen Exchange spam/karantina; özür gereksiz). Fix: tüm müşteri e-postaları **`@*.example.com`** (RFC 2606, asla teslim edilmez); firma adları korundu; `info@pmt.com.tr` (satıcı, gönderim hedefi değil) dokunulmadı. **+6 test** (3 view-mode route 200/404/403 + 2 download helper + 1 seed regression yok→source); 3 source-regression güncellendi. tsc 0 · lint 0 · **5004 test** · build 0. **Smoke gümüş astar:** bounce yok = EMAIL_FROM + Resend + `.html` ek pipeline'ı çalışıyor (Aşama 1 fiilen yeşil). **Sıradaki:** (1) arşiv fix deploy sonrası görsel doğrula — "Belgeyi Aç" → render edilmiş belge + doğru Türkçe (mojibake yok); (2) `.html` eki smoke Aşama 2 (kendi Gmail+Outlook, müşteri e-postasını kendi adresinle değiştir). <details><summary>Önceki: Teklif "Gönder" → müşteriye HTML ekli e-posta (PUSH `5ecc104`)</summary>

Teklif "Gönder"e basınca müşteriye teklif belgesi `.html` ekli e-posta. Karar: HTML eki (binary PDF yok); tetik = "Gönder" onayına checkbox (varsayılan işaretli). Mimari: transition saf kalır, e-posta ayrı reusable endpoint. 6 kod + 6 test: (1) `sendDirectEmail` attachment primitifi; (2) `renderQuoteToCustomer` müşteri şablonu (`hideManageFooter` → dashboard footer gizli, XSS escape); (3) `serviceSendQuoteToCustomer` (arşivle birebir pipeline, `no_email` guard, email_logs entity_type='quote'); (4) `POST /api/quotes/[id]/send-email` (`manage_quotes` RBAC; 404/400/503/502 map); (5) `dbListFailedEmailsForRetry` NULL-safe `.or("entity_type.is.null,entity_type.neq.quote")` quote retry exclusion; (6) frontend draft confirm + checkbox + post-transition POST. ADVISOR 4 not: uçtan uca doğrulanmadı; `.html` Exchange strip riski → önce smoke; RBAC temiz; frozen yerine re-render (gelecek "Tekrar Gönder" frozen ekle). 4999 test · build 0. Drift fix `458c14b` (CTA fallback URL+`.env.example`→erp.getmedspace.com) önceden mirror'a gitmişti.</details>

### Açık yükümlülükler (kullanıcı doğrulamalı — yeşil testler kapsamaz)
- **Teklif e-posta smoke (bu oturum):** Aşama 1 — `EMAIL_FROM`'u `/api/email/test` ile doğrula; Aşama 2 — gerçek teklif "Gönder" → kendi Gmail + Outlook/Exchange → `.html` eki sağlam mı / spam'e düşüyor mu. Sorunluysa PDF-API yoluna geç.
- **Login "Monolith" deploy ön koşulları** (push `27733c6`; canlı tur doğrulanmadı):
  1. **Supabase "Allow new users to sign up" = OFF** (BİRİNCİL kilit — kapalı değilse self-signup oturumu `/api/seed` gibi ALWAYS_PUBLIC uçlarda hâlâ risk).
  2. **⚠️ BRICK RİSKİ:** prod admin `app_metadata.roles` taşımalı VEYA `ADMIN_EMAILS` her iki Coolify env'inde set olmalı — yoksa `isProvisionedUser` guard herkesi kilitler (kurtarma: Supabase dashboard'dan app_metadata set).
  3. **Canlı Google OAuth turu** (testler mock'lu): Supabase Google provider etkin + redirect-URL allowlist `…/auth/callback` + tarayıcı smoke.
- **Paraşüt Faz 12 — Sandbox GATE:** gerçek Paraşüt API ile OAuth + list filtreleri + e-doc trackable_job + stok invariant doğrulamaları (`PARASUT_PLAN.md` §Faz 12).

### Son dönem oturum indeksi (en yeniden eskiye — detay git log'unda)
- Genel Bakış — panel yerleşimi yeniden düzenlendi (drift fix `458c14b`)
- Genel Bakış TAM-SADIK yeniden kurulum (`b2481a1`)
- Uyarılar → Takvim Görünümü — Faz 3 (cila/responsive/a11y) (PUSH `ddac29d`)
- Uyarılar Takvim — Faz 2 (drawer zenginliği)
- Uyarılar Takvim — Faz 1 (iskelet + enrichment + temel drawer)
- Login "Monolith" (F) redesign — TR/EN + tema + Google OAuth + şifre sıfırla
- Null-SKU kapatma — İncele ekranında yeni-ürün SKU girişi (`c7db606`/`7e9654b`)
- Faz D-POC — tam-otomatik katalog→ürün görseli (mupdf WASM) (`4253696`)
- Veri Aktarım yazma yolları — Faz A·B·C·D epic (`bdcdbee`)
- Veri Aktarım Merkezi — rehber + şeffaflık katmanı
- Roven hexagon logo — component + topbar/login/favicon ince ayarları
- Marka rename (KokpitERP → Roven) + main hizalama
- Tema sistemi — Koyu + Aydınlık (Cool slate)
- Topbar "Sakin düz" yeniden tasarım + uyarı butonunu kaldırma (`bf28fb0`)
- Dashboard AI Özeti + Aktif Uyarılar collapsible (`44d4e54`)
- Teklif formu ürün açılır-listesi kırpılma fix'i (`QuoteForm.tsx`)
- Görsel QA (codex) + iki-branch hizalama + PUSH (`1ef3c8e`)
- Branch hizalama audit'i — son commitlerin detaylı kod incelemesi + 3 bulgu (`5265a08`)
- İki branch'i hizalama — codex-experiment ↔ main birleştirme (`56ecbd1`/`39c0d07`)
- Ürün Tipleri sayfası — final ürün (alan düzenleme UI + N+1 fix + a11y modal) (`0914b28`, codex merge'inde superseded)
- Satın Alma Siparişi (Yeni) — birim fiyat + KDV auto-fill (`2509dcf`)
- Ayarlar sayfası — final ürün (modal a11y + tablist a11y + entity render bug + hata mesajı paritesi) (`b37764a`)
- Cariler (Müşteriler) sayfası — final ürün (toplu-silme bayat satır + hover antipattern + modal a11y + validation parity) (`c8057e5`)
- Üretim Girişi sayfası — final ürün (BOM şeffaflığı + silme onayı + a11y) (`0504bdc`)
- Tedarikçiler sayfası — final ürün (a11y modal + görünür yükleme hatası + toplu-seçim kapsamı) (`95ad46e`)
- Satın Alma Siparişleri sayfası — final ürün 2. tur (`448c548`)
- Paraşüt Sync sayfası — final ürün (`ca34198`)
- Satın Alma Siparişleri sayfası — final ürün 1. tur (`470578c`)
- Öneriler (Satın Alma Önerileri) sayfası — eksik kapatma + canlı E2E (`5e6e097`)
- Stok & Ürünler sayfası — eksik kapatma + canlı E2E (`982c4bb`)
- Satış Siparişleri Faz 3 — pending_approval rezervasyon (`40731af`, migration 082)
- Satış Siparişleri Faz 1+2 (`e9c6ac6`, migration 081 APPLY EDİLDİ ✅)
- Faz 6 Bulgular 2. tur (`9a57d66`, 077/078 APPLY EDİLDİ ✅)
- Teklif V7 Faz 6 Bulgular 1. tur (`b17181e`, 077 APPLY EDİLDİ ✅)
- Teklif V7 Faz 6 — Accept → Sipariş (atomik) (`d4988ca`, migration 077 APPLY EDİLDİ ✅)
- Teklif V7 Faz 4 — PDF Arşiv (`6c9c317`, migration 075/076 APPLY EDİLDİ ✅) + Bulgular 1-4. review tur
- Teklif V7 Revizyon Zinciri (`1d96211`, migration 074 APPLY EDİLDİ + review pass)
- Faz 5 infra dilim — numara katmanı (`942ee0d`, migration 073 APPLY EDİLDİ)
- Faz 3 review düzeltmeleri (Bulgular P1-P3, 2 tur, `6366cbd`+`11c5079`, migration 070-072 APPLY EDİLDİ)
- Faz 3 ilk implement (`c5d8267`, migration 070/071 APPLY EDİLDİ)
- Faz 2 (önceki, `afe936b`)

---

## Proje Özeti
PMT Endüstriyel için yapay zeka destekli ERP sistemi. Endüstriyel vana satışı (B2B).
**Stack:** Next.js 15 · TypeScript · Supabase (aktif, 18+ migration) · Tailwind CSS kurulu ama kullanılmıyor (inline styles kullanıyoruz)

---

## Bu Projeyi İlk Açıyorsan

Okuma sırası:
1. `README.md` — kurulum + env + migration
2. `domain-rules.md` — sistemin ne yapması/yapmaması gerektiği (source of truth)
3. `src/lib/database.types.ts` — DB tablo şeması (snake_case)
4. `src/lib/api-mappers.ts` — DB ↔ frontend veri dönüşümleri

---

## Kritik Kodlama Kuralları

### Stil: Sadece Inline Styles + CSS Variables
```tsx
// DOĞRU
<div style={{ color: "var(--text-primary)", padding: "16px" }}>

// YANLIŞ — Tailwind class kullanma
<div className="text-white p-4">
```

### Animasyon Yasak
- Framer Motion **kurulu ama YASAK** — import etme
- CSS `animation` ve `transition` sadece gerekli yerde (hover, progress bar gibi)

### Her interaktif component için
```tsx
"use client";
```

### Renk değerleri: Her zaman CSS variable
```
var(--text-primary)    var(--text-secondary)   var(--text-tertiary)
var(--bg-primary)      var(--bg-secondary)      var(--bg-tertiary)
var(--border-primary)  var(--border-secondary)  var(--border-tertiary)
var(--accent)          var(--accent-bg)          var(--accent-text)     var(--accent-border)
var(--success)         var(--success-bg)         var(--success-text)    var(--success-border)
var(--warning)         var(--warning-bg)         var(--warning-text)    var(--warning-border)
var(--danger)          var(--danger-bg)          var(--danger-text)     var(--danger-border)
```

---

## Proje Yapısı

```
src/
├── app/
│   ├── dashboard/
│   │   ├── page.tsx                    — Ana dashboard
│   │   ├── layout.tsx                  — Sidebar + Topbar wrapper
│   │   ├── orders/
│   │   │   ├── page.tsx                — Sipariş listesi
│   │   │   ├── new/page.tsx            — Yeni sipariş formu
│   │   │   └── [id]/page.tsx           — Sipariş detay + durum geçişleri
│   │   ├── products/page.tsx           — Stok & Ürünler
│   │   ├── customers/page.tsx          — Cariler
│   │   ├── production/page.tsx         — Üretim kaydı (ses + form)
│   │   ├── import/page.tsx             — AI dosya içe aktarma (7-adım wizard)
│   │   ├── alerts/page.tsx             — Üretim & Stok uyarıları
│   │   ├── parasut/page.tsx            — Muhasebe sync dashboard
│   │   ├── purchase/suggested/page.tsx — Yeniden sipariş önerileri
│   │   └── settings/page.tsx           — Firma + kullanıcı + API ayarları
│   ├── api/                            — Route handler'lar (Next.js App Router)
│   │   ├── health/                     — Sağlık kontrolü
│   │   ├── orders/                     — CRUD + durum geçişleri
│   │   ├── products/                   — CRUD
│   │   ├── customers/                  — CRUD
│   │   ├── production/                 — CRUD
│   │   ├── alerts/                     — CRUD + scan
│   │   ├── import/                     — Batch → drafts → confirm akışı
│   │   ├── ai/                         — parse + score endpoint'leri
│   │   └── parasut/                    — sync-all, retry, stats, invoices, logs
│   └── globals.css                     — CSS variables (dark theme)
├── components/
│   ├── layout/                         — Sidebar, Topbar
│   ├── dashboard/                      — StatsCards, RecentOrders, AIAlerts
│   ├── ui/                             — Button, Toast, DemoBanner
│   └── customers/                      — CustomerDetailPanel (sağ panel)
└── lib/
    ├── supabase/                        — DB client + tablo query fonksiyonları
    │   ├── service.ts                   — Supabase service client (RLS bypass)
    │   └── orders.ts, products.ts,      — Her tablo için query fonksiyonları
    │       customers.ts, alerts.ts,
    │       production.ts, sync-log.ts, import.ts
    ├── services/                        — İş mantığı katmanı
    │   ├── order-service.ts             — Sipariş geçişleri, rezervasyon tetikleme
    │   ├── alert-service.ts             — Alert yaşam döngüsü
    │   ├── production-service.ts        — BOM etkileri, üretim tamamlama
    │   ├── purchase-service.ts          — Yeniden sipariş önerisi hesaplama
    │   ├── parasut-service.ts           — Sync, retry, sync-all
    │   ├── import-service.ts            — Batch → draft → merge pipeline
    │   └── ai-service.ts               — Claude Haiku: parse, score, risk
    ├── database.types.ts                — Supabase tablo tipleri (snake_case)
    ├── api-mappers.ts                   — DB row → frontend model dönüşümleri
    ├── mock-data.ts                     — Frontend interface tanımları (camelCase)
    ├── data-context.tsx                 — Global React context (gerçek API'ye bağlı)
    ├── api-error.ts                     — Merkezi hata yönetimi
    └── stock-utils.ts                   — coverage_days, daysColor yardımcıları
supabase/
└── migrations/                          — SQL migration dosyaları (sırayla uygula)
```

---

## Veri Modelleri

### Mimari Katmanlar
- **DB katmanı** (`database.types.ts`): snake_case, nullable field'lar
- **Frontend katmanı** (`mock-data.ts`): camelCase interface'ler
- **Dönüşüm** (`api-mappers.ts`): `mapProduct()`, `mapCustomer()`, `mapOrderDetail()` vb.

```ts
// Product — DB-aligned field isimler
// productType: "manufactured" | "commercial"
Product: id, name, sku, category, unit, price, currency,
         on_hand, reserved, available_now,
         minStockLevel, isActive, productType, warehouse,
         reorderQty?, preferredVendor?, dailyUsage?

// Customer
Customer: id, name, email, phone, address, taxNumber, taxOffice,
          country, currency, notes, isActive,
          totalOrders, totalRevenue, lastOrderDate

// Order — ÇİFT EKSEN
Order: id, orderNumber, customerName,
       commercial_status,   // draft | pending_approval | approved | cancelled
       fulfillment_status,  // unallocated | partially_allocated | allocated | partially_shipped | shipped
       grandTotal, currency, createdAt, itemCount

// OrderLineItem
OrderLineItem: id, productId, productName, productSku, unit,
               quantity, unitPrice, discountPct, lineTotal

// OrderDetail extends Order
OrderDetail: ...Order, customerId, customerEmail, customerCountry,
             customerTaxOffice, customerTaxNumber, subtotal, vatTotal, notes,
             parasutInvoiceId?, parasutSentAt?, parasutError?,
             aiConfidence?, aiReason?, aiRiskLevel?,
             lines: OrderLineItem[]
```

---

## Sipariş Durumu (Çift Eksen)

```
commercial_status:
  DRAFT → PENDING_APPROVAL → APPROVED → CANCELLED

fulfillment_status (PENDING_APPROVAL'dan itibaren aktif):
  UNALLOCATED → PARTIALLY_ALLOCATED → ALLOCATED → PARTIALLY_SHIPPED → SHIPPED

Kural: Rezervasyon "Onaya Gönder" (DRAFT → PENDING_APPROVAL) ile tetiklenir
       (migration 082; eskiden APPROVED'daydı). APPROVED = light ticari teyit.
```

---

## Sipariş Hesaplama
```ts
lineTotal  = quantity * unitPrice * (1 - discountPct / 100)
subtotal   = sum(lineTotals)
vatTotal   = subtotal * 0.20   // KDV %20
grandTotal = subtotal + vatTotal
```

---

## Stok Modeli
```
available_now = on_hand - reserved
// on_hand: fiziksel stok
// reserved: pending_approval + approved siparişler için ayrılmış (migration 082)
// available_now: satılabilir gerçek miktar (computed column)
```

---

## Stok Modeli (Detay)

```
on_hand        — fiziksel stok
reserved       — pending_approval + approved siparişler için ayrılmış (migration 082)
available_now  = on_hand - reserved              (computed column)
quoted         = YALNIZ draft siparişlerdeki toplam miktar (soft hold; pending artık reserved'da)
promisable     = available_now - quoted          (canonical; negatif olabilir — Math.max ile gizleme)
incoming       = açık purchase commitment toplamı
forecasted     = on_hand + incoming - reserved - quoted
```

---

## Domain Kuralları

### Teklif Süresi (quote_valid_until)
- `sales_orders.quote_valid_until date` — nullable, NULL = süresiz
- **Tarih karşılaştırma kuralı — ZORUNLU:**
  ```ts
  const todayStr = new Date().toISOString().slice(0, 10);
  const isExpired = !!date && date < todayStr;  // string karşılaştırma
  ```
  `new Date(date) < new Date()` KULLANMA — saat farkı nedeniyle ~24 saat kayar.
- Expire akışı: `serviceExpireQuotes()` (CRON) → expired draft → auto-cancel, pending → `quote_expired` alert

### Alert Tipleri

| Tip | Tetikleyici |
|-----|-------------|
| `stock_critical` | available_now ≤ 0 |
| `stock_risk` | available_now ≤ min_stock_level |
| `purchase_recommended` | reorder önerisi |
| `order_shortage` | onaylı sipariş için stok yetersiz |
| `order_deadline` | stok tükenme tarihi yakın |
| `quote_expired` | pending_approval + quote_valid_until geçmiş |
| `overdue_shipment` | approved + sevk edilmemiş, planlanan tarih geçmiş veya created_at+7 gün |
| `sync_issue` | Paraşüt sync hatası |
| `import_review_required` | import batch review gerekiyor |

**Dedup:** `dbListActiveAlerts()` → type+entity_id filtresi ile aktif alert varsa yeni yaratılmaz.
**Kapanma:** `dbBatchResolveAlerts([{ type, entityId, reason }])` — ID değil type+entity ile.

### CRON Endpoint'leri (`middleware.ts CRON_PATHS`)

| Endpoint | İşlev |
|----------|-------|
| `POST /api/alerts/scan` | Stok alert taraması |
| `POST /api/alerts/ai-suggest` | AI alert önerileri |
| `POST /api/parasut/sync-all` | Paraşüt sync |
| `POST /api/orders/expire-quotes` | Süresi dolan teklifleri işle |
| `POST /api/orders/check-shipments` | Geciken sevkiyat alertları |

### Import Servisi Kontratı
`serviceConfirmBatch` → `{ added, updated, skipped, errors }`
- Yeni SKU → `added` (on_hand dahil)
- Mevcut SKU → `updated` (on_hand dahil değil — master-data only)
- Eksik zorunlu alan (sku/name/unit) → `skipped`

---

## Güvenlik ve Demo Mode

### Auth Middleware (`middleware.ts` — proje kökünde)
- `/` ve `/login` → herkese açık; auth'd kullanıcı `/`'e gelirse `/dashboard`'a yönlendir
- `/dashboard/**` ve `/api/**` → oturum gerektirir
- Cron bypass: `CRON_SECRET` Bearer token → CRON_PATHS
- `/api/health` ve `/api/auth/demo` → her zaman public

### Demo Mode
**Entry:** Landing "Demo Gez" → `demo_mode=1` cookie → `/dashboard`

**`src/lib/demo-utils.ts`:** `useIsDemo()`, `DEMO_DISABLED_TOOLTIP`, `DEMO_BLOCK_TOAST`

**Middleware gate (demo_mode=1 + unauthenticated):**
- `GET /api/**` → izin ver
- `POST/PATCH/DELETE /api/**` → 403

**Client-side guard pattern:**
```tsx
const isDemo = useIsDemo();
if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
<Button disabled={isDemo} title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}>
```

### Credential Güvenliği
- Auth'd kullanıcı: masked (ilk 4 kar + ••••••••) + boolean flag
- Demo/anon: null veya false
- Regression: `src/__tests__/credentials-no-leak.test.ts`, `demo-mode-middleware.test.ts`

---

## Entegrasyonlar

### Paraşüt
- `src/lib/parasut.ts` — şu an **MOCK** (%90 başarı, 1-1.8s rastgele gecikme)
- `PARASUT_ENABLED=true` → sync aktif; boş/false → erken döner
- Sipariş detay → sevk → `serviceSyncOrderToParasut(id)` (fire-and-forget değil)

### AI Katmanı (Claude Haiku — `claude-haiku-4-5-20251001`)
- Import: `aiDetectColumns()` — sheet başına TEK çağrı, kolon eşleştirme
- Order Review Risk, Ops Summary, Stock Risk Forecast, Purchase Copilot
- AI memory: `column_mappings` tablosu (kolon hafızası), `ai_entity_aliases` (isim öğrenme)
- Guardrails: G1-G4, run logging (`ai_runs` tablosu)
- `GET /api/ai/observability` → son 7 gün istatistik

### Test Altyapısı
- **Framework:** Vitest · `src/__tests__/` · node environment
- **63 dosya · 1274 test**
- Mock pattern:
  ```ts
  vi.mock("@/lib/supabase/orders", () => ({ dbGetOrderById: vi.fn() }));
  vi.mock("next/headers", () => ({ cookies: () => Promise.resolve({ get: () => undefined }) }));
  ```

---

## Auth ve Kullanıcı Yönetimi

- `src/app/login/page.tsx` — Supabase `signInWithPassword`
- `src/app/api/admin/users/route.ts` — GET/POST (service role key)
- İlk admin: `npm run create-admin email şifre`
- Demo modda POST/DELETE → middleware 403

---

## Tamamlanan Fazlar

| Faz | Konu |
|-----|------|
| 0 | Domain Alignment |
| 1 | Frontend Stabilization |
| 2 | Core Domain Model (DB schema — 14+ tablo, 26 migration) |
| 3 | Orders Engine |
| 4 | Inventory & Reservation Engine |
| 5 | Critical Stock & Alerts Engine + Teklif Kırılımı |
| 6 | Purchase Suggestion Engine + Teklif Süresi + Geciken Sevkiyat |
| 7 | Production Engine |
| 8 | Import Flow → Kolon Eşleştirme + Hafıza + Inline Düzenleme |
| 9 | Paraşüt Integration |
| 10 | AI Layer (Claude Haiku) |
| + | Demo Mode, Güvenlik, Ürün Kullanım Bayrakları |

---

## Claude İçin Kurallar (Feedback)

1. **Sessiz silme yasak:** Kodu silmeden önce yerine ne geldiğini açıkla veya kullanıcıya sor. "Taşıdım" demek yeterli değil — eski işlevsellik tam karşılanmalı.

2. **Memory güncellemesi:** Proje durumu değiştiğinde (`current_focus.md`, bu dosyanın "Mevcut Durum" bölümü) otomatik güncelle — kullanıcı söylemeden.

3. **Context güncelleme:** İş commit'lendikten hemen sonra "Mevcut Durum"u ve `memory/current_focus.md`'yi güncelle.
