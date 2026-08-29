# KOBİ Simülasyonu — Doğrulanmış Bulgular (2026-08-29)

> **Kapsam:** dört yapay çalışan (mühendis · muhasebeci · üretim · satış-satın alma)
> canlı Supabase'e karşı, yalnız tarayıcıdan, 5 iş günü.
> **Yöntem:** ajanlar kanıt veremez (kod göremezler) → her ham bulgu koda karşı
> doğrulandı. Doğrulanamayan/elenen bulgular **§4'te gerekçesiyle** duruyor.
> **Ham raporlar:** `docs/sim/gunluk/gun-1..5.md`
> **Durum:** doğrulama turu ✅ · **düzeltme turu ✅ (§5)** — tüm bulgular kapatıldı
> (ertelenenler §5 sonunda gerekçesiyle).
>
> **Özet:** K:3 · Y:6 · O:8 · D:5 · Nit:9 · elenen:6
> *(düzeltme turunda yeniden sınıflandı: **O6 → Düşük**, **O7 → Nit** ⇒ fiilen
> K:3 · Y:6 · O:6 · D:6 · Nit:10)*

---

## §0 — Düzeltme turunda yapılan teşhis düzeltmeleri (2026-08-29)

Düzeltmeye başlamadan önce her bulgu koda karşı **yeniden** okundu. Yedi maddede
ilk teşhis eksik ya da yanlış çıktı; yanlış teşhise göre yazılan düzeltme işe
yaramayacağı için hepsi ilgili bulgunun içinde açıkça düzeltildi:

| Bulgu | Değişen |
|---|---|
| **Y3** | `scrap: 0` sabiti zaten ölü kod — asıl kök `data-context.tsx:548`, `scrap` gövdeye **hiç konmuyor**. Düzeltme iki katmanlı. |
| **Y5** | İkinci kök: mal kabul sonrası uyarı taraması **hiç çalışmamış** (göreli URL + yutulan hata). S12'nin sebebi bu. |
| **O3** | Ürün kodu hatası **değil**, seed kusuru: seed commitment'ları `po_line_id` taşımıyor. |
| **O4** | İlk açılış guard'lı; bayatlık **bfcache/geri dönüş** kaynaklı. Sunucu ikinci siparişi zaten reddediyor. |
| **O6** | Denetim izi **doğru çalışıyor** (`entered_by` sunucu-otoriter). Kusur yalnız görüntüde → **Düşük**. |
| **O7** | `window.print()` headless'ta no-op → "hiçbir şey olmuyor" **harness kusuru**. Kalan: etiket → **Nit**. |
| **O8** | "Yalnız 4 eski kayıt" büyük ölçüde simülasyon kurgusu. Kalan gerçek: hafta/ay toplamı veren görünüm yok. |

Bu, raporun kendi kuralının ikinci uygulaması: **ajan bulgusu iddiadır, kanıt
değil** — ve doğrulayıcının kendi ilk okuması da öyle.

---

## KRİTİK

### K1 — Müşterisi cariye bağlanmamış sipariş sevk edilemiyor; stok kilitli kalıyor

**Kanıt**
- `src/lib/services/order-service.ts:250` — `preflightShipment()`: `if (!order.customer_id) return { valid:false, error:"Sipariş müşterisiz sevk edilemez." }`
- `src/app/dashboard/quotes/new/page.tsx` — `customer_id` **hiç geçmiyor** (0 eşleşme). Müşteri yalnız serbest metin.
- Canlı veri:
  ```
  ORD-2026-0030  customer_id: null  customer_name: "SIM Akdeniz Enerji"
                 commercial_status: approved   fulfillment_status: allocated
  TKL-2026-015   customer_id: null  status: accepted
  "SIM" ile başlayan cari sayısı: 0
  ```

**Etki.** Satışçı yeni bir müşteri adını doğrudan teklife yazınca zincir sonuna
kadar ilerliyor: teklif gönderiliyor → **stok rezerve ediliyor** → kabul →
siparişe dönüşüyor → onaylanıyor → tahsis ediliyor. Sevk anında kalıcı olarak
reddediliyor. Ortaya çıkan şey **stoğu tutan, asla sevk edilemeyen bir sipariş**;
arayüzde onarım yolu yok. Fabrikada ilk hafta içinde kaçınılmaz.

**Düzeltme.** Teklif formunda müşteriyi cari kaydına bağlamayı zorunlu kıl
(picker + "yeni cari oluştur"), ya da en geç **gönderim öncesi** `customer_id`
kontrolü ekle — `preflightShipment`'ın aynısı. Ek olarak mevcut müşterisiz
kayıtlar için bir "cariye bağla" onarım yolu gerekiyor.
**Efor:** Orta

---

### K2 — Tedarikçi fatura numarası arayüzde hiç girilemiyor (indirilecek KDV künyesi)

**Kanıt**
- Arka uç **hazır**: `src/app/api/purchase-orders/[id]/receive/route.ts:63-84` (`vendor_invoice_no`, `vendor_invoice_date` alıyor ve doğruluyor) · `src/lib/services/purchase-order-service.ts:177,193` (yazıyor) · `supabase/migrations/107_parasut_purchase_bills.sql` (kolonlar var)
- Arayüzde **tek satır yok**: `grep -rn "vendor_invoice" src/app/dashboard/ src/components/` → **0 sonuç**
- Deniz mal kabulü tamamladı, sonradan eklemek için PO/tedarikçi/ürün ekranlarını taradı, alan bulamadı.

