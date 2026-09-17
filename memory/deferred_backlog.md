---
name: deferred_backlog
description: Ertelenen büyük işler ve açık kullanıcı-tarafı ön koşullar — yeni oturumun başlangıç noktası (A/B/C/D blokları)
metadata:
  type: project
---

# Ertelenen Büyük İşler (Backlog) — yeni oturumda devam

_Son güncelleme: 2026-09-12 (D bloğu (a) kapandı; RBAC kaydı 'karar verildi'ye çekildi). Önceki: 2026-09-10 (C0 listesindeki üç bayat madde düzeltildi; ilk yazım 2026-06-17). Kullanıcı isteğiyle "sonraki tura bıraktığımız büyük işler" buraya çıkarıldı. Detaylı açık-yükümlülük + smoke listesi `CLAUDE.md` §Açık yükümlülükler'de._

## A. Ertelenmiş büyük teknik turlar (kod)
- **A1. Tam server-side pagination** — ✅ **TAMAMLANDI 6/6** (2026-06-17). orders (pilot) + quotes + purchase/orders + customers + vendors RSC + `loading.tsx` + `db*Paged`/count + `<X>Client.tsx` URL-driven (shared `useListUrlState`/`useDebouncedSearch` + `lib/list-query.orIlikeFilter`). **products** (son liste) farklı çözüldü: sayfa `"use client"` KALDI (risk/alert overlay AI/POST → RSC'ye taşınamaz) ama mega-fetch öldü → `dbListProductsPaged` (arama/çoklu-kategori/tip + **sinyal `id.in`** tam sadakat) + `GET /api/products/counts` (tüm-katalog total/kategori/kritik); sinyal sekmeleri overlay ID seti sunucuya geçer. **Kalan: yalnız manuel smoke** (kod tamamlandı).
- **A2. Rate-limit sertleştirme (denetim O5)** — ✅ **TAMAMLANDI** (2026-06-19). "Upstash" adı bayattı — M-3'te ioredis Redis-backed middleware rate-limit zaten kuruluydu. **Kullanıcı kararı: mevcut altyapıyı sertleştir, Upstash YOK.** O5'in iki gerçek açığı kapandı: (1) `request-ip.ts` spoof-direnci — X-Real-IP primary + XFF son-hop (eski soldaki/client-kontrollü değer terk edildi); (2) `ai-route-limit.ts` hibrit — async `guardAiRoute` önce paylaşımlı ioredis Redis (`aiRoutePolicy`), Redis yok/down → in-memory `checkAiRateLimit` fallback (defense-in-depth). +6 test, 5568. **Açık kullanıcı-tarafı:** prod Traefik X-Real-IP set etmeli + REDIS_URL set olmalı (AI limit paylaşımı için).
- **A3. Gate guard-matrix method-seviye tespiti** — ✅ **TAMAMLANDI** (2026-06-19; rapor `docs/audit/2026-06-19-a3-method-level-guard-gate.md`). `route-guard-matrix.test.ts` dosya-seviye→**method-seviye** (her method gövdesi ayrı + file-local guard-helper çözümü `blockAfter` [calendar-notes context] + `requireCronSecret(` pattern). `route-guard-baseline.ts` method-anahtarlı (methods=kasıtlı guard'sız; per path+method violation/stale). 135 route→26 guard'sız method sınıflandırıldı. **Yakaladığı 3 gerçek açık guard'landı:** quotes GET + quotes/[id] GET→view_quotes (İZLENEN borç kapandı), inventory/movements GET→view_products. +9 test. Gate artık gelecekteki tüm method-seviye kör noktaları yakalar.

- **A4. Developer Console — filtreler URL'ye** — ✅ **TAMAMLANDI** (2026-09-04; `docs/audit/2026-09-04-kalan-uc-madde.md`). YENİ `src/hooks/useUrlFilters.ts` (`useListUrlState`in İSTEMCİ kardeşi — liste sayfaları RSC olduğu için filtreyi sunucu okur, konsol sayfaları `"use client"`+SWR olduğu için URL'i kendileri geri okumak zorunda). **Sözleşme: parametre YOKSA varsayılan, VARSA (boş olsa bile) o değer** → Hatalar'ın varsayılanı `open` olan `status`u "Tüm durumlar"a çekmek `?status=` yazar; uydurma `all` sentinel'i gerekmedi. 5 sayfa bağlandı (Genel Bakış/Performans `range` · Hatalar 5 filtre · Kayıtlar 5 filtre [`sources` virgüllü] · Bug'lar 3 filtre); Tanılama'da filtre yok. **İmleçler URL'e YAZILMAZ** (biriken sayfa yığını filtre değil). Suspense sınırı ALTI sayfaya ayrı ayrı değil KABUĞA kondu (`developer/layout.tsx`). Metin filtreleri `useDebouncedSearch`e geçti — eskiden her tuş vuruşu yeni SWR isteğiydi.

- **A5. Developer Console mobil / dokunma hedefleri** — ✅ **KAPANDI** (2026-09-10). Sekme şeridi (6 bağlantı, ölçüm 69–98×**35.5**) `tap-44-v` aldı ve **sarmayı bıraktı** (YENİ `.tab-strip-scroll`; sarma, 44px kutuları alt satırın GÖRÜNÜR alanına sokuyordu — çözüm CSS yaması değil YERLEŞİM); `logs` "temizle"/requestId, `errors/[id]` bug başlığı, `developer` "Tümü →" (yerel `linkStyle` kopyası → ortak `.row-link`). **Kayıtlı "konsol kimseye açık değil" notu da BAYATMIŞ** — ölçümde erişilebilir çıktı. Kapı: konsol kontrolleri `touch-targets`ta **adıyla** kilitli (sayı iddiası değil).

## B. İnceleme kampanyası (`erp2-reviewer`, modül modül) — ✅ TAMAMLANDI (2026-06-19, 9 modül)
- **alerts ✅** (`docs/audit/2026-06-19-alerts-review-bulgular.md`; çok olgun K:0 Y:0 O:0 D:1; D1 GET /api/alerts/[id]→view_alerts [tam satır, UI tüketicisi yok]; `e2f8bc1`), **settings ✅ TEMİZ** (`docs/audit/2026-06-19-settings-review-bulgular.md`; K:0 Y:0 O:0 D:0 Nit:0 — kampanyanın en olgun modülü; admin/users requireAdmin+normalizeAssignedRoles+last-admin-lockout fail-closed, api-keys requireInternalOperator, company GET SAFE-whitelist, files SVG-attachment+manage_settings, user/password mevcut-şifre doğrulama; view/manage_settings yalnız admin). **9 modül kapandı → kampanya B sona erdi.**
- Tamamlanan derin incelemeler: **RFQ ✅** (`docs/audit/2026-06-17-review-bulgular.md`), **Orders ✅** (`docs/audit/2026-06-17-orders-review-bulgular.md`), **Quotes ✅** (`docs/audit/2026-06-18-quotes-review-bulgular.md`; O1 legacy expire-quotes silindi), **Paraşüt ✅** (`docs/audit/2026-06-18-parasut-review-bulgular.md`; O1 checkAuthAlertThreshold orphaned→wire), **import/AI ✅** (`docs/audit/2026-06-18-import-ai-review-bulgular.md`; O1 iki guard'sız import GET→view_import, D1 ops-summary auth; purchase-copilot/parse/score RBAC İZLENEN), **production ✅** (`docs/audit/2026-06-18-production-review-bulgular.md`; O1 reverse_production eşzamanlı çift-DELETE idempotency→mig.104 `for update`; GET by-design dashboard-tier; `2aaf14f`; **mig.104 APPLY ✅**), **customers/products ✅** (`docs/audit/2026-06-19-customers-products-review-bulgular.md`; O1 customers GET→view_customers [PII cross-role], D1 products/[id]/quotes GET→view_products [teklif pipeline], Nit PATCH customers revalidateTag; `ab635ff`), **alerts ✅** (`docs/audit/2026-06-19-alerts-review-bulgular.md`; çok olgun K:0 Y:0 O:0 D:1; D1 GET /api/alerts/[id]→view_alerts [tam satır AI gerekçe+user_note, UI tüketicisi yok]; migration YOK; PUSH BEKLİYOR).
- **Sonradan eklenen denetimler:** **inventory ✅** (`docs/audit/2026-06-19-inventory-review-bulgular.md`; D-O1 recount_stock mig 105 + D2 ölü helper temizliği; `4179fd8`), **purchase ✅** (`docs/audit/2026-06-19-purchase-review-bulgular.md`; O1 actor/created_by sunucu-otoriter 8 route; `4d70b65`), **vendors ✅** (`docs/audit/2026-06-19-vendors-review-bulgular.md`; D1 create/update audit actor; `dcfd0ff`).
- **✅ MODÜL DENETİM KAMPANYASI TAMAMLANDI** — denetlenmemiş modül KALMADI. Tüm modüller (RFQ/orders/quotes/paraşüt/import-AI/production/customers-products/alerts/settings/inventory/purchase/vendors) derin tarandı.
- **İzlenen RBAC borçları:** ~~GET /api/quotes(+[id]) view_quotes~~ ✅ A3'te kapandı. **KARAR VERİLDİ — açık borç DEĞİL** (purchase-copilot POST + ai/parse + ai/score izin seviyesinde açık; oturum-only, demo/anon bloklu). **2026-09-10 DÜZELTME — bu kaydın SONUCU doğru, GEREKÇESİ yanlıştı.** Eski gerekçe "gate bunları guarded sayar (guardAiRoute)" diyordu; `guardAiRoute` okundu: gövdesi **yalnız IP + sayaç, sıfır kimlik/yetki** — yani gate bir **hız sınırlayıcıyı** yetkilendirme sayıyor. Uçların güvenliği gate'ten değil **proxy'nin oturum kontrolünden** geliyor (`purchase-copilot` ALWAYS_PUBLIC ama kendi `checkAuth`ını taşıyor). Kesişim bugün BOŞ; tehlike gizil ve iki dosyalık → YENİ kapı kuralı `route-guard-matrix`te kilitledi. Kalan gerçek boşluk **izin seviyesinde**: `viewer` de `ai/parse` çağırabiliyor (10/dk). **Kullanıcı kararı 2026-09-10: izin EKLENMEDİ** — `view_import` yalnız admin+satınalmada, izin koymak sihirbazı başka bir rol için sessizce kesebilir ve yerelde doğrulanamaz. **2026-09-12 yeniden ölçüm — kayıt hâlâ doğru, iki ayrıntı netleşti:** `purchase-copilot` ALWAYS_PUBLIC ama kendi `getUser()`+401'ini taşıyor; `ai/parse` ve `ai/score`'un uygulamada **çağıranı SIFIR** (`aiScoreOrder` zaten `orders/route.ts:112`'de sunucu tarafında doğrudan çağrılıyor). `route-guard-baseline`da **hiç `ACIK-BULGU` kaydı yok** (19 public / 4 redaction / 6 self-auth) → kapı açık bulgu bildirmiyor. **Kullanıcı kararı 2026-09-12 (tekrar): dokunulmadı** — ne izin eklendi ne uçlar silindi.
- `/erp-review <modül-yolu>` ile veya `erp2-reviewer` ajanını kapsam vererek çağır. Detay [[reference_review_agent]].

## C0. Teslim öncesi kullanıcı-tarafı (2026-08-31 ürün olgunluğu denetimi)

- **`EMAIL_FROM`** — canlıda 10 bildirim `waiting_config`'te bekliyor, 11 uyarı tipi kimseye ulaşmıyor. Tek satır env.
- **Supabase → Authentication → URL Configuration → Redirect URLs** — parola sıfırlama dönüş adresi kayıtlı olmalı; **YOKSA yeni kurtarma akışı çalışmaz** ("requested path is invalid").
- `ADMIN_EMAILS` + `NEXT_PUBLIC_APP_URL` `.env.local`'de boş.
- `/gizlilik` firma alanları (`[ticari unvan]`, `[VERBİS]`, `[irtibat]`) + hukuk danışmanı onayı. Kaynak: `docs/kvkk-veri-envanteri.md`.
- ~~**`INTERNAL_OPERATOR_EMAILS` BOŞ** → Developer Console kimseye açık değil~~ — **BU NOT BAYATTI** (2026-09-10 ölçümü): konsolun altı sayfası da erişilebilir çıktı ve dokunma turunda canlı olarak ölçüldü. Allowlist bir noktada dolduruldu; kayıt güncellenmemişti. Ön koşul maddesi DEĞİL.
- ~~**Yedek geri-yükleme provası hiç yapılmadı** (madde #11)~~ — ✅ **PROVA EDİLDİ** (2026-09-05): tek geçişte 64/64 tablo · 13/13 obje · 0 hata, 94/94 E2E yeşil; YENİ `npm run restore`. Detay [[project_backups]].
- ~~**E2E kilidi** (madde #19) — 13 spec `preflight:env` tarafından durduruluyor~~ — ✅ **AÇILDI** (2026-08-31): yerel Supabase (colima) kuruldu, kapı kod değişmeden geçti; bugün **94/94 retries=0**. Detay [[project_local_dev_db]].
- **PMT beta pilot haftası** (madde #20).

## C. Deploy / altyapı doğrulamaları (kod tek başına yetmez)
- **C1. Login brick-risk** — ✅ **AI tarafı TAMAMLANDI** (2026-06-19; rapor `docs/audit/2026-06-19-c1-login-preflight.md`). YENİ `scripts/check-auth-preflight.ts` (`npm run preflight:auth`, read-only `listUsers`+gerçek `parseRoles` → kalıcı/bootstrap admin sayar; 0 admin→exit 1 BRICK; canlı koşu 3 kalıcı admin→prod korumalı) + brick modeli + manuel checklist + kurtarma runbook. **Kalan kullanıcı-tarafı:** ADMIN_EMAILS her iki Coolify env + Supabase "signups OFF" + OAuth redirect URLs + tarayıcı smoke (doc §3). (Karar: LoginMonolith UI redesign ayrı iş, kapsam dışı.)
- **C3. Coolify / Hetzner deploy — TARİH DEĞİL, OLAY tetikli (kullanıcı kararı 2026-08-31): "Çorum'a dönünce" Coolify + özel domain kurulup deploy edilecek.** (Eski "~2026-09-07" notu BAYAT — kullanıcı 2026-08-31'de zamanlamayı olaya bağladı; o güne kadar geliştirme **yalnız localhost + telefon**, günlük komut `npm run dev:live`.) Prod `https://erp.getmedspace.com` şu an **AYAKTA DEĞİL**: DNS çözülüyor (`138.199.204.138`) ama 443 bağlantıyı reddediyor (`curl: (7)`), ağ yerelde sorunsuz → sunucu/container durmuş. Kullanıcı kararı: **şimdilik yalnız yerel geliştirme** — `npm run dev:live` (canlı DB + `-H 0.0.0.0`), masaüstünde `http://localhost:3000`, telefonda `http://<Mac IPv4>:3000` (IP `ipconfig getifaddr en0`; `allowedDevOrigins` artık makinenin kendi IPv4'lerinden türetiliyor, sabit yazılmadı). Çorum'a dönüldüğünde **o an yereldeki sürüm doğrudan canlıya alınacak**. Bunun sonuçları: (a) prod build bugünkü commit'lerin GERİSİNDE — deploy günü fark büyük olacak, migration APPLY sırası ve §D'deki 8 MANUAL SQL o gün kritik; (b) canlı-doğrulama gerektiren her iş (browser smoke, RBAC 403 turları, mig probe'ları) o güne kadar birikir; (c) `NEXT_PUBLIC_APP_URL` / `ADMIN_EMAILS` / `X-Real-IP` / `REDIS_URL` env kontrolleri (§A2, §C1) deploy gününün ön koşulu. **Deploy günü açılış hamlesi:** `npx tsx scripts/check-migrations.ts` + `npm run preflight:auth` (0 admin → BRICK).

- **C2. Paraşüt Faz 12-16** — ✅ **KOD TARAFI TAMAMLANDI (2026-08-29)**. Gerçek HTTP adapter (`21497bf`) + alış faturası/indirilecek KDV (`7adc040`, mig.107) + tahsilat geri okuma (`0ba37ef`, mig.108) + stok mutabakatı (`26333b5`) + canlı gate script'i & runbook (`1cf8ee3`). 6100 test. **Kalan tamamı kullanıcı-tarafı:** Paraşüt API başvurusu (`destek@parasut.com` — uzun teslim süreli, ŞİMDİ başlatılmalı) + redirect URI kaydı · **mig.107 + 108 APPLY** · `npm run parasut:gate -- --write` (deneme şirketinde; **stok invariant'ı burada kanıtlanır** — plandaki tek doğrulanmamış varsayımdı) · anahtarları açma. Sıra: `docs/parasut-golive-runbook.md`. Teslim `PARASUT_ENABLED=false` ile KAPALI yapılır.

  **⚠️ 2026-09-11 EKLENDİ — go-live sonrası İLK HAFTA iki sayaç gözlenmeli.** Dış inceleme iki **toplu iş ilerleme** kusuru buldu; ikisi de düzeltilip kapıya bağlandı ama belirtileri sessiz ve **yalnız Paraşüt açıkken** görülür, yani bugün ölçülemezler:
  - `POST /api/parasut/reconcile-stock` → `checked` ≈ `parasut_product_id` dolu aktif ürün sayısı olmalı ve `truncated` **çıkmamalı**. Sabit bir sayıda takılıyorsa katalog yarım taranıyor. (Eskiden sırasız `.limit(100)` vardı → 100'den sonraki hiçbir ürün kontrol edilmiyordu.) Tavan: `PARASUT_RECONCILE_MAX` (varsayılan 2000).
  - `POST /api/parasut/poll-payments` → `failed` sürekli >0 ve hep aynı sayıdaysa kuyruk baştaki bozuk belgelere kilitlenmiştir. (Eskiden hata kolu `checked_at` yazmıyordu → kalıcı hata veren 40 belge sonsuza dek ilk sırada kalıyor, gerideki tüm faturaların tahsilat durumu bayatlıyordu.)

  Sorgu (Studio): `select count(*) from products where parasut_product_id is not null and is_active;`

## D. Migration APPLY + smoke (kullanıcı tarafı; yeşil testler kapsamaz) — ✅ AI tarafı kapandı (2026-06-19)
- ✅ **Durum kesinleşti:** `npx tsx scripts/check-migrations.ts` → **17/17 auto-probe GREEN** (073…100 canlıda; eski "088 BLOKER / 091 APPLY bekliyor" notları BAYAT). Rapor `docs/audit/2026-06-19-d-migration-smoke.md`.
- ✅ **Gate hygiene:** `check-migrations.ts` MANUAL'a **mig.104** eklendi (önceden untracked → artık `⚠️ 104` raporlanır; `manuel: 7→8`).
- ✅ **(a) 8 MANUAL redefine SQL KAPANDI** (2026-09-11): kullanıcı canlı projeyi uyandırıp uyguladı; doğrulama probe listesine GÜVENİLMEDİ — yerel DB (111 mig sıfırdan) ile canlı **diff**'lendi: 64 tablo · 837 kolon · 60 RPC · 6 bucket, **fark SIFIR**, Studio 19/19. Açık migration işi YOKTUR.
- ⏳ **Kalan: browser smoke checklist — ama listesi 2026-09-12'de DARALTILDI.** Kaydın "tarayıcı sürülemez" gerekçesi **2026-06-19**'dan; E2E suite'i **2026-09-05**'te yeşillendi (13 spec / **94 test**, gerçek Chromium, retries=0) — yani gerekçe üç ay sonra çürümüş ve kayıt güncellenmemişti. Maddelerin çoğu artık otomatik katmanda: A3 guards 403 → `route-guard-matrix` + `y1-route-guards` · orders Y1/O2 → `orders.spec.ts` · production O1 → `production.spec.ts` · tema+demo → `auth.spec.ts` (demo cookie + yazma engeli + title) · mig.099 birim → 2026-09-11 yerel↔canlı diff (fark sıfır). **Otomatik kapsanmayan TEK madde: `quote send/mail`** — `tests/` altında quotes spec'i YOK ve `email-service.ts` zaten `EMAIL_FROM`/`RESEND_API_KEY` yokken erken dönüyor. **Yani bu madde kullanıcı-tarafı env işine BAĞLI** (C0'daki `EMAIL_FROM`); o girilmeden ne elle ne otomatik doğrulanabilir.

---
**Sıradaki tur kararı (kullanıcıya sorulacak):** A1 (server-side pagination, en büyük UX etkisi) mi, yoksa B (sıradaki modül derin incelemesi — quotes) mi?


### A6 — Dar ekran (390px) görsel turu + kalan elle örülmüş butonlar

2026-08-31 yüzey turunda **ölçülemedi**: Chrome penceresi OS alt sınırına
takılıyor (1470px'in altına inmiyor) ve uygulama iframe'lenmeyi doğru biçimde
reddediyor (`contentDocument` null). Gerçek dar-ekran doğrulaması için
Playwright viewport'u ya da cihaz emülasyonu gerek.

Aynı turda kapsam dışı bırakılan: **~115 elle örülmüş `<button>`, 49 dosyada**
(import/excel sihirbazı 17 · rfqs 16 · ayarlar 6…). Beş sayfa dışındakiler
`Button`'a bağlanmadı; `gate/surface-consistency` bunları kapsamıyor.


### ✅ KAPANDI (2026-08-31) — E2E kilidi + dev veritabanı

Yerel Supabase kuruldu (colima), `.env.local` yerele çevrildi, kapı kod
değişmeden açıldı. **13 spec / 94 test koşuyor.** Ayrıntı: [[project_local_dev_db]].

Bununla birlikte §A6'daki **390px mobil turu** da artık yapılabilir hale geldi:
Playwright viewport'u pencere OS sınırından etkilenmiyor. Henüz koşulmadı.


### ✅ A6 mobil turu KAPANDI (2026-08-31)

390px × 2 tema × 25 rota koşuldu: **yatay taşma 0**. İki kusur bulundu ve
kapatıldı (`products/aging` başlığı, `purchase/rfqs` çipleri).
**Kalan:** 36 sayfada 30–43px bandında dokunma hedefi var; önceki turun
"kritik aileler kapatıldı" kararının dışında mı, doğrulanmadı.


### 2026-09-04 — Buton dili Dilim 1 KAPANDI, 3 dilim kaldı

Ölçüm: **50 dosyada 127 elle örülmüş `<button>`** (§A6'nın "~115 / 49 dosya"
notu bayattı). Dilim 1 (Veri Aktarım sihirbazı, 4 dosya) kapandı: 26 → 8 buton.

**Kalan dilimler:** 2) satınalma & RFQ (32 buton / 7 dosya) · 3) ayarlar &
şablonlar (15 / 4) · 4) dağınık (~20 / 12).

**Yeni ölçüm sınıfı:** `<button>` taraması **buton-görünümlü `<Link>`leri
kaçırıyor**. Sihirbazda 5 tane vardı (ikisi `--bg-secondary` = zemin rengi).
Depo geneline bakıldı, geriye **2** kaldı: `PurchaseOrderDocument`, `AiPanel`.

### A7 — dar ekran yatay taşması — ✅ KAPANDI (2026-09-04)

**Kayıtlı teşhis YANLIŞTI.** Sebep `.topbar-right`'ın `flex-shrink: 0`'ı +
döviz ticker'ı değildi: o küme ≤768px'te **zaten `display: none`** ve 76px.

**Gerçek sebep, ölçüldü:** `.dashboard-grid` dar ekranda tek kolon (`1fr`) ve
ızgara kolonunun otomatik minimumu `auto`dur → kolon, çocuklarının
**min-content**'i kadar taban alır. Üst bardaki sayfa başlığı `nowrap` taşıyor
ve `overflow: hidden` **min-content'i küçültmez**; `<main>`de `minWidth: 0`
vardı, **`.topbar-wrapper`da YOKTU** → kolon başlık kadar genişliyor, üç
noktalı kısaltma hiç devreye girmiyordu. Taşan 5 rota başlık uzunluğuna göre
sıralıydı (Excel Aktarım Sihirbazı 396 · Satın Alma Siparişleri 386 · Veri
Aktarım Merkezi 383 · E-posta Teslimatları 378 · Developer Console 371).

**Düzeltme:** `dashboard/layout.tsx`'te `.topbar-wrapper`'a `minWidth: 0`
(iki ızgara çocuğu artık simetrik) + `globals.css`'te `.topbar-right`'ın ölü
ve YANILTICI `min-width: 0`'ı silindi. **Doğrulama: 30 rota × {360,390} ×
2 tema = 120 ölçüm → taşma 0.**

**Ölçüm dersi:** `documentElement.scrollWidth` mobil emülasyonda shrink-to-fit
yüzünden güvenilmez (`quotes/new`de 285px'lik HAYALET taşma üretti). Doğru
ölçü `document.body.scrollWidth` ↔ yerleşim görüntü alanı — kendi kabında
kayan tablo (tasarım) ile gövdeyi iten kutu (kusur) ancak böyle ayrışıyor.

### 2026-09-04 (2) — Buton dili turu KAPANDI (Dilim 1-2-3-4)

**127 → 60 elle `<button>`.** Kalan 60'ın tamamı gerekçeli dışarıda bırakılan
küme; §A6 bu maddeyle kapanır.

**`Button`'da ghost-danger varyantı** — ✅ **EKLENDİ** (2026-09-04).
`ghostDanger`: `ghost`un aynısı, hover'ı `--danger-bg`/`--danger-text`/
`--danger-border`. `.file-action-btn` ailesi (depodaki TEK `--danger` hover
kuralı) silindi, `DosyalarTab` silme ikonu `Button`a geçti → **elle örülmüş
buton 60 → 59** ve kontrol `tap-44` kazandı. Dinlenme rengi bilinçli olarak
`--text-tertiary` → `--text-secondary`: komşuları `ghost`a geçince satırdaki
üç ikondan biri daha soluk kalmıştı.


### 2026-09-10 — §A6 artığı ("30–43px bandı") KAPANDI

**"36 kontrol" notu YANLIŞTI.** Yeniden ölçüldü (390×844 · 2 tema · 29 rota;
etkin kutu = eleman ∪ mutlak `::after`, **sınıf adına bakılmadan**):
**1664 kontrolün 584'ü** 44px altındaydı.

Sebep notun kendisinde yazılıydı ama sonucu görülmemişti: 2026-08-31 ölçümü
`::after` kutusunu hesaba katmıştı ama **mobil çekmece KAPALIYKEN** koşmuştu →
uygulamanın en çok dokunulan yüzeyi (`Sidebar`ın 16 bağlantısı, 222×36,
`::after` YOK) envantere hiç girmedi. *Bir envanter, ölçmediği durumu
kapsayamaz.*

**Sonuç:** checkbox **150 → 0** · buton **36 → 4** · bağlantı **142 → 30** ·
başlıksız rota **0** · yatay taşma **0**.

**Gerekçeli kapsam dışı (bu maddeyi kapatır):**
- `input`/`select` (256 hit, 30–36px) — **kullanıcı kararı**; WCAG AA tabanını
  (24px) geçiyorlar, büyütmek her formun dikey ritmini değiştirirdi.
- Yoğun tablo hücresi bağlantıları (`product-types` satır başlığı 16px ×8,
  `purchase/orders` PO numarası 39.5px ×5) — satır tıklanabilir ya da satırda
  44px'lik aksiyon butonu var; büyütmek **komşu SATIRIN** görünür alanını
  yerdi (`q-note-btn` dersinin tersi).
- `.seg button` genişliği (36.1px) — segmentler bitişik, şerit bütün olarak
  tek hedef.
- Cümle içi düz yazı bağlantıları (13–15px ×2) — metin, dokunma hedefi değil.

Rapor: `docs/audit/2026-09-10-dokunma-tabani-ve-kalan-borclar.md`.


### 2026-09-10 (2) — OTURUMSUZ bölge KAPANDI (envanterin altıncı boşluğu)

Aynı günün dokunma turu **29 `/dashboard/*` rotası** gezip "kapandı" dedi.
Oturum açmamış birinin gördüğü **her** yüzey o listenin dışındaydı ve
**`/login` deponun başlık elemanı hiç olmayan TEK yüzeyiydi** — uygulamanın
giriş kapısı.

Ölçüm (390×844, 2 tema, 6 rota, oturumsuz): 78 kontrolün **50'si → 24**;
bağlantı **8→0**, buton **30→12**, başlıksız rota **1→0**, taşma 0, çakışma 0.
Masaüstü (1440px) nötrlüğü kanıtlandı: `::after` üreten eleman **0**.

`<h1>` uydurma metin değil, **logoyu sarıyor** (erişilebilir ad "Roven");
görsel nötrlük ölçüldü. Geri bağlantısının **altıncı lehçesi** `/gizlilik`te
bulundu — dili korunarak yalnız hit alanı düzeltildi.

**Gerekçeli kapsam dışı:** TR/EN dil segmentleri (bitişik şerit, `.seg`
kararıyla aynı) · login'in iki input'u (kullanıcının `input`/`select` kararı) ·
`/gizlilik` ve açılış sayfasının kendi stil dilleri.

Rapor: `docs/audit/2026-09-10-oturumsuz-yuzeyler-ve-kapinin-kor-noktasi.md`.

### 2026-09-15 → 2026-09-17 — Kapanış envanteri A1–A7 ✅ KAPANDI

ERP EKSİKLER oturumu 2026-09-15'te envanteri kaynaktan ölçtü (main `9167434` · tsc 0 ·
lint 0 · 7098 test · audit 0) ve kullanıcı kararıyla ("bunlar açık, planla ve hepsini
kapat") bu oturuma devretti. Rapor: `docs/audit/2026-09-17-a1-a7-kapanis.md`.
Dört dilim: `98a755c` → `7f95ff8` → `8b9453f` → Dilim 3 (E2E + cache fix).

**A. Kodla kapatılanlar:**
1. ✅ **E2E boşluğu** — 8 yeni spec (+29 test, 94 → 123): quotes (liste/new/preview +
   rezervasyon smoke a + Kaydet-sonra-Gönder smoke b) · vendors · purchase/rfqs ·
   purchase/orders/[id] (+print) · orders/[id]/edit · settings/product-types ·
   settings/note-templates (redirect) + email-deliveries · developer/* (6). CLAUDE.md'nin
   iki elle-smoke borcu otomatikleşti. `gate/e2e-coverage` her dashboard rotasını ister.
   **E2E iki ürün kusuru buldu:** `revalidateTag(…, "max")` = stale-while-revalidate
   (bayat okuma; `cacheLife.immediate` + 48 dosya `"immediate"`, `gate/cache-invalidation-profile`)
   ve preview sayfası hidrasyon uyuşmazlığı (`typeof window` state başlangıcı → effect).
2. ✅ **Gerçek-DB entegrasyon kapısı** — `npm run test:integration` (yerel Supabase,
   fail-closed host denetimi): RLS 64/64 · anon 0 sızıntı · 6 kova · 5 DEFINER RPC ·
   088 zinciri (17 test). ROADMAP.md silindi.
3. ✅ **RBAC named artıklar** — 409 FK ön-kontrolleri (customers→invoices;
   orders→shipments/invoices/**production_entries**) · PO print guard + redaksiyon +
   `formatPoCurrency(null)` → "—" · teklif preview: sunucu fetch'i YOK, konusuz (kilitli).
4. ✅ erp2 `npm ci` (vitest 4.1.11 / tsx 4.23.13 / esbuild 0.28.2).
5. ✅ Bayat kayıtlar — `EMAIL_FROM` iddiası **bayat değil eksikti**: iki env profili
   ayrışmış (proje-codex yerel · erp2 CANLI). ROADMAP notu dosyayla birlikte gitti.
6. ✅ Artık dallar — **kullanıcı kararı: KALIYOR** (merge edilmiş, 0 ileri); yalnız
   ROADMAP.md silindi.
7. ✅ Ertelenen özellikler — Tedarikçi Performansı **yapılmayacak** · RFQ ayrı print
   **kapalı** (arşiv-view yeterli). Kullanıcı kararı 2026-09-16.

**B. Yalnız kullanıcı (env/panel/dış servis) — deploy günü listesi, AÇIK:**
- C3 Coolify/Hetzner deploy: prod ayakta değil (443 reddediyor); açılış `check-migrations`
  + `preflight:auth`.
- Env: `EMAIL_FROM` (canlı profilde YOK) · `RESEND_WEBHOOK_SECRET` · `NEXT_PUBLIC_APP_URL` ·
  `ADMIN_EMAILS` (brick) · `REDIS_URL` · `SENTRY_ENVIRONMENT=production` · `QUOTE_SHARE_SECRET`
  · Traefik X-Real-IP.
- `ANTHROPIC_API_KEY` 401 → AI eşleştirme/copilot/ops-summary/sesli giriş ölü.
- Supabase panel: signups OFF · Redirect URLs (parola sıfırlama + OAuth callback) · Google provider.
- Paraşüt: API başvurusu · `parasut:gate --write` · go-live ilk hafta iki sayaç.
- `/gizlilik` 3 köşeli parantez + hukuk onayı · teklif e-posta smoke (Gmail/Outlook) · PMT pilot haftası.
- Marka oturumunun iki notu: (b) e-posta `COLORS.accent` → **Roven mavisi `#123f73` ✅ (kullanıcı
  kararı 2026-09-18**; `accentSoft #e7ecf1`; kilit `email-internal-templates.test.ts`; yalnız
  Roven markalı iç bildirimler etkilenir — müşteri teklif e-postası accent kullanmaz). (a)
  `QuoteDocument` `C.brand = "#0072BC"` (teklif belgesindeki PMT mavisi; 4 yerde sabit:
  `QuoteDocument.tsx` ×3 · `QuoteForm.tsx` ×2 · `globals.css` ×3 baskı) → ikinci müşteri
  gelirse `company_settings` kolonu + Ayarlar renk alanı gerekir; **karar AÇIK** (PMT tek müşteriyken sabit kalabilir).
- Yerel: `colima`/`supabase` işi bitince `supabase stop && colima stop`; Playwright cache'ini
  silen dış süreç bulunmalı (`~/Library/Caches/ms-playwright` iki kez silindi).
