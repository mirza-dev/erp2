# İnceleme — Developer Console / System Health (2026-08-30)

> **Kapsam:** commit `ae7a9c1` — 62 dosya (46 yeni), migration 109, 11 API route'u, 6 ekran,
> mevcut koda dokunan 7 dosya.
> **Yöntem:** üç bağımsız ajan, ayrık kapsamlarla (güvenlik/yetki · doğruluk/veri · regresyon/arayüz);
> ardından ana ajan tarafından **kaynak koddan ve canlı sistemden yeniden doğrulama**.
> **Araçlar:** semgrep (p/typescript · p/react · p/nextjs · p/owasp-top-ten · `.semgrep/erp-rules.yml`) → 29 dosya, **0 bulgu** ·
> gitleaks → **0 sızıntı** · `tsc` 0 · `eslint` 0 · **476 dosya / 6713 test geçti** · `next build` 0 uyarı.
>
> **Özet: K:2 · Y:7 · O:7 · D:8 · Nit:5** (Nit tavanı REVIEW.md gereği 5; toplam ~14 aday vardı.)

> **KAPANIŞ (2026-08-30):** 29 bulgunun **29'u düzeltildi.** Doğrulama:
> `tsc` 0 · `eslint` 0 · **480 dosya / 6779 test** (zemin 6713, +66) · `next build` 0 uyarı ·
> semgrep (değişen yüzeyin tamamı) **0 bulgu** · `check-migrations` yalnız 111'i eksik raporluyor (beklenen).
> Ayrıntı: bu dosyanın sonundaki **Kapanış tablosu**.
>
> **KULLANICI TARAFI AÇIK:** `migration 110` ve `migration 111` Studio'dan uygulanmalı;
> `INTERNAL_OPERATOR_EMAILS` set edilmeden panele girilemez (bilinçli fail-closed).

## Verdikt

| Soru | Cevap |
|---|---|
| Mevcut ERP bozuldu mu? | **Hayır.** Yüksek riskli dört hipotezin dördü de kanıtla çürütüldü (aşağıda). |
| Panel güvenli mi? | **Hayır — K1 canlıda istismar edilebilir durumda.** Düzeltme yazıldı: `migration 110`. |
| Panel doğru mu ölçüyor? | Kısmen. Kapsama iddiası (K2) ve dört ölçüm kusuru (Y3–Y7) panelin verdiğini olduğundan iyi/kötü gösteriyor. |
| Arayüz kurallara uyuyor mu? | **Evet.** Tailwind 0 · framer-motion 0 · hardcoded renk 0 · 8/8 `"use client"` · `dangerouslySetInnerHTML` yok. |

---

## KRİTİK

### K1 — SECURITY DEFINER RPC'leri `anon` rolüne AÇIK; RLS'in tamamı baypas ediliyor · **CANLIDA DOĞRULANDI**

- **Kanıt (canlı, salt-okunur A/B probe — 2026-08-30):**
  ```
  POST /rest/v1/rpc/record_request_metrics  {"p_rows": []}     anon key → HTTP 200   (çalıştı)
  POST /rest/v1/rpc/dashboard_monthly_cogs  {"p_start": "…"}   anon key → HTTP 401
        {"code":"42501","message":"permission denied for function dashboard_monthly_cogs"}
  ```
  Tek fark revoke hedefi: `087:33` `from public, anon, authenticated` · `109:369` yalnız `from public`.
- **Kök sebep:** Supabase'in `ALTER DEFAULT PRIVILEGES … GRANT ALL ON FUNCTIONS TO postgres, anon,
  authenticated, service_role` varsayılanı her yeni fonksiyona **doğrudan** EXECUTE verir.
  `REVOKE … FROM public` yalnız PUBLIC pseudo-rolünü kaldırır, bu doğrudan grant'leri **kaldırmaz**.
  Fonksiyonlar `security definer` (`109:228,311,377`) olduğu için tabloların `service_role`-only
  policy'leri (`109:50,83,119,149,168,202`) bu yolda hiç devreye girmez.
- **Etkilenen 5 fonksiyon** (`revoke … from public;` — hepsi DEFINER):
  | Fonksiyon | Migration | Ne yapılabilir |
  |---|---|---|
  | `purge_telemetry()` | 109:413 | **Oturumsuz saldırgan hata kanıtlarını siler** |
  | `record_error_occurrence(…)` | 109:291 | Redaksiyonu ve boyut tavanlarını atlayarak yazma |
  | `record_request_metrics(jsonb,int)` | 109:369 | Sahte metrik · sınırsız satır (depolama DoS) |
  | `claim_notification_outbox(…)` | **097:175** | Bildirim lease'i çalma → sessiz teslimat DoS |
  | `update_email_delivery_from_provider(…)` | **097:251** | E-posta teslimat durumunu sahteleme |
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` tanımı gereği tarayıcı bundle'ındadır = herkese açıktır.
  Son iki satır bu commit'ten DEĞİL — 097 zaten uygulanmıştı; aynı mekanizma olduğu için birlikte bulundu.
