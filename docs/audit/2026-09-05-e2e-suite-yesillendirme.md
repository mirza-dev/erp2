# E2E suite yeşillendirme — "yeşil" görünen suite aslında yeşil değildi

_2026-09-05 · migration YOK · ürün kodu DEĞİŞMEDİ (yalnız test altyapısı + 2 spec)_

Lansman olgunluk listesinin son kod maddesi **#19 Kullanıcı akışları**. 13 spec /
94 Playwright testi vardı ama suite `pretest:e2e` prod-koruma kapısı yüzünden
aylarca kilitliydi; 2026-08-31'de yerel Supabase ile kilit açıldı ve **o günden
beri bir kez bile uçtan uca koşmamıştı.**

## Baseline — 85 passed · 8 flaky · 1 failed · **32.8 dakika**

İlk koşumda tek bir test sert düştü, sekizi "flaky" diye işaretlendi. **"Flaky"
burada bir tür değil, bir örtüydü:** o testler ilk denemede düşüp retry'da 1
saniyede geçiyordu. `retries: 1` olduğu için özet satırı hep "passed" gibi
okunuyordu.

Uç durum ölçüldü: bir test **15,0 dakika**, bir diğeri **8,2 dakika** sürdü —
oysa test timeout'u 60 saniye. Fark teardown'da geçiyordu (`Tearing down
"context" exceeded the test timeout`).

## Kök sebep 1 — HİDRASYON YARIŞI (4 test)

`gotoApp` yalnız kabuğun **boyandığını** bekliyordu; dosyanın kendi yorumu bunu
zaten bir tuzak olarak işaretlemişti ama bekleme eklenmemişti.

Doğrudan ölçüm (bu depo, `/dashboard/import/excel`):

| an | `main` üzerindeki `__react*` anahtarları |
|---|---|
| `domcontentloaded` | `[]` |
| +2,5 sn | `__reactFiber$…`, `__reactProps$…` (dosya input'unda ayrıca `__reactEvents$…`) |

O pencerede `setInputFiles` **native** `change` olayını atıyor, React'in
`onChange`i henüz bağlı olmadığı için olay hiçbir yere ulaşmıyor: sihirbaz
`idle` durumunda kalıyor, test 30 sn bekleyip düşüyor, retry'da (sayfa artık
hızlı) geçiyor.

**Süre büyütmek bu sınıfı çözmez** — 2026-08-30'da beklemeler 15→30 sn'ye
çıkarılmıştı ve yetmemişti. Doğru düzeltme beklemeyi **süreye değil olaya**
bağlamak: YENİ `waitForHydration(page)`, `gotoApp` ve `waitForApp` içinden
çağrılıyor. Sinyal React'in DOM'a yazdığı fiber anahtarı.

`import.spec` tek başına, retry'sız: **4 düştü → 12/12 geçti.**

## Kök sebep 2 — SOĞUK DERLEME (4 test)

Turbopack her rotayı ilk istekte derliyor ve bu, testin 60 sn'lik bütçesinin
İÇİNDE gerçekleşiyordu. `dashboard` ve `calendar-notes` testleri bu yüzden
teardown'da asılı kalıyordu.

**Önce "üretim sunucusuna karşı koş" denendi ve ÇALIŞMADI** — kayda değer,
çünkü ilk akla gelen çözüm bu: `next build && next start` sonrası globalSetup
girişte takıldı. Sebep üretim CSP'si: `connect-src` yalnız `*.supabase.co`
kabul ediyor, yerel Supabase ise `127.0.0.1:54321`de. Yani **E2E, yerel
geliştirmede `next dev`e karşı koşmak ZORUNDA** ve üretim CSP'si gate ile
kilitli olduğu için gevşetilemez.