**Etki.** Paraşüt Faz 13'te arka uç kuruldu, **ekran kurulmadı.** İndirilecek
KDV'nin resmî künyesi ERP'ye hiç girilemiyor. Ayrıca
`docs/parasut-golive-runbook.md` §5 *"mal kabul ekranından girilir"* diyordu —
**yanlıştı, bu turda düzeltildi.**

**Düzeltme.** Mal kabul formuna iki alan (fatura no + tarih) ekle; tamamlanmış
PO'da sonradan düzenleme yolu bırak. API ve servis hazır, yalnız UI eksik.
**Efor:** Küçük

---

### K3 — Fiziksel stok sayım düzeltmesi girecek ekran yok

**Kanıt**
- `recount_stock` RPC **mevcut** (`supabase/migrations/105_recount_stock.sql`), `src/lib/supabase/products.ts:406`'dan çağrılıyor
- **Tek çağıran** `src/lib/services/import-service.ts:840` — yani yalnız **Excel içe aktarım** yolu
- Hasan yedi ayrı yere baktı: ürün Stok sekmesi (salt okunur) · Düzenle formu (**stok adedi kutusu yok**) · Tedarik/Ticari/Ekler · Ayarlar · Dashboard · Uyarılar · toplu işlem menüsü (yalnız "Sil")
- Üretim Girişi'ne **−2** yazınca kaydet düğmesi pasifleşiyor; **+2** yazınca çalışıyor → ekran yalnız artırıyor

**Etki.** Sayım farkı fabrikada haftalık rutindir. Vardiya sorumlusunun 2
adetlik eksiği girmesi için Excel dosyası hazırlayıp import sihirbazından
geçmesi gerekiyor — pratikte yapılmaz, stok kayması kalıcılaşır.
*"Bugünün asıl işi olan stok sayım düzeltmesini sisteme hiç giremedim."*

**Düzeltme.** Ürün detayına "Sayım / Stok Düzelt" eylemi (sayılan adet + neden).
RPC hazır, yalnız ekran ve ince bir API ucu gerekiyor.
**Efor:** Küçük–Orta

---

## YÜKSEK

### Y1 — İptal edilen/başarısız istek "kayıt bulunamadı" olarak gösteriliyor

**Kanıt**
- `src/app/dashboard/quotes/[id]/page.tsx:70-88`
  ```ts
  .catch(err => { if (err.name !== "AbortError") console.error(...); })
  .finally(() => setQuoteLoading(false));
  ```
  İptal edilen istekte de `finally` bayrağı indiriyor → `loading=false` + `quote=null` → **satır 229: "Teklif bulunamadı."**
- `src/app/dashboard/orders/[id]/page.tsx:111-116` — aynı kusur, **daha sinsi**: `catch` içinde `if (…AbortError) return;` var ama **`finally` `return`'den sonra da çalışır** (JS semantiği). Koruma doğru görünüyor, işlemiyor.

**Etki.** Üç bağımsız tanık (Deniz, Sibel ×2) aynı davranışı bildirdi: kayıt
açılırken "bulunamadı" yazıyor, hiçbir şey yapmadan birkaç saniye sonra
düzeliyor. Kullanıcı kaydın silindiğini sanıyor. Gerçek ağ hatasında da aynı
yanlış mesaj çıkar — "bulunamadı" ile "yüklenemedi" karışıyor.

**Düzeltme.** `finally` yerine başarı ve gerçek-hata yollarında ayrı ayrı
indir; iptalde dokunma. Hata durumu için "bulunamadı"dan ayrı bir mesaj.
**Efor:** Küçük

---

### Y2 — Üretim kaydı düzeltilemiyor; tekrar kayıt İKİNCİ satır ekliyor

**Kanıt.** Hasan: `FWBV-DN400-PN80-PH` için 6 girdi, doğrusu 8 idi, tekrar
kaydetti → *"eski +6 kaydının ÜZERİNE YAZMADI, yeni bir satır olarak EKLEDİ."*
Sonuç 6+8=14, gerçek 8. **Bağımsız ikinci tanık:** Kerem aynı saatlerde,
olaydan habersiz, stoğun **3 → 9 → 17** arttığını bildirdi (3+6=9, 9+8=17).

**Etki.** Sahada yanlış miktar sık girilir. Tek düzeltme yolu silmek; silme de
engelli (bkz. O1). Stok kalıcı olarak yanlış kalıyor — hem satılabilir stok hem
üretim raporu bozuluyor.

**Düzeltme.** Üretim kaydına düzenleme yolu; ya da form yeniden kaydedilirken
"bu ürün için bugün zaten kayıt var, güncellensin mi?" uyarısı.
**Efor:** Orta

---

### Y3 — Üretim girişinde hurda/fire alanı yok; arka uç destekliyor