- **Neden iki koruma da kör kaldı:**
  - `developer-migration-109.test.ts:64` **yanlış yönü** doğruluyor: "açık GRANT yok". Risk açık grant değil,
    varsayılan ayrıcalığın zaten vermiş olması.
  - `gate/sql-migration-lint.test.ts:42` yalnız `/REVOKE|GRANT EXECUTE/i` metninin **varlığına** bakıyor,
    hedef rollere değil → sapma CI'da kırmızı yanmıyor.
- **Emsal:** `055_revoke_ai_feedback_rpc_authenticated.sql:1-9` — proje bu tuzağı bir kez canlıda yedi,
  tek işi bu olan bir migration'la kapattı. Repo standardı `from public, anon, authenticated` (12 migration).
- **Düzeltme:** **`supabase/migrations/110_fix_definer_rpc_grants.sql` yazıldı** (5 fonksiyon, idempotent,
  doğrulama sorgusu dahil). **Studio'dan uygulanmalı.** Ayrıca gate sertleştirilmeli: DEFINER içeren
  migration için `FROM public, anon, authenticated` kalıbı zorunlu kılınmalı; `109` testindeki negatif
  iddia pozitife çevrilmeli.
- **Efor:** Küçük (migration hazır) + Küçük (2 test iddiası).

### K2 — İkinci kanca iddia edilen 33 route'un 28'ine ULAŞMIYOR; o modüllerin arızaları panelde görünmez

- **Kanıt:** `src/instrumentation.ts:7-11` iddiası: *"kalan 33'ü … kendi try/catch'ini yazıp hatayı
  yutuyor — oralara merkezi bir kanca olmadan ULAŞILAMAZ. … `onRequestError` kancası ikisini de yakalar."*
  Yutulan hata Next'in hata sınırına hiç ulaşmaz, dolayısıyla `onRequestError` **tetiklenmez**.
  Sayım (bu oturumda yeniden yapıldı): 159 route dosyası · 126'sı `handleApiError` · kalan 33'ün
  **28'i kendi `catch`'inde yanıt dönüyor**, yalnız 5'i dönmüyor
  (`parasut/config`, `parasut/oauth/start`, `auth/demo`, `auth/logout`, `quotes/[id]/convert`).
  Desen: `src/app/api/alerts/route.ts:24-27` — `catch (err) { console.error(…); return NextResponse.json({error:…},{status:500}); }`.
- **Gerçek kapsama:** 126 + 5 = **131/159**, iddia edilen "hepsi" değil. Görünmeyenler: import (10 route),
  parasut (4), alerts (4), inventory, ai, calendar-notes.
- **Etki:** Paraşüt senkronu her çağrıda 500 dönse, import belgesi her denemede patlasa panel bunu
  **hiç görmez**; `computeOverallHealth` "healthy" der. Panelin varlık sebebi olan soru
  ("sistemde bir sorun var mı") tam da en kırılgan modüllerde cevapsız kalır.
- **Düzeltme:** (a) o 28 route'un `catch` bloklarını `handleApiError`'a çevir (tek satırlık değişiklikler,
  yanıt sözleşmesi korunur) — ya da (b) `console.error`'ı saran bir yardımcı ile telemetriye bağla.
  Her hâlükârde `instrumentation.ts` ve commit mesajındaki kapsama iddiası düzeltilmeli.
- **Efor:** Orta.

---

## YÜKSEK

### Y1 — Ham URL (query string DAHİL) redaksiyonsuz `endpoint` olarak yazılıyor → PII telemetriye düşüyor

