# Ertelenen Büyük İşler (Backlog) — yeni oturumda devam

_Son güncelleme: 2026-06-17. Kullanıcı isteğiyle "sonraki tura bıraktığımız büyük işler" buraya çıkarıldı. Detaylı açık-yükümlülük + smoke listesi `CLAUDE.md` §Açık yükümlülükler'de._

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
- **İzlenen RBAC borçları:** ~~GET /api/quotes(+[id]) view_quotes~~ ✅ A3'te kapandı. Kalan (düşük): purchase-copilot POST + ai/parse + ai/score RBAC'siz (oturum-only, demo/anon bloklu). Yeni method-seviye gate bunları zaten "guarded" sayar (guardAiRoute/checkAuth) — gerçek borç değil.
- `/erp-review <modül-yolu>` ile veya `erp2-reviewer` ajanını kapsam vererek çağır. Detay [[reference_review_agent]].

## C0. Teslim öncesi kullanıcı-tarafı (2026-08-31 ürün olgunluğu denetimi)

- **`EMAIL_FROM`** — canlıda 10 bildirim `waiting_config`'te bekliyor, 11 uyarı tipi kimseye ulaşmıyor. Tek satır env.
- **Supabase → Authentication → URL Configuration → Redirect URLs** — parola sıfırlama dönüş adresi kayıtlı olmalı; **YOKSA yeni kurtarma akışı çalışmaz** ("requested path is invalid").
- `ADMIN_EMAILS` + `NEXT_PUBLIC_APP_URL` `.env.local`'de boş.
- `/gizlilik` firma alanları (`[ticari unvan]`, `[VERBİS]`, `[irtibat]`) + hukuk danışmanı onayı. Kaynak: `docs/kvkk-veri-envanteri.md`.
- **`INTERNAL_OPERATOR_EMAILS` BOŞ** (2026-08-31 ölçümü) → **Developer Console kimseye açık değil**; `Sidebar.tsx` linki `internalOperator` filtresiyle hiç render edilmiyor ve `/dashboard/developer` → `/dashboard`'a döner. Kullanıcı kendi e-postasını eklemeli + dev sunucusunu yeniden başlatmalı. **DC'de görsel iş yapmanın ön koşulu budur** (demo/viewer rolü oraya giremediği için AI tarafı da ölçemiyor).
- **Yedek geri-yükleme provası hiç yapılmadı** (madde #11) — `npm run backup` çalışıyor ama denenmemiş yedek yedek sayılmaz.
- **E2E kilidi** (madde #19) — 13 Playwright spec `preflight:env` tarafından durduruluyor (canlı DB hedefi). Frankfurt dev projesi açılmadan koşamazlar.
- **PMT beta pilot haftası** (madde #20).

## C. Deploy / altyapı doğrulamaları (kod tek başına yetmez)
- **C1. Login brick-risk** — ✅ **AI tarafı TAMAMLANDI** (2026-06-19; rapor `docs/audit/2026-06-19-c1-login-preflight.md`). YENİ `scripts/check-auth-preflight.ts` (`npm run preflight:auth`, read-only `listUsers`+gerçek `parseRoles` → kalıcı/bootstrap admin sayar; 0 admin→exit 1 BRICK; canlı koşu 3 kalıcı admin→prod korumalı) + brick modeli + manuel checklist + kurtarma runbook. **Kalan kullanıcı-tarafı:** ADMIN_EMAILS her iki Coolify env + Supabase "signups OFF" + OAuth redirect URLs + tarayıcı smoke (doc §3). (Karar: LoginMonolith UI redesign ayrı iş, kapsam dışı.)
- **C3. Coolify / Hetzner deploy — TARİH DEĞİL, OLAY tetikli (kullanıcı kararı 2026-08-31): "Çorum'a dönünce" Coolify + özel domain kurulup deploy edilecek.** (Eski "~2026-09-07" notu BAYAT — kullanıcı 2026-08-31'de zamanlamayı olaya bağladı; o güne kadar geliştirme **yalnız localhost + telefon**, günlük komut `npm run dev:live`.) Prod `https://erp.getmedspace.com` şu an **AYAKTA DEĞİL**: DNS çözülüyor (`138.199.204.138`) ama 443 bağlantıyı reddediyor (`curl: (7)`), ağ yerelde sorunsuz → sunucu/container durmuş. Kullanıcı kararı: **şimdilik yalnız yerel geliştirme** — `npm run dev:live` (canlı DB + `-H 0.0.0.0`), masaüstünde `http://localhost:3000`, telefonda `http://<Mac IPv4>:3000` (IP `ipconfig getifaddr en0`; `allowedDevOrigins` artık makinenin kendi IPv4'lerinden türetiliyor, sabit yazılmadı). Çorum'a dönüldüğünde **o an yereldeki sürüm doğrudan canlıya alınacak**. Bunun sonuçları: (a) prod build bugünkü commit'lerin GERİSİNDE — deploy günü fark büyük olacak, migration APPLY sırası ve §D'deki 8 MANUAL SQL o gün kritik; (b) canlı-doğrulama gerektiren her iş (browser smoke, RBAC 403 turları, mig probe'ları) o güne kadar birikir; (c) `NEXT_PUBLIC_APP_URL` / `ADMIN_EMAILS` / `X-Real-IP` / `REDIS_URL` env kontrolleri (§A2, §C1) deploy gününün ön koşulu. **Deploy günü açılış hamlesi:** `npx tsx scripts/check-migrations.ts` + `npm run preflight:auth` (0 admin → BRICK).

- **C2. Paraşüt Faz 12-16** — ✅ **KOD TARAFI TAMAMLANDI (2026-08-29)**. Gerçek HTTP adapter (`21497bf`) + alış faturası/indirilecek KDV (`7adc040`, mig.107) + tahsilat geri okuma (`0ba37ef`, mig.108) + stok mutabakatı (`26333b5`) + canlı gate script'i & runbook (`1cf8ee3`). 6100 test. **Kalan tamamı kullanıcı-tarafı:** Paraşüt API başvurusu (`destek@parasut.com` — uzun teslim süreli, ŞİMDİ başlatılmalı) + redirect URI kaydı · **mig.107 + 108 APPLY** · `npm run parasut:gate -- --write` (deneme şirketinde; **stok invariant'ı burada kanıtlanır** — plandaki tek doğrulanmamış varsayımdı) · anahtarları açma. Sıra: `docs/parasut-golive-runbook.md`. Teslim `PARASUT_ENABLED=false` ile KAPALI yapılır.

## D. Migration APPLY + smoke (kullanıcı tarafı; yeşil testler kapsamaz) — ✅ AI tarafı kapandı (2026-06-19)
- ✅ **Durum kesinleşti:** `npx tsx scripts/check-migrations.ts` → **17/17 auto-probe GREEN** (073…100 canlıda; eski "088 BLOKER / 091 APPLY bekliyor" notları BAYAT). Rapor `docs/audit/2026-06-19-d-migration-smoke.md`.
- ✅ **Gate hygiene:** `check-migrations.ts` MANUAL'a **mig.104** eklendi (önceden untracked → artık `⚠️ 104` raporlanır; `manuel: 7→8`).
- ⏳ **Kalan = yalnız kullanıcı-tarafı** (DB conn/psql yok, tarayıcı sürülemez): (a) **8 MANUAL redefine SQL** Studio'da (089/093/094/095/101/102/103/104 — doc §2); (b) **browser smoke checklist** (doc §3): A3 guards (quotes/movements/customers/products-quotes/alerts 403) · production O1 eşzamanlı geri-alma (stok 1×) · orders Y1/O2 · mig.099 birim · quote send/mail · tema+demo.

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
