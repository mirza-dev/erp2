# Fiyatlandırma ve Paket Modeli

Tarih: 2026-09-18 · Karar: **tek seferlik kurulum + yıllık bakım** (kullanıcı, 2026-09-18)
Bağlı belgeler: [marka rehberi](roven-marka-rehberi.md) §1.5 (vaat ≤ canlı) · [müşteri kurulum](../musteri-kurulum.md)

> Bu belge bir **öneridir**. Rakamlar maliyet tabanı + ölçülmüş pazar fiyatlarından
> türetildi; nihai karar kullanıcınındır. Her rakamın altında nasıl çıktığı yazıyor —
> beğenmediğiniz sayıyı gerekçesini görerek değiştirebilirsiniz.

---

## 1. Neden bu model

Ürün **tek kiracılı**: her müşteri kendi Supabase projesinde, kendi deployment'ında
çalışır (`company_settings` üzerindeki `unique index ((true))` ikinci firmayı fiziksel
olarak engeller; 111 migration'da sıfır `tenant_id`). Bu mimari üç şeyi belirler:

1. **Kurulum gerçek bir iştir**, tek tık değil — yeni proje, 111 migration, veri
   aktarımı, firma profili, kullanıcılar, eğitim. Bedeli ayrı alınmalı.
2. **Her müşterinin sabit bir aylık maliyeti vardır** (altyapı). Bakım ücreti bunun
   altına inemez.
3. **Müşteri sayısı sizin kapasitenizle sınırlı**, sunucuyla değil. Fiyat, "çok müşteri"
   değil "doğru müşteri" için kurulmalı.

Klasik Türkiye ERP modeli (lisans + yıllık bakım) bu gerçeğe abonelik modelinden daha
iyi oturuyor — ve alıcı KOBİ bu modeli zaten tanıyor.

---

## 2. Maliyet tabanı (müşteri başına, ölçülmüş)

| Kalem | Aylık | Not |
|---|---|---|
| Supabase projesi (marjinal) | ~$10 | Pro $25/**organizasyon**, içindeki $10 kredi ilk projeyi karşılar |
| Uygulama sunucusu payı (Coolify/Hetzner) | ~$3–5 | Paylaşımlı; müşteri sayısıyla bölünür |
| E-posta (Resend) | ~$2 | 3.000 mail/ay ücretsiz katman aşılınca |
| Domain / sertifika | ~$1 | |
| **Toplam altyapı** | **~$16–18** | ≈ **770–865 TL/ay** (1 USD ≈ 48 TL) |
| **Yıllık altyapı** | | **≈ 9.200–10.400 TL** |

**Bu bir zemin, fiyat değil.** Yıllık bakım bedeli bu rakamın altındaysa müşteri size
para kaybettiriyor demektir. Üstüne destek emeği, yedek doğrulama, migration operasyonu
ve güncelleme işçiliği biniyor.

⚠️ **Gizli maliyet — migration operasyonu:** migration'lar bugün Studio'dan **elle**
uygulanıyor. N müşteri = N kez elle + drift riski. İkinci müşteriden önce
`check-migrations.ts` çok-projeli koşuma uyarlanmalı, yoksa bakım maliyeti müşteri
sayısıyla **doğrusal** büyür ve marjı yer.

---

## 3. Konumlandırma — fiyatın anlattığı hikâye

```
 Paraşüt / Bizim Hesap          →  ROVEN  ←          Netsis / Wolvox / Logo
 870–940 TL/ay                                       25.000–112.000 TL lisans
 Ön muhasebe. Fatura keser,                          Her şeyi yapar. Danışmanla
 stok/üretim/teklif zincirini                        kurulur, aylar sürer,
 yönetmez.                                           kullanıcı başına ödersiniz.
```

**Roven'ın cümlesi:** *"Ön muhasebeden büyüdünüz, Netsis'i kaldıramıyorsunuz. Arası bu."*

### Üç yapısal fark — fiyat sayfasının omurgası

1. **Kullanıcı başına ücret yok.** Netsis'te 5 kullanıcı ~25.000 TL/yıl, 10 kullanıcı
   ~60.000 TL/yıl. Roven'da kullanıcı sayısı fiyatı değiştirmez. Depoya bir kişi daha
   eklemek bütçe toplantısı gerektirmez. *(Kodda doğrulandı: lisans sayacı yok, RBAC
   rol bazlı.)*
2. **Modül başına ücret yok.** Teklif, sipariş, stok, satın alma, tedarikçi fiyat
   talebi, üretim, uyarı motoru — hepsi her kurulumda vardır. *(Kodda doğrulandı:
   müşteri bazlı özellik kapısı yok, tüm kurulumlar aynı kodu çalıştırır. Paketleri
   modüle bölmek teknik olarak mümkün değil ve dürüst de olmazdı.)*
3. **Veriniz sizin projenizde.** Ayrı veritabanı, ayrı deployment. Başka müşterinin
   verisiyle aynı tabloda durmuyorsunuz — teknik olarak mümkün değil.

---

## 4. Paketler

Paketler **modüle göre değil hizmet seviyesine göre** ayrışır. Ürün her pakette aynıdır.

### 4.1 Kurulum (tek seferlik, KDV hariç)

| | **Hızlı Kurulum** | **Anahtar Teslim** ★ | **Dönüşüm** |
|---|---|---|---|
| **Bedel** | **45.000 TL** | **85.000 TL** | **150.000 TL'den** |
| Kimin için | Excel'i düzenli, verisi temiz, hızlı başlamak isteyen | Çoğu KOBİ — varsayılan | Mevcut ERP'den geçen, süreci karışık |
| Sistem kurulumu | ✓ | ✓ | ✓ |
| Veri aktarımı | Ürün + cari (1 Excel) | Ürün, cari, tedarikçi, tedarikçi fiyatları, açılış stoğu, ürün tipleri + teknik alanlar | + geçmiş sipariş/teklif arşivi, mevcut sistemden göç |
| Firma kimliği | Logo + antet | + teklif/PDF şablonu firmaya göre, teklif numara düzeni, not şablonları | + özel alan ve rapor tasarımı |
| Kullanıcılar | 6 rol hazır | + rol/yetki haritası çıkarımı | + süreç analizi (yarım gün atölye) |
| Eğitim | 3 saat uzaktan | **1 gün yerinde** + rol bazlı | 2 gün yerinde + yönetici oturumu |
| Yakın destek | 30 gün | **90 gün** | 6 ay |

★ **Anahtar Teslim varsayılan pakettir** — fiyat sayfasında vurgulanır, diğer ikisi
onu çerçeveler.

### 4.2 Yıllık bakım (zorunlu, ilk yıl kurulum bedeline dahil)

| | **Temel** | **Öncelikli** ★ | **Ortak** |
|---|---|---|---|
| **Yıllık** | **24.000 TL** | **42.000 TL** | **72.000 TL** |
| Aylık karşılığı | 2.000 TL | 3.500 TL | 6.000 TL |
| Barındırma + günlük yedek | ✓ | ✓ | ✓ |
| Sürüm güncellemeleri | ✓ | ✓ | ✓ |
| Destek kanalı | E-posta | + telefon / WhatsApp | + doğrudan hat |
| Yanıt süresi | 2 iş günü | **Aynı iş günü** | 4 saat |
| Uzaktan destek kotası | — | 4 saat/ay | 8 saat/ay |
| Sağlık kontrolü | Yıllık | Çeyreklik | Aylık |
| Geliştirme/özelleştirme | Ayrı teklif | Ayrı teklif (%20 indirim) | **8 saat/ay dahil** |
| Yeni özellik önceliği | — | — | ✓ |

**İlk yıl bakımı kurulum bedeline dahildir**; 13. aydan itibaren faturalanır.
Zam kuralı: her yıl **TÜFE + %5**, sözleşmede yazılı (sürpriz yok; enflasyonda
"bu yıl ne kadar zam gelecek" belirsizliği satışı öldürür).

### 4.3 Örnek toplam sahip olma maliyeti (3 yıl)

Anahtar Teslim + Öncelikli bakım, sınırsız kullanıcı:

| | Roven | Netsis 3 Standard (5 kullanıcı, tahmini) |
|---|---|---|
| Yıl 1 | 85.000 (bakım dahil) | ~25.000 lisans + ~15.000 kurulum/eğitim = 40.000 |
| Yıl 2 | 42.000 | ~6.250 bakım |
| Yıl 3 | 42.000 | ~6.250 bakım |
| **3 yıl** | **169.000 TL** | **~52.500 TL** |
| 6. kullanıcı eklenince | **+0 TL** | +lisans (paket atlama) |
| Barındırma | dahil | ayrı (sunucu/bulut) |
| Kurulum + veri aktarımı | dahil | genelde ayrı bayi bedeli |

**Dürüst okuma:** Roven salt lisans karşılaştırmasında Netsis'ten pahalıdır ve satış
konuşmasında bu gizlenmemelidir. Roven'ın sattığı lisans değil **kurulmuş, veri
aktarılmış, çalışan sistem + sınırsız kullanıcı + barındırma**. Netsis'in görünen
fiyatı bayi kurulumunu, sunucuyu, kullanıcı büyümesini ve modül eklemelerini
içermez. Karşılaştırma bu kalemler açıldığında yapılmalı — "ucuzuz" demeyin,
**"toplamı belli"** deyin.

---

## 5. Sınırlar — ne satmıyoruz (rehber §1.5)

Satış konuşmasında **bugün** söylenemeyecekler:

| Konu | Gerçek | Nasıl konuşulur |
|---|---|---|
| **e-Fatura / e-Arşiv** | Roven kesmiyor. Entegratör değiliz. | "e-Fatura'yı Paraşüt'te veya mali müşavirinizde bırakıyoruz; Roven operasyonu yönetir, faturayı oraya taşır." **Bu bir eksik değil bir sınır** — e-fatura entegratörlüğü ayrı bir iş, ayrı mevzuat. |
| **Paraşüt entegrasyonu** | Kod hazır, **bugün kapalı** (`PARASUT_ENABLED=false`, API başvurusu bekliyor) | "Yol haritasında, kod tarafı yazıldı, Paraşüt API onayı bekliyor." Tarihe söz vermeyin. |
| **AI PDF okuma** | Kod hazır, anahtar kapalı | "Yol haritasında." Demoda göstermeyin. |
| **Resmî muhasebe / beyanname** | Yok, planda da yok | "Mali müşavirinizin işi, biz oraya veri veriyoruz." |
| **Çok şirketli yapı** | Tek kiracılı — bir kurulum bir firma | İki firması olana **iki kurulum** teklif edilir (ikincisi %50 kurulum indirimi + tam bakım). |
| **Mobil uygulama** | PWA var (ana ekrana eklenir), App Store'da uygulama yok | "Telefonda tarayıcıdan açılır, ana ekrana eklenir, uygulama gibi çalışır." Doğru ve yeterli. |

---

## 6. İndirim ve pazarlık kuralları (kendinize disiplin)

- **Liste fiyatından indirim yok, kapsamdan indirim var.** Bütçe yetmiyorsa Anahtar
  Teslim'den Hızlı Kurulum'a inilir — fiyat düşer çünkü **iş azalır**. Aynı işi ucuza
  yapmak hem marjı hem algıyı bozar.
- **Referans indirimi:** ilk 3 müşteri için kurulumda %25, karşılığında **yazılı
  referans + vaka hikâyesi + logo kullanım izni**. Takas açık yazılır.
- **Peşin ödeme:** yıllık bakımda peşin %10 indirim (nakit akışı).
- **Pilot:** ücretsiz pilot **yok**. Bunun yerine **ücretli kısa kurulum** (Hızlı
  Kurulum) — para ödemeyen müşteri veri aktarmaz, veri aktarmayan müşteri ürünü
  göremez, göremeyen müşteri satın almaz.
- **Demo her zaman ücretsiz** (canlı demo modu + 30 dk ekran paylaşımı).

---

## 7. Kapasite gerçeği

Tek kişilik ekip. Aynı anda **3'ten fazla aktif kurulum** yürütülemez (Anahtar Teslim'in
90 günlük yakın desteği hesaba katılırsa). Gerçekçi yıllık hedef:

| Yıl | Yeni kurulum | Bakımdaki müşteri | Tahmini gelir |
|---|---|---|---|
| 1 | 4 × 85.000 | — (ilk yıl dahil) | 340.000 TL |
| 2 | 5 × 85.000 | 4 × 42.000 | 593.000 TL |
| 3 | 5 × 85.000 | 9 × 42.000 | 803.000 TL |

Bakım geliri kümülatiftir ve **asıl işi o yapar** — 3. yılda gelirin %47'si kurulum
yapmadan gelir. Bu yüzden bakım fiyatını düşük tutup kurulumla telafi etmek stratejik
hata olur; model tersi yönde kurulmalı.

**Kapasite doluysa fiyat artar, sıra beklenmez.** Talep kapasiteyi aşarsa kurulum
bedeli yükseltilir — bu bir ceza değil, tek kişilik ekibin tek ölçeklenme kolu.

---

## 8. Landing sayfasına ne yazılacak

Fiyat sayfası **rakam gösterir** — "Teklif alın" ile saklamak bu segmentte güven
kaybettirir (alıcı KOBİ, Netsis bayisinden fiyat alamamanın yorgunluğuyla geliyor).

Gösterilecek: üç kurulum paketi (Anahtar Teslim vurgulu) + üç bakım satırı + "kullanıcı
başına ücret yok / modül başına ücret yok / barındırma dahil" üçlüsü + KDV hariç notu +
"Dönüşüm paketi projeye göre fiyatlanır" satırı.

Gösterilmeyecek: kapasite tablosu, maliyet tabanı, indirim kuralları (bu belge iç
kullanım içindir).

---

## 9. Kullanıcının karar vermesi gereken 4 şey

1. **Rakamlar onaylanıyor mu?** Özellikle Anahtar Teslim 85.000 TL ve Öncelikli bakım
   42.000 TL — geri kalan her metin bunlara yaslanacak.
2. **Referans indirimi uygulanacak mı?** PMT zaten ilk müşteri; karşılığında yazılı
   vaka hikâyesi alınacak mı?
3. **Fiyat landing'de açık mı yazılsın, "teklif alın" mı?** (Öneri: açık yazılsın.)
4. **Zam kuralı TÜFE+%5 kabul mü?** Sözleşme şablonuna girecek.

---

## 10. Kaynaklar (2026-09-18 ölçümü)

- Logo Netsis 2026 fiyat listeleri — [netsislogo.com](https://netsislogo.com/netsis-fiyat-listesi-2026/), [netsis-destek.com](https://netsis-destek.com/netsis-2026-fiyat-listesi/)
- Akınsoft Wolvox ERP fiyatlandırma — [akinsoft.com.tr](https://www.akinsoft.com.tr/programlar/detay/wolvox-erp-programi-erp-mrp-on-muhasebe--woo9)
- Paraşüt ön muhasebe fiyatları — [parasut.com](https://www.parasut.com/on-muhasebe-fiyatlari)
- Ön muhasebe programı fiyat karşılaştırması 2026 — [eticaretradari.com](https://eticaretradari.com/muhasebe-programi-fiyatlari/)
- Bizim Hesap fiyatlar — [bizimhesap.com](https://bizimhesap.com/fiyatlar)
