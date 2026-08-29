# Gün 3 — Çarşamba · ham raporlar

> Çalışanların kendi ağzından. Doğrulama Faz 4'te.

**Günün kazancı:** teklif → sipariş zinciri **uçtan uca tamamlandı** ve para
tarafı birebir tuttu. Karşılığında dört yeni ciddi bulgu çıktı.

---

## Deniz Arslan — satış ve satın alma

### Günün işi — zincir tamamlandı ✅
Adres girildi → kaydedildi → **Gönder** → onay penceresi onaylandı → teklif
"Gönderildi". Kontrol etti: **`ORD-2026-0030`** numarasıyla "Bekliyor"
durumunda sipariş otomatik açılmış ($33.600, Lojistik: **Rezerveli**), teklif
satırındaki "Verilebilir" **30 → 20**'ye düşmüş, "Düşük" etiketi çıkmış —
*"10 adet rezerve, teklif miktarıyla birebir uyuyor. **Bu adım söylediği gibi
çalıştı.**"*

Sonra "Kabul Et ve Siparişe Dönüştür". Sipariş detayı: 1 kalem,
`TGAV-150-DN150-WCB`, 10 adet, $2.800 birim, $28.000 satır. Ara Toplam $28.000,
KDV %20 $5.600, Genel Toplam **$33.600 — teklifle birebir aynı, doğru.**

Öneriler ekranı: 6 kritik ürün, hepsi ticari (imalat 0), toplam önerilen alım
**$1.541.100**. En acil `FIT-TEE-DN200-20S` (9 gün kaldı). Bugün sattığı
`TGAV-150-DN150-WCB` de listede — *"önerilen sipariş tarihi zaten geçmiş
(21 Ağustos)."*

### Takıldıkları

**D5 — Gönderdikten sonra "geri" eski/yanlış hali gösteriyor** ⚠️
- Ne oldu: gönderimin hemen ardından geri dönünce ekran teklifi **"Taslak" / "Henüz gönderilmedi"** düzenleme formunda gösterdi; **Gönder düğmesi geri geldi, az önce girilen müşteri adresi boş görünüyordu.**
- *"Bir an 'adres kaydolmadı, tekrar mı göndersem' diye düşündüm."* Menüden tekrar girince gerçek durumun "Gönderildi" ve adresin kayıtlı olduğunu gördü.
- Etki: durdurmadı ama — *"gerçek işte bu, kişiyi 'kaybetmişim, tekrar gireyim tekrar göndereyim' diye yanlış bir harekete sürükleyip **mükerrer gönderime** yol açabilir."*

**D6 — Onay penceresi "taslak sipariş" diyor, sipariş "Onaylı" çıkıyor**
- Onay penceresi *"taslak sipariş olarak oluşturulacak"* yazıyordu; Deniz siparişi Taslak/Bekliyor halinde bulup elle onaya gönderip onaylayacağını bekliyordu.
- Ne oldu: sipariş doğrudan **"Onaylı" + "Stok rezerve edildi"** çıktı. Onaya gönderecek/onaylayacak düğme yok — yalnız "İptal Et" ve "Belgeyi Aç". Yeni sipariş de açılmamış; gönderimde oluşan `ORD-2026-0030` doğrudan onaylıya dönmüş.
- *"Onay penceresinin yazdığı ile gerçekte olan tutmuyor."*
- Etki: satış tamamlandı ama *"onay mekanizmasının gerçekten çalışıp çalışmadığından emin olamadım."*

**D7 — "Kaydedildi" bildirimi yine çıkmadı** (Gün 2'deki D2'nin tekrarı — sistematik)
- *"Kaydın geçtiğinden emin olmak için teklifi yeniden açıp kontrol etmek zorunda kaldım."*