**Kanıt**
- `src/app/dashboard/production/page.tsx:265` → `scrap: 0` **sabit kodlanmış**
- ⚠️ **Düzeltme turunda bulunan derin kök:** o sabit zaten **ölü kod**.
  `src/lib/data-context.tsx:548` gövdeyi `{product_id, produced_qty,
  production_date, notes}` olarak kuruyor — `scrap` **hiç taşınmıyor**.
  Yani forma alan eklemek tek başına yetmez; **taşıma katmanı da açılmalı.**
- Arka uç hazır: `src/app/api/production/route.ts:26,38` (`scrap_qty`, `waste_reason`) · `src/lib/services/production-service.ts:16,46` (doğruluyor: `0 ≤ scrap ≤ produced`)

**Etki.** Hasan 20 üretip 1'ini hurdaya ayırdı; **stok tam 20 arttı.** Hurdayı
serbest nota yazdı: *"ben yazmasam hiçbir yerde görünmeyecekti."* Fire oranı
hiçbir raporda yok, stok sistematik olarak fazla görünüyor.

**Düzeltme.** İki katman: (1) `data-context.tsx` `addUretimKaydi` gövdesine
`scrap_qty` + `waste_reason` eklenir, (2) forma hurda adedi + fire nedeni alanı.
API/servis hazır.
**Efor:** Küçük

---

### Y4 — RFQ'ya girilen teknik şartname notu hiçbir yerde görünmüyor

**Kanıt**
- Yazılıyor: `src/app/dashboard/purchase/rfqs/new/page.tsx:119` → API `src/app/api/rfqs/route.ts:59`
- **Gösterilmiyor:** `src/app/dashboard/purchase/rfqs/[id]/page.tsx` içinde `notes` → **0 eşleşme**

**Etki.** Kerem RFQ'ya *"PN80 basınç sınıfı, EN 10204 3.1 sertifika zorunluluğu,
hidrostatik test raporu"* yazdı; oluşan kayıtta hiçbir yerde yok. Veri
kaybolmuyor, **görünmez oluyor** — mühendis açısından sonuç aynı: tedarikçiye
teknik şartın ulaşıp ulaşmadığı doğrulanamıyor. *"Teklif toplama sürecinin
teknik doğruluğunu riske atıyor."*

**Düzeltme.** RFQ detayında (ve tedarikçiye giden belgede) notu göster.
**Efor:** Küçük

---

### Y5 — Uyarı metinleri donuk: canlı stok rakamlarıyla hiç örtüşmüyor

**Kanıt.** Üç bağımsız tanık (Kerem, Sibel, Hasan), iki üründe:
- `TGAV-150-DN150-WCB` uyarısı: **"Mevcut stok 10 adet (min: 10)"** · Stok sekmesi: **Stokta 38 / Satılabilir 20 / Rezerve 18 / Min Stok 25** — hiçbir rakam tutmuyor
- `FWBV-DN400-PN80-PH` uyarısı: **"Mevcut stok 0 adet (min: 4)"** · Stok sekmesi: **3** (sonra 9, sonra 17)
- Kerem min-stok parametresini düzelttikten sonra da uyarı eski rakamla kaldı.
- **Gün 5 yeni örnek:** `PO-2026-0003` tam kabul edildi (6/6, durum "Tamamlandı", mal bugün 10:23'te alındı) — Dashboard'da hâlâ **"Geciken Tedarik: 41 gün gecikti, tedarikçiyle teyitleşin"** acil uyarısı duruyor.

**Etki.** Kerem'in ifadesi: *"'Aktif ama aslında çözülmüş' uyarılar personelin
gerçek kritik durumları gözden kaçırmasına yol açabilir."* Hasan: *"uyarı
listesine güvenim kalmadı."* Uyarı paneli fabrikanın ana operasyon ekranı.

**İKİNCİ KÖK (düzeltme turunda bulundu) — tarama hiç çalışmıyor.**
`src/lib/services/purchase-order-service.ts:223` mal kabul sonrası kendi
sunucusuna **göreli URL** ile HTTP atıyor:
`fetch(\`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/alerts/scan\`)`.
`NEXT_PUBLIC_APP_URL` `.env.local`'da **set değil** → Node fetch göreli URL'i
ayrıştıramayıp **fırlatıyor** → hemen altındaki boş `catch` yutuyor. Yani mal
kabul sonrası uyarı taraması **hiç koşmamış.** S12'nin (tamamlanmış PO hâlâ
"Geciken Tedarik" gösteriyor) gerçek sebebi bu: `po_overdue` çözme mantığı
(`alert-service.ts:514`) doğru yazılmış, sadece hiç tetiklenmiyor.

**Düzeltme.** (1) `alert-service.ts:141/176` — aktif uyarı varsa scan hiçbir şey
yapmıyor; `dbUpdateActiveAlertContent` (`alerts.ts:248`, `order_deadline` ve AI
bulgularında zaten kullanılıyor) `stock_critical`/`stock_risk` dallarına da
bağlanır → metin okuma anında tazelenir. (2) Mal kabul sonrası HTTP turu
kaldırılır, servis fonksiyonları **doğrudan** çağrılır (env bağımlılığı biter).
**Efor:** Orta

---

### Y6 — Teklif/siparişteki müşteri cari kaydına hiç dönüşmüyor

