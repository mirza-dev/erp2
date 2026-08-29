# Gün 1 — Pazartesi · ham raporlar

> Çalışanların kendi ağzından, **değiştirilmeden**. Doğrulama Faz 4'te,
> `docs/sim/<tarih>-sim-bulgular.md` dosyasında yapılır.

---

## Deniz Arslan — satış ve satın alma

### Günün işi
- Teklifler bölümüne girdi, açık teklif durumunu çıkardı: 16 teklif (6 taslak,
  1 gönderildi, 3 kabul, 1 red, 1 süresi dolmuş, 4 revize). Yanıt bekleyen tek
  teklif `TKL-2026-010` (Botaş, ₺42.240,00, 13 Haziran'da gönderilmiş).
- `TKL-2026-014` taslağını inceledi.
- İki yeni teklif oluşturdu ve kaydetti:
  - `TKL-2026-015` — SIM Akdeniz Enerji — 10 × `TGAV-150-DN150-WCB` — birim $2.800 — genel toplam **$33.600,00**
  - `TKL-2026-016` — SIM Petkim Rafineri — 4 × `FWBV-DN400-PN80-PH` — birim $6.500 — genel toplam **$31.200,00**
- Yarım kalan iş yok. İkisi de taslak bırakıldı (görevde "gönder" istenmemişti).

### Takıldıkları

**D1 — Teklif detayı önce "bulunamadı" diyor, sonra kendiliğinden düzeliyor**
- Ne yapmaya çalıştı: Teklifler listesinde `TKL-2026-014` satırına tıklayıp detayı açmak
- Ne bekliyordu: düzenleme ekranının doğrudan açılmasını
- Ne oldu: sayfa **"Teklif bulunamadı. Geri dön"** yazısıyla açıldı, içerik gelmedi. Birkaç saniye beklenince — hiçbir şeye tıklamadan — sayfa kendiliğinden doğru içerikle yüklendi.
- Tekrar: Teklifler → `TKL-2026-014` satırına tıkla → ilk açılışta "Teklif bulunamadı" → birkaç saniye sonra düzeliyor
- Etki: **yavaşlattı** — "teklif silinmiş/bozulmuş" sandı

**D2 — Kaydetme bildirimi bazen çıkmıyor (kayıt yine de oluyor)**
- Ne yapmaya çalıştı: ikinci teklifi (`TKL-2026-016`) kaydetmek
- Ne bekliyordu: ilk teklifteki gibi "Kaydedildi" bildirimini
- Ne oldu: düğme "Kaydediliyor…" durumuna geçti, **bildirim hiç görünmedi**, ama kayıt gerçekleşti (numara atandı, listede doğru göründü)
- Tekrar: Yeni teklif formunda Kaydet'e bas; bildirim bazen çıkıyor bazen çıkmıyor
- Etki: **rahatsız etti** — kaydın olduğundan emin olmak için listeye dönüp kontrol etmek zorunda kaldı

### Aklına takılanlar

- **`TKL-2026-014` müşterisiz.** Firma adı, kişi, telefon, e-posta, adres hepsi boş. **$29.912,40'lık bir teklif kime ait belli değil.**
- **`TKL-2026-013` de aynı:** müşterisi boş, tutarı ₺0,00. Yarım kalmış taslak.
- **Katalog dışı ürün:** `TKL-2026-014`'ün 3. kaleminde `TANK-CS-60M3` — "Çelik Tank V=60 m³ Yatay Karbon Çelik". *"Biz vana/flanş/fitting/conta satıyoruz, tank bizim sattığımız bir şey değil."* Aynı kalemde ayrıca **"Stok yetersiz — −2 adet verilebilir (Stokta 0, Tekliflerde 2)"** uyarısı var.
- **Not ile kayıt uyuşmuyor:** aynı teklifin notunda *"Rev 2 — müşteri adet artırdı, birim fiyat güncellendi"* yazıyor ama `TKL-2026-014` numarasında revizyon eki (R2, R3) yok, tekil taslak olarak duruyor.
- **Geçerlilik kolonu ve süresi dolma:** Haziran tarihli tüm tekliflerde "Geçerlilik" boş; bugün açılan iki yeni teklifte "29 gün kaldı" yazıyor. **`TKL-2026-010` (Gönderildi, 13 Haziran) 30 günlük kurala göre çoktan dolmuş olmalıydı ama hâlâ "Gönderildi" durumunda**, "Süresi Doldu" işaretlenmemiş.
- **Stok yetersizlik mesajı canlı güncellenmiyor:** `FWBV-DN400-PN80-PH` için adet 3→4 değiştirildiğinde uyarı metni aynı kaldı ("−1 adet verilebilir"). İşi engellemedi.

---

## Hasan Çelik — üretim vardiya sorumlusu

### Günün işi
- Hafta sonu üretimini girdi: `TGAV-150-DN150-WCB` **20 adet**; hurdaya çıkan
  1 adedi **nota yazdı** (ayrı alan bulamadı). Sistem *"20 adet üretim
  kaydedildi, stok güncellendi"* dedi.
- Stok ekranına baktı, en riskli iki kalemi çıkardı.
- Geçen ayın üretim raporunu **üç ayrı yerden aradı, bulamadı** — yarım kaldı.

### Takıldıkları

**H1 — Ürün seçimi ne kodla ne adla tutuyor, tam metin şart**
- Ne yapmaya çalıştı: Üretim Girişi'nde ürünü seçmek — önce sadece kod (`TGAV-150-DN150-WCB`), sonra sadece ad (`TGAV Gate Vana Class 150 DN150 WCB`)
- Ne oldu: **ikisinde de "bulamadım"**. Listede tam o yazı duruyordu; ancak `kod + tire + ad` birleşimini harfiyen yazınca seçebildi.
- Tekrar: Üretim Girişi → satırdaki "Ürün seç…" kutusu → sadece kod ya da sadece ad tutmuyor
- Etki: **yavaşlattı** (3. denemede oldu)

**H2 — Hurda/fire alanı yok; stok tam miktarda artıyor**
- Ne bekliyordu: ayrı bir "hurda / fire" kutusu
- Ne oldu: **öyle bir alan yok** — yalnız "Adet" ve serbest "Not". Üretilen 20'yi Adet'e, hurdayı Not'a yazdı. Kaydedince **stok tam 20 arttı, hurda düşülmedi.** *"Ben yazmasam hiçbir yerde görünmeyecekti."*
- Etki: **rahatsız etti** — ama *"Adet'e 20 mi 19 mu yazmam gerektiğinden emin olamadım, doğrusu bu mu bilmiyorum."*

**H3 — "Riskli (2)" sekmesi tabloyu filtrelemiyor**
- Ne oldu: üstteki sayaç "2 riskli" oldu ama **tablo yine 20 ürünün hepsini gösterdi.** Hangi 2 tanesi olduğunu elle "Stok"/"Satılabilir" sütunlarına bakarak bulmak zorunda kaldı.
- Tekrar: Stok & Ürünler → "Riskli" sekmesi
- Etki: **rahatsız etti**

**H4 — "Rapor indir" hiçbir şey yapmıyor**
- Ne bekliyordu: dosya inmesi ya da en azından bir bildirim
- Ne oldu: **hiçbir bildirim çıkmadı, ekranda hiçbir şey değişmedi.** *"İndi mi inmedi mi anlayamadım."*
- Tekrar: Dashboard → sağ üst "Rapor indir"
- Etki: **durdurdu** — görevi tamamlayamadı

**H5 — Dönem düğmeleri (Bugün/Hafta/Ay/Çeyrek) hiçbir rakamı değiştirmiyor**
- Ne oldu: "Ay"a bastı, **hiçbir sayı değişmedi**, hangi ayı gösterdiği anlaşılmadı
- Etki: **yavaşlattı**

**H6 — Üretim geçmişinde yalnız 4 kayıt, sayfalama yok**
- Ne oldu: "Diğer Günlerin Kayıtları" tablosunda **yalnız 4 kayıt**, hepsi Haziran (13, 13, 11, 8). Temmuz'dan hiçbir kayıt yok, "daha fazla göster" düğmesi de yok.
- Etki: **durdurdu** — geçen ayın raporunu bulamadı

### Patrona ilettiği stok durumu
- `TANK-CS-60M3` (Çelik Tank 60 m³): stok **0**, satılabilir **−2**. *"Karşılığı olmayan bir söz/sipariş var gibi duruyor."*
- `FWBV-DN400-PN80-PH`: stok **3**, olması gereken en az 4, satılabilir **−1**. Tedarikçiden geliyor, sistem "Acil" işaretlemiş.
- **Şüpheli öneri:** listede 400 adet dirsek isteniyordu ama *"o ürünün deposunda 640 adet olduğunu, sınırın sadece 150 olduğunu gördüm — bol stok varken neden istendiğini çözemedim."* Bu yüzden patrona iletmedi.

### Anlamadıkları
- Üretim Girişi'nde ürün seçilince **"Mevcut stok: 10 adet"** yazdı, ama Stok & Ürünler'de aynı ürünün üretim öncesi stoğu **18** olmalıydı. *"'Mevcut stok' hangi sayıyı gösteriyor çözemedim."*
- Satın Alma Önerileri'ndeki adetlerin nereden çıktığını anlamadı; *"liste sayfayı her açışımda biraz değişiyordu, bir ürün hiç dokunmadan listeye eklendi."*
- **"Satılabilir" sütununun ne demek olduğunu bilmiyor** — stok 0'ken −2 yazması kafasını karıştırdı.
- **"Riskli (AI)" etiketinin** ne hesapladığını bilmiyor.

---

## Sibel Toprak — mali işler

### Günün işi
Dashboard'ın 7 özet kartını ve Kritik Uyarılar panelini okudu. 29 siparişin
tamamını tarayıp 9 açık siparişi (Onaylı 7 + Bekleyen 2) tutar/para birimiyle
tek tek çıkardı. 16 teklifin durum dağılımını çıkardı, tek "Gönderildi" teklifin
KDV'sini doğruladı. 7 PO'yu ve 20 ürünün tamamını inceledi, Stok Değeri'ni
**elle hesaplayıp** dashboard'la karşılaştırdı. İstenen 4 gecikmiş siparişin
(0005/0008/0010/0018) Ara Toplam / KDV / Genel Toplam hesabını satır satır
doğruladı — **dördü de kendi içinde ve listeyle tutarlı, sorun yok.**

Yarım kalan: Uyarılar takvim görünümünden "Sipariş" kategorisindeki 8 uyarının
dökümü çıkarılamadı; "Yoldaki Mal" kartındaki *"2 tanesi gecikmede"* ifadesinin
ikinci PO'su teyit edilemedi.

### Tutmayan rakamlar

**S1 — Teklif Hattı kartı $878, tek gönderilmiş teklif ₺42.240,00**
- Dashboard → Teklif Hattı: **"$878" · "1 teklif"**
- Teklifler → Gönderildi (1) → `TKL-2026-010` (Botaş): **Genel Toplam ₺42.240,00** (Ara Toplam ₺35.200 + KDV %20 ₺7.040 — *kendi içinde doğru*)
- Fark: **sayı tutuyor (1=1), tutar tutmuyor.** *"$878 ile ₺42.240,00 arasında makul hiçbir kur ile örtüşme yok (o kur ₺48'e gelir ki gerçekçi değil). Dashboard'da hangi para biriminin/kurun kullanıldığı hiçbir yerde yazmıyor."*
- Tekrar: Teklifler → "Gönderildi (1)" → `TKL-2026-010`

**S2 — Stok Değeri "Satılabilir $251K" vs elle toplam $215.967,20**
- 20 satırın `Satılabilir × Fiyat` çarpımı: **$215.967,20** (negatifler dahil: `TANK-CS-60M3` −2, `FWBV-DN400-PN80-PH` −1 — liste bunları eksi gösteriyor)
- Fark: **~$35K düşük.** *"Negatif iki kalemi sıfır kabul edip yeniden toplarsam $250.367,20 çıkıyor ki bu $251K'ya çok yakın — yani sistem muhtemelen negatif satılabilir stoku toplamda sıfırlıyor ama ürün satırında hâlâ eksi gösteriyor; **iki ekran farklı mantık kullanıyor** gibi."*
- Ayrıca: 20 üründen 19'u USD, 1'i (`INS-GPR-DN100`) **EUR** fiyatlı; kur bilgisi hiçbir yerde yok, ham sayı olarak toplandı.

**S3 — Stok Değeri "$329K" vs elle toplam $331.120,00**
- `Stok × Fiyat` çarpımı: **$331.120,00** → **~$2.120 fark**, tam oturmuyor. S2 ile aynı kök nedene (EUR fiyatlı ürün + görünmeyen kur) bağlı olabilir.

### Takıldıkları

**S4 — Üç para birimi karışık, kur hiçbir yerde görünmüyor**
- 9 açık siparişten 5'i USD ($150.069,60), 2'si TRY (₺211.440,00), 2'si EUR (€5.068,80). 3 açık PO'da da aynı durum.
- **Ayarlar → Firma Profili'nde yalnız "Varsayılan Para Birimi" seçici var; kur tablosu/oranı hiçbir yerde yok.**
- *"Mali işler için kur şeffaflığı olmadan bu rakamlara tam güvenemem."*
- Etki: **rahatsız etti** (durdurmadı)

**S5 — Uyarılar sayfası takvim görünümünde, düz filtreli liste yok**
- Ne bekliyordu: tutar/tarihle filtrelenebilir düz liste
- Ne oldu: sayfa takvim görünümünde açılıyor; "Sipariş 8" filtresine tıklayınca **günlere dağılmış ikonlar dışında döküm çıkmadı**
- Etki: **yavaşlattı** — dashboard'daki 4 isimli gecikmiş sevkiyata güvenerek devam etti

### Aklına takılanlar
- **Test artığı paneli dolduruyor:** "Son Siparişler" ve sipariş listesinin üst sıraları `Test Müşterisi 1781860236472` gibi 7-8 kayıtla dolu (çoğu Taslak/İptal, $120); bir teklifte müşteri adı **"mirza"** (`TKL-2026-009`). Toplamları etkilemiyorlar ama *"gerçek son işlemleri görmek için doğrudan listeye gitmek gerekiyor."*
- **Donmuş totaller — hata değil:** `ORD-2026-0018` ve `0010`'da satır birim fiyatları güncel katalogdan farklı (`GV-600-DN20-A105-STL` katalog $195, siparişte $188). *"Sipariş notunda 'totaller teklif anından donduruldu' yazıyor — kasıtlı görünüyor, sadece bilginize."*
- `ORD-2026-0005` **"Onaylı"** ama diğer gecikmişlerin aksine (0008 Kısmi Rezerve, 0010/0018 Rezerveli) **Lojistik'te rezervasyon rozeti yok.**

---

## Kerem Aydın — makine mühendisi

### Günün işi
`SIM-TGAV-300-DN200-WCB` ürün kartını açtı. Teknik Şablon olarak "Vana"yı seçti,
16 alanlık teknik bloktan **4 zorunlu alanın hepsini** doldurdu (DN=200mm,
PN/Sınıf=300LB, Bağlantı Tipi=Flanşlı, Gövde Malzemesi=WCB) + Vana Tipi=Sürgülü.
Standartlar'da ASME B16.34'ü işaretledi. Kimlik Bilgileri'ni doldurdu, ürün
notlarına **varsayımlarını açıkça yazdı**. Ürün oluştu. Teknik Şablonlar
sayfasını inceledi, referans ürün `TGAV-150-DN150-WCB` ile karşılaştırdı.

Yarım kalan: Min. Stok Seviyesi değiştirilemedi (0'da kaldı); ürün detayındaki
**"Teknik" sekmesine hiç girilemedi** → girdiği DN/PN/bağlantı/malzeme verisinin
kaydedildiği gözle teyit edilemedi.

### Takıldıkları

**K1 — Ürün detayında Teknik / Stok / Tedarik sekmelerine hiç girilemedi**
- Ne oldu: her tıklamada **sol menüdeki** "Teknik Şablonlar" / "Stok & Ürünler" / "Tedarikçiler" sayfasına attı; sayfa içi sekme hiç açılmadı.
- Kendi teşhisi: *"Sekme adı sol menüdeki bir bağlantının içinde geçtiği için tıklama hep menüye gidiyor."*
- Etki: **durdurdu** — 6 sekmenin yarısına girilemedi
- 🔧 **Patron notu — büyük ihtimalle harness kusuru.** `tikla` fiili hedefi ararken sırayı `düğme → bağlantı → sekme` olarak deniyor ve tüm sayfada arıyor; "Teknik" sorgusu sol menüdeki "Teknik Şablonlar" **bağlantısıyla** eşleşip sekmeden önce kazanıyor. Gün 2 öncesi düzeltildi (önce ana içerik, sekme rolü bağlantıdan önce). **Doğrulama turunda yeniden sınanacak.**

**K2 — Standartlar düğmesine bastıktan sonra formun üst yarısı erişilemez oldu**
- Ne oldu: "Min. Stok Seviyesi" alanına 3 kez yazılmaya çalışıldı, "bulamadım" hatası — *"oysa `bak` ekranında alan hâlâ görünüyordu, değeri 0 idi."* Formun üstündeki **tüm temel alanlar** (Ürün Adı, SKU, Kategori, Birim Fiyat, Para Birimi, Birim, Başlangıç Stoğu, Min. Stok, Ürün Tipi, Depo) aynı anda erişilemez hale geldi; Kimlik Bilgileri ve Teknik Şablon alanları etkilenmedi.
- Tekrar: Yeni Ürün → Teknik Şablon seç → alanlar yüklendikten **sonra** Standartlar/Onaylar listesinde bir düğmeye tıkla → formun üst kısmı `yaz`/`sec` ile bulunamıyor
- Etki: **yavaşlattı** — Min. Stok 0'da kaldı

**K3 — İki ayrı "Standartlar" alanı, birbirini yansıtmıyor**
- Teknik Şablon'un **çoklu-seçim** Standartlar listesinden ASME B16.34 işaretlendi → ürünün **Genel** sekmesinde Standartlar **"—" (boş)** çıktı.
- Düzenle modunda görüldü: Genel sekmesindeki Standartlar **tamamen ayrı, serbest metin** bir alan; çoklu-seçim listesiyle **hiç bağlantısı yok**. Elle yazınca göründü.
- *"Aynı isimli iki 'Standartlar' alanı var, hangisi esas belli değil, elle senkronlamak zorunda kaldım."*

**K4 — "API 600" hem Onaylar hem Standartlar listesinde; yanlış olan işaretlendi**
- Ne oldu: Standartlar'daki API 600 işaretlenmek istendi, **Onaylar (sertifika) grubundaki aynı isimli düğme işaretlendi** — ekran görüntüsüyle doğrulandı.
- *"Fark etmeseydim, ürünün sahip olmadığı bir sertifikayı sisteme işlemiş olacaktım."* Geri alındı; Standartlar'daki API 600'e hiç erişilemedi.
- 🔧 **Patron notu:** tıklamanın ilkini seçmesi harness'tan; ama **aynı ekranda aynı etiketli iki kontrol bulunması** uygulamanın kendi belirsizliği ve gerçek risk taşıyor. Doğrulama turunda ikisi ayrılacak.

### Giremediği teknik bilgiler
- **Yüz tipi (RF / FF / RTJ)** — flanşlı bağlantının en kritik eşleşme bilgisi. "Bağlantı Tipi" seçeneklerinde yok (Flanşlı/Kaynaklı/NPT/SW/BSP/Diş/Butt-Weld/Tri-Clamp var). **Kanıt:** referans ürün `TGAV-150-DN150-WCB`'nin *Malzeme* alanına biri elle **"A216 WCB, RF, flex wedge OS&Y"** yazmış — gerçek alan olmadığı için malzeme kutusuna sıkıştırılmış.
- **Mil/yapı tipi (OS&Y / NRS)** — gate vanada temel sınıflandırma, şablonda alan yok. Aynı kanıt.
- **Malzeme test sertifikası (EN 10204 3.1 / 3.2)** — *"endüstriyel vana siparişlerinde müşterinin en sık istediği belge"*; ne Onaylar'da (CE, PED, API var) ne başka yerde.
- **Kama/disk alt tipi** (solid / flex / split wedge) — Vana Tipi yalnız genel tip veriyor.
- Ağırlık (kg) alanı var ama hem yeni üründe hem referansta boş *(veri elde yok, sistem eksikliği değil)*.

### Aklına takılanlar
- **Test artığı şablon canlıda seçilebiliyor:** Teknik Şablonlar'da **"mrz"** adlı, açıklaması **"sagsage"** olan, **0 alanlı** bir şablon **Aktif** ve Yeni Ürün formunda seçilebiliyor. *"Biri yanlışlıkla seçerse hiçbir teknik alan gelmiyor."*
- **Ürün tipi tutarsızlığı:** `TGAV-150-DN150-WCB` "Ticari" (dışarıdan tedarik), Üretim Tesisi boş; ama Tedarikçiler'de "PMT Suluova Fabrikası" ayrı bir tedarikçi olarak var. Yeni DN200 kartını "İmalat" açtı. *"Aynı ürün ailesi aynı mantıkla izlenmeli."* Bilerek düzeltmedi.
- **Menşei Ülke serbest metin:** referansta "TR", kendisi "Türkiye" yazdı. *"Standart liste/kod olmadığı için ülkeye göre filtreleme/rapor güvenilir olmaz."*
- Hem genel **"Malzeme Kalitesi"** hem şablona özel **"Gövde Malzemesi"** var; ikisine de WCB yazdı, *"senkron tutulacağı garanti değil."*
- Birim Fiyat 0 bırakıldı — *"sıfırın teklif/siparişe 'ücretsiz' gibi yansıyıp yansımayacağını bilmiyorum."*
- Hiçbir işlem yapmadığı sırada `TGAV-150-DN150-WCB` stoğu **18/10 → 38/30** değişti. *(Patron notu: bu Hasan'ın aynı anda girdiği üretim. Eşzamanlı çalışma doğru yansımış.)*
- **Tedarik süresi tükenişi geçiyor:** `TGAV-150-DN150-WCB` kritik stokta (10 adet, günde 1 tüketim ≈ 10 gün), **tedarik süresi 21 gün**. *"Şimdi sipariş verilse bile stok tükendikten sonra gelecek."*