### Aklına takılanlar
- Sipariş "Onaylı + Rezerveli" olduktan sonra **"Sevk Edildi"ye geçirecek düğme yok.** *"Sevkiyat başka bir ekrandan mı yapılıyor, benim rolümde mi değil, bilmiyorum — sormak istiyorum."*
  → 🔧 **Patron notu:** bu **doğru davranış**. Sevk yetkisi (`ship_sales_orders`) satışta değil, üretim ve yöneticide. Rol duvarı tasarlandığı gibi çalışıyor. **Bulgu değil** — ama sevkin kimde olduğunu ekranın söylememesi bulgu.

---

## Hasan Çelik — üretim vardiya sorumlusu

### Günün işi
Dünkü 6 adetlik fazlalığı **düzeltemedi**. Bugünün üretimini girdi:
`CKV-DD-DN150-PN16-WCB` **12 adet** — *"1 kalem, 12 adet üretim kaydedildi,
stok güncellendi"* onayı geldi, tabloda göründü. Uyarılar ekranını inceledi.

### Takıldıkları

**H8 — Silme düğmesi YANLIŞ satırı hedefliyor** ⚠️⚠️
- Ne yapmaya çalıştı: `FWBV-DN400-PN80-PH`'nin yanlış **+6** satırını silip **+8**'i bırakmak
- Ne oldu: *"Sil (çöp) düğmesine **her bastığımda** çıkan onay kutusu hep **+8'i (doğru kaydı)** silmek istediğini söyledi, **+6 hiç çıkmadı**; satıra tıklamak da hiçbir şeyi değiştirmedi, hiçbir bildirim çıkmadı. İki satırın adı aynı olduğu için sistem hangisini sileceğimi ayıramıyor gibi."*
- *"Yanlışlıkla doğru kaydı silmemek için üç denemeden sonra Vazgeç deyip bıraktım."*
- Tekrar: Üretim Girişi → Bugünkü Üretim Kayıtları'nda aynı üründen iki satır varken sil düğmesine bas
- Etki: **tam engelledi** — 6 adetlik hata hâlâ sistemde

**H9 — Aynı filtre iki kez basılınca farklı sonuç veriyor**
- "Tümü" → takvimde **4 gün** işaretli (26, 27, 28, 31 Ağustos). "Stok"a basıp tekrar "Tümü"ye basınca **6 gün** (1, 21, 26, 27, 28, 31). *"1 Ağustos ve 21 Ağustos ilk seferde yoktu, sonradan belirdi."*
- Etki: *"Üretimimi durdurmadı ama **uyarı listesine güvenim kalmadı**, hangisi doğru bilmiyorum."*

**H10 — "Stok" filtresi 4 diyor, hiçbir şey göstermiyor**
- Üstte "4" yazıyor ama **takvimde hiçbir gün işaretlenmedi, altta hiçbir liste çıkmadı, bildirim de yok.**

### Anlamadıkları
- **24 uyarının hepsini tek listede nasıl göreceğini bulamadı.** *"Takvimde işaretli günlere tek tek tıklamam gerekiyor, hangisini kaçırdığımı bilemiyorum."*
- "SİPARİŞ TESLİM RİSKİ — KRİTİK" uyarısı çıkıyor ama *"'Detay' ve 'Yoksay' dışında bana **ne yapmam gerektiğini söyleyen bir şey yok.** Sevkiyatı ben mi bildireceğim yoksa bu satış işi mi, anlamadım."*
- Uyarı detayındaki **"SAAT BAZLI UYARILAR" → "◷ HEDEF" / "◷ Stok Tükenme — bu gün"** ifadelerinin ne demek olduğunu ve asıl uyarıyla bağını çözemedi.
- Takvim başlığı *"29 Ağustos, Cumartesi"* diyor, kendisi Çarşamba olduğunu biliyor.
  → 🔧 **Patron notu: bu SİMÜLASYONUN kendi kurgusu.** Gerçek tarih 29 Ağustos Cumartesi; hafta günleri simülasyon senaryosunun uydurması. Uygulama doğru tarihi gösteriyor. **Bulgu değil.**