- **Kanıt:** `src/instrumentation.ts:40` `endpoint: errorRequest.path` · Next bunu
  `node_modules/next/dist/server/base-server.js:451` `path: req.url || ''` ile doldurur — Node'un `req.url`'i
  **sorgu dizesi dahil** ham istek hedefidir. `src/lib/telemetry/record.ts:158` `endpoint`'i **ham** geçiyor;
  aynı çağrıdaki title (`:151`), normalizedMessage (`:155`), userAgent (`:165`), stack (`:166`),
  context (`:167`) redaksiyondan geçiyor — `endpoint` **tek istisna** ve query string taşıyan tek alan.
- **Araç var, bu yolda çağrılmıyor:** `src/lib/telemetry/endpoint.ts:39` `normalizeEndpoint()` ilk iş olarak
  `split("?")[0]` yapıyor; yorumu (`:34`) gerekçeyi yazıyor: *"PII query string'de olabilir"*. Yalnız RUM
  yolunda kullanılıyor.
- **Gerçek yüzey:** RSC render hataları `handleApiError`'dan **geçmez**, doğrudan bu kancaya düşer.
  `src/app/dashboard/orders/page.tsx:20-27` `search`/`customerId`/`from`/`to` parametrelerini okuyan
  `force-dynamic` sunucu component'i; aynı desen customers/quotes/vendors/production'da da var.
  Ayrıca `/api/quotes/shared/<HMAC token>` (token PATH'te) ve `/login?…&attempted=<e-posta>`.
- **Kalıcılık:** `109:247` `endpoint = coalesce(excluded.endpoint, …)` grubun endpoint'ini her oluşumda
  ham URL ile **üzerine yazıyor**; `system_error_groups` için TTL yok.
- **Düzeltme:** `record.ts`'te yazmadan önce `normalizeEndpoint(endpoint) ?? redactString(endpoint.split("?")[0], 200)`.
  Test: `telemetry-record.test.ts`'e "sorgu dizesi endpoint'e yazılmaz" kilidi (`developer-rum.test.ts:47`'nin ikizi).
- **Efor:** Küçük.

### Y2 — Sunucu/edge Sentry hiç başlamıyor; kancadaki Sentry çağrısı no-op ve bu commit uyarıyı sustur du

- **Kanıt:** `@sentry/nextjs` v10 kök `sentry.server.config.ts`/`sentry.edge.config.ts` dosyalarını
  otomatik YÜKLEMEZ. SDK'nın kendi kodu bunu söylüyor —
  `node_modules/@sentry/nextjs/build/cjs/config/webpack.js:534-540`: *"`Sentry.init` must be called inside
  of an instrumentation file"* ve kök config dosyası varsa build uyarısı basar.
  **Ama** `:524-528` — uyarı, instrumentation dosyası `@sentry/` içeriyorsa **bastırılır**;
  yeni `src/instrumentation.ts:1` tam olarak `import * as Sentry from "@sentry/nextjs"` ile başlıyor.
- **Ayrım (önemli):** Bu commit Sentry'yi **bozmadı** — `ae7a9c1^` içinde `instrumentation.ts` yoktu,
  yani sunucu/edge Sentry'si **zaten hiç başlamıyordu** (istemci tarafı çalışıyor, o webpack ile enjekte ediliyor).
  Commit'in yaptığı: (a) SDK'nın bunu söyleyen build uyarısını **sustur mak**, (b) `instrumentation.ts:13-17`
  yorumunda ve `developer-integration.test.ts:62-68` testinde yanlış varsayımı **kilitlemek**.
  Sonuç: `instrumentation.ts:27` `Sentry.captureRequestError` sunucu tarafında **no-op**.
- **Etki:** "Sentry dış alarm katmanı olarak yerinde kalır" (plan §29.6) sunucu hataları için geçerli değil;
  Coolify'a çıkıldığında sunucu tarafında dış alarm **olmayacak** ve bunu söyleyecek uyarı da susturuldu.
- **Düzeltme:** `instrumentation.ts`'e `register()` ekle → `sentry.server.config.ts` / `sentry.edge.config.ts`
  içeriğini `process.env.NEXT_RUNTIME`'a göre import et (SDK'nın önerdiği kalıp), kök config dosyalarını kaldır.
  Yorum ve testteki iddiayı düzelt.
- **Efor:** Küçük–Orta (deploy öncesi doğrulama ister).

### Y3 — Sağlık verdikti hata oranına 4xx'i katıyor; aynı yanıttaki API satırı yalnız 5xx sayıyor