**Kanıt.** Sibel 23 carinin tam listesini taradı: **"SIM Akdeniz Enerji" yok**;
arama "SIM" → *"0 müşteri"*. Sipariş detayında müşteri adı yazıyor ama
**tıklanabilir cari linki yok.** (K1 ile aynı kök: `quotes/new` `customer_id`
tutmuyor.)

**Etki.** K1 sevkiyatı engelliyordu; bu, aynı kökün **muhasebe yüzü**:
*"$33.600'lük bir satışın alacak takibini hangi cari üzerinden yapacağım belli
değil, bu müşteri için 'Toplam Gelir' hiçbir yerde toplanmıyor."* Cari ekstresi,
alacak yaşlandırma ve müşteri bazlı ciro bu satışı hiç görmüyor.

**Düzeltme.** K1 ile birlikte çözülür: teklifte cari bağlama zorunlu, ya da
"yeni cari oluştur" akışı.
**Efor:** K1'e dahil

---

## ORTA

### O1 — Aynı üründen iki üretim kaydında sil düğmeleri ayırt edilemiyor
`src/app/dashboard/production/page.tsx:811` → `aria-label={\`${kaydi.productName} üretim kaydını sil\`}` — iki satırda **birebir aynı ad**. Silme mantığı `id` ile doğru çalışıyor (`:892`), ama ekran okuyucu, klavye ve otomasyon için iki kontrol ayırt edilemez; onay kutusu da miktar/saat göstermiyor. Hasan doğru kaydı silmemek için vazgeçti. **Düzeltme:** etikete miktar+saat ekle. **Efor:** Küçük

### O2 — Teklif gönderiminin zorunlu alanı formda işaretli değil
Teklif "müşteri adresi" boşken sorunsuz kaydediliyor; kural ancak **üç adım
sonra**, onay penceresinde *"Teklifi göndermeden önce müşteri adresi girilmeli"*
diye öğreniliyor. **Düzeltme:** alanı formda zorunlu işaretle veya Gönder'i
pasifleştirip sebebini yaz. **Efor:** Küçük

### O3 — Tam kabul edilen PO "Bekleyen Teslimatlar"da kalmaya devam ediyor
`PO-2026-0003` 6/6 kabul edildi, PO "Tamamlandı" — ürün Stok sekmesinde hâlâ
*"6 adet, durum: pending"*, üstte **"Bekleniyor: 6"**. İki bağımsız tanık
(Kerem, Deniz). *"Bu ekrana bakan biri '6 adet daha yolda' sanabilir."*

🔧 **Kök neden (düzeltme turunda bulundu) — ürün kodu değil, SEED kusuru.**
`receive_po_lines` commitment'ı `WHERE po_line_id = v_line_id` ile kapatıyor
(`supabase/migrations/051_po_receive_rpc.sql:68`) ve `confirm_po` commitment'ı
`po_line_id` ile yaratıyor (`052:41`). Ama `src/lib/seed/seed-runner.ts:509`
commitment'ları **`po_line_id` olmadan** insert ediyor → mal kabul UPDATE'i hiç
eşleşmiyor, satır kalıcı olarak `pending` kalıyor. **Uygulamadan açılan PO'da
(draft → confirm → receive) zincir doğru çalışıyor.**
**Düzeltme:** seed commitment'ları PO satırlarına bağlanır + `find-test-data`'ya
yetim-commitment deseni (`po_line_id IS NULL AND status='pending'`) eklenir.
**Efor:** Küçük

### O4 — Teklif detayı ilk açılışta eski durumu ve AKTİF dönüştürme düğmesini gösteriyor
Liste "Kabul Edildi" derken detay "Gönderildi" gösterdi ve **"Kabul Et ve
Siparişe Dönüştür" düğmesi aktifti** — sipariş çoktan oluşmuştu. Sibel:
*"Biri yanlışlıkla tıklarsa ikinci bir sipariş yaratma riski var."*
🔧 **Kök (düzeltme turunda bulundu):** sayfada `if (quoteLoading)` yükleniyor
guard'ı **var** (`quotes/[id]/page.tsx:218`), yani ilk açılışta bayat durum
gösterilemez. Bayatlık **geri dönüşte** (tarayıcı Geri / bfcache) oluşuyor:
sayfa DOM'u eski state'iyle geri yükleniyor ve yeniden fetch tetiklenmiyor.
Sunucu tarafı korumalı — geçersiz geçiş `isValidQuoteTransition` ile reddedilir,
yani ikinci sipariş **oluşmaz**; kusur görsel/güven kaybı.
**Düzeltme:** `pageshow`/`visibilitychange` üzerinde yeniden fetch. **Efor:** Küçük

### O5 — Ürüne ikinci/alternatif tedarikçi tanımlanamıyor
"Tercihli tedarikçi" tek serbest metin alanı, üzerine yazıyor. Kerem:
*"0 stok + 68 gün gecikmiş sipariş + tek tedarikçi (60 gün temin süresi)
durumunda **tek-kaynak riskini sistemde hiç görünür kılamıyorum.**"* Tedarikçi
kartında teslim performansı da yok, fiyat geçmişi tek nokta. **Efor:** Büyük