---

## Kerem Aydın — makine mühendisi

### Günün işi
Tedarik zinciri incelendi: 5 tedarikçi, China Langge kartı, `FWBV-DN400`'e
ikinci tedarikçi ekleme denemesi, RFQ bölümü + yeni test talebi
(`RFQ-2026-0003`).

### Takıldıkları

**K8 — RFQ'ya girilen teknik şartname notu KAYBOLUYOR** ⚠️⚠️
- Ne yaptı: Yeni Fiyat Talebi → `FWBV-DN400-PN80-PH` seçti → **Notlar** alanına teknik şartname yazdı (**PN80 basınç sınıfı, EN 10204 3.1 sertifika zorunluluğu, hidrostatik test raporu talebi**) → China Langge işaretledi → Talep Oluştur
- Ne oldu: RFQ oluştu, başlık ve kalem doğru, **ama yazdığı Notlar metni ne üstte, ne kalem satırında, ne başka bir sekmede görünüyor — sanki hiç girilmemiş gibi.**
- Etki: **yüksek** — *"Mühendis olarak tedarikçiye basınç sınıfı/sertifika/test raporu gibi teknik şartları iletebilmem bu formun tek yolu; notun kaydedilip kaydedilmediği ya da tedarikçiye ulaşıp ulaşmadığı belirsiz — teklif toplama sürecinin teknik doğruluğunu riske atıyor."*

**K9 — Ürüne ikinci/alternatif tedarikçi eklenemiyor**
- "Tercihli tedarikçi" **tek bir serbest metin alanı** — yazınca mevcut değerin üzerine yazıyor, ikisini birden tutmuyor. *"Yapısal bir tedarikçi seçimi bile değil, düz metin girişi."* İkinci tedarikçi ekleme düğmesi/alanı yok.
- Etki: **orta-yüksek** — *"Bu ürün 0 stok + 68 gün gecikmiş sipariş + tek tedarikçi (60 gün temin süresi) durumunda; **tek-kaynak riskini sistemde hiç görünür kılamıyorum**, alternatif tedarikçi karşılaştırması yapamıyorum."*

**K10 — RFQ'da kalem-bazlı not ve dosya eki yok**
- Formun altında **tek genel "Notlar"** kutusu var, kalem sayısı ne olursa olsun. Dosya/çizim eki alanı yok.
- Etki: **orta** — *"Çok kalemli bir RFQ'da hangi notun hangi ürüne ait olduğunu ayıramam; teknik çizim paylaşmam gerektiğinde sistem üzerinden yapamıyorum."*

**K11 — Tedarikçi fiyatları yalnız RFQ'dan besleniyor, elle giriş yok**
- *"Henüz tedarikçi fiyatı kaydı yok. Fiyat Talebi (RFQ) yanıtları burada birikir."* Kritik stoktaki bu ürünün **hiç fiyat geçmişi yok**, tedarikçi kartında "Son fiyat" boş.

### Giremediği bilgiler
- China Langge kartında **teslim performansı yok** (geç teslimat oranı, ortalama gecikme) — yalnız "Toplam Alım" ve "Son sipariş" tarihi. *"Dashboard'da görünen gecikmeli PO'ların bu tedarikçiye ait olup olmadığını kartından anlayamıyorum."*
- **Fiyat geçmişi tek nokta** ("Son fiyat" + tek tarih) — zaman içindeki trend görünmüyor.

### Aklına takılanlar
- ✅ **İyi çalışan:** RFQ formunda ürün seçince tedarikçiyi otomatik "Önerilen" işaretlemesi doğru tedarikçiyi öneriyor.
- RFQ satırındaki "Belge" bağlantısında görünür bir değişiklik/bildirim olmadı — *"yeni sekmede açılmış olabilir, emin değilim."*

---

## Sibel Toprak — mali işler

### Günün işi — ✅ PARA ZİNCİRİ BİREBİR TUTTU

