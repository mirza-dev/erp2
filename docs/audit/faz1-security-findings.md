# Faz 1 — Güvenlik Bulguları Raporu
_Tarih: 2026-04-22 | Yöntem: Statik kod analizi_

## Önem Seviyeleri
- 🔴 **CRITICAL** — İstismar edilirse doğrudan zarar (veri sızıntısı, yetkisiz yazma)
- 🟠 **HIGH** — Ciddi risk, hızlı düzeltilmeli
- 🟡 **MEDIUM** — Orta riskli, hardening backlog'a alınmalı
- 🟢 **INFO** — Bilgi niteliğinde, dikkat edilmeli

---

## Bulgular

### B-01 🟡 — Eksik HTTP Güvenlik Header'ları

**Durum:** `next.config.ts`'de sadece 3 header var.

**Mevcut:**
- `X-Content-Type-Options: nosniff` ✅
- `X-Frame-Options: SAMEORIGIN` ✅
- `Referrer-Policy: strict-origin-when-cross-origin` ✅

**Eksik:**
```
Content-Security-Policy     → XSS saldırılarına karşı ilk savunma hattı
Strict-Transport-Security   → HTTPS downgrade saldırılarına karşı (Vercel otomatik ekliyor olabilir — doğrulanmalı)
Permissions-Policy          → Gereksiz browser API erişimini kısıtlar (camera, mic, geolocation)
X-XSS-Protection: 0        → Legacy ama bazı eski tarayıcılar için; modern CSP öncelikli
```

**Önerilen Çözüm:**
```ts
// next.config.ts — headers() içine eklenecek
{ key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
{ key: "Content-Security-Policy", value: "default-src 'self'; img-src 'self' data: blob: https:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src 'self' https://*.supabase.co https://sentry.io;" },
```

**Not:** CSP için `'unsafe-inline'` gerekiyor çünkü proje inline styles kullanıyor. İdealde nonce tabanlı CSP daha güçlüdür ama mimaride değişiklik gerektirir.

---

### B-02 🟡 — Rate Limiting Yok

**Durum:** Hiçbir route'da rate limiting yok. Middleware'de de yok.

**Risk alanları:**
- `POST /api/auth/*` — brute force login denemeleri (Supabase kendi sınırı var, doğrulanmalı)
- `POST /api/ai/*` — her çağrı Anthropic API'ye gider → maliyet saldırısı potansiyeli
- `POST /api/alerts/scan` — ağır RPC çağrıları zincirleniyor
- `POST /api/import/[id]/confirm` — stok yazma işlemleri

**Önerilen Çözüm:**
Vercel Edge Middleware'de IP tabanlı rate limiting (Vercel KV veya upstash-ratelimit). Öncelik: AI endpoint'leri.

---

### B-03 🟡 — `handleApiError` İç Hata Mesajlarını İstemciye Döner

**Durum:** `src/lib/api-error.ts:25`
```ts
const msg = err instanceof Error ? err.message : "Beklenmeyen bir hata oluştu.";
return NextResponse.json({ error: msg }, { status: 500 });
```

**Risk:** Supabase hata mesajları tablo adı, kolon adı, constraint adı içerebilir.
Örnek potansiyel sızıntı: `"duplicate key value violates unique constraint 'products_sku_key'"`

**Kime görünür:** Auth'd kullanıcılara (middleware anonymous/demo için 401/403 döner, 500'e ulaşmaz).

**Önerilen Çözüm:**
```ts
// Prod'da internal mesajı logla, generic mesaj dön
const isProduction = process.env.NODE_ENV === "production";
const clientMsg = isProduction ? "Beklenmeyen bir hata oluştu." : (err instanceof Error ? err.message : "Beklenmeyen bir hata oluştu.");
```

---

### B-04 🟡 — `/api/health` Şema Detaylarını Herkese Açar

**Durum:** `/api/health` ALWAYS_PUBLIC — anonymous kullanıcılar dahil herkes görebilir.

**Açıklanan bilgiler:**
- Uygulanan migration isimleri (migration_001 → migration_037)
- Tablo isimleri (`customers`, `sales_orders`, `production_entries`, `alerts`, ...)
- RPC fonksiyon isimleri
- Supabase URL (zaten public) ve env var varlığı (boolean flag)

**Risk:** Saldırganlar DB şemasını öğrenerek daha hedefli saldırı yapabilir.

**Önerilen Çözüm:**
- Seçenek A: Health check'i sadece `{ status: "ok" }` döndürecek şekilde sadeleştir; detayları auth gerektirir.
- Seçenek B: Mevcut hali koru ama ALWAYS_PUBLIC'ten çıkar, session gerektirir.

---

### B-05 🟡 — Pagination `limit` Parametresinde Üst Sınır Yok

**Durum:** Bazı endpoint'ler `limit` parametresini validation olmadan DB'ye iletir.

```ts
// /api/inventory/movements/route.ts:14
const limit = parseInt(searchParams.get("limit") ?? "50");
// DB'ye aynen gidiyor — MaxValue = Infinity'e kadar gönderebilir
```

**Etkilenen endpoint'ler:**
- `GET /api/inventory/movements?limit=999999`
- `GET /api/parasut/logs?limit=999999`
- `GET /api/production?limit=999999`

**Risk:** Auth'd kullanıcı büyük limitlerle gereksiz DB yükü yaratabilir.

**Önerilen Çözüm:**
```ts
const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 500);
```