- **Kanıt:** `src/lib/supabase/telemetry.ts:415` `totalErrors = Σ(status4xx + status5xx)` →
  `src/lib/services/developer-console-service.ts:73-75` `errorRate = totalErrors / totalRequests` →
  `src/lib/telemetry/health.ts:88-90` `errorRate >= 0.2` → **`status: "critical"`**.
  Aynı yanıttaki API servis satırı ise `src/lib/telemetry/service-health.ts:89` `serverErrors / total`
  ile **yalnız 5xx** sayıyor.
- **Etki:** RUM tarayıcıdan geldiği için her 401 (oturum tazeleme), 404, 409 sayılıyor. 100 istekte 25 adet
  401 → genel durum **"Kritik — Hata oranı %25"**, API satırı aynı ekranda **"Sağlıklı"**.
  Commit'in kendi gerekçesi (`api-error.ts:66-69`) 4xx'in sistem kusuru olmadığını söylüyor.
- **Düzeltme:** Sağlık kararında 5xx oranını kullan; 4xx'i ayrı bir "istemci hataları" göstergesi yap.
- **Efor:** Küçük.

### Y4 — Başarısız sonda "ölçülmüş sıfır" olarak çiziliyor: `0 kritik hata`, yeşil (§28 ihlali)

- **Kanıt:** `src/lib/services/developer-console-service.ts:52,97` `safe(() => dbErrorWindowStats(since), emptyErrorStats())`
  → sonda patlarsa **sıfırlar** dönüyor ve `MetricCard` bunu ölçülmüş değer olarak çiziyor.
  `MetricCard`'ın `null → "Ölçülmüyor"` yolu (`ConsoleWidgets.tsx:113,139`) bu kartlarda hiç kullanılamıyor.
  Aynı desen `developer-feed.ts:316-324,349-354` — `.error` hiç kontrol edilmiyor.
- **Etki:** Telemetri okunamadığında (RLS/bağlantı/migration) panel **yeşil ve sıfır** gösterir; yani
  gözlemlenebilirlik katmanı bozulduğunda tam olarak "her şey yolunda" der. Şartname §28'in tersi.
- **Düzeltme:** `safe()` fallback'lerini `null`'a çevir; `HealthPayload`'da ölçülemeyen alanı `null` taşı;
  kartlar "Ölçülmüyor" göstersin.
- **Efor:** Orta.

### Y5 — RUM ingest'inde bütünlük ve kota kontrolü yok: Sağlık paneli her oturumlu kullanıcı tarafından yalanlatılabilir

- **Kanıt:** `src/app/api/developer/rum/route.ts:27` kapı `view_dashboard` — `permissions.ts:124` VIEWER_PERMS
  bile taşıyor → **6 rolün 6'sı**. `rum-aggregate.ts:88-105` `validateSample` yalnız **biçim** doğruluyor;
  örneğin gerçek bir isteğe ait olduğuna dair hiçbir bağ yok.
  Bu veri Y3'teki zincirle doğrudan `"critical"` üretebiliyor.
- **Yorum yanlış:** `rum/route.ts:19` *"tanınmayan path yazılmaz"* diyor — kod bunu yapmıyor.
  `SAFE_PATH_RE` (`endpoint.ts:20`) yalnız **biçim** doğruluyor, bilinen route listesine üyelik değil:
  `/api/aaaa`, `/api/aaab`… hepsi geçer. `109:191` `unique (bucket_at, endpoint, method)` +
  50 satır/istek + 300 istek/dk (`rate-limit.ts:144`) → tek IP'den saatte ~900 bin satır, `expires_at` 30 gün.
- **Not:** Stored-XSS **yok** (`SAFE_PATH_RE` `<`/`"`/`&` geçirmiyor) ve kişisel veri yazılmıyor.
  Eksik olan yetki değil, **bütünlük ve kota**.
- **Düzeltme:** (a) normalize sonucu **gerçek route manifestine** karşı allowlist'le; (b) `user.id` anahtarlı
  saatlik kota; (c) sağlık kararında RUM `errorRate`'i tek başına "critical" tetikleyicisi yapma —
  sunucu-tarafı `system_error_events` 5xx sayısıyla çapraz doğrula.
- **Efor:** Orta.

### Y6 — Kayıtlar ekranının filtreleri fetch'ten SONRA uygulanıyor; sonuç eksik ve sayfalama erken duruyor

