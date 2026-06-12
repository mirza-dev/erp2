# Güvenlik & Doğruluk Denetimi — Bulgular (2026-06)

> Kapsam: tüm API yüzeyi (114 route / 323 metod), 92 migration, servis katmanı,
> lib/ semantiği (para/KDV/tarih), frontend veri bütünlüğü, cron/e-posta/PDF/
> entegrasyon, bağımlılıklar. Yöntem: 6 paralel keşif taraması + her Kritik/Yüksek
> bulgunun kaynak koddan elle doğrulanması. **Bu turda ürün kodu DEĞİŞTİRİLMEDİ** —
> rapor + bekçi (gate) testleri eklendi (bkz. son bölüm).

---

## 0. Dış rapor karnesi (iddia ↔ doğrulama)

Kullanıcının paylaştığı dış denetim raporundaki her iddia kodda doğrulandı:

| Dış iddia | Karar | Kanıt |
|---|---|---|
| Güvenlik proxy katmanına aşırı bağımlı | ✅ DOĞRU | `src/proxy.ts` session+demo+CRON+page-RBAC'ı tutuyor; route-permission haritası yok; 25/64 GET guard'sız (proxy geçen herkese açık) |
| `requirePermission` oturumsuzda viewer'a düşer | ✅ DOĞRU | `role-guard.ts:26` `if (!user) return ["viewer"]`; `resolveAuthContext` aynı fallback |
| DB helper'ları service-role ile RLS bypass | ✅ DOĞRU (tasarım) | `service.ts` 400+ kullanım; RLS yalnız PostgREST-doğrudan-erişime karşı savunma |
| Birçok GET `view_*` kontrolsüz | ✅ DOĞRU | audit-log/production/inventory-movements/alerts vb. — detay §2-Y1 |
| Audit endpoint tam before/after_state + silinen müşteri PII | ✅ DOĞRU | K1 |
| Demo anon kullanıcı signed URL alabilir (env opt-in) | ✅ DOĞRU | `ATTACHMENTS_BLOCK_DEMO_ANON` default kapalı — O11 |
| AI uçları yalnız IP rate-limit; stock-risk DB mutasyonu | ✅ DOĞRU | Y2 |
| Sipariş/teklif toplamları istemciden sahte oluşturulabilir | ✅ DOĞRU | K2 — `quantity=100, unit_price=100, line_total=1` kabul edilir |
| Teklif önce sent, rezervasyon best-effort | ✅ DOĞRU | K4 |
| Reject/expire release best-effort → phantom rezervasyon | ✅ DOĞRU | Y3 |
| **İptal edilen quote-order yeniden oluşturulamaz** | ✅ DOĞRU (düzeltme: ilk değerlendirmemiz yanlıştı) | 037 unique index cancelled satırları DA kapsıyordu; 088'in idempotency'si cancelled'ı dışladığından yeni INSERT aynı quote_id ile 23505'e çarpar → teklif bir daha gönderilemezdi. **mig.094 ile kapatıldı** (index cancelled'ı dışlar). Eşzamanlılık zaten quote FOR UPDATE ile serialize |
| xlsx 0.18.5 savunmasız | ✅ DOĞRU | Y5 — `npm audit`: prototype pollution + ReDoS, fix yok |
| 019 advisory-lock RPC'leri REVOKE/search_path'siz | ✅ DOĞRU | Y7 — 039/054/071/088 doğru kalıbı kullanıyor, 019+016 outlier |
| 088, 080'in description + 078'in qty-guard'ını düşürüyor | ✅ DOĞRU | Y4 — send path'te ikisi de yok |
| **Sipariş redaction discount_amount maskelemiyor (açık)** | ⚠️ KISMEN | `redact.ts:68-83` orders'ta discount maskelenmiyor ama subtotal/grand_total null → mutlak iskonto tek başına düşük sızıntı. Quotes maskeliyor → asimetri var (O7), "Yüksek" değil |
| Migration drift (088/089/090 bekliyor) | ⚠️ KISMEN (drift gerçek, liste bayat) | K5 — canlı probe: 088/090/091/092 UYGULANMIŞ; yalnız 089 belirsiz. Asıl bulgu: drift'i izleyen mekanizma yoktu (dokümantasyon da yanılıyordu) |

Ek olarak bu denetimde dış raporun **görmediği** bulgular çıktı (K3 import-KDV, Y6 UTC tarih, Y8 e-posta/alert sessizliği, O1-O10).

---

## 1. KRİTİK

### K1 — `/api/audit-log` guard'sız ve tam `before_state`/`after_state` döndürüyor (PII)
- **Kanıt:** `src/app/api/audit-log/route.ts:6-24` — hiçbir guard yok; `dbListAuditLog` `before_state,after_state` dahil seçiyor. `src/lib/supabase/customers.ts` müşteri silmede tam satırı (`email`, `tax_number`, `address`, `phone`) `before_state`'e yazıyor.
- **Etki:** Proxy'i geçen HERHANGİ bir oturum (viewer dahil, demo GET dahil) silinmiş müşterilerin tüm PII'sini ve tüm entity'lerin önce/sonra hallerini (fiyatlar dahil) okuyabilir. RBAC redaction'ın tamamını baypas eden bir yan kapı.
- **Düzeltme:** `requirePermission("view_audit_log")` (veya admin); `before_state`/`after_state`'i RBAC'a göre redact et veya listede hiç döndürme (detayda yetkiyle).
- **Efor:** Küçük (1 route + test).

### K2 — Finansal toplamlar istemciden geliyor; sunucu tutarlılığı DOĞRULAMIYOR
- **Kanıt:**
  - Order create: `order-service.ts:87-110 validateOrderCreate` yalnız sınır kontrolleri (`grand_total > 0`, `quantity > 0`); `023_quote_valid_until.sql:68-71` RPC `p_header->>'subtotal'/'vat_total'/'grand_total'` ve `line_total`'ı OLDUĞU GİBİ insert eder.
  - Order edit: `081_order_update_lines.sql:78-83` header'ı SUM(line_total)'dan hesaplar AMA `line_total` istemciden gelir (satır 72), `quantity × unit_price × (1-disc)` doğrulanmaz.
  - Quote create/update: `071_quotes_rpc_discount.sql:53-56,92,132-135` aynı kalıp; route yalnız `discount ≤ subtotal` doğrular.
- **Etki:** `manage_sales_orders`/`manage_quotes` yetkili herhangi bir kullanıcı (veya XSS/CSRF üzerinden onun oturumu) `quantity=100, unit_price=100, line_total=1, grand_total=1` gönderebilir → muhasebe/Paraşüt/rapor zinciri bozuk veri üzerine çalışır. UI doğru hesaplıyor; bu sınır API'den doğrudan istek için geçerli.
- **Düzeltme:** Tek noktada (RPC içinde) `line_total := round(quantity*unit_price*(1-discount_pct/100), 2)` yeniden hesapla + header'ı satırlardan türet; API'den gelen toplamları yalnız tolerans karşılaştırması için kullan. Migration + route testleri.
- **Efor:** Orta (3 RPC + testler; davranış değişikliği yok — dürüst istemci aynı sonucu alır).

### K3 — Import sipariş satırı yolunda KDV: iskonto YOK + oran %20 HARDCODE
- **Kanıt:** `src/lib/services/import-service.ts:771-776` —
  `subtotal = Σ line_total; vatTotal = subtotal * 0.20; grand_total = subtotal + vatTotal`.
  Siparişin kendi `vat_rate`'i ve `discount_amount`'ı tamamen yok sayılır; `item_count` de satır sayısıyla ezilir.
- **Etki:** Excel'den sipariş satırı import edilen her sipariş: %10/%1 KDV'li veya iskontolu siparişlerde toplamlar fiilen YANLIŞ yazılır; Paraşüt reconcile guard'ı bu siparişleri reddeder (fatura kesilemez).
- **Düzeltme:** Mevcut order'ın `vat_rate`/`discount_amount`'ını okuyup `vat = (subtotal - discount) * vat_rate/100` uygula (K2 çözülürse bu yol da RPC'den geçmeli).
- **Efor:** Küçük.

### K4 — Teklif gönder: status ÖNCE, rezervasyon SONRA (best-effort), reconciler YOK
- **Kanıt:** `quote-service.ts:90` status→sent; `:113-124` `dbSendQuoteCreatePendingOrder` try/catch ile yalnız `reservationWarning`. "sent ama bağlı pending order yok" durumunu tarayan hiçbir cron/reconciler yok.
- **Etki:** Rezervasyon RPC'si başarısız olursa teklif "gönderildi" görünür, stok ayrılmamıştır → oversell. Aynı kalıp tersine: phantom rezervasyon (Y3).
- **Düzeltme:** İdeal: status flip + order create tek RPC (088 zaten RPC — status güncellemesini içine al). Pratik ara adım: alert-scan'e "sent & linked-order-yok" reconciler ekle.
- **Efor:** Orta.

### K5 — Migration drift: izlenemiyor; startup/deploy kontrolü YOK (dokümantasyon da bayatlamış)
- **Kanıt:** Migration'lar Studio'dan elle uygulandığı için `schema_migrations` kaydı düşmüyor → `supabase migration list` 082+ için boş (yanıltıcı). CLAUDE.md/bellek "088/091 APPLY BEKLİYOR" diyordu; bu turda yazılan canlı probe **088/091/092'nin UYGULANMIŞ olduğunu** gösterdi — yani drift iki yönlü: şema da, dokümantasyon da güvenilir biçimde izlenmiyordu. Tek belirsiz kalan: 089 (`po_overdue` CHECK — OpenAPI'den problanamaz, elle SQL doğrulaması raporda).
- **Etki:** "Hangi migration canlıda?" sorusunun güvenilir yanıtı yoktu; özellikler sessizce kırık sanılıyor ya da kırıkken sağlam sanılıyor (089 yolu hatayı yutuyor).
- **Düzeltme:** Bu turda eklendi → `scripts/check-migrations.ts`: PostgREST OpenAPI spec'inden (tek read-only GET) tablo/kolon/RPC varlığını problar; eksikte exit 1. İlk koşu canlıyla hizayı doğruladı. Kalıcı: deploy-öncesi adım + yeni migration'da PROBES kaydı zorunluluğu.
- **Efor:** Script hazır; 089 elle doğrulama kullanıcı aksiyonu.

---

## 2. YÜKSEK

### Y1 — Guard'sız GET yüzeyi geniş; auth tek hatta (proxy) + viewer fallback
- **Kanıt:** 64 GET'in 25'i route içinde guard çağırmıyor (envanter: `src/__tests__/gate/route-guard-baseline.ts`). `role-guard.ts:26` oturumsuz→viewer. Proxy yalnız session varlığına bakar; route-permission haritası yok. Next 16.1.7 middleware-bypass advisory geçmişi düşünülürse route-içi guard TEK savunma değil İLK savunma olmalı.
- **Etki:** Proxy bypass durumunda guard'sız route'lar anonim erişilir; bugün bile her rol (viewer/production) operasyonel listelerin tamamını okur (`/api/production`, `/api/inventory/movements`, `/api/alerts/calendar`, `/api/orders/open-count-by-product`...). Çoğu operasyonel/zararsız sınıfta ama K1 gibi istisnalar bu modelin ürünü.
- **Düzeltme:** Bu turda eklendi → route-guard matris testi: guard'sız her (route, metod) çifti gerekçeli baseline'da olmak ZORUNDA; yeni guard'sız route CI'da kırılır. Sonraki tur: baseline'daki AÇIK-BULGU kayıtlarını tek tek guard'la kapat.
- **Efor:** Gate hazır; kapatma turu Orta.

### Y2 — `/api/ai/stock-risk` permission'sız DB mutasyonu
- **Kanıt:** Route'ta yalnız `guardAiRoute` (IP rate-limit); `dbExpireStaleRecommendations` / `dbUpsertRecommendation` / `dbExpireSuggestedRecommendations` çağrılır.
- **Etki:** Herhangi bir oturum (viewer) öneri tablosunu yeniden yazdırabilir + Anthropic maliyeti üretir. Veri sınıfı operasyonel ama mutasyon yetkisiz.
- **Düzeltme:** `requirePermission("view_products")` (okuma tetikleyici) veya purchase rolleri; rate-limit kalsın.
- **Efor:** Küçük.

### Y3 — Reject/expire/revise: rezervasyon bırakma best-effort → kalıcı phantom rezervasyon
- **Kanıt:** `quote-service.ts:129-135` `dbCancelQuoteLinkedOrder` try/catch + yalnız `console.error`. Başarısızlıkta teklif rejected, bağlı pending order + rezervasyon yaşamaya devam eder; tekrar deneme mekanizması yok.
- **Etki:** Stok kalıcı kilitli kalabilir (available_now düşük görünür → yanlış satınalma sinyalleri).
- **Düzeltme:** K4 ile aynı reconciler: "terminal-status teklif & aktif linked order" taraması cancel etsin.
- **Efor:** Orta (K4 ile birlikte tek iş).

### Y4 — 088 önceki davranışları sessizce düşürdü (redefinition regresyonu)
- **Kanıt:** `send_quote_and_create_pending_order` (088:119-130) order_lines INSERT'inde `qli.description` YOK (080:93-103 accept yolunda var → satır açıklamaları send-yolunda kaybolur); 088:84-89 qty pre-check yalnız `<> trunc` — 078'in `<= 0` kontrolü yok (DB CHECK yine yakalar ama ham hata kullanıcıya çıkar).
- **Etki:** Veri kaybı (description) + kaba hata mesajı (qty=0).
- **Düzeltme:** 093 düzeltme migration'ı: INSERT'e `description` ekle + `<= 0 OR <> trunc` pre-check. 088 henüz uygulanmadıysa 088'i yerinde düzeltmek de meşru.
- **Efor:** Küçük (1 migration). **Not:** Gate'in fonksiyon-redefinition envanteri bu sınıf hatayı bundan sonra görünür kılar.

### Y5 — `xlsx@0.18.5`: prototype pollution + ReDoS, npm'de düzeltme yok
- **Kanıt:** `npm audit` → GHSA-4r6h-8v6p-xvw6 (prototype pollution), GHSA-5pgg-2g8v-p4x9 (ReDoS). Kullanıcı dosyası server-side parse: `import/classify` (extractExcelTextSample), `import/documents/[id]/extract`; ayrıca yazma yönü (report/templates — risksiz).
- **Etki:** Yetkili bir kullanıcının yüklediği zararlı .xlsx parse sırasında prototype pollution / event-loop blokajı (DoS) tetikleyebilir.
- **Düzeltme seçenekleri:** (a) SheetJS'in CDN dağıtımındaki güncel sürüme geç (npm'de yok, `https://cdn.sheetjs.com` tarball dependency), (b) `exceljs`'e geçiş, (c) parse'ı timeout'lu izole işçiye al. Geçici: dosya boyu limiti zaten var; parse çağrılarına süre sınırı eklenebilir.
- **Efor:** Orta (b en temiz, dokunan 5 dosya).