`TKL-2026-015` → `ORD-2026-0030` dönüşümünün mali denetimi. **Dört rakam ve
satır kalemi birebir örtüşüyor:**

| | Teklif `TKL-2026-015` | Sipariş `ORD-2026-0030` |
|---|---|---|
| Ara Toplam | $28.000,00 | $28.000,00 |
| İskonto | yok | — |
| KDV (%20) | $5.600,00 | $5.600,00 |
| **Genel Toplam** | **$33.600,00** | **$33.600,00** |
| Satır | `TGAV-150-DN150-WCB` 10 × $2.800 = $28.000 | aynı |

Liste tutarı ($33.600) = detay Genel Toplamı ($33.600). **"Bu dört rakamda ve
satırda sorun yok."**

### Tutmayan rakamlar

**S7 — Dashboard ilk açılışta BAYAT veri gösteriyor** ⚠️
- Oturumun ilk açılışında: **"Aylık Ciro" → "—" / "Bu dönemde sipariş yok"** — oysa Ağustos'ta onaylı ve rezerve edilmiş **$33.600'lık** sipariş duruyor.
- Aynı anda "Açık Siparişler" **9 / $160K** (olması gereken **10 / $194K**), "Son Siparişler" widget'ında `ORD-2026-0030` **hiç yok**.
- Tekrar: oturumun en başında `/dashboard`'a bak → bu hal; başka sayfaya gidip dönünce **kendiliğinden düzeliyor** ($34K, 10, $194K, sipariş listede).

**S9 — Uyarı metni ile Stok sekmesi rakamları hiç örtüşmüyor** *(Kerem'in K5'inin ikinci tanığı)*
- Uyarı: **"Mevcut stok 10 adet (min: 10)"**
- Stok sekmesi: **Stokta 38 / Satılabilir 20 / Rezerve 18 / Min Stok 25**
- *"Uyarı metnindeki ne 'mevcut stok 10' ne 'min 10' rakamı, Stok sekmesindeki hiçbir rakamla örtüşmüyor."*

### Takıldıkları

**S8 — Teklif detayı ilk açılışta ESKİ durumu ve AKTİF dönüştürme düğmesini gösteriyor** ⚠️⚠️
- Liste "Kabul Edildi" diyor; detay **"Gönderildi" / "Müşteri yanıtı bekleniyor"** gösterdi ve **"Reddet" · "Kabul Et ve Siparişe Dönüştür" · "Revize Et" düğmeleri AKTİFTİ** — *"sanki teklif hiç dönüştürülmemiş gibi."* Oysa sipariş çoktan oluşmuştu.
- Sipariş sayfasındaki "Teklif Detayı →" linkinden girince doğru geldi: "Kabul Edildi", "✓ Sipariş oluşturuldu: ORD-2026-0030", dönüştürme düğmeleri yok.
- Etki: **orta** — *"Aktif 'Kabul Et ve Siparişe Dönüştür' düğmesi dururken biri yanlışlıkla tıklarsa **ikinci bir sipariş yaratma riski** var."*

**S10 — "Sipariş bulunamadı" hatası, hemen ardından doğru veri** *(Deniz'in D1'inin ikinci tanığı)*
- `satir "ORD-2026-0030"` → "Sipariş bulunamadı. Geri dön" → tekrar bakınca sorunsuz geldi.

### Aklına takılanlar
- Rezerve toplamı (18) var ama **sipariş bazlı kırılım ekranı yok** — bu siparişin 10 adedinin 18'in ne kadarını oluşturduğu görünmüyor. *(İç tutarlılık doğru: 38 − 18 = 20.)*
- ✅ Sipariş sonrası Satın Alma Önerileri'nde `TGAV-150-DN150-WCB` için **"25 adet — Yakında"** önerisi belirdi; Satılabilir (20) < Min Stok (25) olduğu için **mantıklı** — öneri motoru doğru tepki verdi.
