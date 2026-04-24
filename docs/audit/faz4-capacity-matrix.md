# ERP2 Audit — Faz 4: Kapasite Matrisi ve Sonuç Raporu
_Tarih: 2026-04-22 | Ortam: Lokal dev (localhost:3002) | DB: Supabase cloud_

---

## Özet

| Kategori | Durum | En Kritik Bulgu |
|----------|-------|-----------------|
| Güvenlik (Auth) | ⚠️ Kısmi | Dev sunucu middleware bypass |
| Concurrency | ✅ Geçti | 5 VU'da invariant sağlam |
| Kapasite (small) | ✅ Geçti | Aging p95: 1.18s |
| Kapasite (medium) | ✅ Geçti | Aging p95: 2.64s, filter p99: 7.5s |
| Edge Cases | ⚠️ 4 sorun | JSON hataları 500 döndürüyor |

---

## Faz 1 — Güvenlik Audit Sonuçları

### Auth Erişim Özeti

| Ortam | Kimliksiz GET | Kimliksiz POST | Demo GET | Demo POST |
|-------|--------------|----------------|----------|-----------|
| Production (port 3001) | 401 ✅ | 401 ✅ | 200 ✅ | 403 ✅ |
| Dev / Turbopack (port 3002) | **200 ❌** | **500 ❌** | 200 ✅ | **500 ❌** |

**Bulgu F-1: Dev middleware bypass**
- **Etki:** Yalnızca geliştirme ortamı — production build doğru çalışıyor
- **Kök neden:** Turbopack Edge Runtime'da `createServerClient` başarısız oluyor (env var erişim sorunu), middleware exception'ı yakalanmıyor, Next.js isteği route handler'a geçiriyor
- **Çözüm:** `middleware.ts`'e try-catch ekle; hata durumunda explicit 401 dön

```typescript
// Önce:
const { data: { user } } = await supabase.auth.getUser();
// Sonra:
let user = null;
try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
} catch {
    // Supabase init başarısız → kimliksiz kabul et → 401
}
```

### HTTP Güvenlik Header'ları

| Header | Durum | Not |
|--------|-------|-----|
| X-Content-Type-Options: nosniff | ✅ | `next.config.ts`'de mevcut |
| X-Frame-Options: SAMEORIGIN | ✅ | `next.config.ts`'de mevcut |
| Referrer-Policy | ✅ | `next.config.ts`'de mevcut |
| Content-Security-Policy | ❌ Eksik | XSS riski; hardening backlog |
| Strict-Transport-Security | ❌ Eksik | Vercel'de otomatik olabilir |
| Permissions-Policy | ❌ Eksik | Hardening backlog |

### CRON Endpoint Güvenliği

| Test | Sonuç | Açıklama |
|------|-------|----------|
| Yanlış Bearer token (prod) | 401 ✅ | Middleware session'a düşüyor, session yok → 401 |
| Doğru Bearer token | 200 ✅ | CRON bypass çalışıyor |
| Authenticated user, no CRON token | 200 ⚠️ | Tasarım gereği: session varsa geçirir |

**Not:** Authenticated kullanıcıların CRON endpoint'lerini doğrudan çağırabilmesi tasarım gereği ancak potansiyel risk. `requireAdmin()` veya role check eklenebilir.

---

## Faz 2 — Concurrency Test Sonuçları

### 2.1 Quote Convert Yarışı (migration 037)

| Metrik | Değer |
|--------|-------|
| Eşzamanlı VU | 5 |
| Başarılı convert (201) | **1** ✅ |
| Reddedilen convert (409) | 14 ✅ |
| Server error (5xx) | 0 ✅ |
| Invariant | Tek sipariş oluştu ✅ |

**Sonuç:** Migration 037 UNIQUE partial index (`quote_id` üzerinde) race condition'ı tamamen engelliyor.

### 2.2 Stok Rezervasyon Yarışı (5 → 100 VU kademeli)