- **Kanıt:** `level`/`module`/`search` filtreleri 6 kaynağın sorgularına inmiyor; her kaynaktan en yeni N satır
  çekilip TS'te eleniyor ve `nextCursor` da eleme sonrası hesaplanıyor.
- **Etki:** `level=critical` seçildiğinde 6 kaynağın son N satırında kritik yoksa ekran **boş** görünür ve
  sayfalama durur — oysa daha eski kritik kayıtlar vardır. Filtre "yok" demiyor, "bu sayfada yok" diyor.
- **Düzeltme:** Filtreleri her kaynağın PostgREST sorgusuna indir; cursor'ı filtreli sorgudan türet.
- **Efor:** Orta.

### Y7 — Hata grupları ortamları karıştırıyor; panel "production" etiketiyle development sayılarını gösterebilir

- **Kanıt:** `fingerprintError` girdisi `{errorType, normalizedMessage, topFrame}` — `environment` **yok**;
  `109` `on conflict (fingerprint) do update` `environment` kolonunu **güncellemiyor**.
- **Etki:** Tek Supabase projesi kullanıldığı sürece (bu projede öyle) geliştirme makinesindeki hata ile
  canlıdaki aynı hata **tek gruba** düşer; `occurrence_count` ve `last_seen_at` karışır, `environment`
  ilk yazan neyse o kalır. Prod ayağa kalkınca aktifleşir.
- **Düzeltme:** `environment`'ı parmak izi girdisine ekle (grup ayrışsın) veya grup anahtarını
  `(fingerprint, environment)` yap.
- **Efor:** Küçük–Orta (mevcut gruplar yeniden anahtarlanır).

---

## ORTA

| # | Bulgu | Kanıt | Etki |
|---|---|---|---|
| **O1** | `percentileFromHistogram` taşma kovasında **üst** değil **alt** sınır döndürüyor; etiket "Kova üst sınırı" diyor | `endpoint.ts:85-97` (`Number.isFinite(upper) ? upper : DURATION_BUCKETS[i-1]`) | 60 sn'lik bir uç panelde `p99 = 12,8 sn` görünür (5× eksik) — etiket yanıltıyor |
| **O2** | Cursor sayfalaması tie-breaker'sız; hata gruplarında imleç kolonu ayrıca değişken | `telemetry.ts` cursor sorguları | Aynı timestamp'li satırlar atlanır veya tekrarlanır |
| **O3** | Ciddiyet sayıları olayın değil **grubun** (yalnız yukarı çıkan) seviyesinden; "Uyarı" kartı yapısal olarak hep 0 | `system_error_events`'te `severity` kolonu yok | "Son 15 dk'da N kritik hata" ifadesi yanlış; bir kart hiç dolmaz |
| **O4** | `openIncidents` sondası çalışıyor ama hiç kullanılmıyor | `developer-feed.ts:327` | Açık bakım arızası sağlığı etkilemiyor |
| **O5** | Altı sondadan ikisi `safe()` dışında | `developer-console-service.ts:48-56` | Patlarsa `/api/developer/health` tamamen 500 — dosyanın `:134-137`'deki kendi gerekçesine aykırı |
| **O6** | `onRequestError` yolunda `requestId` doğrulanmadan yazılıyor | `record.ts:143-146` vs `request-id.ts:42` (`isValidRequestId`, yorumu "enjeksiyon kapısı") | Korelasyon zehirlenmesi: saldırgan kendi olaylarını meşru bir isteğin ID'sine bağlayabilir |
| **O7** | Kayıtlar akışında altı kaynağın hepsi hatayı sessizce yutuyor | `developer-feed.ts` | Bir kaynak düşerse ekran onu hiç göstermez, "kayıt yok" der |

---

## DÜŞÜK

