# Satış Kiti

Tarih: 2026-09-18 · İç kullanım
Bağlı: [marka rehberi](roven-marka-rehberi.md) (§1.5 vaat ≤ canlı) · [fiyatlandırma](fiyatlandirma-modeli.md) · [isim araştırması](isim-arastirmasi.md)

> **Tek kural:** bu belgedeki hiçbir cümle rehber §1.5'teki dürüstlük tablosunu
> aşamaz. Bugün kapalı olan bir şey (AI belge okuma, Paraşüt) "var" diye
> satılmaz. Kapalıyı satmak ilk kurulumda ortaya çıkar ve o müşteri referans
> değil risk olur.

---

## 1. Kime satıyoruz (ICP)

### 1.1 Uyan profil

| Eksen | Değer |
|---|---|
| Çalışan | 5–50 kişi |
| Ciro | ~10–150 milyon TL/yıl |
| İş modeli | **Teklif verip satan** — stok tutan, ürün alan veya üreten |
| Sektör | Fark etmez: makina, mobilya, gıda, ambalaj, kimya, elektrik, endüstriyel malzeme, toptan ticaret |
| Bugünkü araçları | Excel + WhatsApp + ön muhasebe (Paraşüt/Bizim Hesap/Logo İşbaşı) |
| Karar verici | Patron veya şirket müdürü — **tek kişi**, komite yok |
| Tetikleyici olay | Aşağıdaki §1.3 |

### 1.2 Neden bu profil

- **5 kişinin altı:** Excel hâlâ yetiyor, acı yok, fiyat yüksek gelir.
- **50 kişinin üstü:** IT departmanı, satın alma süreci, komite kararı, RFP.
  Netsis/SAP'nin sahası; tek kişilik ekip o satış döngüsünü taşıyamaz.
- **Teklif vermeyen iş** (perakende, hizmet): ürünün omurgası teklif→sipariş→stok
  zinciri. Teklif yoksa değerin yarısı boşa gider.

### 1.3 Satın alma tetikleyicileri — bunları duyduğunuzda öne çıkın

Sırayla en güçlüden:

1. **"Aynı malı iki müşteriye sattık."** — Ürünün en keskin cevabı bu. Teklif
   gönderildiği anda stok rezerve edilir (mig.088); aynı stok ikinci kez
   vaat edilemez.
2. **"Teklif dosyası kayboldu / hangi fiyatı verdiğimizi bulamıyoruz."** —
   Teklif arşivi + revizyon zinciri.
3. **"Stok sayımı tutmuyor."** — Her hareket kayıtlı, kim yaptı belli.
4. **"Satın almayı ne zaman yapacağımızı kaçırıyoruz."** — Uyarı takvimi +
   satın alma önerisi.
5. **Büyüme:** yeni depo, ikinci satışçı, ilk üretim hattı — Excel'in çatladığı an.
6. **Devir:** oğul/kız işin başına geçiyor, "artık sistemle yönetelim" diyor.
   *(Bu en kolay satıştır: değişim isteği zaten içeriden geliyor.)*

### 1.4 Uymayan profil — vaktinizi almasın

- e-Fatura entegratörü arayan → **biz değiliz**, Paraşüt'e yönlendirin.
- Resmî muhasebe/beyanname isteyen → mali müşavir işi.
- Perakende/kasa/POS isteyen → ürün bunu yapmıyor.
- İki-üç firmayı tek ekranda görmek isteyen holding → tek kiracılı mimari;
  her firma ayrı kurulum, konsolide rapor yok.
- "Önce bedava kullanalım, beğenirsek alırız" → §6'daki kural.

---

## 2. Rakip haritası