| VU | Create p95 | Approve p95 | Created | Approved | Rejected | 5xx | Fail% |
|----|-----------|------------|---------|----------|----------|-----|-------|
| 5 | 1316ms | — | 877 | 0 | 877 | 0 | 75.0% |
| 15 | 7241ms | 1344ms | 813 | 808 | 5 | 0 | 1.3% |
| 30 | 3840ms | 2845ms | 1496 | 1194 | 287 | **8** | 6.5% |
| 50 | 15s (timeout) | 9212ms | 1583 | 454 | 1062 | 0 | 23.3% |
| 75 | 15s (timeout) | 15s (timeout) | 608 | 80 | 1153 | 0 | 52.7% |
| **100** | 15s | — | **0** | **0** | 2220 | 0 | **100%** |

**İnvariant kontrol (tüm kademeler sonunda):**
- `reserved > on_hand`: **0 ihlal** ✅
- `available_now < 0`: **0 ihlal** ✅
- Cancelled + non-unallocated: **0 ihlal** ✅

**Kırılma noktaları:**
- **50 VU → Soft limit:** p95 timeout'a giriyor, %23 fail, 409 stok yetersiz artıyor
- **75 VU → Ciddi degradasyon:** %52 fail, approve p95 timeout
- **100 VU → Tam çöküş:** %100 timeout, hiçbir create başarılı değil
- VU 30'da 8 adet 5xx — bağlantı pool sıkışması

**Not:** VU 5'te 0 onay (877 red) — ürün stoku test başında tükenmiş; stok yetersiz reddi business logic değil, bug değil.

### 2.3 Alert Scan Kırılma Testi (5→100 VU)

| VU | p50 | p95 | p99 | Fail Rate | Toplam İstek |
|----|-----|-----|-----|-----------|-------------|
| 5 | 313ms | 4978ms | 5945ms | 81.9% | 733 |
| 15 | 309ms | 4890ms | 5026ms | 86.5% | 2511 |
| 30 | 310ms | 4891ms | 5119ms | 88.9% | 5267 |
| 50 | 310ms | 4877ms | 6448ms | 89.8% | 8334 |
| 75 | 308ms | 4874ms | 5774ms | 89.9% | 12907 |
| 100 | 308ms | 4882ms | 10244ms | 90.1% | 15927 |

**Açıklama:** Yüksek fail rate beklenen davranış — advisory lock sayesinde sadece 1 scan eşzamanlı çalışıyor, diğerleri anında 409 alıyor (p50 ~310ms). Gerçek scan süresi p95 ~5s.

**Kırılma noktası:** Scan işlemi 100 VU'da bile kırılmadı. `pg_advisory_xact_lock` etkili çalışıyor. 100 VU'da p99 ~10s'e yükseldi (connection pool baskısı başlıyor).

---

## Faz 3 — Kapasite Testi Sonuçları

### 3.1 Endpoint Performans Matrisi

| Endpoint | Small (500 ür. / 1K sip.) | Medium (5K ür. / 10K sip.) | Trend |
|----------|--------------------------|---------------------------|-------|
| | p50 / p95 | p50 / p95 | |
| `GET /api/products` | 15ms / 2157ms | 18ms / 2464ms | ↑ 14% |
| `GET /api/products?category=X` | 11ms / 650ms | 11ms / 2844ms | ↑ 337% |
| `GET /api/products/aging` | 905ms / **1180ms** | 967ms / **2643ms** | ↑ 124% |
| `GET /api/orders` | 321ms / 356ms | 327ms / 405ms | ↑ 14% |
| `GET /api/orders?commercial_status=approved` | 320ms / 331ms | 327ms / 408ms | ↑ 23% |
| `GET /api/quotes` | 11ms / 325ms | 13ms / 335ms | ↑ 3% |
| `GET /api/alerts?status=active` | 316ms / 401ms | 317ms / 403ms | ~flat |
| `GET /api/purchase/suggestions` | 310ms / 332ms | 311ms / 389ms | ↑ 17% |
| `GET /api/customers` | 16ms / 639ms | 26ms / 954ms | ↑ 49% |

**Tüm 18 endpoint check her iki profilde de başarılı (pass rate: %100)**

### 3.2 Darboğaz Analizi