### Y6 — UTC tarih dilimleme: gün sınırı Türkiye'de 3 saat kayıyor (13 nokta)
- **Kanıt:** `new Date().toISOString().slice(0, 10)` — `order-service.ts:95,141,363`, `orders.ts:331,492-493`, `quote-service.ts:377`, `purchase-orders.ts:349`, `parasut-service.ts:546,703,967` vb. İstanbul 00:00–03:00 arası "bugün" UTC'de DÜN'dür. Doğru kalıp repo'da zaten var: `stock-utils.ts:289 localISODate()` ("UTC-midnight drift" yorumuyla).
- **Etki:** Teklif/PO vadesi gece penceresinde 1 gün geç dolar; vadesi dün biten teklif 00:00–03:00 arasında hâlâ accept edilebilir (`quote-service.ts:377`); Paraşüt fatura `issue_date` gece kesiminde dünün tarihini alır.
- **Düzeltme:** 13 çağrıyı `localISODate()` ile değiştir (mekanik); vade karşılaştıran 3 noktaya saat-mock'lu test.
- **Efor:** Küçük-Orta.

### Y7 — 019 advisory-lock RPC'leri: SECURITY DEFINER, REVOKE/`SET search_path` yok + session-level lock
- **Kanıt:** `019_concurrency_hardening.sql` 4 fonksiyon (`try_acquire_scan_lock` vb.) — authenticated herkes EXECUTE edebilir; `pg_try_advisory_lock` session-level → PgBouncer havuzunda lock bağlantıya yapışır. Karşı-örnek: 039/054/071/088 tam hijyenli (REVOKE+GRANT service_role+search_path).
- **Etki:** Yetkili herhangi bir kullanıcı scan/AI-suggest kilidini tutup taramaları engelleyebilir; havuzda kilit sızıntısı.
- **Düzeltme:** 019b migration: 4 fonksiyona `SET search_path = public` + REVOKE/GRANT; mümkünse `pg_try_advisory_xact_lock`'a geçiş. **Gate:** SQL lint testi bundan sonra DEFINER+hijyensiz yeni fonksiyonu kırar (019/016 grandfathered).
- **Efor:** Küçük.