### O7 — "Rapor indir" etiketi yaptığı işi anlatmıyor *(Nit'e indirildi)*
İki bağımsız tanık (Hasan, Sibel ×2 deneme): *"ne bildirim, ne yeni sekme, ne
ekranda görünür bir değişiklik."*
🔧 **Kök (düzeltme turunda bulundu):** düğme `window.print()` çağırıyor
(`src/app/dashboard/page.tsx:207`) ve **headless Chromium'da `window.print()`
no-op'tur** — yani "hiçbir şey olmuyor" kısmı **harness kusuru**, gerçek
tarayıcıda yazdırma penceresi açılır. Geriye kalan gerçek kusur küçük: düğme
*"Rapor indir"* diyor ama dosya indirmiyor, yazdırma açıyor.
**Düzeltme:** etiket *"Raporu yazdır / PDF"*. **Efor:** Küçük

### O8 — Haftalık/aylık üretim toplamı veren hiçbir görünüm yok
Dört ayrı denemede (Gün 1 ve Gün 5) haftalık/aylık üretim toplamı çıkarılamadı.
🔧 **Kapsam düzeltmesi:** *"yalnız 4 eski kayıt görünüyor"* kısmı büyük ölçüde
**simülasyon kurgusu** — sim'in beş günü aynı gerçek takvim gününde koştuğu için
tüm sim kayıtlarının `tarih`'i bugün; "Diğer Günlerin Kayıtları" da tanımı gereği
(`page.tsx:127`, `tarih !== seçili`) yalnız Haziran'ı gösterdi. Veri aslında
120 günlük pencerede geliyor (`productionFetchUrl`).
**Geriye kalan gerçek kusur:** ekran yalnız **gün** ekseninde çalışıyor; hafta/ay
toplamı veren bir görünüm yok, "Diğer Günler" listesi de gruplanmamış düz liste.
**Düzeltme:** dönem özeti (bu hafta / bu ay: adet + kalem) + diğer günlerin
tarihe göre gruplanması. **Efor:** Orta

### O6 — Üretimi girenin adı ekranda görünmüyor *(Düşük'e indirildi)*
İlk teşhis **yanlıştı** ("kaydedilmiyor, denetim izi yok"). `POST /api/production`
`entered_by`'ı **oturumdan, sunucu-otoriter** yazıyor (`route.ts:54`), ve
`girenKullanici: "Usta"` sabiti gövdeye hiç girmiyor (`data-context.tsx:548`) —
yani **denetim izi doğru.** Gerçek kusur iki yerde: (a) kaydettikten hemen sonra
UI'da beliren optimistic satır sahte `"Usta"` gösteriyor, (b) üretim listesinde
**"Giren" kolonu hiç yok** → kimin girdiği ekranda görünmüyor.
**Düzeltme:** sahte sabit kaldırılır + listeye Giren kolonu. **Efor:** Küçük

---

## DÜŞÜK

### D1 — Kaydetme bildirimi tutarsız çıkıyor
Deniz iki ayrı günde: düğme "Kaydediliyor…" oluyor, kayıt gerçekleşiyor ama
**"Kaydedildi" bildirimi bazen hiç çıkmıyor.** *"Kaydın olduğundan emin olmak
için listeye dönüp kontrol etmek zorunda kaldım."*

### D2 — "Önizle & PDF" → "Formu Düzenle" boş yeni teklif açıyor
`/dashboard/quotes/new`'e gidiyor, mevcut teklife değil. *"Dikkatsizce Kaydet
denirse yanlışlıkla boş/mükerrer teklif oluşabilir."*

### D3 — Onay penceresi metni sonuçla uyuşmuyor
Pencere *"taslak sipariş olarak oluşturulacak"* diyor; sipariş doğrudan
**"Onaylı" + rezerveli** çıkıyor. Deniz: *"Onay mekanizmasının gerçekten
çalışıp çalışmadığından emin olamadım."*

### D4 — Aktivite geçmişi ham kod gösteriyor
PO geçmişinde **`po_fully_received`** + çıplak UUID. *"Kullanıcıya gösterilmek
üzere hazırlanmamış gibi duruyor."*

### D5 — Eskime raporunda negatif bekleme günü
Ticari Eskimesi → `TGAV-150-DN150-WCB`: Son Satış = bugün, **Bekleme = "−1 gün"**.

### Nit
- Dashboard dönem düğmeleri (Bugün/Hafta/Ay/Çeyrek) hiçbir rakamı değiştirmiyor (Hasan)
- Stok & Ürünler "Riskli (2)" sekmesi tabloyu filtrelemiyor (Hasan)
- 24 uyarının düz listesi yok, yalnız takvim; "Stok 4" filtresi hiçbir şey göstermiyor (Hasan, Sibel)
- Uyarılar takviminde aynı filtre iki kez basılınca farklı gün seti (Hasan)
- Test artığı canlıda: "mrz"/"sagsage" teknik şablonu **aktif ve seçilebilir**; `Test Müşterisi <timestamp>` kayıtları "Son Siparişler" panelini dolduruyor; bir teklifte müşteri adı "mirza"
- Menşei ülke serbest metin ("TR" vs "Türkiye") → ülkeye göre rapor güvenilmez
- Aynı ürün için hem "Malzeme Kalitesi" hem "Gövde Malzemesi"; senkron garanti değil
- `TGAV-150-DN150-WCB` "Ticari" tipli ama tercihli tedarikçisi **kendi fabrikamız**
- Teklifler tarih filtresi kutularının **erişilebilir adı yok** ("(etiketsiz)")
- Üretim ekranı satılabilir stoğu **"Mevcut stok"** diye adlandırıyor → Hasan iki kez "hangisi gerçek sayı" diye sordu (48 vs 30)
- Bazı PO'da aktivite geçmişi var, bazısında hiç yok — tutarsız
- Süreç çubuğunda aşama başına tarih/saat yok, yalnız "Oluşturulma"
- `PO-2026-0004` notu kısmi teslim diyor, satırlar 100/100 ve 300/300 tam gösteriyor