| # | Bulgu | Kanıt |
|---|---|---|
| **D1** | Sessiz `.limit()` kırpması kesin sayı gibi sunuluyor | `developer-feed.ts:365` `.limit(10_000)` → "Aktif kullanıcı" sessizce doyar |
| **D2** | Uç bazında `avgMs`/`errorRate` ölçülemediğinde `0`, genel toplam aynı durumda `null` | `telemetry.ts:400` — aynı yanıtta iki farklı sözleşme |
| **D3** | `record_request_metrics`: eksik/`null` histogram elemanı satırı kalıcı bozar, CHECK yakalamaz | `109:328-334` — `coalesce` yok |
| **D4** | `open` hata grupları hiç silinmiyor → grup tablosunda sınırsız büyüme | `109:397-401` — purge koşulu yalnız çözülmüşleri kapsıyor |
| **D5** | `pagehide` dinleyicisi cleanup'ta kaldırılmıyor | `TelemetryBridge` — Fast Refresh'te dinleyici birikir |
| **D6** | `PATCH /api/developer/bugs/[id]` bağ işlemlerini varlık kontrolünden önce yapıyor | `bugs/[id]/route.ts:75,78` vs `:93` → 404 yerine FK ihlali → 500, üstelik hata merkezine yazılır |
| **D7** | proxy matcher `.*\..*` ile noktalı her yolu middleware'den muaf tutuyor | `proxy.ts:345` — bu commit'te değişmedi; O6'nın penceresi. Developer route'ları kendi guard'ını taşıdığı için panel bu yoldan açılmıyor |
| **D8** | ~~Retention cron adımı 109 uygulanmadan saatlik job'ı kırar~~ | **DÜŞTÜ** — 109 uygulandı |

---

## Nitler (5 / ~14)

1. `redact.ts` anahtar listesinde PII alan adları yok (`phone`, `address`, `tax_number`, `vkn`, `tckn`);
   biçimlendirilmiş telefon ve `TR33…` IBAN elenmiyor. Bugün istismar edilemez (hiçbir çağıran `context`'e
   kullanıcı verisi koymuyor) — latent.
2. `GET /api/developer/logs` `userId` serbest metin olarak uuid kolonuna gidiyor (`logs/route.ts:35`);
   `isUuid` (`api-params.ts:61`) aynı dosyada var, diğer route'lar kullanıyor → PG `22P02` = 400 yerine 500.
3. `request_metrics` status sayaçlarında `check (>= 0)` yok (`109:185-188`); `sample_count`/`sum_ms`/`max_ms`
   için var — DB savunması asimetrik.
4. `X-RateLimit-Reset` yalnız 429 yanıtında (`proxy.ts:170`); başarılı yolda yok → istemci geri-çekilme hesaplayamaz.
5. `109` yorumu ve `rum/route.ts:19` yorumu kodun yapmadığını iddia ediyor ("tanınmayan path yazılmaz") —
   yorum-kod sapması, Y5'in tespitini geciktiren sebep.

---

## Yüksek riskli hipotezler — kanıtla ÇÜRÜTÜLDÜ (tekrar aranmasın)

| Hipotez | Sonuç |
|---|---|
| `proxy.ts` response'u yeniden ürettiği için Supabase oturum çerezleri düşüyor → login döngüsü | **Hayır.** Auth'lu yol hâlâ `supabaseResponse` döndürüyor (`proxy.ts:336`); `NextResponse.next({request:{headers}})` Next içinde aynı koda gidiyor. |
| `handleApiError` telemetri yüzünden patlayabilir (hata yakalarken kendi patlar) | **Hayır.** Üç kat try/catch: `scheduleTelemetry` · `recordError` iç try · `after()` sarmalı. |
| `register()` export edilmemesi Next'i kırar | **Hayır.** Next `register`'ı opsiyonel çağırıyor. (Sentry init sorunu ayrı — Y2.) |
| Global `fetch` sarmalayıcısı istekleri bozar / sonsuz döngü kurar | **Hayır.** Argümanlar kayıpsız geçiyor, orijinal hata yeniden fırlatılıyor, çift-sarma ve self-ölçüm korumalı. |
| `database.types.ts` mevcut tipleri bozdu | **Hayır.** Salt-ekleme: 94 satır eklendi, 0 silindi. |
| Panelde stored-XSS | **Yok.** React kaçışı + `dangerouslySetInnerHTML` yok + `SAFE_PATH_RE` `<`/`"` geçirmiyor. |
| `/api/developer/retention` `ALWAYS_PUBLIC`'te → korumasız | **Hayır.** `requireCronSecret` fail-**CLOSED** (secret yoksa 401) + `timingSafeEqual`. |
| `INTERNAL_ONLY_PREFIXES` sınır hatası (`/dashboard/developerX`) | **Yok.** `proxy.ts:325` `=== p \|\| startsWith(p+"/")`; kaçan yol matriste olmadığı için fail-closed. |
| DEFINER RPC'lerinde SQL enjeksiyonu | **Yok.** Dinamik SQL/`execute format` yok; `jsonb_array_elements` + tipli cast. |
| `audit_log` PII sızıntısı (2026-06 denetiminin K1 deseni) | **Yok.** `developer-feed.ts:162` `before_state`/`after_state` çekmiyor; `actor` redakte ediliyor. |
| Route guard'ları dönüş değeri kontrol edilmeden çağrılıyor | **Yok.** 11/11 `const guard = …; if (guard) return guard;` ve authz testi dizini enumerate ediyor. |
| `purge_telemetry` bug'a bağlı grubu siler | **Hayır.** Garanti SQL'de gerçek. |
| Tarih/TZ kayması (`toISOString().slice(0,10)` deseni) | **Yok.** |