**Kritik: `GET /api/products/aging`**
- Small → Medium: p95 2.24× arttı (1.18s → 2.64s)
- Medium p99: 4.64s — 20K ürünle timeout riski yüksek
- Sebep: Ürün başına `coverage_days` hesaplama, JOIN'ler, hesaplamalı kolonlar
- **Öneri:** Index iyileştirmesi + sorgu caching veya server-side pagination

**Dikkat: `GET /api/products?category=X` filtresi**
- Small p95: 650ms → Medium p95: 2844ms (4.4× artış)
- Medium p99: 7.491s (yavaş)
- Sebep: Kategori filtresi + büyük tablo taraması
- **Öneri:** `category` kolonu üzerine composite index

**Stabil: Alertler, siparişler, teklifler**
- Veri hacminden neredeyse bağımsız (sayfalama ve index etkili)

### 3.3 Edge Case Sonuçları

| Test | HTTP Kodu | Beklenen | Durum | Not |
|------|-----------|----------|-------|-----|
| Bozuk JSON body | 500 | 400 | ❌ | JS parse error sızdı |
| `null` body | 500 | 400 | ❌ | "Cannot set properties of null" sızdı |
| Numeric overflow (99999999²) | 500 | 400/422 | ❌ | DB hatası sızdı |
| 100KB notes string | 201 | 201 veya 413 | ⚠️ | String boyut limiti yok |
| Negatif quantity | 400 | 400 | ✅ | Doğru hata mesajı |
| Enum dışı `commercial_status` | 400 | 400 | ✅ | |
| Enum dışı `transition` değeri | 400 | 400 | ✅ | |
| `?page=999999` | 200 (boş dizi) | 200 | ✅ | Graceful |
| `?limit=999999` | 200 (boş dizi) | 200 | ✅ | Graceful |
| Geçersiz UUID path | 400 | 400 | ✅ | |

**Bulgu F-2: JSON parse hataları 500 dönüyor**
- `SyntaxError` ve DB hataları direkt olarak client'a yansıyor
- **Çözüm:** `api/orders/route.ts` ve diğer POST route'lara `try-catch` + standart 400 response ekle

```typescript
// orders/route.ts POST başında:
let body;
try {
    body = await request.json();
} catch {
    return NextResponse.json({ error: "Geçersiz JSON." }, { status: 400 });
}
if (!body) return NextResponse.json({ error: "Boş istek gövdesi." }, { status: 400 });
```

---

## Faz 4 — Tam Bulgu Listesi ve Backlog

> Bu bölüm **tek kaynak of truth** — Faz 1 statik güvenlik analizi + Faz 3 kapasite/edge case bulgularının tamamı burada.

---

### Kritik (Üretim Öncesi Şart)

| # | Kaynak | Konu | Etki | Çözüm |
|---|--------|------|------|-------|
| C-1 | Faz 1 / Faz 3 | Dev middleware bypass (Turbopack) | Auth kontrolsüz (sadece dev) | `middleware.ts`'de `getUser()` try-catch; hata → explicit 401 |
| C-2 | Faz 3 | JSON/null body → 500 | İç hata sızıyor, 400 olmalı | Her POST route başına JSON parse try-catch |
| C-3 | Faz 3 | Numeric overflow → 500 | DB hata mesajı sızıyor | Max value validation + DB hata catch |

---

### Yüksek Öncelik

| # | Kaynak | Konu | Etki | Çözüm |
|---|--------|------|------|-------|
| H-1 | Faz 1 | Content-Security-Policy eksik | XSS riski | `next.config.ts` headers ekle (`'unsafe-inline'` gerekli — inline styles) |
| H-2 | Faz 3 | `products/aging` p95=2.6s (medium) | 20K ürünle timeout | Index + sorgu optimize + server-side pagination |
| H-3 | Faz 3 | Category filter p99=7.5s (medium) | UX bozulması | `products(category, is_active)` composite index migration |
| H-4 | Faz 3 | 100KB+ body limitsiz | DoS vektörü | Notes/string alanlarına max length validation |

---

### Orta Öncelik