---

### B-06 🟡 — CRON Endpoint'leri Session ile de Tetiklenebilir

**Durum:** `middleware.ts:33`
```ts
// Secret yoksa veya header eşleşmiyorsa → session kontrolüne düş
```
CRON_PATHS'te CRON_SECRET yoksa/eşleşmiyorsa middleware session kontrolüne düşer. Geçerli session olan her kullanıcı CRON endpoint'lerini tetikleyebilir.

**Etkilenen endpoint'ler:** 6 CRON endpoint (alerts/scan, alerts/ai-suggest, parasut/sync-all, orders/expire-quotes, orders/check-shipments, quotes/expire)

**Risk:** Auth'd kullanıcı istemeden (veya bilerek) ağır CRON işlerini başlatabilir. Özellikle `POST /api/alerts/scan` advisory lock ile korunuyor ama yine de sık tetikleme DB yükü yaratır.

**Önerilen Çözüm:**
CRON_PATH'lerde session bypass'ı tamamen kaldır — sadece CRON_SECRET kabul et:
```ts
if (CRON_PATHS.some(p => pathname === p)) {
    const secret = process.env.CRON_SECRET;
    const authHeader = request.headers.get("authorization");
    if (secret && authHeader === `Bearer ${secret}`) {
        return NextResponse.next();
    }
    return NextResponse.json({ error: "CRON_SECRET gerekli." }, { status: 401 });
}
```

---

### B-07 🟢 — `dangerouslySetInnerHTML` — GÜVENLİ

**Durum:** 4 kullanım tespit edildi, tamamı sabit CSS string.

| Dosya | Satır | İçerik |
|-------|-------|--------|
| `quotes/preview/page.tsx` | 88 | Hardcoded print CSS template literal |
| `quotes/_components/QuoteForm.tsx` | 552 | `INJECTED_CSS` — line 37'de `const` |
| `quotes/components/QuoteDocument.tsx` | 308 | `PAGE_CSS` — line 46'da `const` |
| `quotes/components/QuoteDocument.tsx` | 309 | `PRINT_CSS` — line 55'de `const` |

**Sonuç:** Kullanıcı verisi hiçbir yerde interpolate edilmiyor. XSS riski yok. ✅

---

### B-08 🟢 — Logo Upload — GÜVENLİ

**Durum:** `/api/settings/company/logo` — `src/app/api/settings/company/logo/route.ts`

- MIME whitelist: `["image/png", "image/jpeg", "image/svg+xml", "image/webp"]` ✅
- Max boyut: 2MB ✅
- Supabase Storage'a upload — public URL üzerinden servis ediliyor

**Dikkat:** SVG dosyaları JavaScript içerebilir. Supabase Storage SVG'yi inline servis ediyorsa XSS potansiyeli var. Ancak `<img>` tag ile gösteriliyorsa güvenli.

**Öneri:** Logo'nun `<img src=...>` ile gösterildiğini doğrula (inline SVG değil). Eğer inline SVG kullanılıyorsa `image/svg+xml` whitelist'ten çıkarılmalı.

---

### B-09 🟢 — Credential Masking — GÜVENLİ

- `GET /api/parasut/config` → Demo: sadece `enabled` flag. Auth'd user: ilk 4 kar + `••••••••` ✅
- `GET /api/settings/api-keys-status` → Demo: `{ parasut: false, claude: false, vercel: false }` ✅
- `GET /api/settings/company` → Firma bilgisi (adres, web) döner — hassas credential içermiyor ✅
- Regression test var: `credentials-no-leak.test.ts` ✅

---

### B-10 🟢 — `ADMIN_EMAILS` Boş Durumu

**Durum:** `ADMIN_EMAILS` boşsa tüm auth'd kullanıcılar admin endpoint'lerine erişebilir.

**Mevcut kod:** `if (allowed.length > 0 && !allowed.includes(user.email ?? "")) → 403`

**Değerlendirme:** Lokal dev için kasıtlı "fail open" davranış. Production'da `ADMIN_EMAILS` doldurulmalı.

---

## Özet Tablo

| ID | Önem | Başlık | Durum |
|----|------|--------|-------|
| B-01 | 🟡 MEDIUM | Eksik HTTP Security Header'lar (CSP, HSTS, Permissions-Policy) | Hardening backlog |
| B-02 | 🟡 MEDIUM | Rate limiting yok | Hardening backlog |
| B-03 | 🟡 MEDIUM | `handleApiError` iç mesaj sızıntısı | Hardening backlog |
| B-04 | 🟡 MEDIUM | `/api/health` şema detayı ALWAYS_PUBLIC | Hardening backlog |
| B-05 | 🟡 MEDIUM | `limit` param üst sınır yok | Düşük öncelik fix |
| B-06 | 🟡 MEDIUM | CRON endpoint'leri session ile tetiklenebilir | Hardening backlog |
| B-07 | 🟢 INFO | `dangerouslySetInnerHTML` güvenli | Aksiyon yok |
| B-08 | 🟢 INFO | Logo upload — SVG inline doğrulama bekleniyor | Küçük kontrol |
| B-09 | 🟢 INFO | Credential masking doğru | Aksiyon yok |
| B-10 | 🟢 INFO | `ADMIN_EMAILS` boş = fail open | Production'da doldur |

**CRITICAL veya HIGH bulgu yok.** Mevcut sistem savunulabilir; eksikler hardening kategorisinde.