---

## Veri modeli boşlukları (mühendis raporu)

Kerem'in giremediği, ürün kartında yeri olmayan teknik alanlar:

| Alan | Neden gerekli | Kanıt |
|---|---|---|
| **Yüz tipi (RF / FF / RTJ)** | Flanşlı bağlantının eşleşme bilgisi | Referans üründe biri *Malzeme* kutusuna **"A216 WCB, RF, flex wedge OS&Y"** yazmış — alan olmadığı için serbest metne sıkıştırılmış |
| **Mil/yapı tipi (OS&Y / NRS)** | Gate vanada temel sınıflandırma | aynı kanıt |
| **Malzeme test sertifikası (EN 10204 3.1 / 3.2)** | *"Müşterinin en sık istediği belge"* | Onaylar listesinde CE/PED/API var, 3.1–3.2 yok |
| **Kama/disk alt tipi** (solid/flex/split wedge) | Vana Tipi yalnız genel tip veriyor | — |

Ayrıca: **"Standartlar" iki ayrı alan** (Genel'de serbest metin, Teknik
Şablon'da çoklu-seçim) ve birbirini yansıtmıyorlar; **"API 600" hem Onaylar hem
Standartlar listesinde** — Kerem yanlışlıkla sahip olunmayan bir sertifikayı
işaretledi, fark edip geri aldı. *"Fark etmeseydim, ürünün sahip olmadığı bir
sertifikayı sisteme işlemiş olacaktım."*

---

## §4 — Elenen bulgular (gerekçeli)

Sessizce düşürülmedi; her biri neden bulgu olmadığıyla birlikte duruyor.

| Ham bulgu | Verdi | Gerekçe |
|---|---|---|
| **"Teknik/Stok/Tedarik sekmelerine girilemiyor"** (Kerem, Gün 1) | ❌ **Harness kusuru** | `tikla` hedefi tüm sayfada arıyordu; "Teknik" sorgusu sol menüdeki **"Teknik Şablonlar" bağlantısıyla** eşleşip sekmeden önce kazanıyordu. Düzeltildi (ana içerik + sekme rolü önceliği), yeniden denendi, sekmeler çalışıyor. Kerem'in girdiği teknik veri de doğru kaydolmuş (DN 200mm · 300LB · Sürgülü · Flanşlı · WCB). |
| **"Gönder onay penceresindeki hiçbir kontrol tıklanamıyor"** (Deniz, Gün 2) | ❌ **Harness kusuru** | Yukarıdaki düzeltmenin yan etkisi: modal `main` dışında açılıyor, aynı etiketli **arkadaki** düğme seçilip pencerenin altında kaldığı için tıklama düşüyordu. Modal-farkında hedefleme eklendi. **Altından gerçek bulgu çıktı → O2.** |
| **"Teklif Hattı $878, oysa teklif ₺42.240"** (Sibel, Gün 1) | ❌ **Yanlış pozitif** | **42.240 ÷ 878 = 48,11** — 2026 için makul bir TRY/USD kuru. `quotePipelineView` (`dashboard-view-model.ts:485`) `toReporting()` ile doğru çeviriyor. **Gerçek bulgu Sibel'in ikinci cümlesi:** dashboard hangi para birimini/kuru kullandığını hiçbir yerde yazmıyor → doğrulanamıyor. Aşağıya taşındı. |
| **"Sil düğmesi hep +8'i gösteriyor"** (Hasan, Gün 2) | ⚠️ **Kısmen harness** | "Hep aynısını gösteriyor" kısmı `tikla`'nın ilk eşleşmeyi seçmesinden. Ama **iki düğmenin erişilebilir adı birebir aynı** — bu gerçek → **O1**. |
| **"Takvim 29 Ağustos Cumartesi diyor, bugün Çarşamba"** (Hasan, Gün 3) | ❌ **Simülasyon kurgusu** | Gerçek tarih 29 Ağustos Cumartesi. Hafta günleri senaryonun uydurması; uygulama doğru tarihi gösteriyor. |
| **"Açık Alacak kartı yok"** (Sibel, Gün 5) | ❌ **Beklenen** | Kart Paraşüt'ün tahsilat verisine bağlı (`dashboard-view-model.ts`, `input.receivables != null` koşullu); Paraşüt kapalı teslim ediliyor. *Sibel'in ikinci cümlesi geçerli ve **Y6**'ya taşındı.* |
| **"Tarih kutusuna yazınca 0024-08-29 oluyor"** (Hasan, Gün 5) | ⚠️ **Muhtemelen harness** | Yerel tarih kutusuna karakter karakter yazmanın bilinen davranışı; insan takvimden seçer. **Ama** kutuların etiketsiz olması gerçek → Nit. |
| **"Sevk düğmesi yok"** (Deniz, Gün 3) | ✅ **Doğru davranış** | `ship_sales_orders` yetkisi satışta değil, üretim + yöneticide. Rol duvarı tasarlandığı gibi çalışıyor. *Ama sevkin kimde olduğunu ekranın söylememesi Nit olarak kaldı.* |

### Elenenden türeyen gerçek bulgu

**Kur şeffaflığı yok.** Dashboard tek para biriminde toplam gösteriyor ama
**hangi para birimi ve hangi kur** hiçbir yerde yazmıyor; Ayarlar → Firma
Profili'nde yalnız "Varsayılan Para Birimi" seçici var, kur tablosu yok. Sibel:
*"Mali işler için kur şeffaflığı olmadan bu rakamlara tam güvenemem."* Açık
siparişlerin 5'i USD, 2'si TRY, 2'si EUR. **Efor:** Küçük (kartın altına
"USD · TCMB 29.08.2026" gibi bir satır)