---

## Eylem sırası

1. **Şimdi:** `supabase/migrations/110_fix_definer_rpc_grants.sql` → Studio'dan uygula, sonundaki
   doğrulama sorgusunu çalıştır (hepsi `false` dönmeli). **K1 canlı.**
2. **Deploy öncesi:** Y2 (Sentry `register()`), Y1 (endpoint redaksiyonu), Y3 (4xx/5xx), Y4 (null vs 0).
3. **Panel güvenilirliği:** K2 (28 route), Y5 (RUM bütünlüğü), Y6 (filtreler), Y7 (environment).
4. **Gate sertleştirme:** SQL-lint'e rol-hedefli REVOKE kontrolü — bu sınıfın bir daha kaçmaması için.

---

# Kapanış tablosu (2026-08-30)

| # | Bulgu | Durum | Nerede |
|---|---|---|---|
| **K1** | DEFINER RPC'leri anon'a açık (5 fonksiyon) | ✅ `mig.110` (APPLY bekliyor) + gate | `110_fix_definer_rpc_grants.sql` · `gate/sql-migration-lint` yeni rol-hedefli REVOKE iddiası |
| **K2** | `onRequestError` 28 route'a ulaşmıyor | ✅ 28 route çevrildi + gate | `handleApiError(err, label, { clientMessage })` · `gate/route-error-coverage.test.ts` (baseline BOŞ) |
| **Y1** | Ham URL (query string) redaksiyonsuz `endpoint`'e | ✅ | `record.ts` `safeEndpoint()` — `normalizeEndpoint` ∨ `?`-kes + redaksiyon |
| **Y2** | Sunucu/edge Sentry hiç başlamıyor | ✅ | `instrumentation.ts` `register()` (NEXT_RUNTIME'a göre kök config'leri yükler); test iddiası çevrildi |
| **Y3** | Sağlık oranı 4xx sayıyor | ✅ | `PerformanceSummary.totalServerErrors`; sağlık YALNIZ 5xx · 4xx ayrı kart |
| **Y4** | Başarısız sonda "ölçülmüş sıfır" | ✅ | `safe(…, null)`; metrikler `number \| null`; `computeOverallHealth` `telemetryReadable` → asla healthy |
| **Y5** | RUM ingest bütünlük/kota yok | ✅ | `known-endpoints.ts` allowlist + senkron gate · `POLICIES.RUM` · `errorRateCorroborated` çapraz doğrulama |
| **Y6** | Log filtreleri fetch sonrası, sayfalama duruyor | ✅ | Filtreler her kaynağın SORGUSUNA indi; `dbListSystemEvents` (ölü koddu) devreye girdi |
| **Y7** | Hata grupları ortamları karıştırıyor | ✅ `mig.111` | `unique (fingerprint, environment)` + RPC on-conflict + okuma tarafı ortam filtresi |
| **O1** | Yüzdelik taşma kovasında ALT sınır | ✅ | `percentileFromHistogram` → `{ ms, overflow }`; UI "> 12,8 sn"; sıralama `maxMs`'e düşüyor |
| **O2** | Cursor tie-breaker yok, kolon hareketli | ✅ | Bileşik imleç `<snapshot>\|<ts>\|<id>` + `lte(snapshot)` + ikincil `order by id` |
| **O3** | Ciddiyet grubun (monoton) seviyesinden | ✅ `mig.111` | `system_error_events.severity` kolonu; pencere istatistiği olayın kendi seviyesini sayıyor |
| **O4** | `openIncidents` hiç kullanılmıyor | ✅ | "Bakım / Arıza" servis satırı |
| **O5** | İki sonda `safe()` dışında | ✅ | `dbBackgroundJobHealth` / `dbExternalServiceHealth` sarıldı |
| **O6** | `requestId` `onRequestError` yolunda doğrulanmıyor | ✅ | `isValidRequestId` iki yolun geçtiği TEK noktada |
| **O7** | Feed kaynakları hatayı sessizce yutuyor | ✅ | `{ entries, failed }` → `unavailableSources` + Kayıtlar/Genel Bakış uyarı şeridi |
| **D1** | Sessiz `.limit()` kırpması kesin sayı gibi | ✅ | `limit + 1` + `truncated` → `truncatedMetrics` + "≥" uyarısı |
| **D2** | `avgMs`/`errorRate` 0 vs null tutarsızlığı | ✅ | İkisi de `count === 0`'da `null`; UI "—" |
| **D3** | Histogram NULL elemanı satırı kalıcı bozar | ✅ `mig.111` | `coalesce(...)` + `jsonb_array_length = 10` ön kontrolü (`raise exception`) |
| **D4** | `open` gruplar hiç silinmiyor | ✅ `mig.111` | purge'e 180 günlük kol (olayı/bug bağı olmayan) |
| **D5** | `pagehide` dinleyicisi birikiyor | ✅ | Referans saklanıp cleanup'ta kaldırılıyor; `resetRumCollector` `fetch`'i geri yüklüyor |
| **D6** | `bugs/[id]` bağ işlemi varlık kontrolünden önce | ✅ | `dbGetBug` → 404 önce |
| **D7** | proxy matcher noktalı her yolu muaf tutuyor | ✅ | Muafiyet uzantı-son-eki allowlist'ine indi (`public/` yalnız `.svg`) |
| **D8** | ~~Retention cron 109 uygulanmadan kırar~~ | — | Düştü: 109 uygulandı |
| **Nit 1** | Redaksiyonda PII alan adları yok | ✅ | `phone/telefon/adres/tax_number/vkn/tckn` + biçimli telefon + IBAN kalıpları |
| **Nit 2** | `logs` `userId` uuid doğrulaması yok | ✅ | `isUuid` kapısı (400 yerine 500 üretmiyor) |
| **Nit 3** | `request_metrics` status sayaçlarında CHECK yok | ✅ `mig.111` | `check (status_2xx >= 0 …)` |
| **Nit 4** | `X-RateLimit-Reset` yalnız 429'da | ✅ | `withRateHeaders` her yolda basıyor |
| **Nit 5** | Yorum-kod sapmaları | ✅ | Parmak izi "64 bit" iddiası GERÇEKTEN düzeltildi (`mix32` finalizer; bit0 eşitlik oranı 1.0 → 0.498, 200k girdide 0 çakışma) · `topStackFrame` fazladan `)` eklemiyor · eşik yorumları `>=` · `rum/route.ts` "tanınmayan path" yorumu · "yavaş istek" olayı belgesi · ölü `dbListSystemEvents` devreye girdi |

