# Gün 2 — Salı · ham raporlar

> Çalışanların kendi ağzından. Doğrulama Faz 4'te.

**Günün ana zinciri (teklif → sipariş) TAMAMLANAMADI.** Deniz teklifi
gönderemedi; Sibel de bu yüzden mali denetimi yapamadı. Sebebin bir kısmı
harness'ımdı, bir kısmı gerçek (aşağıda ayrıştırıldı).

---

## Deniz Arslan — satış ve satın alma

### Günün işi
`TKL-2026-015`'i açtı, kalemleri teyit etti: 10 adet × $2.800 = **$28.000** ara
toplam, KDV %20 **$5.600**, genel toplam **$33.600** — dünkü hazırlıkla birebir.
Stok satırı *"Stokta: 38 | Tekliflerde: 0 | Verilebilir: 30"* diyordu, yeterli.
"Gönder"e bastı, onay penceresi **doğru içerikle** açıldı. **Ama penceredeki
onayı tıklatamadı** — teklif gün boyu "Taslak" kaldı. Kabul etme, siparişe
çevirme, onaya gönderme adımlarının hiçbirine geçemedi.

### Takıldıkları

**D3 — Gönder onay penceresindeki hiçbir kontrol tıklanamıyor**
- 5-6 farklı deneme: `tikla "Gönder"` → "bulamadım" (oysa düğme listesinde vardı); `tikla "Teklifi Gönder"` → "başarılı" göründü ama hiçbir şey değişmedi; penceredeki kutucuk da bulunamadı. Listede toplu aksiyon aradı (yalnız "Sil"), "Önizle & PDF"de ayrı gönderme yolu aradı (yok).
- Etki: **durdurdu** — günün tamamı bu adıma bağlıydı
- 🔧 **Patron notu — harness kusuru, doğrulandı ve düzeltildi.** Gün 1'de eklediğim "önce ana içerik" kuralı modalları dışarıda bırakıyordu: pencere `main` dışında açılıyor, aynı etiketli arkadaki düğme seçilip pencerenin altında kaldığı için tıklama düşüyordu. Modal-farkında hedefleme eklendi (`[role="dialog"]` / kaplayan sabit kapsayıcı önceliklendi, çakışan etikette DOM'da sonuncusu seçilir). Yeniden denendi → pencere çalışıyor.

**D3b — ALTINDAN ÇIKAN GERÇEK BULGU: zorunlu alan formda işaretli değil**
- Pencere düzelince gönderim şu hatayla reddedildi: **"Teklifi göndermeden önce müşteri adresi girilmeli."**
- Ama **teklif formunda "Address (Adres)" alanı zorunlu olarak işaretli değil**; Deniz dün teklifi bu alan boşken sorunsuz kaydetti, hiçbir uyarı almadı.
- Kural yalnızca **onay penceresi açılıp Gönder'e basıldıktan sonra** öğreniliyor — üç adım sonra, geri dönüp düzenlemek gerekiyor.

**D4 — "Önizle & PDF" → "Formu Düzenle" yanlış sayfaya götürüyor**
- Ne bekliyordu: `TKL-2026-015` düzenleme ekranına dönmeyi
- Ne oldu: **`/dashboard/quotes/new`** açıldı — *"tamamen boş 3 satırlı yeni bir taslak, sanki teklif hiç yokmuş gibi."* Kaydetmeden geri döndü, orijinal teklif yerindeydi.
- Tekrar: herhangi bir teklifte "Önizle & PDF" → "Formu Düzenle"
- Etki: **rahatsız etti** — *"dikkatsizce buraya Kaydet denirse yanlışlıkla boş/mükerrer teklif oluşabilir, riskli."*

### Aklına takılanlar
- Gönder penceresinin metnine göre teklif gönderilince arka planda otomatik **bekleyen sipariş oluşup stok rezerve ediliyor** — yani *"'kabul et' ayrı bir adım olmayabilir, gönderim anında iş zaten başlıyor olabilir."*

---

## Hasan Çelik — üretim vardiya sorumlusu

> Raporu tamamlanamadı (oturum kotası doldu), ama **en kritik bulgu geldi**.

### Takıldıkları

**H7 — Üretim kaydı düzeltilemiyor; düzeltme denemesi İKİNCİ KAYIT ekliyor** ⚠️
- Ne yaptı: `FWBV-DN400-PN80-PH` için **6 adet** girdi. Sonra vardiya defterinden gerçeğin **8 adet** olduğunu fark etti, düzeltmeye çalıştı.
- Ne oldu: *"Form tekrar kaydedince eski +6 kaydının **ÜZERİNE YAZMADI, yeni bir satır olarak EKLEDİ.** Şimdi tabloda aynı ürün için iki ayrı satır var: +8 ve +6. … Sistemde bu ürün için görünen toplam 6+8=14 adet, oysa gerçekte 8 adet üretilmiş olmalıydı."*
- Kendi cümlesi: **"Kaydı düzeltmeye çalışırken durumu kazara kötüleştirdim."**
- Etki: **stok 6 adet fazla göründü** — düzeltme yolu yok, yanlış kayıt kalıcı
- ✔ **Bağımsız ikinci tanık:** Kerem aynı saatlerde, ne olduğunu bilmeden, aynı ürünün stoğunun *"görünürde bir teslim alma hareketi olmadan"* **3 → 9 → 17** diye arttığını bildirdi. 3+6=9, 9+8=17 — Hasan'ın mükerrer kayıtlarıyla birebir örtüşüyor.