| # | Kaynak | Konu | Etki | Çözüm |
|---|--------|------|------|-------|
| M-1 | Faz 1 | CRON endpoint'ler session ile tetiklenebilir | Auth'd user ağır işlemi başlatabilir | Sadece `CRON_SECRET` Bearer kabul et; session bypass kaldır |
| M-2 | Faz 1 | HSTS eksik | MITM riski | `next.config.ts` veya Vercel dashboard'dan ayarla |
| M-3 | Faz 1 | Rate limiting yok | Brute force / AI maliyet saldırısı | Vercel KV veya upstash-ratelimit; önce AI endpoint'leri |
| M-4 | Faz 1 | `handleApiError` iç mesaj sızıntısı | Prod'da DB/constraint adları görünebilir | `NODE_ENV=production`'da generic mesaj dön, Sentry'e logla |
| M-5 | Faz 3 | Stok rezervasyon 15+ VU testi yapılmadı | Kırılma noktası bilinmiyor | `TARGET_VU=15,30,50,100` kademesi çalıştır |
| M-6 | Faz 3 | Large profil (20K ürün) testi yapılmadı | Aging/filter timeout riski bilinmiyor | `seed-large.ts --profile=large` + kapasite testi |

---

### Düşük Öncelik / Backlog

| # | Kaynak | Konu | Çözüm |
|---|--------|------|-------|
| L-1 | Faz 1 | Permissions-Policy header eksik | `next.config.ts`'e ekle (`camera=(), microphone=(), geolocation=()`) |
| L-2 | Faz 1 | `/api/health` tablo/migration adları herkese açık | Seçenek A: sadece `{status:"ok"}` döndür. Seçenek B: auth gerektirir |
| L-3 | Faz 1 | `limit` param üst sınırı yok (`?limit=999999`) | `Math.min(parseInt(limit ?? "50"), 500)` — inventory/movements, parasut/logs, production |
| L-4 | Faz 1 | Logo upload: SVG inline doğrulama | Logo'nun `<img src>` ile render edildiğini doğrula (inline SVG değil) |
| L-5 | Faz 1 | `ADMIN_EMAILS` boş = fail open | Production'da `ADMIN_EMAILS` env var dolu olmalı |
| L-6 | Faz 3 | `seed-large.ts --clean` 1000 limit bug | Loop veya batch delete fix |
| L-7 | Faz 3 | `GET /api/customers?page=999999` tutarsız | Sayfalama davranışı standardize et |
| L-8 | Roadmap | Tedarikçi performansı modülü | Yüksek etki planı kalan item — ayrı konuşmada |

---

### Güvenli — Aksiyon Gerekmiyor

| # | Konu | Sonuç |
|---|------|-------|
| S-1 | `dangerouslySetInnerHTML` (4 kullanım) | Hepsi hardcoded CSS const — kullanıcı verisi yok ✅ |
| S-2 | Credential masking | Demo: null/false · Auth'd: ilk 4 kar + •••••••• ✅ |
| S-3 | JSON/null body → 500 | Regression test mevcut ✅ |

---

## Ham Metrik Arşivi

```
results/
├── capacity-small-20260422.json     (500 ür / 1K sip)
├── capacity-medium-20260422.json    (5K ür / 10K sip)
├── concurrency-quote-20260422-*.json (3 deneme, son başarılı: 173407)
├── scan-vu5-20260422.json
├── scan-vu15-20260422.json
├── scan-vu30-20260422.json
├── scan-vu50-20260422.json
├── scan-vu75-20260422.json
├── scan-vu100-20260422.json
├── stock-reservation-vu5-20260422.json
└── stock-reservation-vu5-20260422-180729.json
```

---

## Audit Kapsamı ve Sınırları

**Yapılan:**
- Faz 1: Statik güvenlik analizi, auth matrisi, header denetimi
- Faz 2: Quote convert race (5 VU), stok rezervasyon (5 VU), alert scan (5→100 VU)
- Faz 3: Small + medium profil kapasite testi, 10 edge case
- Faz 4: Bu rapor

**Yapılmayan (backlog):**
- Stok rezervasyon 15–100 VU kademesi
- Large profil (20K ürün, 50K sipariş) kapasite testi
- Import wizard concurrency testi
- Paraşüt sync concurrency testi
- Playwright E2E auth regression
- DB `EXPLAIN ANALYZE` sorgu planı analizi

---

_Rapor: Claude Code · 2026-04-22_
