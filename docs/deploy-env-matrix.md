# Deploy Env Matrisi

Prod (Coolify) açılışından önce doldurulması gereken ortam değişkenleri, ve
**eksik bırakılırsa ne olduğu**. Bu dosyanın amacı "eksikse patlar mı, sessizce
kapanır mı" sorusunu deploy gününde aramamak.

Kaynak: `grep -rhoE "process\.env\.[A-Z_0-9]+" src scripts` — 2026-08-30.
E-posta tarafının ayrıntısı ayrı dosyada: [`EMAIL_DEPLOY.md`](EMAIL_DEPLOY.md).

Sütunlar:
- **Yerel** = `.env.local`'daki bugünkü durum (2026-08-30).
- **Eksikse** = kodun gerçek davranışı; "sessiz" olanlar en tehlikelileri, çünkü
  deploy başarılı görünür ve özellik çalışmaz.

---

## 1. Zorunlu — eksikse uygulama ayağa kalkmaz veya kilitlenir

| Değişken | Yerel | Eksikse |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Her istek `ConfigError` → HTTP 503 (`api-error.ts`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Aynı — istemci Supabase kurulamaz |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Sunucu tarafı tüm sorgular 503 |
| `ADMIN_EMAILS` | ❌ **YOK** | **Brick riski.** `proxy.ts:87` + `auth/callback` bootstrap admin listesi buradan gelir. Kalıcı admin varsa (canlıda 3 var) sistem açılır; **hiç kalıcı admin yoksa kimse giremez.** Deploy öncesi `npm run preflight:auth` bunu ölçer (0 admin → exit 1) |

## 2. Sessizce kapanan özellikler — build yeşil, özellik ölü

| Değişken | Yerel | Eksikse |
|---|---|---|
| `EMAIL_FROM` | ❌ **YOK** | **Şu an canlıdaki sorun bu.** `email-service.ts:56` erken döner; bildirimler `notification_outbox`'ta `waiting_config` olarak birikir (bugün 10 kayıt, en eskisi 12 Haz). `RESEND_API_KEY` set olsa bile yetmiyor — ikisi birlikte gerekiyor |
| `RESEND_API_KEY` | ✅ | Aynı yol: gönderim yok, outbox birikir |
| `RESEND_WEBHOOK_SECRET` | ❌ YOK | Teslimat durumu (bounce/delivered) geri okunamaz; `email-webhook-service.ts` imzayı doğrulayamaz → webhook reddedilir |
| `ANTHROPIC_API_KEY` | ⚠️ **SET ama 401** | AI kolon eşleştirme, `ai/parse`, `ai/score`, purchase-copilot, ops-summary kapalı. `/api/ai/health` `auth_failed` döner ve Ayarlar'da kırmızı görünür. 2026-08-30 probe: `api.anthropic.com/v1/models` → **HTTP 401** |
| `OPENAI_API_KEY` | ✅ | Sesli giriş kapanır — `voice-service.ts:20` **ikisini birden** ister (`OPENAI_API_KEY` ∧ `ANTHROPIC_API_KEY`), yani Anthropic 401'i sesli girişi de düşürüyor |
| `CRON_SECRET` | ✅ | Zamanlanmış uçların hepsi 401: outbox drenajı, alert taraması, Paraşüt senkronları, telemetri purge |
| `REDIS_URL` | ❌ YOK | Rate-limit paylaşılmaz; `ai-route-limit.ts` in-memory fallback'e düşer → **çok instance'lı kurulumda limit instance başına** uygulanır |
| `LIVE_RATES_API_KEY` | ❌ YOK | Kur servisi ücretsiz/önbellekli kaynağa düşer (`exchange-rates/route.ts:47`) |

## 3. Doğru değer gerektirenler — yanlışsa yanlış çalışır

| Değişken | Yerel | Not |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | ❌ YOK | Fallback **sabit** `https://erp.getmedspace.com` (`email/templates.ts:18`). E-posta içindeki bağlantılar buraya gider — domain değişirse linkler yanlış hedefe gider ve bu **sessizdir** |
| `INTERNAL_OPERATOR_EMAILS` | ✅ | Boşsa Developer Console + E-posta Teslimatları + API Anahtarları/Yapay Zeka sekmeleri **fail-closed** (kimse göremez). Yerelde satır başında bir boşlukla yazılı; `@next/env` okuyor, bazı shell `export` akışları takılabilir |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | ✅ | Yoksa Sentry no-op; panel "Sentry yapılandırılmamış" der |
| `SENTRY_ENVIRONMENT` | ❌ YOK | `NODE_ENV`'e düşer. **Prod'da açıkça `production` verilmeli** — mig.111'den beri hata grupları `(fingerprint, environment)` ile ayrışıyor; ortam etiketi yanlışsa dev ve prod hataları aynı gruba düşer |
| `QUOTE_SHARE_SECRET` | ❌ YOK | `CRON_SECRET`'tan **türetiliyor** (eşit değil). Çalışır, ama `CRON_SECRET` döndürülürse **paylaşılmış tüm teklif linkleri kırılır**. Prod'da ayrı vermek daha temiz |
| `TELEMETRY_ENABLED` | ❌ YOK | Varsayılan açık (`record.ts:64`). Kapatmak istenirse açıkça `false` |
| `ATTACHMENTS_ALLOW_DEMO_ANON` | ❌ YOK | Varsayılan kapalı — demo/anon ürün eki erişimi bloklu (`proxy.ts:244`). **Prod'da böyle kalmalı** |

## 4. Paraşüt — teslim KAPALI çıkacak

`PARASUT_ENABLED` boş (falsy) → entegrasyon kapalı. Açılış sırası ve kalan
kullanıcı-tarafı iş: [`parasut-golive-runbook.md`](parasut-golive-runbook.md).
`PARASUT_USE_MOCK` **`"false"` olarak açıkça verilmedikçe mock modda** kalır
(`parasut/oauth/start/route.ts:37`) — yani unutulursa gerçek OAuth başlamaz.

## 5. Prod'a **girmemesi** gerekenler

`E2E_USER_EMAIL` · `E2E_USER_PASSWORD` · `SIM_PASSWORD` · `SIM_APP_URL` ·
`SIM_HEADED` · `SIM_ONLY` · `SEED_DEMO_PASSWORD` · `BASE_URL` — test/simülasyon
koşumları için. `SEED_DEMO_PASSWORD` prod'a konursa seed demo kullanıcılarının
şifresini sabitler.

---

## Deploy günü açılış hamlesi

```bash
npx tsx scripts/check-migrations.ts   # otomatik probe + manuel liste
npm run preflight:auth                # 0 kalıcı admin → exit 1 = BRICK
```

Ardından Studio'da [`audit/manual-migration-checks.sql`](audit/manual-migration-checks.sql)
(her satır ✅ olmalı — son koşum 2026-08-30: 9/9).

Sonra bu dosyadaki §1 ve §2'yi Coolify env'ine karşı satır satır geçir.