Çözüm derlemeyi test bütçesinin **dışına** almak: `globalSetup` artık suite'in
dokunduğu 16 rotayı bir kez geziyor (salt-okunur, fail-soft; globalSetup'ın
test timeout'u yok). Ölçülen etki, hidrasyon düzeltmesinden **bağımsız**
olarak: `dashboard` + `calendar-notes` teardown timeout'undan retry'sız
geçmeye döndü.

## Kök sebep 3 — TAŞINMIŞ SÖZLEŞME (1 test, gerçek regresyon)

`aging.spec` eskime filtrelerini `getByRole("button")` ile arıyordu ve **iki
denemede de** düştü. Filtreler 2026-09-04'te `FilterChips`e taşınmıştı ve o
bileşen bir `tablist` üretiyor → rol artık `tab`.

Bu, **önceki turun sessiz regresyonu**: vitest kaynak-kilidi testleri
işaretlemenin metnini görür, ANLAMINI değil; E2E de dönüşümden beri hiç
koşmamıştı. İddia gevşetilmedi, taşındı (`tab` + ayrıca `tablist` sözleşmesi).

## Yan düzeltme — iki demo testi hiçbir şey kanıtlamıyordu

`auth.spec`'in iki demo testi `if (await btn.isVisible())` ile sarılıydı: buton
bulunamazsa test **sessizce geçiyordu**. Üstelik ikisi de attribute'ları anlık
okuyordu ve aynı hidrasyon penceresine düşüyordu (`useIsDemo` cookie'yi ilk
istemci render'ında okur; SSR HTML'i `isDemo=false` ile boyanır). Biri devre
dışı kalmış butona tıklamayı deneyip 60 sn bekliyordu.

Sarmalayıcı kaldırıldı, iddialar Playwright'ın **yeniden deneyen** biçimlerine
çevrildi (`toBeVisible` → `toBeDisabled` → `toHaveAttribute`).

## Sonuç

| | baseline | sonra |
|---|---|---|
| koşum | 85 passed · 8 flaky · 1 failed | **94 passed** |
| retry | 1 (kusurları örtüyordu) | **0** |
| süre | 32,8 dk | **2,3 dk** |

İki ardışık koşumda **94/94, retries=0**. `retries` yerelde **1 → 0**: retry
kusuru düzeltmez, gizler — bu suite tam olarak öyle "yeşil" görünüyordu. CI'da
2 kalıyor (orada amaç kusuru görmek değil, altyapı hıçkırığında boşuna kırmızı
yakmamak).

## Kapı

YENİ `src/__tests__/gate/e2e-harness.test.ts` (4 test, **5/5 kırmızı
kanıtlı**): hidrasyon beklemesi `gotoApp`/`waitForApp` gövdelerinde · ısınma
listesi çağrılıyor ve kritik rotaları kapsıyor · yerel retry 0 · `FilterChips`
yüzeyleri `tab` rolüyle aranıyor. Yeni bir ev açıldı çünkü E2E altyapısının
mevcut bir kapı sahibi yoktu.

tsc 0 · lint 0 · **497 dosya / 6921 test** · build 0 uyarı · migration YOK.

## Ders — "flaky" bir sonuç değil, bir ERTELEME

Rapor "8 flaky" yazıyordu ve aylarca kimse bakmadı. Sekizinin de altında
tekrarlanabilir birer kusur vardı; ikisi ürün davranışına dair gerçek yarışlar,
biri gerçek bir regresyondu. **Retry açıkken bir suite'in yeşilliği bir iddia
değildir.** Yeşilliği ölçmek için retry kapatılmalı.

## İkinci ders — kırmızı-kanıt turu yine ZAYIF bir kural yakaladı (4. kez)

Yeni kapının "gotoApp hidrasyonu bekler" kuralı ilk hâlinde
`gotoApp[\s\S]*?waitForHydration` diyordu. `gotoApp`ın çağrısı silindiğinde
kural **yeşil kaldı**: `[\s\S]*?` gövdeden çıkıp aşağıdaki `waitForApp`in
çağrısına ulaşıyordu. Bir gün önce A4 kuralında **aynı sınıf** hata çıkmıştı.
Kural fonksiyon gövdesini ayrıştıracak biçimde yeniden yazıldı.

## Kalan

Bu turdan açık madde çıkmadı. Lansman listesinde kalan iki madde de
kullanıcı-tarafı: **#13** `EMAIL_FROM` (10 bildirim `waiting_config`'te) ·
**#11** yedek geri-yükleme provası · **#20** PMT pilot haftası.