### Y8 — Kritik-stok e-postası fire-and-forget; başarısızlık + 24h dedup = sessiz kayıp
- **Kanıt:** `alert-service.ts:149-160` e-posta `.catch(console.error)`; alert dedup penceresi aynı entity için yeniden alert üretmez → e-posta altyapısı düşükken kritik stok bildirimi 24 saate kadar hiç ulaşmaz, UI "alert oluşturuldu" der. `email/retry-failed` cron'u yalnız `failed` LOG'ları dener — log oluşmadan atılan exception'lar kapsam dışı.
- **Etki:** Operasyonel görünürlük kaybı; kritik stok aksiyonu gecikir.
- **Düzeltme:** E-posta denemesini log-first yap (önce pending log, sonra send — kısmen var), alert metadata'ya `notify_failed` işaretle ve retry cron kapsamına al.
- **Efor:** Orta.

---

## 3. ORTA

| # | Bulgu | Kanıt | Etki/Not |
|---|---|---|---|
| O1 | Ship: stok düştü ama `shipped_at` yazımı başarısızsa caller'a `success:false` döner | `order-service.ts:305-340` | Çift düşüm YOK (RPC guard) ve hata yutulmuyor; ama UI "başarısız" derken stok hareket etmiş olur — retry UX'i yanıltıcı. Patch'i RPC'ye taşı |
| O2 | Import apply: post-commit status yazımı başarısızsa doküman `applying`'de kilitli kalır | `import-apply-service.ts:632-646` | Ürünler oluşmuş, claim yeniden-deneme reddediyor → manuel DB müdahalesi gerekir. Status'u erken yaz veya recovery yolu ekle |
| O3 | Paraşüt iskonto reconcile float aritmetiği + satır-başına büyüyen tolerans | `parasut-service.ts:1040-1047` | `Math.round` half-away vs Postgres half-up; 20 satırda tolerans 0.21 TRY — hem yanlış-red hem yanlış-kabul payı. Cent-bazlı tamsayı hesap |
| O4 | Paraşüt hata mesajları redaksiyonsuz `integration_sync_logs`'a + `/api/parasut/logs`'tan görünür | `sync-log.ts:28` | API hatası müşteri adı/VKN içerebilir; `view_parasut` rolüne sızar. Kod+kırpılmış mesaj sakla |
| O5 | Rate-limit IP'si `x-forwarded-for[0]` + in-memory instance-başına state | `request-ip.ts:15-20`, `ai-route-limit.ts` | Proxy zincir konfigürasyonuna bağlı spoof; çoklu instance'da limit etkisiz. Redis-backed sayaç |
| O6 | Sentry `beforeSend` PII scrubbing yok | `sentry.*.config.ts` | Exception context'inde müşteri verisi yakalanabilir (örnekleme %10 — sınırlı). Scrub hook ekle |
| O7 | Redaction asimetrisi: quotes `discountAmount` maskeli, orders `discount_amount`/`discount_pct` açık | `redact.ts:68-83 vs 103-119` | Subtotal null'ken mutlak iskonto düşük sinyal; yine de sınıflandırma kararı netleştirilip simetrik yapılmalı |
| O8 | OAuth state HMAC anahtarı `CRON_SECRET ?? ""` — unset'te boş-anahtar HMAC | `parasut/oauth/callback/route.ts:21` | Gerçek auth code yine gerekir → istismar zor; ama fail-open kalıbı yanlış. Startup'ta zorunlu kıl veya ayrı secret |
| O9 | `quotes/[id]/convert` POST guard'sız görünür durumda | route dosyası | Bellek/V7 kayıtlarına göre 410-gone ölü uç; yine de 410 + guard ile mühürle veya sil |
| O10 | SWR mutasyon success-handler'ı throw ederse cache invalidation yok | `data-context.tsx` addOrder vb. | DB'de var/cache'te yok geçici tutarsızlık; sayfa yenilemesi düzeltir. Hata yolunda `mutate(KEY)` |
| O11 | `ATTACHMENTS_BLOCK_DEMO_ANON` default KAPALI (opt-in koruma) | `attachments/[attachmentId]/url/route.ts:13-19`, `proxy.ts:175` | Demo anon kullanıcı özel ürün dosyalarına signed URL alabilir. Default'u tersine çevir (opt-out) |