---

## Sibel Toprak — mali işler

### Günün işi
Teklifin dört rakamını okudu ve **kendi içinde tutarlı** buldu: Ara Toplam
**$28.000,00** · İskonto boş (uygulanmamış) · KDV %20 → **$5.600,00** · Genel
Toplam **$33.600,00** (28.000 + 5.600 = 33.600 ✓). Tek satır (10 × $2.800 =
$28.000) ara toplamla birebir eşleşiyor.

Dönüşüm gerçekleşmediği için sipariş tarafı **denetlenemedi**.

### Takıldıkları

**S6 — Beklenen dönüşüm ~8 dakika boyunca hiç gerçekleşmedi**
- 9 ayrı bekleme turu (10+15+20+30+30+30+60+60+90+60 sn), aralarda "Yenile" ve Teklifler↔Siparişler git-gel. `TKL-2026-015` hâlâ "Taslak", sipariş listesi sabit "29 sipariş".
- Etki: **durdurdu** — günün ana görevi yapılamadı
- 🔧 **Patron notu:** kök neden D3 (harness). Sibel doğru davrandı: beklediğini, ne kadar beklediğini ve neyin değişmediğini yazdı.

### Aklına takılanlar
- Teklifte **İskonto alanı tamamen boş** (0 bile yazmıyor) — *"sipariş tarafında bu alanın nasıl taşınacağını göremedim."*
- Dashboard **"Aylık Ciro"** bugün "—" / "Bu dönemde sipariş yok" gösteriyor; 29 siparişin hiçbiri Ağustos 2026 tarihli değil, **şu an tutarlı.** Dönüşüm olunca yeniden bakılmalı.

---

## Kerem Aydın — makine mühendisi

### Günün işi — takıldığı yok, gerçek düzeltme yaptı

**`FWBV-DN400-PN80-PH`** — Stok: 3 / Satılabilir −1 / Rezerve 3 / Min Stok 4 /
Bekleniyor 4. Tedarik: China Langge, **tedarik süresi 60 gün**, maliyet $12.500.
> *"60 günlük tedarik süresi × 1 adet/gün = 60 birimlik tüketim. Min Stok ve
> Yeniden Sipariş Adedi'nin ikisi de sadece 4 — bu sadece 4 günlük tüketimi
> karşılar. **Parametre yanlış.**"*

**Düzeltti:** Min Stok **4 → 70**, Yeniden Sipariş **4 → 60**. Kaydetti, listede doğruladı.

**`TGAV-150-DN150-WCB`** — tedarik süresi 21 gün, Min Stok 10.
> *"21 gün × 1 adet/gün = 21 birim. Min Stok sadece 10 — ihtiyacın yarısından az."*

**Düzeltti:** Min Stok **10 → 25**, Yeniden Sipariş **20 → 25**.

Düzeltmeler sonrası üst özet: "Riskli (AI)" 2 → 1, "Öneri bekliyor" 2 → 1.

### Aklına takılanlar

**K5 — Uyarı metni canlı stokla uyuşmuyor, uyarı hiç güncellenmiyor** ⚠️
- `FWBV-DN400`: uyarı **"Mevcut stok 0 adet (min: 4)"** diyor, Stok sekmesi **3** gösteriyordu (sonra 9, sonra 17). *"Uyarı metni bu değişikliklerin hiçbirini yansıtmadı."*
- `TGAV-150-DN150-WCB`: uyarı **"Mevcut stok 10 adet (min: 10)"** + "Sipariş son tarihi geçti", ama Stok sekmesi baştan sona **38 / satılabilir 30** ve "Bekleyen Teslimat: yok".
- *"Böyle 'aktif ama aslında çözülmüş' uyarılar personelin gerçek kritik durumları gözden kaçırmasına yol açabilir."*

**K6 — "Bekleyen Teslimatlar" hiç "received" olmuyor**
- 4 adet, beklenen 2026-07-01, durum **pending** — *"68 gün önce geçti"* işaretli, hiç kapanmamış.

**K7 — "Ticari" ürünün tedarikçisi kendi fabrikamız**
- `TGAV-150-DN150-WCB` "Ticari" (dışarıdan tedarik) tipli ama tercihli tedarikçisi **"PMT Suluova Fabrikası"**. *"Ya ürün tipi yanlış seçilmiş ya da tedarikçi alanı yanlış dolmuş."*