| Rakip | Ne yapar | Nerede kazanırız | Nerede kaybederiz |
|---|---|---|---|
| **Paraşüt / Bizim Hesap / KolayBi** (870–940 TL/ay) | Ön muhasebe, e-fatura | Stok rezervasyonu, teklif zinciri, üretim/BOM, satın alma, uyarılar — hiçbiri onlarda yok | Fiyat (biz 10–20 kat). e-Fatura onlarda var bizde yok |
| **Logo Netsis** (25.000–112.000 TL lisans + %25 bakım) | Tam ERP, geniş bayi ağı | Kurulum süresi, kullanıcı başına ücret yok, modül ücreti yok, arayüz, mobil, Türkçe destek doğrudan geliştiriciden | Kurumsal referans, e-fatura, bordro, mali müşavir aşinalığı, "batarsan ne olur" güveni |
| **Akınsoft Wolvox** (45.000 TL'den) | Tam ERP + sektör paketleri | Modern arayüz, bulut/mobil, kurulum hızı | Yaygınlık, sektör şablonları, bayi desteği |
| **Dia / bulut ERP'ler** | Bulut ERP, abonelik | Tek kiracılı izolasyon, özelleştirme yakınlığı | Ekip büyüklüğü, süreklilik algısı |
| **Odoo (TR partnerleri)** | Açık kaynak, modüler | Türkçe yerelleşme derdi yok, KDV/teklif belgesi yerli | Ekosistem, modül zenginliği |
| **Excel (asıl rakip)** | Bedava, herkes biliyor | Hata, kayıp, çift satış, görünmezlik | **Bedava ve tanıdık** — asıl mücadele burada |

**Excel gerçek rakiptir.** Görüşmelerin çoğu Netsis'e değil "biz Excel'de
hallediyoruz"a karşı verilir. Bu yüzden demo Excel dosyalarının yüklenmesiyle
başlar (§4 adım 1) — "bırakmanız gereken bir şey yok, taşıyoruz" mesajı.

---

## 3. Konuşma çerçevesi

### 3.1 Tek cümlelik tanım
> "Roven, teklif–sipariş–stok–üretim zincirini tek ekranda toplayan bir ERP.
> Ön muhasebeden büyümüş, Netsis'i kaldıramayan işletmeler için."

### 3.2 Üç temel vaat (bunların dışına çıkmayın)
1. **Aynı stoğu iki kez satamazsınız.** Teklif gönderildiği an stok rezerve olur.
2. **Kullanıcı ve modül başına ücret yok.** Ne ödeyeceğinizi ilk gün bilirsiniz.
3. **Veriniz kendi veritabanınızda.** Başka müşteriyle aynı tabloda değil.

### 3.3 Keşif soruları — demo ÖNCESİ sorun
Cevaplar demonun neyi göstereceğini belirler; hepsini göstermeye çalışmayın.

1. Teklifi bugün nasıl hazırlıyorsunuz? Kaç kişi hazırlıyor?
2. Verdiğiniz bir teklifin güncel hâlini 30 saniyede bulabiliyor musunuz?
3. Stok sayısını nereden okuyorsunuz, ne sıklıkla tutmuyor?
4. Hiç aynı malı iki müşteriye sattığınız oldu mu? *(En değerli soru.)*
5. Satın almaya ne zaman çıkacağınıza kim, neye bakarak karar veriyor?
6. Üretim yapıyor musunuz? Yapıyorsanız hangi kaydı tutuyorsunuz?
7. Mali müşavirinize ayı nasıl kapatıyorsunuz?
8. Daha önce bir ERP denediniz mi? *(Denediyse: neden bıraktınız — altın soru.)*

---

## 4. Demo senaryosu (30 dakika)

**Kural: sunum yok.** Slayt açmayın, canlı sistemde gezin. Demoya girmeden
önce keşif sorularını sormuş olun ve **sadece onların derdini** gösterin.

| Dk | Ne | Nasıl anlatılır |
|---|---|---|
| 0–3 | **Çerçeve** | "Size Roven'ı anlatmayacağım, sizin işinizi Roven'da göstereceğim. Uymadığı yerde uymuyor diyeceğim." |
| 3–8 | **Excel'i yükle** | Veri Aktarım Merkezi → gerçek ürün listelerinden birini sürükle. Kolonların otomatik eşleşmesini gösterin, bir eşleşmeyi elle düzeltin, **sistemin hatırladığını** söyleyin. *Mesaj: taşınma acısı yok.* |
| 8–14 | **Teklif** | Yeni teklif → ürün seç → miktar → iskonto → Önizle → PDF. Belgede firma antetini gösterin. *Mesaj: müşteriye giden belge profesyonel ve sizin.* |
| 14–18 | **Rezervasyon — vurucu an** | Teklifi gönder. Ürün kartına dönün: **satılabilir miktar düştü.** Aynı ürüne ikinci teklif açın → stok yetersiz uyarısı. "Aynı malı iki müşteriye satamazsınız." *Burada durun ve tepkilerini bekleyin.* |
| 18–22 | **Zincir** | Teklif kabul → sipariş otomatik → sevk → stok düşer. Her adımda kim yaptı, ne zaman — denetim izi. |
| 22–26 | **Uyarılar** | Uyarı takvimi: kritik stok, geciken sevkiyat, süresi dolan teklif, vadesi gelen satın alma. "Siz aramıyorsunuz, sistem söylüyor." |
| 26–30 | **Roller + kapanış** | Satış rolüyle girin: maliyet alanları **hiç görünmüyor**. Sonra §5'e geçin. |

**Üretim yapan müşteride:** 18–22 aralığını üretim kaydı + BOM ile değiştirin
(bitmiş ürün artar, bileşenler düşer).

**Demoda GÖSTERMEYİN:** AI belge okuma ve Paraşüt ekranları — bugün kapalı.
Sorulursa: "Kod tarafı yazıldı, anahtar/başvuru bekliyor. Açıldığında
haber veririm." Tarih vermeyin.

### 4.1 Kapanış cümlesi
> "İki yol var: ya şimdi konuşuruz ve ay sonuna kurulur, ya da siz Excel'de
> devam edersiniz — ikisi de olur. Sizce hangisi?"

Sonra **susun.** İlk konuşan kaybeder.

---

## 5. İtiraz karşılama

Yapı: **kabul et → çerçeveyi değiştir → kanıt.** Savunmaya geçmeyin.

### "Pahalı."
> "Hangi rakamla kıyasladığınıza bağlı. Netsis'in lisansı ilk bakışta daha
> ucuz, doğru. Ama oraya sunucu, bayi kurulumu, veri aktarımı ve kullanıcı
> başına lisans ekleyin — 5 kişiden 8'e çıktığınızda tekrar ödersiniz.
> Bizde kullanıcı sayısı fiyatı değiştirmiyor, barındırma dahil ve toplamı
> ilk gün belli. Sizin için asıl soru şu: **aynı malı iki kez satmak** size
> yılda kaça mal oluyor?"

### "Logo/Netsis daha güvenli, büyük firma."
> "Haklısınız, büyükler. Buna karşılık siz onların on binlerce müşterisinden
> birisiniz; bende ise ilk on müşteriden birisiniz. Bir sorun olduğunda bayiye
> ticket açmıyorsunuz, yazılımı yazan kişiyi arıyorsunuz. Bunun bir de öteki
> yüzü var ve size açıkça söyleyeyim: ben tek kişiyim. Bu yüzden veriniz
> **sizin** Supabase projenizde duruyor, yedeği her gün alınıyor ve yedek
> sizindir — bana bağımlı değil. *(→ §5.1)*"

### "Ya siz bırakırsanız / işler ters giderse?" — **en meşru itiraz, ciddiye alın**
> "Doğru soru. Üç somut cevap: **(1)** Veri sizin adınıza açılmış bir Supabase
> projesinde; erişim sizde, ben hizmet veriyorum, sahip değilim. **(2)** Günlük
> yedek alınır ve dışa aktarılabilir — sisteme kilitli değilsiniz. **(3)**
> Sözleşmeye kaynak kodun emanet (escrow) maddesi koyabiliriz: iş sürdürülemez
> hâle gelirse kod size devredilir."
>
> *(Kullanıcı notu: escrow maddesi henüz sözleşme şablonunda YOK. Ya eklenmeli
> ya da bu cümle kullanılmamalı — rehber §1.5 kuralı satış vaatlerine de işler.)*

### "e-Fatura kesebiliyor mu?"
> "Hayır, biz entegratör değiliz — o ayrı bir iş ve ayrı mevzuat. e-Faturayı
> Paraşüt'te veya mali müşavirinizde bırakıyorsunuz; Roven operasyonu yönetir,
> faturaya giden veriyi oraya taşır. Zaten çoğu müşteri ön muhasebesini
> değiştirmek istemiyor."

### "Personel öğrenebilir mi?"
> "Ekranları görüyorsunuz — Excel'den daha karmaşık değil. Yerinde bir gün
> eğitim veriyoruz, rol bazlı: satışçı sadece satış ekranlarını görüyor,
> depocu sadece depoyu. Ayrıca 90 gün boyunca telefonun ucundayım."

### "Kendi Excel'imiz aslında iyi çalışıyor."
> "O zaman değiştirmeyin — ciddiyim. Bir tek şunu sorayım: aynı anda üç kişi
> aynı stok dosyasına yazdığında hangisinin doğru olduğunu nasıl biliyorsunuz?
> Ve üç ay önceki bir teklifin hangi fiyatla verildiğini bulmak ne kadar
> sürüyor? Bu ikisi sizde sorun değilse gerçekten sisteme ihtiyacınız yok."

### "Düşünelim, sonra dönerim."
> "Tabii. Neyi düşüneceğinizi netleştirelim ki boşa beklemeyelim: fiyat mı,
> zamanlama mı, yoksa 'bu iş bize uyar mı' sorusu mu? *(Cevabı bekleyin.)*
> Şunu önereyim — iki hafta sonra 15 dakika ayıralım, o zamana kadar
> [belirtilen endişe] için size somut bir cevap hazırlayayım."

### "İndirim yapar mısınız?"
> "Liste fiyatından indirim yapmıyorum ama kapsamı küçültebiliriz. Anahtar
> Teslim yerine Hızlı Kurulum'a geçersek 40 bin TL düşer; farkı siz
> yaparsınız — veriyi siz hazırlarsınız, eğitim uzaktan olur. Aynı işi ucuza
> yapmayı teklif etmem; o iş ikimiz için de kötü biter."

---

## 6. Süreç kuralları

- **Ücretsiz pilot yok.** Para ödemeyen müşteri veri aktarmaz; veri aktarmayan
  ürünü göremez; göremeyen satın almaz. Bunun yerine ücretli Hızlı Kurulum.
- **Demo ücretsiz ve sınırsız.** Kaç kez isterlerse.
- **Teklif 7 gün geçerli.** Belirsiz süreli teklif karar aldırmaz.
- **Aynı anda en fazla 3 aktif kurulum.** Dördüncüsü sıraya değil, sonraki aya.
- **Referans takası açık yazılır:** ilk 3 müşteride %25 kurulum indirimi
  karşılığında yazılı referans + vaka hikâyesi + logo kullanım izni.

---

## 7. Kanallar — sıralı

### 7.1 Mali müşavir ortaklığı ★ (en yüksek getiri)
Mali müşavir, KOBİ'nin **en çok güvendiği dış danışmandır** ve müşterisinin
dağınık verisinden birebir muzdariptir. Roven mali müşavirin işini kolaylaştırır
(düzenli veri, Paraşüt'e hazır akış) ve onun işini **almaz** (beyanname/resmî
muhasebe bizde yok) — yani rakip değil, tamamlayıcı.

Teklif: yönlendirdiği her kurulumda **%10 komisyon** veya müşterisine %10
indirim (müşavir hangisini isterse). Hedef: 5–10 müşavirle ilişki.

### 7.2 Mevcut müşteri referansı
PMT'nin ilk referans olması kritik. Vaka hikâyesi + "başka kimi tanıyorsunuz"
sorusu her başarılı kurulumdan 90 gün sonra sorulur.

### 7.3 Sektör dernekleri / OSB
Organize sanayi bölgesi firma listeleri açık kaynaktır; dernek bültenlerinde
görünmek reklamdan ucuz ve daha güvenilir.

### 7.4 LinkedIn — içerik, satış değil
Haftada bir gönderi: gerçek bir KOBİ problemi + Roven'ın ona ne yaptığı.
Satış mesajı değil, problem anlatımı. DM'de şablon atmayın (§8.2).

### 7.5 Google araması — uzun vade
SEO temeli kuruldu (robots/sitemap/JSON-LD). İçerik yazıları geldikçe
"KOBİ ERP", "Excel'den ERP'ye geçiş", "ERP fiyatları" aramalarından organik
trafik gelir. **6–12 ay** sürer; şimdi başlamak gerekiyordu, başladı.

---

## 8. Mesaj şablonları

> Hepsi kısa. Uzun mesaj okunmaz. Köşeli parantezleri **gerçekten** doldurun —
> doldurulmamış şablon hemen belli olur ve güveni sıfırlar.

### 8.1 Soğuk e-posta

**Konu:** `[Firma adı] — teklif ve stok tek ekranda`

```
Merhaba [Ad],

[Firma adı]'nın [ürün/sektör] tarafında çalıştığını gördüm. Sizin
ölçeğinizdeki işletmelerde en sık duyduğum şey şu: teklifler Word'de,
stok Excel'de, ikisi birbirini tutmuyor ve arada aynı mal iki müşteriye
söz veriliyor.

Roven bu zinciri tek ekranda birleştiriyor — teklifi gönderdiğiniz anda
stok rezerve oluyor, aynı malı ikinci kez vaat edemiyorsunuz.

30 dakikalık bir görüşmede kendi ürün listenizi sisteme yükleyip
göstereyim mi? Uymuyorsa uymuyor derim, vaktinizi almam.

[Ad Soyad]
[telefon] · rovenerp.com
```

**Takip (5 gün sonra, aynı konuya yanıt):**
```
Merhaba [Ad],

Bu hafta uygun olur mu diye tekrar sorayım. Yoğunsanız sorun değil —
"şimdi değil" derseniz rahatsız etmem.

[Ad Soyad]
```

*(İki takipten fazlası yapılmaz.)*

### 8.2 LinkedIn bağlantı notu
```
Merhaba [Ad], [sektör] tarafında KOBİ'lerin teklif–stok karmaşası
üzerine çalışıyorum. Bağlantı kurmak isterim.
```
**Bağlantı kabul edilince hemen satış mesajı ATMAYIN.** En az bir hafta
bekleyin veya hiç yazmayın; içeriğiniz sizin adınıza konuşsun.

### 8.3 WhatsApp (yalnız tanışıklık varsa)
```
Merhaba [Ad], [ortak tanıdık] vesilesiyle yazıyorum. KOBİ'ler için
teklif–sipariş–stok sistemi geliştiriyorum. Bu hafta 20 dakika
ayırabilirseniz ekranı göstereyim, uymazsa hiç uğraşmayalım.
```

### 8.4 Mali müşavir yaklaşımı
```
Merhaba [Ad] Bey/Hanım,

Mali müşavirlerin en çok şikâyet ettiği şeyin müşteriden gelen dağınık
veri olduğunu biliyorum. KOBİ'ler için teklif–sipariş–stok sistemi
geliştiriyorum; sizin işinizi almıyor — beyanname ve resmî muhasebe
bizde yok. Yaptığı şey müşterinizin verisini düzenli hâle getirmek.

Yönlendirdiğiniz kurulumlarda komisyon ya da müşterinize indirim
sunuyorum, hangisini tercih ederseniz.

Kısa bir görüşme yapabilir miyiz?
```

### 8.5 Demo sonrası özet (aynı gün gönderilir)
```
Merhaba [Ad],

Bugünkü görüşme için teşekkürler. Konuştuklarımızın özeti:

• Sizin derdiniz: [kendi cümleleriyle yazın]
• Roven'ın buna cevabı: [gösterdiğiniz tek şey]
• Uygun paket: [paket adı] — [tutar] TL + KDV, ilk yıl bakım dahil
• Kurulum süresi: [X] hafta

Ek'te tanıtım dosyası var. Karar için [tarih]'e kadar bekliyorum;
sorunuz olursa doğrudan arayın.

[Ad Soyad] · [telefon]
```

---

## 9. Eksikler — bu kit tamamlanmadan önce

| Eksik | Kim yapar |
|---|---|
| **Gerçek ekran görüntüleri** — landing ve tanıtım dosyası için | Marka ajanı (canlı/dev ortam gerekiyor) |
| **PMT vaka hikâyesi** — sayı ve alıntı içermeli | Kullanıcı (PMT'den izin + rakam) |
| **1 sayfalık tanıtım PDF'i** | Marka ajanı (ekran görüntüleri geldikten sonra) |
| **Sözleşme şablonu** + escrow maddesi | Kullanıcı (hukuk) |
| **Referans/logo kullanım izni metni** | Kullanıcı |
| **İletişim adresi** (`CONTACT_EMAIL`) | Kullanıcı |