## Yan bulgu — test altyapısında latent kusur

`code()` yorum-ayıklayıcısı **11 test dosyasında** kopyalanmıştı ve blok yorumları
satır yorumlarından ÖNCE ayıklıyordu. `proxy.ts`'teki `// /dashboard/** erişimi`
satırı içindeki `/*`, blok yorum başlangıcı sanılıyordu; o noktadan sonra dosyada
bir `*/` bulunduğu anda **aradaki GERÇEK KOD siliniyor** ve kaynak-kilidi testleri
sessizce yanlış şeyi doğruluyordu. (Bu tur `proxy.ts`'e yeni bir JSDoc eklenince
ortaya çıktı: `developer-console-authz` internalOperator kapısını göremez oldu.)
Sıra 11 dosyada da düzeltildi: **önce satır yorumları, sonra bloklar.**

## Kalan iş (kullanıcı tarafı)

1. **`migration 110`** — Studio'dan uygula, sonundaki `has_function_privilege` sorgusunu koştur (beşi de `false` dönmeli). **K1 canlı.**
2. **`migration 111`** — Studio'dan uygula; `npx tsx scripts/check-migrations.ts` yeşile döner.
3. **`INTERNAL_OPERATOR_EMAILS`** set edilmeden panele girilemez (bilinçli fail-closed).
4. **Tarayıcı turu** — özellikle **D7**: matcher muafiyeti daraldı, statik varlıkların (`/icon.svg`, `favicon.ico`) hâlâ servis edildiğini ve giriş akışının bozulmadığını gözle doğrulayın.