**Stok Değeri farkı — açık soru.** Sibel elle $331.120 hesapladı, kart $329K
gösterdi (~%0,6). Negatif satılabilir stoğun özet toplamda sıfırlanıp listede
eksi gösterilmesi de doğrulanmalı. Rakam küçük ama muhasebe kuruş tutar
istiyor; **ayrı bir kontrol turu gerekiyor.**

---

## Sistemin doğru çalıştığı yerler (kayda geçti)

- **Teklif → sipariş para zinciri birebir tuttu.** Ara Toplam $28.000 · KDV %20 $5.600 · Genel Toplam $33.600, satır kalemi (10 × $2.800) — teklif ve siparişte aynı; liste tutarı = detay tutarı. Sibel: *"Bu dört rakamda ve satırda sorun yok."*
- **Rezervasyon doğru çalıştı.** Teklif gönderilince satılabilir 30 → 20 düştü, tam 10 adet. Deniz: *"Bu adım söylediği gibi çalıştı."*
- **Öneri motoru doğru tepki verdi.** Sipariş sonrası satılabilir (20) min stoğun (25) altına düşünce `TGAV-150` için "25 adet — Yakında" önerisi belirdi.
- **RFQ doğru tedarikçiyi öneriyor.** Ürün seçilince China Langge otomatik "Önerilen" işaretlendi.
- **RBAC gerçekten uygulanıyor.** Hasan'ın menüsünde Teklifler/Cariler/PO yok; ciro ve stok değeri yerine *"görüntüleme yetkiniz yok"* görüyor; sevk düğmesi satışta yok.
- **Cariler "Toplam Gelir" doğru.** Star Rafineri $134.400 ve Botaş ₺350.400 siparişlerle **birebir örtüştü**; yalnız onaylanmış siparişler sayılıyor (iptal/bekleyen hariç).
- **Eskime Raporu anlaşılır ve doğru okunuyor.** Bağlı sermaye hem toplamda hem satırda görünüyor; imalat/ticari ayrımı, Yavaş/Durgun/Hareket Yok/Ölü bantları çalışıyor.
- **Mal kabul stoğa doğru yansıdı.** 6/6 kabul → `INS-GPR-DN100` stok arttı, PO Tamamlandı.

---

## §5 — Düzeltme turu (2026-08-29)

Doğrulama turunun ardından **tüm bulgular kapatıldı.** Aşağıda ne yapıldığı ve
düzeltmenin nerede olduğu; teşhisi değişenler §0'da.