## 4. DÜŞÜK

- **D1** Yuvarlama konvansiyonu dağınık: `Math.round(x*100)/100` / `*1000` (QuoteForm 3 ondalık) / yuvarlamasız akümülasyon (`OrderForm`, `import-service:728`) — kuruş düzeyi tutarsızlıklar; tek `roundMoney()` helper'ı.
- **D2** QuoteForm iskonto clamp'i sessiz (150 girilir, 100 uygulanır, uyarı yok) — inline uyarı.
- **D3** Eşzamanlı çift teklif-send: 088 idempotency SELECT'i kilitsiz → yarışta 23505 ham hatası (kullanıcıya kaba mesaj; veri bozulmaz).
- **D4** `check-shipments`/diğer CRON route'ları yalnız proxy'deki CRON_SECRET'a güveniyor (route-içi doğrulama yok) — derinlemesine savunma için route-içi kontrol; karşılaştırma timing-safe değil (env secret, kısa string — düşük).
- **D5** PO receive UI: negatif girilen qty sessizce filtreleniyor (kullanıcı geri bildirimi yok; sunucu zaten reddeder).
- **D6** E-posta dedup hatasında bilinçli "yine de gönder" (yorumla belgeli) → nadir çift e-posta; kabul edilmiş takas, izlenebilir.