| Bulgu | Durum | Düzeltme |
|---|---|---|
| **K1** müşterisiz sipariş | ✅ | `quote-validation.ts` gönderim öncesi `customer_id` şart (kural **rezervasyondan önce** kırılır) + QuoteForm inline "Yeni cari oluştur" + sipariş detayında **"Cariye bağla"** onarım yolu (`serviceLinkOrderCustomer`) |
| **K2** tedarikçi fatura künyesi | ✅ | Mal kabul formuna fatura no + tarih; **sessiz kayıp kapatıldı** (`invoiceWarning` → uyarı toast'ı, mig.107 uygulanmasa da doğru davranır); tamamlanmış PO'da sonradan düzeltme dalı (draft kısıtının dışında) |
| **K3** stok sayımı ekranı | ✅ | YENİ `POST /api/inventory/recount` (mevcut `recount_stock` RPC'si) + ürün detayında "Sayım / Stok Düzelt" (sistem/sayılan/fark/neden) |
| **Y1** iptal → "bulunamadı" | ✅ | `finally` kaldırıldı (quotes+orders), iptalde state'e dokunulmuyor; **"yüklenemedi" ayrı mesaj + Yeniden dene**; aynı sınıf `settings`'te iki blokta daha bulundu ve düzeltildi |
| **Y2** mükerrer üretim kaydı | ✅ | Kaydetmeden önce aynı ürün/gün kontrolü → onay penceresi ("yeni kayıt EKLENİR, güncellenmez") |
| **Y3** hurda/fire | ✅ | **Asıl kök taşıma katmanıydı** (§0): `data-context` gövdesine `scrap_qty`+`waste_reason`; forma hurda + fire nedeni; listede Hurda kolonu ve fire oranı |
| **Y4** RFQ notu | ✅ | Detayda "Teknik Şartname / Notlar" bölümü (belge zaten taşıyordu) |
| **Y5** uyarı tazeliği | ✅ | Aktif stok uyarısının metni okuma anında tazeleniyor (`dbUpdateActiveAlertContent`) **+ ikinci kök**: mal kabul sonrası tarama göreli URL yüzünden hiç koşmuyordu → YENİ `alert-scan-runner` (route ve mal kabul aynı koşucuyu çağırır, lock korunur) |
| **Y6** cari yansımıyor | ✅ | K1 ile birlikte; ayrıca sipariş detayında cari **tıklanabilir link** |
| **O1** ayırt edilemeyen silme | ✅ | `aria-label` → ürün · adet · saat; onay penceresi de hangi kaydı sorduğunu söylüyor |
| **O2** adres zorunluluğu | ✅ | Formda `*` + `aria-required` + inline uyarı; Gönder düğmesi eksik varken pasif ve **sebebini** yazıyor |
| **O3** bekleyen teslimat | ✅ | **Seed kusuruydu** (§0): taahhütler artık PO satırına bağlı (`po_line_id`), bağlanamayan açık taahhüt seed'i patlatır; `find-test-data`'ya **yetim taahhüt** tespiti — canlıda **2 yetim** anında yakalandı |
| **O4** bayat teklif durumu | ✅ | `pageshow`/`visibilitychange` ile yeniden fetch (bfcache) |
| **O5** tek-kaynak riski | ✅ (kısmi) | YENİ `POST /api/product-vendor-links` + ürün Tedarik sekmesinde "Tedarikçiler" paneli (tek tedarikçide uyarı); `preferred_vendor_id` **ilk kez UI'dan yazılıyor**. **Teslim performansı ertelendi** (kullanıcı kararı) |
| **O6** giren kullanıcı | ✅ | Sahte `"Usta"` kaldırıldı, listeye **Giren** + **Saat** kolonları (denetim izi zaten doğruydu — §0) |
| **O7** "Rapor indir" | ✅ | Etiket → **"Raporu yazdır / PDF"** (davranış aynı; "hiçbir şey olmuyor" harness kusuruydu — §0) |
| **O8** üretim geçmişi | ✅ | Hafta/ay **dönem özeti** (adet · kalem · hurda · fire %) + diğer günler tarihe göre gruplu, gün toplamlı |
| **D1** kaydetme bildirimi | ✅ | Zamanlayıcı sızıntısı: üst üste kayıtta önceki `setTimeout` yeni bildirimi siliyordu → ref ile iptal + unmount temizliği |
| **D2** "Formu Düzenle" | ✅ | Snapshot `quoteId` taşıyor → kaydedilmiş teklife döner |
| **D3** onay metni | ✅ | "taslak sipariş" → **"ONAYLI sipariş"** + rezervasyon devri yazılıyor (088 gerçeği) |
| **D4** ham aktivite kodu | ✅ | Sözlük `purchase-order-ui.ts`'e taşındı; **`po_fully_received` haritada yoktu** (RPC onu yazıyor) → eklendi; çıplak UUID → "Sistem" |
| **D5** negatif bekleme günü | ✅ | Yerel takvim günü + taban 0 (UTC ayrışması, Y6 sınıfı) |
| **Kur şeffaflığı** | ✅ | KPI şeridi altında "Tutarlar USD cinsinden · TCMB 29.08.2026 · 1 USD = 48,11 ₺" |
| **Nit — etiketsiz tarih filtresi** | ✅ | Teklifler + **Siparişler** (aynı kusur oradaydı ama sim görmedi) + RFQ `label htmlFor` |

**Doğrulama:** tsc 0 · lint 0 · **455 dosya / 6204 test** · build 0 · migration YOK.
Yeni testler: `sim-tur1..4-fixes.test.ts` (101 test). Mevcut 19 test sözleşme
değişikliği nedeniyle güncellendi (gönderim artık cari ister; tarama kompozisyonu
koşucuya taşındı; üretim listesi kolonları değişti) — hiçbiri gevşetilmedi.

### Bu turda kapatılmayanlar

- **O5 teslim performansı** — tedarikçi kartında zamanında-teslim oranı /
  ortalama gecikme. Kullanıcı kararıyla ertelendi.
- **Veri modeli boşlukları** (yüz tipi RF/FF/RTJ · mil tipi OS&Y/NRS · EN 10204
  3.1/3.2 · kama alt tipi) — kod değil **konfigürasyon**: Ayarlar → Ürün Tipleri
  alan editöründen eklenir. "Standartlar"ın iki ayrı yerde durması da orada
  tekilleştirilir.
- **Test artığı temizliği** — `npm run find-test-data` 32 şüpheli listeliyor
  (30 test artığı + 2 yetim taahhüt). Silme kullanıcı kararı.
- **mig.107 APPLY** — fatura künyesi kolonları canlıda yok; ekran çalışır ve
  yazamadığında **uyarır**, ama künye ancak migration sonrası kalıcı olur.