## 5. Elenen yanlış-pozitifler (rapor güvenilirliği için)

| İddia | Neden yanlış |
|---|---|
| PO receive: qty > kalan sunucuda kabul edilir | Route rol-guard + pozitif tamsayı doğrulaması; RPC `051:48` aşırı kabulde RAISE → plpgsql tek transaction, kısmi yazım imkânsız |
| PO receive çift artırım "on_hand bozulur" | Aynı nedenle imkânsız (RAISE tüm fonksiyonu geri alır) |
| QuoteForm Türkçe virgül `parseFloat("1.234,56")=1.234` | Fiyat/adet input'ları `type="number"` — tarayıcı virgüllü değeri value olarak vermez |
| E-posta dedup hatasında "skipped sayılıp yine gönderiliyor" | Hata yolunda `skipped` artmaz; bilinçli gönderime-devam, yorumla belgeli |
| ~~İptal edilen quote-order yeniden oluşturulamaz~~ | **GERİ ALINDI — iddia DOĞRUYMUŞ:** ajan "idempotency INSERT'i önler" demişti ama kontrol cancelled'ı dışlıyor → INSERT 037 index'ine çarpar. mig.094 düzeltti. (D3 "eşzamanlılık yarışı" diye yazdığımız da yanlıştı: FOR UPDATE serialize ediyor) |
| `accept_quote` 077↔088 uyumsuz | 088 tek migration içinde tutarlı; risk yalnız kısmi apply (K5 drift kontrolü kapsar) |

## 6. Önceliklendirilmiş yol haritası

1. **Tur A (hızlı, yüksek getiri):** K1 audit-log guard+redaction · Y2 stock-risk guard · K3 import KDV · O9 convert mühürleme · O11 default flip — hepsi küçük, tek tur.
2. **Tur B (finansal bütünlük):** K2 RPC'lerde recompute (023/081/071 halefi tek migration ailesi) + D1 `roundMoney()`.
3. **Tur C (rezervasyon yaşam döngüsü):** K4+Y3 reconciler (alert-scan'e ek) + Y4 (093 düzeltme migration) + 089'un elle doğrulanması/apply'ı (K5 — kalan tek belirsiz).
4. **Tur D (platform):** Y5 xlsx değişimi · Y6 localISODate geçişi · Y7 019b migration · Next güvenlik sürümü takibi.
5. **Tur E (operasyonel):** Y8 bildirim dayanıklılığı · O2/O3/O4/O5.

## 7. Kurulan Gate sistemi (bu turda eklendi)

| Bileşen | Dosya | Ne yakalar |
|---|---|---|
| Route-guard matrisi | `src/__tests__/gate/route-guard-matrix.test.ts` + `route-guard-baseline.ts` | Guard'sız YENİ route/metod CI'da kırılır; mevcut 25+ guard'sız uç gerekçeli baseline'da (sınıf: bilinçli-public / AÇIK-BULGU). Baseline'dan guard kazanan kayıt da kırar → liste küçülmeye zorlanır |
| SQL/migration lint | `src/__tests__/gate/sql-migration-lint.test.ts` + `sql-lint-baseline.ts` | Yeni SECURITY DEFINER fonksiyonu `SET search_path` + REVOKE/GRANT'sız ise kırılır (019/016 grandfathered); mevcut fonksiyonun yeni migration'da redefine edilmesi baseline kaydı ister → 088-tipi sessiz regresyon görünür olur |
| Bağımlılık gate'i | `scripts/check-deps.mjs` + `test.yml` job | `npm audit` high+ yeni açık → CI kırmızı; xlsx 2 GHSA gerekçeli allowlist'te |
| Migration drift | `scripts/check-migrations.ts` | PostgREST OpenAPI spec'inden (read-only tek GET) migration nesnelerini (tablo/kolon/RPC) problar; eksikte exit 1. İlk koşu: 088/090/091/092 canlıda ✅, yalnız 089 elle doğrulama gerektiriyor (deploy-öncesi koşulur; kullanım: runbook) |

---

## 8. Düzeltme durumu (2026-06-13 — Tur A–E uygulandı)

| Bulgu | Durum | Nerede |
|---|---|---|
| K1 audit-log | ✅ kod | oturum + entity-bazlı yetki (`audit-log/route.ts`) |
| K2 finansal toplamlar | ⏳ **mig.093 APPLY bekliyor** | order RPC'leri sunucuda hesaplar; quote override + makul-sapma (%5/100) |
| K3 import KDV | ✅ kod | siparişin vat_rate+discount_amount'ı ile 081 formülü |
| K4+Y3 rezervasyon | ✅ kod | `serviceReconcileQuoteReservations` alert-scan'de (iki yön + sync_issue) |
| K5 drift | ✅ sistem | check-migrations.ts (probe) + PROBES/MANUAL kültürü |
| Y1 guard'sız GET'ler | ✅ kod (2026-06-12) | kalan 7 uç requirePermissionFor aldı — **demo-dostu varyant** (kullanıcı kararı): anonim→viewer fallback bilinçli, demo gezintisi yaşar; import uçları viewer'da izin olmadığından fiilen kapalı; baseline'da ACIK-BULGU sınıfı KALMADI (y1-route-guards testi kilitler) |
| Y2 stock-risk | ✅ kod | oturum + view_products |
| Y4 088 regresyonları | ✅ mig.094 apply edildi (2026-06-12) | description + qty<=0 + **cancelled-hariç unique index** (dış raporun haklı çıktığı bulgu); doğrulama SQL + smoke bekliyor |
| Y5 xlsx | ✅ kod | CDN 0.20.3 pin; GHSA'lar kapandı, allowlist'ten silindi |
| Y6 UTC tarih | ✅ kod | 10 nokta `localISODate`; computeDueDate bilinçli muaf |
| Y7 lock hijyeni | ✅ mig.095 apply edildi (2026-06-12) | search_path + REVOKE/GRANT (016+019); doğrulama SQL bekliyor |
| Y8 e-posta sessiz kayıp | ✅ kod | awaited + `ScanResult.emailFailed` |
| O1/O2/O3/O4/O6/O7/O8/O10/O11 | ✅ kod | Tur B/D/E commit'leri |
| D1/D2/D4/D5 | ✅ kod | roundMoney / clamp uyarısı / requireCronSecret / receive toast |
| D3 eşzamanlı send | ✅ kapalı sayıldı | FOR UPDATE zaten serialize ediyordu (ilk değerlendirme hatalıydı); 094 index'i kalan durumu çözer |
| Next 16.x yükseltme | ✅ kod (2026-06-12) | 16.1.7 → 16.2.9 + fast-uri 3.1.2; 14 next advisory + 2 fast-uri GHSA kapandı; **deps-gate allowlist BOŞ** — yeni advisory'ler yeniden yakalanır |
| O5 rate-limit Redis | 📋 ertelendi (kullanıcı kararı) | ayrı tur |
| O9 convert | ✅ bulgu değil | saf 410 tombstone — baseline'da `public` sınıfı |

**Kullanıcı aksiyonu:** ~~Studio'da sırayla 093 → 094 → 095 apply~~ ✅ apply edildi
(2026-06-12). Kalan: birleşik doğrulama SQL'i (4 satır `true` — pg_proc/pg_indexes)
+ smoke (sipariş oluştur/düzenle [toplamlar sunucudan], teklif kaydet [override %5
içi], teklif gönder→iptal→tekrar gönder [094 index], teklif reddet [rezerv düşer]).
Next 16.2.9 sonrası ek smoke: login redirect + dashboard + bir API çağrısı.
